# The Elite Diver helmet: a commercial-style dive helmet (fictional design, no markings of any real maker).
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python tools\cosmetics\diver_helmet.py [-- --preview <folder>]
# Writes assets/cosmetics/diver_helmet.glb: meshes diver_helmet_lod0 / _lod1 / _lod2 (material 0 = the shell and its
# fittings, baked; material 1 = the tinted glass), skinned 100% to the head bone of the game's skeleton. Optional
# preview renders (front, side, back, three-quarter, on the head, the detail levels) go to the --preview folder.
#
# Modelled in game space round the real (fitted MakeHuman) head: crown 1.802, eyes at y 1.689 z -0.091, nose tip about
# z -0.139, ears out to x 0.093. The shell clears all six game heads (checked at the end of the build).
import sys, os, math, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from mathutils import Vector, Matrix
import kit
from kit import TM, log

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else os.path.join(tempfile.gettempdir(), 'steel-tide-cosmetics', 'preview')
WORK = os.path.join(tempfile.gettempdir(), 'steel-tide-cosmetics', 'diver_helmet')
OUT = os.path.join(kit.REPO, 'assets', 'cosmetics', 'diver_helmet.glb')
NAME = 'diver_helmet'
TEX = 1024
PI = math.pi
sm = lambda x: (lambda t: t * t * (3 - 2 * t))(min(1.0, max(0.0, x)))
lerp = lambda a, b, t: a + (b - a) * t

# ================================================================== shape of the shell (game space)
CEQ = (0.0, 1.700, -0.012)                 # centre of the dome's widest ring
RX, RZF, RZB, RY = 0.136, 0.158, 0.138, 0.146  # half width, front and back depth at that ring, height of the dome above it
NXZ, NY = 2.25, 2.3                        # super-ellipse exponents: a little squarer than an egg
RING_C, RING_TILT = (0.0, 1.556, -0.004), 0.10  # the neck clamp ring: centre, rise toward the back (radians)
RING_R = (0.121, 0.126, 0.119)              # its mid radii: side, front, back
T_EQ = 0.62                                # share of the shell's rows above the widest ring
# the face land: a gently curved, back-tilted plateau the faceplate is bolted to
LZ0, LY0, LTILT, LRC = -0.167, 1.692, math.radians(13), 0.30
WIN_C, WIN_HW, WIN_HH, WIN_R = (0.0, 1.692), 0.084, 0.063, 0.029  # window: centre, half width / height, corner radius
FRAME_IN, FRAME_OUT = 0.004, 0.0135        # the frame overlaps the window by FRAME_IN and reaches FRAME_OUT beyond it
LAND_SOFT = 0.026

def ring_y(z): return RING_C[1] + (z - RING_C[2]) * math.tan(RING_TILT)

def sel(rx, rzf, rzb, th, n):  # super-ellipse radius toward th (0 = front, +x = the wearer's right)
    s, c = abs(math.sin(th)), abs(math.cos(th)); rz = rzf if math.cos(th) > 0 else rzb
    return ((s / rx) ** n + (c / rz) ** n) ** (-1 / n) if s + c > 0 else rx

def land_z(x, y): return LZ0 + (y - LY0) * math.tan(LTILT) + x * x / (2 * LRC)

def land(x, y):
    """Point and outward normal of the face land at (x, y)."""
    n = Vector((x / LRC, math.tan(LTILT), -1.0)).normalized(); return (x, y, land_z(x, y)), n

def rrect(hw, hh, r, n=56, c=WIN_C, taper=0.07):
    """A rounded rectangle (closed list of (x, y)), a little narrower at the bottom; points spaced evenly."""
    pts = []
    # walk the outline as a polyline with fine steps, then resample
    fine = []
    for k in range(4):
        cx = (hw - r) * (1 if k in (0, 3) else -1); cy = (hh - r) * (1 if k in (0, 1) else -1); a0 = k * PI / 2
        for i in range(17): a = a0 + PI / 2 * i / 16; fine.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    fine.append(fine[0])
    L = [0.0]
    for i in range(1, len(fine)): L.append(L[-1] + math.dist(fine[i], fine[i - 1]))
    for k in range(n):
        t = L[-1] * k / n; i = max(1, int(np.searchsorted(L, t))); f = (t - L[i - 1]) / max(1e-9, L[i] - L[i - 1])
        x = lerp(fine[i - 1][0], fine[i][0], f); y = lerp(fine[i - 1][1], fine[i][1], f)
        pts.append((c[0] + x * (1 + taper * y / hh), c[1] + y))
    return pts

def rrect_sdf(x, y, hw, hh, r, c=WIN_C, taper=0.07):
    yy = y - c[1]; xx = (x - c[0]) / (1 + taper * max(-1, min(1, yy / hh)))
    qx, qy = abs(xx) - (hw - r), abs(yy) - (hh - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r

def shell_point(th, t):
    """The outer shell surface: th round the head (0 = front), t from the crown (0) to the bottom rim (1)."""
    if t <= T_EQ:
        ph = (t / T_EQ) * PI / 2; k = math.sin(ph) ** (2 / NY) if ph > 0 else 0.0; h = math.cos(ph) ** (2 / NY)
        r = sel(RX, RZF, RZB, th, NXZ) * k; y = CEQ[1] + RY * h; cz = CEQ[2]
    else:
        s = (t - T_EQ) / (1 - T_EQ); e = math.sin(s * PI / 2)
        Re = sel(RX, RZF, RZB, th, NXZ); Rr = sel(RING_R[0] - 0.005, RING_R[1] - 0.005, RING_R[2] - 0.005, th, 2.1)
        r = Rr + (Re - Rr) * math.cos(s * PI / 2); cz = lerp(CEQ[2], RING_C[2], e)
        yr = ring_y(cz - Rr * math.cos(th)) + 0.0085; y = CEQ[1] - (CEQ[1] - yr) * e
    x = r * math.sin(th); z = cz - r * math.cos(th)
    # the face land: inside the frame's outline the shell is the land, with a soft shoulder round it
    if math.cos(th) > 0.05:
        d = rrect_sdf(x, y, WIN_HW + FRAME_OUT + 0.006, WIN_HH + FRAME_OUT + 0.006, WIN_R + FRAME_OUT)
        w = (1 - sm(d / LAND_SOFT)) * sm((math.cos(th) - 0.05) / 0.35)
        z = lerp(z, land_z(x, y), w)
    return np.array([x, y, z])

def shell_frame(th, y, out=0.0):
    """A frame on the shell at angle th and height y: local Z = outward normal, local Y = up along the surface."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        m = (lo + hi) / 2
        if shell_point(th, m)[1] > y: lo = m
        else: hi = m
    t = (lo + hi) / 2; p = shell_point(th, t); e = 1e-4
    du = shell_point(th + e, t) - shell_point(th - e, t); dv = shell_point(th, t + e) - shell_point(th, t - e)
    n = Vector(np.cross(dv, du)).normalized()
    if n.dot(Vector(p) - Vector((0, 1.69, -0.01))) < 0: n = -n
    return kit.frame_to(Vector(p) + n * out, n, (0, 1, 0))

def at(M, x, y, z=0.0): return M @ Vector((x, y, z))

# ================================================================== materials (procedural; baked onto the one texture set)
def band(n, v, lo, hi, soft):
    a = n.ramp(v, 0.0, 1.0, lo - soft, lo); b = n.ramp(v, 1.0, 0.0, hi, hi + soft); return n.math('MULTIPLY', a, b)

def mats():
    M = {}
    def fiberglass(n):
        o = n.coord(); xyz = n.sep(o); X, Yb, Z = xyz['X'], xyz['Y'], xyz['Z']  # Blender axes: X = game x, -Y = game z, Z = game y
        base = n.mix(n.noise(9, 3, 0.5), kit.srgb(0xe9ae00), kit.srgb(0xf7c51a))
        grime = n.math('SUBTRACT', 1.0, n.ao(0.025, False, 16)); grime = n.math('MULTIPLY', grime, n.ramp(n.noise(30, 4, 0.6), 0.5, 1.2, 0.3, 0.7))
        col = n.mix(n.math('MINIMUM', grime, 0.85), base, (0.23, 0.17, 0.08))
        # scuffs: thin bright scratches where the gelcoat is worn, more on the lower shell and the edges
        sc = n.ramp(n.noise(55, 2, 0.4, n.vmath('MULTIPLY', o, (1.0, 1.0, 9.0)), distortion=1.5), 0.0, 1.0, 0.70, 0.74)
        edge = n.ramp(n.ao(0.004, True, 8), 1.0, 0.0, 0.25, 0.75)
        wear = n.math('MAXIMUM', n.math('MULTIPLY', sc, 0.35), n.math('MULTIPLY', edge, n.ramp(n.noise(80, 3, 0.6), 0.0, 1.0, 0.45, 0.6)))
        col = n.mix(wear, col, kit.srgb(0xf6e7b0))
        # retro-reflective tape: a strip on each side and two at the back
        tape = n.math('ADD', n.math('MULTIPLY', band(n, Z, 1.735, 1.758, 0.0007), band(n, n.math('ABSOLUTE', X), 0.118, 0.2, 0.0007)),
                      n.math('MULTIPLY', n.math('MULTIPLY', band(n, Z, 1.775, 1.797, 0.0007), band(n, Yb, -0.2, -0.105, 0.0007)), band(n, n.math('ABSOLUTE', X), 0.012, 0.06, 0.0007)))
        tape = n.math('MINIMUM', tape, 1.0)
        tapecol = n.mix(n.voronoi(1400), kit.srgb(0xa9adb0), kit.srgb(0xc9ccce))
        col = n.mix(tape, col, tapecol)
        rough = n.math('ADD', n.math('ADD', 0.2, n.math('MULTIPLY', grime, 0.9)), n.math('MULTIPLY', wear, 0.35))
        rough = n.mix(tape, rough, 0.38, 'FLOAT')
        seam = band(n, Z, 1.6985, 1.7015, 0.0006)  # the mould's parting line round the sides and back
        seam = n.math('MULTIPLY', seam, n.ramp(Yb, 0.0, 1.0, -0.06, 0.02))
        h = n.math('ADD', n.math('MULTIPLY', n.noise(700, 2, 0.5), 0.15), n.math('MULTIPLY', tape, 0.5))
        h = n.math('SUBTRACT', h, n.math('MULTIPLY', seam, 0.8)); h = n.math('SUBTRACT', h, n.math('MULTIPLY', sc, 0.25))
        return dict(color=col, rough=rough, metal=0.0, normal=n.bump(h, 0.5, 0.0008))
    M['shell'] = kit.material('shell', fiberglass)
    def liner(n):
        f = n.noise(260, 6, 0.7)
        return dict(color=n.mix(f, (0.018, 0.018, 0.02), (0.035, 0.035, 0.04)), rough=0.93, metal=0.0, normal=n.bump(n.voronoi(320, out='Distance'), 0.4, 0.001))
    M['liner'] = kit.material('liner', liner)
    def metal(base, rough0, brushed=False):
        def b(n):
            o = n.coord()
            sm_ = n.noise(14, 5, 0.6); scr = n.ramp(n.noise(90, 2, 0.4, n.vmath('MULTIPLY', o, (1, 1, 14) if brushed else (1, 12, 1)), distortion=2.0), 0, 1, 0.64, 0.7)
            dirt = n.math('SUBTRACT', 1.0, n.ao(0.012, False, 12))
            col = n.mix(n.math('MULTIPLY', dirt, 1.2), n.mix(sm_, (base[0] * 0.9,) * 3, base), (0.09, 0.085, 0.075))
            rough = n.math('ADD', n.math('ADD', rough0, n.math('MULTIPLY', sm_, 0.12)), n.math('ADD', n.math('MULTIPLY', scr, 0.18), n.math('MULTIPLY', dirt, 0.4)))
            hb = n.noise(1800 if brushed else 900, 1, 0.3, n.vmath('MULTIPLY', o, (1, 1, 30) if brushed else (1, 1, 1)))
            return dict(color=col, rough=rough, metal=n.ramp(dirt, 1.0, 0.4, 0.2, 1.0), normal=n.bump(n.math('ADD', n.math('MULTIPLY', hb, 0.3), n.math('MULTIPLY', scr, 0.2)), 0.25, 0.0004))
        return b
    M['chrome'] = kit.material('chrome', metal((0.82, 0.82, 0.84), 0.08))
    M['satin'] = kit.material('satin', metal((0.62, 0.63, 0.64), 0.3, True))
    def anodised(n):
        edge = n.ramp(n.ao(0.003, True, 8), 1.0, 0.0, 0.3, 0.8); edge = n.math('MULTIPLY', edge, n.ramp(n.noise(70, 3), 0, 1, 0.45, 0.6))
        col = n.mix(edge, n.mix(n.noise(20, 3), (0.022, 0.023, 0.026), (0.035, 0.036, 0.04)), (0.55, 0.56, 0.58))
        return dict(color=col, rough=n.math('ADD', 0.34, n.math('MULTIPLY', edge, -0.12)), metal=n.math('ADD', 0.35, n.math('MULTIPLY', edge, 0.65)), normal=n.bump(n.noise(1100, 1, 0.3), 0.15, 0.0003))
    M['anodised'] = kit.material('anodised', anodised)
    def rubber(n):
        f = n.noise(400, 5, 0.6); dust = n.math('SUBTRACT', 1.0, n.ao(0.015, False, 12))
        col = n.mix(n.math('MULTIPLY', dust, 0.8), n.mix(f, (0.014, 0.014, 0.015), (0.026, 0.026, 0.027)), (0.1, 0.095, 0.085))
        return dict(color=col, rough=n.math('ADD', 0.62, n.math('MULTIPLY', f, 0.2)), metal=0.0, normal=n.bump(n.noise(1500, 2, 0.5), 0.35, 0.0004))
    M['rubber'] = kit.material('rubber', rubber)
    def latex(n):  # the neck dam: a satin, slightly fabric-backed rubber
        f = n.noise(180, 4, 0.55)
        return dict(color=n.mix(f, (0.02, 0.02, 0.022), (0.032, 0.031, 0.03)), rough=n.math('ADD', 0.45, n.math('MULTIPLY', f, 0.15)), metal=0.0, normal=n.bump(n.voronoi(900), 0.2, 0.0004))
    M['latex'] = kit.material('latex', latex)
    def red(n):
        f = n.noise(60, 3); edge = n.ramp(n.ao(0.003, True, 8), 1.0, 0.0, 0.3, 0.8)
        return dict(color=n.mix(edge, n.mix(f, kit.srgb(0xa3150d), kit.srgb(0xc21f12)), kit.srgb(0xd9785c)), rough=0.33, metal=0.0, normal=None)
    M['red'] = kit.material('red', red)
    return M

# ================================================================== the parts
def knurl(k):  # radius factor for a knurled knob
    return lambda t, i: 1.0 + 0.06 * (1 if int(t / (2 * PI) * 28) % 2 else -1) * (1 if 0 < i < 3 else 0)

def build(M):
    P = []          # opaque parts: (object, lod2?) ; lod2 keeps only the big shapes
    def add(o, small=False):
        if small: kit.tag(o, 'detail', 1)
        P.append(o); return o
    # ---- the shell: a dense-at-the-front grid, real thickness, the window cut out, rounded edges
    nc, nr = 36, 20
    def thmap(u):  # u in [-1, 1) -> angle; columns crowd toward the front where the face land is
        return PI * u * (0.5 + 0.5 * u * u)
    def tmap(v):  # rows crowd round the face land's height
        return v
    G = np.zeros((nr, nc, 3))
    for i in range(nr):
        t = i / (nr - 1)
        for j in range(nc): G[i, j] = shell_point(thmap(-1 + 2 * j / nc), t)
    sh = kit.from_grid('shell', G, True, False, False, M['shell'], center=(0, 1.69, -0.01)); sh.data.materials.append(M['liner'])
    s = kit.solidify(sh, 0.006, -1.0); s.material_offset = 1; s.material_offset_rim = 0
    kit.apply(sh)
    win = rrect(WIN_HW, WIN_HH, WIN_R, 64)
    cut = kit.plate('cut', win, land, -0.05, 0.05, 2); kit.boolean(sh, cut); kit.apply(sh); kit.remove(cut)
    kit.bevel_mod(sh, 0.0022, 2, 55); kit.apply(sh); kit.sharp_by_angle(sh, 50); add(sh)
    # ---- faceplate frame: a polished band round the window, standing proud of the land, and its screws
    def ring_outline(off, n=48):
        out = []
        for (x, y) in rrect(WIN_HW + off, WIN_HH + off, WIN_R + off, n): out.append((x, y))
        return out
    inner = ring_outline(-FRAME_IN); outer = ring_outline(FRAME_OUT)
    prof = [(inner, -0.0015), (inner, 0.0055), (outer, 0.0068), (outer, 0.0010), (outer, -0.002), (inner, -0.0015)]
    FP = np.zeros((len(prof) - 1, len(inner), 3))
    for k, (ol, off) in enumerate(prof[:-1]):
        for j, (x, y) in enumerate(ol):
            p, nn = land(x, y); FP[k, j] = np.array(p) + np.array(nn) * off
    FP = np.concatenate([FP, FP[:1]], 0)
    fr = kit.from_grid('frame', FP, True, False, False, M['chrome']); kit.bevel_mod(fr, 0.0014, 1, 30); kit.apply(fr); add(fr)
    mid = rrect(WIN_HW + (FRAME_OUT - FRAME_IN) / 2 + 0.0005, WIN_HH + (FRAME_OUT - FRAME_IN) / 2 + 0.0005, WIN_R + 0.004, 12)
    for k, (x, y) in enumerate(mid):
        p, nn = land(x, y); add(kit.hexbolt('bolt%d' % k, 0.0043, 0.0028, kit.frame_y(Vector(p) + nn * 0.0062, nn, (0, 1, 0)), M['chrome'], washer=False), True)
    # ---- neck clamp ring (satin steel) with its latch at the back and a hinge at the front, then the neck dam
    rc = kit.TM(RING_C, (-RING_TILT, 0, 0))
    prof = [(0.0055, -0.0075), (0.0068, -0.0045), (0.0068, 0.0045), (0.0055, 0.0075), (-0.0055, 0.0075), (-0.0068, 0.0045), (-0.0068, -0.0045), (-0.0055, -0.0075), (0.0055, -0.0075)]
    R0 = RING_R[0]
    def ringwob(t, i):  # make the revolved ring an oval: front and back radii from RING_R
        c = math.cos(t); return 1.0
    RP = np.zeros((len(prof), 40, 3))
    for i, (dr, dy) in enumerate(prof):
        for j in range(40):
            th = 2 * PI * j / 40; r = sel(RING_R[0], RING_R[1], RING_R[2], th, 2.1) + dr
            RP[i, j] = (rc @ Vector((r * math.sin(th), dy, -r * math.cos(th))))[:]
    rg = kit.from_grid('ring', RP, True, False, False, M['satin']); add(rg)
    back = rc @ Vector((0, 0, RING_R[2] + 0.0068))
    lm = kit.frame_to(back, (0, 0.1, 1), (0, 1, 0))
    add(kit.rbox('latch', (0.036, 0.02, 0.012), lm @ TM((0, 0, 0.004)), 0.002, 2, M['satin']))
    add(kit.rbox('lever', (0.03, 0.009, 0.005), lm @ TM((0.003, -0.002, 0.0125), (0.12, 0, 0.08)), 0.0015, 2, M['chrome']), True)
    add(kit.cylinder('pin', 0.0026, 0.03, 10, lm @ TM((0, 0.012, 0.006), (0, 0, PI / 2)), 0.0006, 1, M['red']), True)
    for sx in (-1, 1):
        th = sx * 0.55; r = sel(*RING_R, th, 2.1) + 0.007
        add(kit.cylinder('hinge%d' % sx, 0.0042, 0.016, 10, rc @ TM((r * math.sin(th), 0, -r * math.cos(th)), (0, -th, 0)), 0.0008, 1, M['satin']), True)
    # neck dam: from inside the ring down round the neck, with soft folds
    DR = 6; DS = 32; D = np.zeros((DR, DS, 3))
    for i in range(DR):
        f = i / (DR - 1)
        for j in range(DS):
            th = 2 * PI * j / DS; c = math.cos(th)
            r_top = sel(RING_R[0] - 0.008, RING_R[1] - 0.008, RING_R[2] - 0.008, th, 2.1)
            r_bot = sel(0.103, 0.094, 0.086, th, 2.2)
            r = lerp(r_top, r_bot, sm(f * 1.15)) + 0.0028 * math.sin(th * 11 + f * 2.0) * math.sin(f * PI) + 0.0015 * math.sin(th * 23) * f
            cz = lerp(RING_C[2], -0.002, f); z = cz - r * c
            y_top = ring_y(z) - 0.004; y_bot = 1.512 + 0.22 * z
            D[i, j] = (r * math.sin(th), lerp(y_top, y_bot, f), z)
    dm = kit.from_grid('dam', D, True, False, False, M['latex'], center=(0, 1.55, 0)); kit.solidify(dm, 0.003, -1.0); kit.apply(dm); add(dm)
    # ---- demand regulator below the faceplate, on the wearer's left
    rmf = shell_frame(-0.38, 1.566)
    ax = (rmf.to_3x3() @ Vector((0, -0.42, 1))).normalized(); org = rmf.translation - ax * 0.008
    rm = kit.frame_y(org, ax, (0, 1, 0)) @ Matrix.Diagonal((1.28, 1.28, 1.28, 1.0))
    add(kit.revolve('reg_body', [(0.0, 0.0), (0.0315, 0.0), (0.0335, 0.004), (0.0335, 0.024), (0.0318, 0.027), (0.0, 0.027)], 32, rm, M['anodised']))
    add(kit.revolve('reg_clamp', [(0.0332, 0.0225), (0.0352, 0.0228), (0.0358, 0.0262), (0.0352, 0.0296), (0.0332, 0.0298), (0.0332, 0.0225)], 32, rm, M['chrome']))
    cover = [(0.0312, 0.027), (0.0318, 0.031), (0.0298, 0.0375), (0.024, 0.0425), (0.0135, 0.0445), (0.0, 0.0448)]
    add(kit.revolve('reg_cover', cover, 32, rm, M['rubber'], wobble=lambda t, i: 1.0 + (0.025 * math.cos(t * 12) if 1 <= i <= 3 else 0)))
    add(kit.revolve('reg_purge', [(0.0122, 0.0435), (0.0124, 0.0475), (0.011, 0.0495), (0.006, 0.0505), (0.0, 0.0507)], 24, rm, M['rubber'],
                    wobble=lambda t, i: 1.0 + (0.05 * math.cos(t * 8) if i >= 1 else 0)), True)
    # exhaust whiskers: a moulded rubber piece hugging the chin under the regulator
    wp = [shell_frame(th, 1.566 + 0.004 * math.cos(th * 2), 0.008).translation for th in np.linspace(-0.85, 0.55, 15)]
    add(kit.sweep('whisker', wp, [0.007 + 0.006 * math.sin(PI * k / 14) for k in range(15)], 10, M['rubber']))
    # nose-clearing knob on the land just under the faceplate
    nb, nn_ = land(0.0, WIN_C[1] - WIN_HH - FRAME_OUT - 0.0085); nbm = kit.frame_y(Vector(nb), nn_, (0, 1, 0))
    add(kit.cylinder('nb_stem', 0.0045, 0.012, 12, nbm @ TM((0, 0.006, 0)), 0.0006, 1, M['chrome']), True)
    add(kit.revolve('nb_knob', [(0.0, 0.01), (0.0085, 0.01), (0.0098, 0.012), (0.0098, 0.019), (0.0085, 0.021), (0.0, 0.0215)], 20, nbm, M['rubber'], wobble=knurl(0)))
    # ---- side block on the wearer's right: emergency valve (red handwheel), the bent tube to the regulator
    sbf = shell_frame(1.22, 1.632)
    add(kit.rbox('sideblock', (0.054, 0.046, 0.026), sbf @ TM((0, 0, 0.011)), 0.004, 2, M['satin']))
    add(kit.rbox('sideplate', (0.064, 0.056, 0.004), sbf @ TM((0, 0, 0.0005)), 0.0018, 2, M['satin']), True)
    for dx, dy in ((-0.024, -0.021), (0.024, -0.021), (-0.024, 0.021), (0.024, 0.021)):
        add(kit.hexbolt('sbb', 0.0032, 0.0022, sbf @ TM((dx * 1.12, dy * 1.12, 0.0025), (PI / 2, 0, 0)), M['chrome']), True)
    vax = sbf.to_3x3() @ Vector((1, 0, 0))  # forward along the side
    vm = kit.frame_y(at(sbf, 0.027, 0.004, 0.012), vax, sbf.to_3x3() @ Vector((0, 0, 1)))
    add(kit.cylinder('ev_stem', 0.0055, 0.022, 12, vm @ TM((0, 0.011, 0)), 0.0008, 1, M['chrome']), True)
    add(kit.revolve('ev_wheel', [(0.0, 0.016), (0.008, 0.016), (0.0165, 0.017), (0.0175, 0.02), (0.0175, 0.026), (0.0165, 0.029), (0.008, 0.0295), (0.0, 0.0295)], 28, vm, M['red'], wobble=knurl(0)))
    add(kit.revolve('ev_cap', [(0.0, 0.0294), (0.0062, 0.0294), (0.0064, 0.032), (0.0, 0.0324)], 16, vm, M['chrome']), True)
    # bent tube: from the bottom of the side block round the chin to the regulator
    bt = [at(sbf, 0.012, -0.024, 0.012)] + [shell_frame(th, 1.598 - 0.012 * (1 - th / 1.1), 0.011).translation for th in np.linspace(1.05, 0.05, 12)] + [rm @ Vector((0.036, 0.013, 0))]
    add(kit.sweep('bent_tube', kit.resample(bt, 0.01), 0.0046, 8, M['chrome']), True)
    # ---- steady-flow (defog) valve on the wearer's left
    sf = shell_frame(-1.08, 1.622)
    add(kit.cylinder('sf_base', 0.011, 0.008, 18, sf @ TM((0, 0, 0.003), (PI / 2, 0, 0)), 0.0015, 2, M['satin']))
    add(kit.cylinder('sf_stem', 0.005, 0.02, 12, sf @ TM((0, 0, 0.014), (PI / 2, 0, 0)), 0.0008, 1, M['chrome']), True)
    km = kit.frame_y(at(sf, 0, 0, 0.018), sf.to_3x3() @ Vector((0, 0, 1)))
    add(kit.revolve('sf_knob', [(0.0, 0.0), (0.009, 0.0), (0.0135, 0.002), (0.014, 0.005), (0.014, 0.012), (0.0128, 0.0145), (0.0, 0.015)], 24, km, M['rubber'], wobble=knurl(0)))
    # ---- rear gas fitting and the umbilical hose: from the back of the helmet, clipped to the clamp, down to the harness
    rf = shell_frame(2.5, 1.628)
    add(kit.rbox('rear_block', (0.04, 0.036, 0.02), rf @ TM((0, 0, 0.008)), 0.0035, 2, M['satin']))
    hax = (rf.to_3x3() @ Vector((0, -0.85, 0.5))).normalized(); hm = kit.frame_y(at(rf, 0, -0.012, 0.016), hax, rf.to_3x3() @ Vector((0, 0, 1)))
    add(kit.cylinder('rf_nut', 0.0105, 0.012, 6, hm @ TM((0, 0.006, 0)), 0.0012, 1, M['chrome']))
    add(kit.cylinder('rf_nipple', 0.0075, 0.018, 16, hm @ TM((0, 0.02, 0)), 0.0008, 1, M['chrome']), True)
    # a small gas pipe along the right side, from the side block to the rear block
    gp = [at(sbf, -0.026, 0.012, 0.014)] + [shell_frame(th, 1.646 - 0.01 * (th - 1.3), 0.0105).translation for th in np.linspace(1.36, 2.36, 10)] + [at(rf, 0.018, 0.006, 0.012)]
    add(kit.sweep('gas_pipe', kit.resample(gp, 0.009), 0.0036, 8, M['chrome']), True)
    h0 = hm @ Vector((0, 0.028, 0)); clip = rc @ Vector((0.028, 0.0, RING_R[2] + 0.02))
    hose = kit.bezier(h0, h0 + hax * 0.05, clip + Vector((0.01, 0.03, 0.02)), clip, 14)[:-1] + kit.bezier(clip, clip + Vector((-0.004, -0.03, 0.006)), Vector((0.02, 1.47, 0.152)), Vector((0.014, 1.448, 0.146)), 10)
    hose = kit.resample(hose, 0.006)
    hp = kit.sweep('hose', hose, 0.0112, 8, M['rubber'], ribs=lambda k, s: 1.0 + (0.07 if k % 2 else -0.03))
    add(hp)
    end = hose[-1]; d = (hose[-1] - hose[-3]).normalized()
    add(kit.cylinder('hose_end', 0.0135, 0.024, 6, kit.frame_y(end + d * 0.008, d), 0.0015, 1, M['chrome']))
    add(kit.rbox('hose_clip', (0.032, 0.014, 0.03), kit.frame_to(clip, (0, -0.2, 1), (0, 1, 0)) @ TM((0, 0, -0.004)), 0.003, 2, M['rubber']), True)
    # ---- lamp on the wearer's left, above the ear: mount plate, arm, ribbed body, bezel, reflector
    lf = shell_frame(-1.62, 1.76)
    add(kit.rbox('lamp_plate', (0.05, 0.034, 0.005), lf @ TM((0, 0, 0.001)), 0.002, 2, M['anodised']))
    add(kit.rbox('lamp_arm', (0.016, 0.022, 0.03), lf @ TM((0, 0, 0.016)), 0.003, 2, M['anodised']))
    for dx in (-0.019, 0.019): add(kit.hexbolt('lpb', 0.0028, 0.002, lf @ TM((dx, 0, 0.0035), (PI / 2, 0, 0)), M['chrome']), True)
    lax = Vector((0.03, -0.06, -1)).normalized(); lc = at(lf, 0, 0.0, 0.036)
    lm = kit.frame_y(lc, lax, (0, 1, 0))
    body = [(0.0, -0.046), (0.011, -0.046), (0.0145, -0.044)]
    for k in range(3): y = -0.034 + k * 0.0085; body += [(0.0155, y), (0.0182, y + 0.0012), (0.0182, y + 0.0032), (0.0155, y + 0.0044)]
    body += [(0.0162, -0.002), (0.0165, 0.03), (0.0172, 0.031)]
    add(kit.revolve('lamp_body', body + [(0.0, 0.031)], 16, lm, M['anodised']))
    add(kit.revolve('lamp_bezel', [(0.0168, 0.03), (0.0195, 0.031), (0.0205, 0.0345), (0.0205, 0.043), (0.0192, 0.0455), (0.0172, 0.0455), (0.0166, 0.041), (0.012, 0.037), (0.0045, 0.0335), (0.0, 0.033)], 20, lm, M['chrome']))
    add(kit.sweep('lamp_cable', kit.resample(kit.bezier(at(lm, 0, -0.046, 0), at(lm, 0, -0.07, 0), at(lf, 0.06, -0.02, 0.012), at(lf, 0.075, -0.035, 0.002), 12), 0.008), 0.0028, 8, M['rubber']), True)
    # ---- carrying handle over the front of the crown
    hp_ = [shell_frame(th, 1.808 - 0.03 * abs(th) ** 2, 0.004 + 0.018 * sm(1 - abs(th) / 0.95 + 0.25)).translation for th in np.linspace(-0.95, 0.95, 21)]
    add(kit.sweep('handle', kit.resample(hp_, 0.009), 0.0058, 8, M['chrome']))
    for th in (-0.95, 0.95):
        fm = shell_frame(th, 1.808 - 0.03 * th * th)
        add(kit.rbox('handle_foot', (0.022, 0.03, 0.007), fm @ TM((0, 0, 0.002)), 0.0022, 2, M['chrome']))
        for dy in (-0.008, 0.008): add(kit.hexbolt('hfb', 0.0026, 0.0018, fm @ TM((0, dy, 0.0055), (PI / 2, 0, 0)), M['chrome']), True)
    return P

def glass(M_glass, lod):
    win = rrect(WIN_HW + 0.006, WIN_HH + 0.006, WIN_R + 0.006, 64 if lod == 0 else 32 if lod == 1 else 16)
    g = kit.plate(NAME + '_glass%d' % lod, win, land, -0.0005, -0.0065 if lod < 2 else -0.0035, 3 if lod == 0 else 2 if lod == 1 else 1, M_glass)
    parts = [g]
    if lod < 2:  # the lamp's lens
        lf = shell_frame(-1.62, 1.76); lax = Vector((0.03, -0.06, -1)).normalized(); lm = kit.frame_y(at(lf, 0, 0.0, 0.036), lax, (0, 1, 0))
        parts.append(kit.revolve('lens', [(0.0, 0.0438), (0.017, 0.0438), (0.017, 0.0428), (0.0, 0.0425)], 24 if lod == 0 else 12, lm, M_glass))
    return kit.join(parts, NAME + '_glass%d' % lod)

# ================================================================== build
def main():
    log('fitting the body (MPFB)')
    H = kit.fitted_body(0)
    kit.reset()
    M = mats()
    parts = build(M)
    for o in parts: kit.apply(o)
    counts = sorted(((kit.tris(o), o.name) for o in parts), reverse=True); log('parts:', ', '.join('%s %d' % (n, t) for t, n in counts[:40]), '... total', sum(t for t, _ in counts))
    for o in parts:
        if not o.data.materials or any(m is None for m in o.data.materials): log('NO MATERIAL', o.name, list(o.data.materials))
    lo = kit.join(parts, NAME + '_lod0'); kit.clean(lo)
    log('lod0 opaque tris', kit.tris(lo))
    if os.environ.get('DH_PARTS'): return
    kit.unwrap(lo, angle=52, margin=0.003, density={'shell': 1.15, 'chrome': 1.2, 'liner': 0.45, 'latex': 0.8})
    os.makedirs(WORK, exist_ok=True)
    maps = kit.bake(lo, TEX, samples_ao=96)
    files = kit.write_maps(maps, WORK, NAME)
    # detail levels: lod1 = a third of lod0; lod2 = the big shapes only, under 1,200 triangles with the glass
    l1 = kit.decimate(lo, ratio=0.33, name=NAME + '_lod1')
    l2c = kit.copy(lo, NAME + '_lod2c'); kit.drop_tagged(l2c); l2 = kit.decimate(l2c, target_tris=1040, name=NAME + '_lod2x'); kit.remove(l2c)
    for o in (l1, l2): kit.sharp_by_angle(o, 55)
    shellm = kit.gltf_material(NAME, files); glassm = kit.gltf_material(NAME + '_glass', color=(0.05, 0.07, 0.075), rough=0.04, metal=0.0, alpha=0.4)
    lods = []
    for k, o in enumerate((lo, l1, l2)):
        o.data.materials.clear(); o.data.materials.append(shellm)
        for p in o.data.polygons: p.material_index = 0
        g = glass(glassm, k); o = kit.join([o, g], NAME + '_lod%d' % k); lods.append(o)
        log('lod%d: %d triangles' % (k, kit.tris(o)))
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o not in lods: kit.remove(o)
    rig = kit.armature('rig')
    for o in lods: kit.skin(o, rig, {'head': 1.0})
    # clearance against every game head (as the game draws them) at the nearest and farthest detail level
    heads = []
    for tone in range(6):
        for hl in (0, 2):
            co, _ = kit.game_part('head%d' % tone, hl); heads.append(('head%d lod%d' % (tone, hl), co))
    for k in (0, 2):
        res = kit.clearance([lods[k]], [h for h in heads if h[0].endswith('lod%d' % (0 if k == 0 else 2))], below=1.545)
        for nm, d, p in res: log('clearance helmet lod%d / %s: %.1f mm at %s' % (k, nm, d * 1000, p))
    kit.export_glb(OUT, lods, rig)
    J = kit.read_glb_json(OUT); log('glb meshes:', [m['name'] for m in J['meshes']], 'images:', [i.get('mimeType') for i in J.get('images', [])], 'extensions:', J.get('extensionsUsed'))
    preview(H)

def preview(H):
    """Renders the exported file (imported back, so Draco and WebP are proven too) on its own and on the fitted head."""
    kit.reset(); kit.studio()
    bpy.ops.import_scene.gltf(filepath=OUT)
    objs = {o.name: o for o in bpy.data.objects}
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    log('imported:', [(o.name, kit.tris(o)) for o in meshes])
    def show(k):
        for o in meshes: o.hide_render = not o.name.startswith(NAME + '_lod%d' % k)
    show(0)
    floor = bpy.data.materials.new('floor'); floor.diffuse_color = (0.3, 0.3, 0.3, 1)
    V = [('front', (0, 1.70, -0.95), (0, 1.69, -0.02), 50), ('side', (0.95, 1.70, -0.01), (0, 1.69, -0.01), 50), ('back', (0, 1.72, 0.95), (0, 1.68, 0), 50),
         ('threequarter', (-0.62, 1.86, -0.72), (0, 1.68, -0.02), 50)]
    kit.render_views(PREVIEW, NAME, V, (900, 900), 96)
    for k in (1, 2):
        show(k); kit.render_views(PREVIEW, NAME + '_lod%d' % k, [V[3]], (600, 600), 64)
    show(0)
    skinm = kit.material('skin', lambda n: dict(color=kit.srgb(0xc08c6c), rough=0.55, metal=0.0))
    kit.body_object(H, 'body', skinm)
    kit.render_views(PREVIEW, NAME + '_onhead', [('threequarter', (-0.9, 1.75, -1.05), (0, 1.55, 0), 50), ('front', (0, 1.6, -1.6), (0, 1.5, 0), 50), ('side', (1.4, 1.62, 0), (0, 1.52, 0), 50)], (900, 900), 96)

main()
