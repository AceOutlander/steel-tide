# Builds assets/people/* for Steel Tide from the MakeHuman (MPFB) CC0 base mesh and CC0 skin textures.
#   blender -b --python tools/people/build.py -- <out dir> <skins dir> [preview dir]
# Output: people.json (manifest, measurements), people.bin (meshes), skin_0..3.webp (head + hands atlas per skin tone).
# Meshes are in the game's space and bind pose (see fit.py), skinned to the game's 23 bones (two influences a vertex).
import sys, os, json, math, struct
sys.path.insert(0, os.path.dirname(__file__))
import bpy, bmesh
import numpy as np
import fit
from fit import BI, NB, SK, SKP
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT, SKINS = ARGS[0], ARGS[1]
PREV = ARGS[2] if len(ARGS) > 2 else None
os.makedirs(OUT, exist_ok=True)

BODY_MACRO = {"gender": 1.0, "age": 0.5, "muscle": 0.72, "weight": 0.5, "proportions": 0.5, "height": 0.5}
TONES = [  # geometry (race mix, age) and the CC0 MakeHuman skin for each of the game's four skin tones
    dict(race={"asian": 0.0, "caucasian": 1.0, "african": 0.0}, age=0.5, skin='young_caucasian_male/young_lightskinned_male_diffuse.png', hair=(0.20, 0.15, 0.11), brow=(0.16, 0.115, 0.08), eye=(0.30, 0.22, 0.14)),
    dict(race={"asian": 0.85, "caucasian": 0.15, "african": 0.0}, age=0.5, skin='young_asian_male/young_lightskinned_male_diffuse3.png', hair=(0.07, 0.06, 0.055), brow=(0.07, 0.06, 0.05), eye=(0.17, 0.11, 0.07)),
    dict(race={"asian": 0.1, "caucasian": 0.9, "african": 0.0}, age=0.62, skin='middleage_caucasian_male/middleage_lightskinned_male_diffuse.png', hair=(0.33, 0.27, 0.2), brow=(0.25, 0.2, 0.14), eye=(0.25, 0.33, 0.42)),
    dict(race={"asian": 0.0, "caucasian": 0.1, "african": 0.9}, age=0.5, skin='young_african_male/young_darkskinned_male_diffuse.png', hair=(0.035, 0.03, 0.03), brow=(0.035, 0.03, 0.03), eye=(0.13, 0.085, 0.055)),
]
ARMS = lambda sd: [BI[n + sd] for n in ('uarm', 'larm', 'hand', 'fin', 'fin2', 'thumb')]
LEGS = lambda sd: [BI[n + sd] for n in ('uleg', 'lleg', 'foot')]
ARM_ALL = ARMS('L') + ARMS('R'); LEG_ALL = LEGS('L') + LEGS('R')
NECK_N = np.array([0, 1.0, -0.39]) / np.linalg.norm([0, 1.0, -0.39]); NECK_P = np.array([0, 1.526, 0.0])  # collar line: lower in front
CLOTH_TILE = 0.55  # metres of cloth covered by one repeat of the fabric texture

def log(*a): print('[people]', *a); sys.stdout.flush()

# ------------------------------------------------------------------ Blender mesh helpers
def dup(ob, name):
    o = ob.copy(); o.data = ob.data.copy(); o.name = name; bpy.context.scene.collection.objects.link(o); return o

def weights_of(me, ob):
    names = {g.index: g.name for g in ob.vertex_groups}; W = np.zeros((len(me.vertices), NB)); X = {}
    for v in me.vertices:
        for g in v.groups:
            n = names[g.group]
            if n in BI: W[v.index, BI[n]] = g.weight
            else: X.setdefault(n, np.zeros(len(me.vertices)))[v.index] = g.weight
    s = W.sum(1, keepdims=True); s[s == 0] = 1
    return W / s, X

def edit(ob, fn):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.verify(); gi = {g.name: g.index for g in ob.vertex_groups}
    def wsum(v, idx): d = v[dl]; return sum(d.get(gi[SK[i][0]], 0.0) for i in idx)
    fn(bm, wsum); bm.normal_update(); bm.to_mesh(ob.data); bm.free(); ob.data.update()

def bisect(bm, faces, co, no, clear_outer=False, clear_inner=False):
    geom = set(faces)
    for f in faces: geom.update(f.verts); geom.update(f.edges)
    bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-6, plane_co=Vector(co), plane_no=Vector(no), clear_outer=clear_outer, clear_inner=clear_inner)

def del_faces(bm, faces):
    bmesh.ops.delete(bm, geom=list(faces), context='FACES')

def keep_faces(bm, faces):
    ks = set(faces); del_faces(bm, [f for f in bm.faces if f not in ks])

def smooth(bm, n, fac=0.5, keep_boundary=True):
    for _ in range(n):
        vs = [v for v in bm.verts if not (keep_boundary and v.is_boundary)]
        bmesh.ops.smooth_vert(bm, verts=vs, factor=fac, use_axis_x=True, use_axis_y=True, use_axis_z=True)

def extract(ob, subsurf=0, ratio=None):
    """-> dict(co (N,3), tris (M,3), cuv (M,3,2) or None, W (N,NB), X {group: (N,)})"""
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    if subsurf: m = ob.modifiers.new('ss', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf; m.boundary_smooth = 'PRESERVE_CORNERS'
    if ratio is not None and ratio < 0.999: m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); me = ev.to_mesh()
    me.calc_loop_triangles()
    nv = len(me.vertices); co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nt = len(me.loop_triangles); tris = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tris); tris = tris.reshape(-1, 3)
    cuv = None
    if me.uv_layers.active:
        tl = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('loops', tl)
        uv = np.empty(len(me.loops) * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2); cuv = uv[tl].reshape(-1, 3, 2)
    W, X = weights_of(me, ob)
    ev.to_mesh_clear()
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    return dict(co=co, tris=tris, cuv=cuv, W=W, X=X)

def normals(co, tris):
    n = np.zeros_like(co); a, b, c = co[tris[:, 0]], co[tris[:, 1]], co[tris[:, 2]]; fn = np.cross(b - a, c - a)
    for k in range(3): np.add.at(n, tris[:, k], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return n / l

# ------------------------------------------------------------------ packing
BIN = bytearray(); PARTS = {}
def put(arr):
    global BIN
    while len(BIN) % 4: BIN.append(0)
    off = len(BIN); BIN += arr.tobytes(); return off

def pack(name, lod, P, cuv, flags=None):
    """Splits vertices where their UVs differ, keeps the two strongest bones, appends to the binary."""
    co, tris, W = P['co'], P['tris'], P['W']; nrm = normals(co, tris)
    key = {}; vi = []; uvl = []; idx = np.empty(tris.shape, dtype=np.int64)
    q = np.round(cuv * 8192).astype(np.int64)
    for t in range(len(tris)):
        for k in range(3):
            kk = (int(tris[t, k]), int(q[t, k, 0]), int(q[t, k, 1])); j = key.get(kk)
            if j is None: j = len(vi); key[kk] = j; vi.append(kk[0]); uvl.append(cuv[t, k])
            idx[t, k] = j
    vi = np.array(vi); uv = np.array(uvl); n = len(vi)
    order = np.argsort(-W[vi], axis=1)[:, :2]; w0 = np.take_along_axis(W[vi], order, 1); t1 = w0[:, 1] / np.maximum(1e-9, w0.sum(1))
    bw = np.zeros((n, 4), dtype=np.uint8); bw[:, 0] = order[:, 0]; bw[:, 1] = order[:, 1]; bw[:, 2] = np.round(t1 * 255); bw[:, 3] = 0 if flags is None else flags[vi]
    uv0 = uv.min(0); uvs = np.maximum(1e-9, uv.max(0) - uv0); uq = np.round((uv - uv0) / uvs * 65535).astype(np.uint16)
    nq = np.zeros((n, 4), dtype=np.int8); nq[:, :3] = np.round(nrm[vi] * 127)
    rec = dict(nv=int(n), ni=int(idx.size), pos=put(co[vi].astype(np.float32)), nrm=put(nq), uv=put(uq), uv0=uv0.tolist(), uvs=uvs.tolist(), bw=put(bw),
               weld=put(vi.astype(np.uint32)), idx=put(idx.astype(np.uint32 if n > 65535 else np.uint16).ravel()), i32=bool(n > 65535))
    PARTS.setdefault(name, {})[str(lod)] = rec
    log('part %-10s lod %s: %6d verts %6d tris' % (name, lod, n, len(tris)))

# ------------------------------------------------------------------ cloth UVs (a tube unwrap for each sleeve, leg and the trunk)
def cloth_uv(P, kind):
    co, tris, W = P['co'], P['tris'], P['W']
    wa = {sd: W[:, ARMS(sd)].sum(1) for sd in 'LR'}; wl = {sd: W[:, LEGS(sd)].sum(1) for sd in 'LR'}
    cen = co[tris].mean(1); out = np.zeros((len(tris), 3, 2))
    for t in range(len(tris)):
        v = tris[t]; p = co[v]; aL, aR = wa['L'][v].sum(), wa['R'][v].sum()
        if kind == 'shirt' and max(aL, aR) > 1.5:
            sx = -1.0 if aL > aR else 1.0; ang = np.arctan2(p[:, 2], (p[:, 0] - sx * 0.198) * sx); R = 0.056; uo = 3.1 * sx
        elif kind == 'shirt':
            ang = np.arctan2(p[:, 0], p[:, 2]); R = 0.165; uo = 0.0
        else:
            sx = -1.0 if cen[t, 0] < 0 else 1.0; ang = np.arctan2(p[:, 2], (p[:, 0] - sx * 0.092) * sx); R = 0.08; uo = 1.7 * sx + 5.0
        d = ang - ang[0]; ang = np.where(d > math.pi, ang - 2 * math.pi, np.where(d < -math.pi, ang + 2 * math.pi, ang))
        out[t, :, 0] = uo + ang * R / CLOTH_TILE; out[t, :, 1] = p[:, 1] / CLOTH_TILE
    return out

# ------------------------------------------------------------------ skin atlas
AW, AH = 2048, 1536
def region_of(uvc):  # which piece of the MakeHuman skin layout a face (by its UV centre) is in
    u, v = uvc
    if u > 0.625 and 0.145 < v < 0.87: return 'head'
    if 0.35 < u < 0.775 and v < 0.21: return 'hands'
    if u < 0.17 and 0.53 < v < 0.66: return 'sockets'
    if 0.74 < u < 0.94 and v < 0.16: return 'mouth'
    return 'body'
# source rectangle (u0, v0, u1, v1) -> destination rectangle in the new atlas; rot = the head is turned upright
REG = {
    'head': dict(src=(0.625, 0.13, 1.0, 0.87), dst=(0.0, 1 / 3, 1.0, 1.0), rot=True),
    'hands': dict(src=(0.355, 0.0, 0.775, 0.21), dst=(0.0, 0.0, 0.5, 1 / 3), rot=False),
    'sockets': dict(src=(0.0, 0.53, 0.17, 0.66), dst=(0.5, 0.0, 0.625, 1 / 9), rot=False),
    'mouth': dict(src=(0.74, 0.0, 0.94, 0.16), dst=(0.5, 1 / 9, 0.625, 2 / 9), rot=False),
    'body': dict(src=(0.25, 0.86, 0.60, 0.985), dst=(0.625, 0.0, 1.0, 2 / 9), rot=False),  # the base of the neck
}
EYE_TILE = (0.5, 2 / 9, 0.625, 1 / 3); EYE_N = 170  # the iris tile: a square of EYE_N pixels at the corner of EYE_TILE
def remap_uv(uv, r):
    R = REG[r]; s = R['src']; d = R['dst']; a = (uv[..., 0] - s[0]) / (s[2] - s[0]); b = (uv[..., 1] - s[1]) / (s[3] - s[1])
    if R['rot']: a, b = b, 1 - a
    return np.stack([d[0] + a * (d[2] - d[0]), d[1] + b * (d[3] - d[1])], axis=-1)

def bilinear(img, u, v):
    h, w = img.shape[:2]; x = np.clip(u * w - 0.5, 0, w - 1.001); y = np.clip(v * h - 0.5, 0, h - 1.001)
    x0 = x.astype(np.int64); y0 = y.astype(np.int64); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx) * (1 - fy) + (img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx) * fy

def hash3(p):
    q = np.floor(p).astype(np.int64); h = (q[..., 0] * 73856093) ^ (q[..., 1] * 19349663) ^ (q[..., 2] * 83492791); h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xffff) / 65535.0
def vnoise(p):
    i = np.floor(p); f = p - i; f = f * f * (3 - 2 * f); out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                out = out + w * hash3(i + np.array([dx, dy, dz]))
    return out

def build_atlas(src_img, P, cuv_new, tone, eyes):
    """src_img: (h, w, 3) MakeHuman skin. Copies the used pieces into the new layout, then paints what the skins lack
    (eyebrows, darker cropped hair, the lash line) by position on the head."""
    A = np.zeros((AH, AW, 3), dtype=np.float32); A[:] = src_img[8, 8]
    for r, R in REG.items():
        d = R['dst']; x0, x1, y0, y1 = int(round(d[0] * AW)), int(round(d[2] * AW)), int(round(d[1] * AH)), int(round(d[3] * AH))
        a = (np.arange(x0, x1) + 0.5 - x0) / (x1 - x0); b = (np.arange(y0, y1) + 0.5 - y0) / (y1 - y0); a, b = np.meshgrid(a, b)
        if R['rot']: a, b = 1 - b, a
        s = R['src']; A[y0:y1, x0:x1] = bilinear(src_img, s[0] + a * (s[2] - s[0]), s[1] + b * (s[3] - s[1]))
        if r == 'sockets': A[y0:y1, x0:x1] *= np.array([0.2, 0.17, 0.17])  # the hollow behind the eyeball: dark, so the far model (no eyeballs) has dark eyes
    # the iris tile
    d = EYE_TILE; x0, y0 = int(d[0] * AW), int(d[1] * AH); n = EYE_N
    yy, xx = np.mgrid[0:n, 0:n]; rr = np.hypot(xx - n / 2 + 0.5, yy - n / 2 + 0.5) / (n / 2); th = np.arctan2(yy - n / 2, xx - n / 2)
    ir = math.asin(min(0.9, 0.0059 / eyes['L'][1])) / (math.pi / 2); e = np.array(tone['eye']); tile = np.zeros((n, n, 3), dtype=np.float32) + np.array([0.86, 0.84, 0.81])
    tile -= (np.clip((rr - 0.55) / 0.45, 0, 1) ** 1.5)[..., None] * np.array([0.25, 0.33, 0.33])  # pinker and darker toward the lids
    fib = 0.75 + 0.5 * vnoise(np.stack([th * 14, rr * 5, th * 0], -1)) * (0.6 + 0.4 * np.sin(th * 37) ** 2)
    iris = e[None, None, :] * fib[..., None] * (0.75 + 0.9 * np.clip(1 - rr / ir, 0, 1))[..., None]
    k = np.clip((ir - rr) / 0.015, 0, 1)[..., None]; tile = tile * (1 - k) + iris * k
    limb = np.exp(-((rr - ir) / 0.02) ** 2)[..., None]; tile *= 1 - 0.55 * limb
    tile *= 1 - np.clip((ir * 0.4 - rr) / 0.02, 0, 1)[..., None] * 0.97  # pupil
    hl = np.exp(-(((xx - n * (0.5 - ir * 0.14)) / (n * 0.012)) ** 2 + ((yy - n * (0.5 + ir * 0.16)) / (n * 0.016)) ** 2))[..., None]; tile = tile * (1 - hl) + hl  # catch light
    A[y0:y0 + n, x0:x0 + n] = tile
    # paint by position: every head triangle is drawn into the atlas carrying its place on the head
    co, tris, X = P['co'], P['tris'], P['X']; nrm = normals(co, tris); scalp = X.get('scalp', np.zeros(len(co))).copy(); A0 = A.copy()
    for _ in range(5):  # soften the hairline: average each vertex with its neighbours
        acc = np.zeros(len(co)); cnt = np.zeros(len(co))
        for a_, b_ in ((0, 1), (1, 2), (2, 0)):
            np.add.at(acc, tris[:, a_], scalp[tris[:, b_]]); np.add.at(cnt, tris[:, a_], 1); np.add.at(acc, tris[:, b_], scalp[tris[:, a_]]); np.add.at(cnt, tris[:, b_], 1)
        scalp = 0.5 * scalp + 0.5 * acc / np.maximum(1, cnt)
    hair = np.array(tone['hair']); brow = np.array(tone['brow']); eL, eR = eyes['L'][0], eyes['R'][0]; er = eyes['L'][1]
    for t in range(len(tris)):
        v = tris[t]; uv = cuv_new[t] * np.array([AW, AH])
        if co[v][:, 1].min() < 1.5: continue
        mn = np.floor(uv.min(0)).astype(int) - 1; mx = np.ceil(uv.max(0)).astype(int) + 1
        if mx[0] - mn[0] > 300 or mx[1] - mn[1] > 300: continue
        xs, ys = np.meshgrid(np.arange(mn[0], mx[0]) + 0.5, np.arange(mn[1], mx[1]) + 0.5)
        d0 = uv[1] - uv[0]; d1 = uv[2] - uv[0]; den = d0[0] * d1[1] - d0[1] * d1[0]
        if abs(den) < 1e-9: continue
        px = xs - uv[0, 0]; py = ys - uv[0, 1]; b1 = (px * d1[1] - py * d1[0]) / den; b2 = (py * d0[0] - px * d0[1]) / den; b0 = 1 - b1 - b2
        m = (b0 >= -0.02) & (b1 >= -0.02) & (b2 >= -0.02)
        if not m.any(): continue
        B = np.stack([b0, b1, b2], -1)[m]; p = B @ co[v]; nn = B @ nrm[v]; sc = B @ scalp[v]
        iy = ys[m].astype(int); ix = xs[m].astype(int); ok = (ix >= 0) & (ix < AW) & (iy >= 0) & (iy < AH); iy, ix, p, nn, sc = iy[ok], ix[ok], p[ok], nn[ok], sc[ok]
        c = A0[iy, ix]
        # cropped hair: the skins have pale stubble; dye it and add strands
        hn = vnoise(p * np.array([900, 260, 900])) * 0.5 + vnoise(p * 2200) * 0.5
        edge = np.clip((sc - 0.42 + (hn - 0.5) * 0.25) / 0.22, 0, 1) * np.clip(0.6 + hn * 0.8, 0, 1)
        lum = c.mean(1, keepdims=True) / max(1e-6, float(src_img[8, 8].mean()))
        c = c * (1 - edge[:, None] * 0.86) + (hair * (0.55 + 0.9 * hn[:, None]) * lum) * edge[:, None] * 0.86
        for ec, sg in ((eL, -1.0), (eR, 1.0)):
            # eyebrow: an arch over the eye, thicker toward the nose, made of short strokes
            lx = (p[:, 0] - ec[0]) * sg; ly = p[:, 1] - ec[1]; f = (lx + 0.021) / 0.052  # 0 at the inner end, 1 at the tail
            arch = 0.0215 + 0.0075 * np.sin(np.clip(f, 0, 1) * math.pi * 0.62) - 0.0065 * np.clip(f - 0.62, 0, 1) / 0.38
            half = 0.0078 * (1 - 0.62 * np.clip(f, 0, 1) ** 1.3)
            d = np.abs(ly - arch) / np.maximum(1e-5, half)
            st = vnoise(np.stack([(lx * 1 + ly * 0.9) * 2600, (ly - lx * 0.5) * 420, lx * 0], -1))
            k = np.clip((1.0 - d) * 1.6, 0, 1) * np.clip(f * 7 + 0.5, 0, 1) * np.clip((1.02 - f) * 6, 0, 1) * (0.45 + 0.8 * st) * (nn[:, 2] < 0.1)
            k = np.clip(k, 0, 0.9)[:, None]; c = c * (1 - k) + brow * (0.7 + 0.5 * st[:, None]) * k
            # lash line and the shadow inside the lids: skin that faces away from the front, right at the eyeball
            de = np.linalg.norm(p - ec, axis=1); k = np.clip((er * 1.22 - de) / (er * 0.2), 0, 1) * np.clip((nn[:, 2] + 0.55) / 0.5, 0, 1) * 0.8
            c = c * (1 - k[:, None]) + np.array([0.09, 0.05, 0.04]) * k[:, None]
        A[iy, ix] = c
    return A

def save_img(A, path, quality=88):
    h, w = A.shape[:2]; rgba = np.ones((h, w, 4), dtype=np.float32); rgba[..., :3] = np.clip(A, 0, 1)
    img = bpy.data.images.new('o', w, h, alpha=False); img.pixels.foreach_set(rgba.ravel()); img.file_format = 'WEBP' if path.endswith('.webp') else 'PNG'
    img.filepath_raw = path; img.save(filepath=path, quality=quality); bpy.data.images.remove(img)

# ------------------------------------------------------------------ the parts
def head_part(H, tone, ti, lods):
    body = fit.to_object('body', H['fit'], H['faces'], H['W'], H['fuv'])
    vg = body.vertex_groups.new(name='scalp'); vg.add([int(i) for i in H['groups'].get('scalp', [])], 1.0, 'REPLACE')
    def cut(bm, wsum):
        bisect(bm, list(bm.faces), NECK_P - NECK_N * 0.016, NECK_N, clear_inner=True)
    edit(body, cut)
    src = None
    for lod, ratio in lods:
        P = extract(body, ratio=ratio)
        # the eyeballs: real spheres in the sockets, looking a little inward and down like a relaxed gaze
        co, tris, cuv, W, X = P['co'], P['tris'], P['cuv'], P['W'], P['X']
        reg = [region_of(c.mean(0)) for c in cuv]; cn = np.zeros_like(cuv)
        for t, r in enumerate(reg): cn[t] = remap_uv(cuv[t], r)
        seg, rings = (14, 8) if lod == 0 else (8, 5) if lod == 1 else (0, 0)
        add_co, add_tri, add_uv = [], [], []
        if seg:
            for sd in 'LR':
                c, r = H['eyes_fit'][sd]; r = r * 0.985; base = len(co) + len(add_co); d = EYE_TILE
                for i in range(rings + 1):
                    ph = math.pi * 0.62 * i / rings  # the front cap only
                    for j in range(seg):
                        th = 2 * math.pi * j / seg; x = math.sin(ph) * math.cos(th); y = math.sin(ph) * math.sin(th); z = -math.cos(ph)
                        add_co.append(c + r * np.array([x, y, z])); rr = min(0.49, ph / (math.pi * 0.5) * 0.5); tn = EYE_N
                        add_uv.append([(int(d[0] * AW) + (0.5 + rr * math.cos(th)) * tn) / AW, (int(d[1] * AH) + (0.5 + rr * math.sin(th)) * tn) / AH])
                for i in range(rings):
                    for j in range(seg):
                        a = base + i * seg + j; b = base + i * seg + (j + 1) % seg; c2 = a + seg; d2 = b + seg
                        add_tri.append([a, b, c2]); add_tri.append([b, d2, c2])
            n0 = len(co); co = np.vstack([co, np.array(add_co)]); Wn = np.zeros((len(add_co), NB)); Wn[:, BI['head']] = 1; W = np.vstack([W, Wn])
            at = np.array(add_tri); tris = np.vstack([tris, at]); auv = np.array(add_uv); cn = np.vstack([cn, auv[at - n0]])
            X = {k: np.concatenate([v, np.zeros(len(add_co))]) for k, v in X.items()}
        P2 = dict(co=co, tris=tris, W=W, X=X)
        if lod == 0:
            img = bpy.data.images.load(os.path.join(SKINS, tone['skin'])); w, h = img.size; px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
            src = px.reshape(h, w, 4)[..., :3].copy(); bpy.data.images.remove(img)
            A = build_atlas(src, dict(co=P['co'], tris=P['tris'], X=P['X']), cn[:len(P['tris'])], tone, H['eyes_fit'])
            save_img(A, os.path.join(OUT, 'skin_%d.webp' % ti))
            if PREV: save_img(A[::2, ::2], os.path.join(PREV, 'skin_%d.png' % ti))
            d = REG['head']['dst']; face = A[int(AH * 0.55):int(AH * 0.75), int(AW * 0.42):int(AW * 0.58)].reshape(-1, 3).mean(0)
            tone['rgb'] = [float(x) for x in face]
        flags = (np.clip(X.get('scalp', np.zeros(len(co))), 0, 1) * 255).astype(np.uint8)
        pack('head%d' % ti, lod, P2, cn, flags)
    bpy.data.objects.remove(body)

def body_parts(H, lods):
    body = fit.to_object('body', H['fit'], H['faces'], H['W'], H['fuv'])
    # ---- hands (skin; gloves are the same mesh pushed out a little by the game)
    for sd, sx in (('L', -1), ('R', 1)):
        ob = dup(body, 'hand' + sd)
        def cut(bm, wsum):
            keep_faces(bm, [f for f in bm.faces if all(wsum(v, ARMS(sd)) > 0.5 for v in f.verts) and f.calc_center_median().y < 1.0])
            bisect(bm, list(bm.faces), (0, 0.9, 0), (0, 1, 0), clear_outer=True)
        edit(ob, cut)
        for lod, ratio in lods:
            P = extract(ob, ratio=ratio); cn = np.zeros_like(P['cuv'])
            for t in range(len(P['tris'])): cn[t] = remap_uv(P['cuv'][t], 'hands')
            pack('hand' + sd, lod, P, cn)
        bpy.data.objects.remove(ob)
    # ---- shirt: trunk and sleeves from the collar to the hem and the wrists, smoothed so it reads as cloth, not skin
    def shirt_cut(bm, wsum):
        arm = [f for f in bm.faces if all(wsum(v, ARM_ALL) > 0.5 for v in f.verts) and f.calc_center_median().y < 1.2]
        bisect(bm, arm, (0, 0.875, 0), (0, 1, 0), clear_inner=True)
        rest = [f for f in bm.faces if not (all(wsum(v, ARM_ALL) > 0.5 for v in f.verts) and f.calc_center_median().y < 1.2)]
        bisect(bm, rest, (0, 0.9, 0), (0, 1, 0), clear_inner=True)
        bisect(bm, list(bm.faces), NECK_P, NECK_N, clear_outer=True)
        smooth(bm, 6)
    sh = dup(body, 'shirt'); edit(sh, shirt_cut)
    def trouser_cut(bm, wsum):
        del_faces(bm, [f for f in bm.faces if any(wsum(v, ARM_ALL) > 0.5 for v in f.verts)])
        bisect(bm, list(bm.faces), (0, 1.07, 0), (0, 1, 0), clear_outer=True)
        bisect(bm, list(bm.faces), (0, 0.19, 0), (0, 1, 0), clear_inner=True)
        smooth(bm, 5)
    tr = dup(body, 'trousers'); edit(tr, trouser_cut)
    for ob, kind in ((sh, 'shirt'), (tr, 'trousers')):
        for lod, ss, ratio in ((0, 1, None), (1, 0, None), (2, 0, 0.22)):
            P = extract(ob, subsurf=ss, ratio=ratio); pack(kind, lod, P, cloth_uv(P, kind))
            if lod == 0 and kind == 'shirt': measure_torso(P)
    # ---- measurements the game's own gear code needs
    foot = H['fit'][(H['W'][:, BI['footR']] + H['W'][:, BI['llegR']] > 0.5) & (H['fit'][:, 0] > 0) & (H['fit'][:, 1] < 0.32)]
    rows = []
    for z in np.arange(-0.24, 0.10, 0.01):
        s = foot[(np.abs(foot[:, 2] - z) < 0.008) & (foot[:, 1] < 0.14)]
        if len(s) > 2: rows.append([round(float(z), 3), round(float(s[:, 0].min()), 4), round(float(s[:, 0].max()), 4), round(float(s[:, 1].max()), 4), round(float(s[:, 1].min()), 4)])
    META['foot'] = rows
    shin = []
    for y in np.arange(0.06, 0.34, 0.02):
        s = foot[np.abs(foot[:, 1] - y) < 0.012]
        if len(s) > 2: shin.append([round(float(y), 3), round(float(s[:, 0].min()), 4), round(float(s[:, 0].max()), 4), round(float(s[:, 2].min()), 4), round(float(s[:, 2].max()), 4)])
    META['shin'] = shin
    if PREV:
        import preview
        for o in bpy.data.objects: o.hide_render = o not in (sh, tr)
        m = bpy.data.materials.new('m'); m.diffuse_color = (0.5, 0.55, 0.6, 1)
        for o in (sh, tr): o.data.materials.append(m); mm = o.modifiers.new('ss', 'SUBSURF'); mm.levels = mm.render_levels = 1
        preview.shots(PREV + '/cloth', preview.BODY)
    for o in (body, sh, tr): bpy.data.objects.remove(o)

META = {}
def measure_torso(P):
    co, W = P['co'], P['W']; t = co[(W[:, ARM_ALL].sum(1) < 0.25)]; rows = []
    for y in [0.90, 0.95, 1.01, 1.07, 1.14, 1.21, 1.29, 1.365, 1.43, 1.462, 1.492]:
        s = t[np.abs(t[:, 1] - y) < 0.014]
        if len(s) > 3: rows.append([y, round(float(np.abs(s[:, 0]).max()), 4), round(float(-s[:, 2].min()), 4), round(float(s[:, 2].max()), 4)])
    META['torso'] = rows

def main():
    lods_skin = ((0, None), (1, 0.2), (2, 0.045))
    for ti, tone in enumerate(TONES):
        H = fit.make_human({**BODY_MACRO, 'age': tone['age']}, tone['race']); fit.fit(H, log=log if ti == 0 else (lambda *a: None))
        head_part(H, tone, ti, lods_skin)
        if ti == 0:
            META.update(head_dz=H['head_dz'], head_scale=H['head_scale'], eyes={k: [v[0].tolist(), v[1]] for k, v in H['eyes_fit'].items()},
                        joints={k: {n: p.tolist() for n, p in v.items()} for k, v in H['joints'].items()})
            body_parts(H, ((0, None), (1, 0.3), (2, 0.07)))
            # the head and neck as numbers, for the collars, helmets and face gear the game builds itself
            f = H['fit']; W = H['W']; ears = set(H['groups'].get('ears', [])); notear = np.array([i not in ears for i in range(len(f))])
            nk = f[(W[:, BI['neck']] + W[:, BI['chest']] > 0.6) & (np.abs(f[:, 0]) < 0.09)]; rows = []
            for y in np.arange(1.48, 1.60, 0.01):
                q = nk[np.abs(nk[:, 1] - y) < 0.008]
                if len(q) > 3: rows.append([round(float(y), 3), round(float(np.abs(q[:, 0]).max()), 4), round(float(q[:, 2].min()), 4), round(float(q[:, 2].max()), 4)])
            META['neck'] = rows
            hd = f[(W[:, BI['head']] > 0.9) & notear]; rows = []
            for y in np.arange(1.60, 1.81, 0.01):
                q = hd[np.abs(hd[:, 1] - y) < 0.006]
                if len(q) > 3: rows.append([round(float(y), 3), round(float(np.abs(q[:, 0]).max()), 4), round(float(q[:, 2].min()), 4), round(float(q[:, 2].max()), 4)])
            META['head'] = rows
            e = f[[i for i in ears if i < len(f)]]; e = e[e[:, 0] > 0]; META['ear'] = [[round(float(v), 4) for v in e.min(0)], [round(float(v), 4) for v in e.max(0)]]
    META['skeleton'] = [[b[0], b[1], b[2], b[3], b[4]] for b in SK]
    META['tones'] = [dict(rgb=t['rgb'], hair=list(t['hair'])) for t in TONES]
    META['atlas'] = [AW, AH]; META['clothTile'] = CLOTH_TILE; META['parts'] = PARTS
    META['source'] = 'MakeHuman / MPFB base mesh and skins, CC0'
    with open(os.path.join(OUT, 'people.bin'), 'wb') as f: f.write(BIN)
    with open(os.path.join(OUT, 'people.json'), 'w') as f: json.dump(META, f, separators=(',', ':'))
    log('wrote', len(BIN), 'bytes')

main()
