# Shared library for the Steel Tide cosmetics (helmets, uniforms) built in Blender 5.1 by script.
#
# Coordinates: items are AUTHORED IN GAME SPACE (metres, Y up, forward = -Z, right = +X, origin at the soles; the same
# space as js/units/v2/human.js and tools/people/fit.py) and written into Blender as (game x, -game z, game y). The glTF
# exporter's own +Y-up change then lands every vertex back in game space, so the game uses the positions as they are.
#
# One item script (e.g. diver_helmet.py) does:
#   H = kit.fitted_body(0)            # (optional) the MakeHuman body on the game skeleton, as arrays (runs MPFB)
#   kit.reset()                       # empty scene, Cycles, metres
#   ... build parts with the modelling helpers (each returns a Blender mesh object, already in place) ...
#   lod0 = kit.join([...]); kit.unwrap(lod0); maps = kit.bake(lod0, size)   # normal / AO / colour / roughness / metal
#   kit.export_glb(path, lods, maps, ...)                                    # Draco geometry, WebP textures
# Everything is modelled here: no downloaded models, textures or HDRIs.
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, 'tools', 'people'))

def log(*a):
    print('[cosmetics]', *a); sys.stdout.flush()

# ------------------------------------------------------------------ the game's skeleton (kept equal to fit.SK / human.js SK)
SK = [
    ('hips', -1, 0, 0.955, 0), ('spine', 0, 0, 1.07, 0.004), ('chest', 1, 0, 1.24, 0.004), ('neck', 2, 0, 1.495, 0.012), ('head', 3, 0, 1.59, 0.006),
    ('uarmR', 2, 0.198, 1.42, 0), ('larmR', 5, 0.198, 1.125, 0), ('handR', 6, 0.198, 0.861, 0), ('finR', 7, 0.198, 0.75, 0), ('fin2R', 8, 0.198, 0.721, 0), ('thumbR', 7, 0.195, 0.82, -0.031),
    ('uarmL', 2, -0.198, 1.42, 0), ('larmL', 11, -0.198, 1.125, 0), ('handL', 12, -0.198, 0.861, 0), ('finL', 13, -0.198, 0.75, 0), ('fin2L', 14, -0.198, 0.721, 0), ('thumbL', 13, -0.195, 0.82, -0.031),
    ('ulegR', 0, 0.092, 0.955, 0), ('llegR', 17, 0.092, 0.515, 0), ('footR', 18, 0.092, 0.085, 0),
    ('ulegL', 0, -0.092, 0.955, 0), ('llegL', 20, -0.092, 0.515, 0), ('footL', 21, -0.092, 0.085, 0),
]

def _check_sk():
    try:
        import fit
        assert [tuple(b) for b in fit.SK] == [tuple(b) for b in SK], 'kit.SK differs from tools/people/fit.py SK'
    except ImportError:
        pass

# ------------------------------------------------------------------ coordinates
def B(p):
    """game -> Blender"""
    return Vector((p[0], -p[2], p[1]))

def G(p):
    """Blender -> game"""
    return Vector((p[0], p[2], -p[1]))

def B_np(a):
    a = np.asarray(a, dtype=np.float64); return np.stack([a[..., 0], -a[..., 2], a[..., 1]], axis=-1)

def G_np(a):
    a = np.asarray(a, dtype=np.float64); return np.stack([a[..., 0], a[..., 2], -a[..., 1]], axis=-1)

def TM(pos=(0, 0, 0), rot=(0, 0, 0), scale=1.0, order='XYZ'):
    """A transform in GAME space: translate * rotate (Euler, radians, game axes) * scale."""
    s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    return Matrix.Translation(Vector(pos)) @ Euler(rot, order).to_matrix().to_4x4() @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))

def frame_to(origin, z_axis, up_hint=(0, 1, 0)):
    """Game-space matrix whose local +Z is z_axis and local +Y is as close to up_hint as possible."""
    z = Vector(z_axis).normalized(); y = Vector(up_hint); y = (y - z * y.dot(z))
    if y.length < 1e-6: y = z.orthogonal()
    y.normalize(); x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4(); m.translation = Vector(origin); return m

def frame_y(origin, y_axis, hint=(0, 0, -1)):
    """Game-space matrix whose local +Y is y_axis (for parts turned about Y: revolve, cylinder, hexbolt)."""
    y = Vector(y_axis).normalized(); z = Vector(hint); z = (z - y * z.dot(y))
    if z.length < 1e-6: z = y.orthogonal()
    z.normalize(); x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4(); m.translation = Vector(origin); return m

def plate(name, outline, surf, front, back, rings=4, mat=None):
    """A solid plate whose outline (closed list of game (x, y)) is laid on a surface: surf(x, y) -> (point, outward
    normal) in game space. The front face sits `front` along the normal, the back `back` (front > back). Rings of
    vertices follow the surface's curve inside the outline."""
    cx = sum(p[0] for p in outline) / len(outline); cy = sum(p[1] for p in outline) / len(outline); n = len(outline)
    def sheet(off):
        rows = []
        for i in range(rings + 1):
            s = 1 - i / rings; row = []
            for (x, y) in outline:
                px, py = cx + (x - cx) * s, cy + (y - cy) * s; p, nn = surf(px, py); row.append(tuple(Vector(p) + Vector(nn) * off))
            rows.append(row)
        return rows
    F = sheet(front); Bk = sheet(back)
    P = np.array(Bk[::-1] + F)  # back centre -> back edge -> front edge -> front centre: one closed tube capped at both ends
    return from_grid(name, P, True, False, False, mat)  # the centre rows are single points: they close the plate

# ------------------------------------------------------------------ scene
def reset(samples=64):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'; sc.unit_settings.scale_length = 1.0
    sc.render.engine = 'CYCLES'
    try:
        sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = False
    except Exception:
        pass
    sc.view_settings.view_transform = 'Standard'
    return sc

def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob); return ob

def remove(ob):
    me = ob.data if ob.type == 'MESH' else None
    bpy.data.objects.remove(ob, do_unlink=True)
    if me is not None and me.users == 0: bpy.data.meshes.remove(me)

def activate(ob, others=()):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in (ob, *others): o.select_set(True)
    bpy.context.view_layer.objects.active = ob

# ------------------------------------------------------------------ the fitted body
def fitted_body(tone=0, log_fn=None):
    """Runs MPFB (tools/people/fit.py: make_human + fit) and returns the dict H with H['fit'] (N,3 game space),
    H['faces'], H['W'] (N,23 weights). NOTE: this resets the Blender scene, so call it before reset()/modelling."""
    import fit
    T = tones()
    tn = T['TONES'][tone]
    H = fit.make_human({**T['BODY_MACRO'], 'age': tn['age']}, tn['race']); fit.fit(H, log=log_fn or (lambda *a: None))
    _check_sk()
    return H

def tones():
    """BODY_MACRO and TONES from tools/people/build.py (read from its source: importing build.py would run it)."""
    import ast
    src = open(os.path.join(REPO, 'tools', 'people', 'build.py'), encoding='utf-8').read(); out = {}
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and getattr(node.targets[0], 'id', '') in ('BODY_MACRO', 'TONES'):
            out[node.targets[0].id] = eval(compile(ast.Expression(node.value), 'build.py', 'eval'), {'__builtins__': {}, 'dict': dict})
    return out

def body_object(H, name='body', mat=None):
    """The fitted body as a Blender mesh (for previews and for checking clearance)."""
    co = B_np(H['fit']); me = bpy.data.meshes.new(name); me.from_pydata([tuple(c) for c in co], [], H['faces']); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    if mat: ob.data.materials.append(mat)
    return ob

def game_part(name, lod=0, people_dir=None):
    """A part exactly as the game draws it, read from assets/people (people.json + people.bin): (co (N,3 game), tris (M,3))."""
    d = people_dir or os.path.join(REPO, 'assets', 'people')
    meta = json.load(open(os.path.join(d, 'people.json'))); raw = open(os.path.join(d, 'people.bin'), 'rb').read()
    p = meta['parts'][name][str(lod)]
    co = np.frombuffer(raw, np.float32, p['nv'] * 3, p['pos']).reshape(-1, 3).astype(np.float64)
    idx = np.frombuffer(raw, np.uint32 if p['i32'] else np.uint16, p['ni'], p['idx']).astype(np.int64).reshape(-1, 3)
    return co, idx

def people_meta():
    return json.load(open(os.path.join(REPO, 'assets', 'people', 'people.json')))

def mesh_object(name, co_game, faces, mat=None, smooth=True):
    co = B_np(co_game); me = bpy.data.meshes.new(name); me.from_pydata([tuple(c) for c in co], [], [tuple(int(i) for i in f) for f in faces]); me.update()
    for p in me.polygons: p.use_smooth = smooth
    ob = link(bpy.data.objects.new(name, me))
    if mat: ob.data.materials.append(mat)
    return ob

# ------------------------------------------------------------------ armature and skinning
def armature(name='rig'):
    """The game's 23 bones at their bind positions. Bones point at their first child (or straight up)."""
    arm = bpy.data.armatures.new(name); ob = link(bpy.data.objects.new(name, arm)); activate(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    kids = {i: [j for j, b in enumerate(SK) if b[1] == i] for i in range(len(SK))}
    for i, (n, par, x, y, z) in enumerate(SK):
        b = arm.edit_bones.new(n); h = B((x, y, z)); b.head = h
        k = [j for j in kids[i] if (Vector(SK[j][2:5]) - Vector((x, y, z))).length > 0.02]
        t = B(SK[k[0]][2:5]) if k and n not in ('chest',) else h + Vector((0, 0, 0.06))
        if n.startswith(('uleg', 'lleg')): t = B(SK[k[0]][2:5])
        if n.startswith('foot'): t = h + Vector((0, -0.12, -0.06))
        b.tail = t; b.roll = 0.0
        if par >= 0: b.parent = eb[SK[par][0]]
        eb[n] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob

def skin(ob, rig, weights=None):
    """Parents ob to rig with an Armature modifier. weights: {bone: weight} for every vertex (default {'head': 1})."""
    weights = weights or {'head': 1.0}
    for bn, w in weights.items():
        vg = ob.vertex_groups.get(bn) or ob.vertex_groups.new(name=bn); vg.add(list(range(len(ob.data.vertices))), w, 'REPLACE')
    ob.parent = rig; ob.matrix_parent_inverse = Matrix.Identity(4)
    m = ob.modifiers.new('rig', 'ARMATURE'); m.object = rig
    return ob

# ------------------------------------------------------------------ mesh building (game space in, Blender object out)
def from_grid(name, P, closed_u=True, cap0=False, cap1=False, mat=None, uv=True, flip=False, center=None):
    """A quad sheet from an (nr, nc, 3) array of GAME-space points. Rows run along v, columns along u (closed round u
    unless closed_u is False). cap0 / cap1 close the first / last row with a fan. A 'param' UV map (u, v in 0..1) is kept
    for procedural shading."""
    P = np.asarray(P, dtype=np.float64); nr, nc = P.shape[:2]
    bm = bmesh.new(); V = [[bm.verts.new(B(P[i, j])) for j in range(nc)] for i in range(nr)]
    cols = nc if closed_u else nc - 1; faces = []
    for i in range(nr - 1):
        for j in range(cols):
            a, b, c, d = V[i][j], V[i][(j + 1) % nc], V[i + 1][(j + 1) % nc], V[i + 1][j]
            q = (a, d, c, b) if flip else (a, b, c, d)
            try: f = bm.faces.new(q); faces.append((f, (i, j)))
            except ValueError: pass
    def cap(row, rev):
        c = bm.verts.new(B(P[row].mean(0)))
        for j in range(cols):
            a, b = V[row][j], V[row][(j + 1) % nc]
            q = (c, b, a) if rev != flip else (c, a, b)
            try: bm.faces.new(q)
            except ValueError: pass
    if cap0: cap(0, False)
    if cap1: cap(nr - 1, True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if not flip and center is not None:  # open sheets: face away from `center` (game space)
        c = B(center); bm.normal_update(); s = sum((f.calc_center_median() - c).dot(f.normal) * f.calc_area() for f in bm.faces)
        if s < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
    if uv:
        lay = bm.loops.layers.uv.new('param')
        for f, (i, j) in faces:
            if not f.is_valid: continue
            for l, (di, dj) in zip(f.loops, ((0, 0), (0, 1), (1, 1), (1, 0)) if not flip else ((0, 0), (1, 0), (1, 1), (0, 1))):
                l[lay].uv = ((j + dj) / max(1, cols), (i + di) / max(1, nr - 1))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    if mat: ob.data.materials.append(mat)
    return ob

def revolve(name, profile, seg, M=None, mat=None, cap0=False, cap1=False, a0=0.0, sx=1.0, sz=1.0, wobble=None):
    """A lathe: profile = [(radius, y), ...] in the local frame, turned about local +Y; M (game-space matrix) places it.
    sx / sz stretch it into an oval; wobble(theta, row) -> radius factor."""
    M = M or Matrix.Identity(4); P = np.zeros((len(profile), seg, 3))
    for i, (r, y) in enumerate(profile):
        for j in range(seg):
            t = a0 + 2 * math.pi * j / seg; k = wobble(t, i) if wobble else 1.0
            P[i, j] = (M @ Vector((math.cos(t) * r * sx * k, y, math.sin(t) * r * sz * k)))[:]
    return from_grid(name, P, True, cap0, cap1, mat)

def sweep(name, pts, radius, seg=10, mat=None, caps=True, twist=0.0, ribs=None, up=(0, 1, 0)):
    """A tube along a polyline of GAME points. radius: number or per-point list. ribs(k, s) -> radius factor at ring k
    (s = arc length) for corrugated hoses. Frames are parallel-transported, so the tube does not twist."""
    pts = [Vector(p) for p in pts]; n = len(pts); R = radius if isinstance(radius, (list, tuple)) else [radius] * n
    T = []
    for i in range(n):
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]; T.append((b - a).normalized())
    u = Vector(up); u = (u - T[0] * u.dot(T[0])); u = u.normalized() if u.length > 1e-6 else T[0].orthogonal().normalized()
    P = np.zeros((n, seg, 3)); s = 0.0
    for i in range(n):
        if i:
            s += (pts[i] - pts[i - 1]).length
            ax = T[i - 1].cross(T[i])
            if ax.length > 1e-9: u = Matrix.Rotation(T[i - 1].angle(T[i]), 3, ax.normalized()) @ u
            u = (u - T[i] * u.dot(T[i])).normalized()
        v = T[i].cross(u); k = ribs(i, s) if ribs else 1.0
        for j in range(seg):
            a = 2 * math.pi * j / seg + twist * s
            P[i, j] = (pts[i] + (u * math.cos(a) + v * math.sin(a)) * R[i] * k)[:]
    return from_grid(name, P, True, caps, caps, mat)

def resample(pts, step):
    """Even points along a polyline (game space)."""
    pts = [Vector(p) for p in pts]; out = [pts[0]]; acc = 0.0
    seglen = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]; total = sum(seglen); n = max(2, int(round(total / step)))
    d = [0.0]
    for l in seglen: d.append(d[-1] + l)
    for k in range(1, n + 1):
        t = total * k / n; i = max(0, min(len(seglen) - 1, np.searchsorted(d, t) - 1)); f = (t - d[i]) / max(1e-9, seglen[i])
        out.append(pts[i].lerp(pts[i + 1], f))
    return out

def bezier(p0, p1, p2, p3, n):
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    return [((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3 for t in (k / (n - 1) for k in range(n))]

def rbox(name, size, M=None, bevel=0.002, segments=2, mat=None):
    """A box (game-space size, centred) with real rounded edges."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    M = M or Matrix.Identity(4)
    for v in bm.verts: v.co = B(M @ v.co)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if mat: ob.data.materials.append(mat)
    if bevel > 0: bevel_mod(ob, bevel, segments, angle=30)
    smooth(ob)
    return ob

def cylinder(name, r, h, seg=16, M=None, bevel=0.0015, segments=2, mat=None, r1=None):
    """A capped cylinder along local Y (centred), real bevelled rims. r1: radius at the top (cone)."""
    r1 = r if r1 is None else r1
    ob = revolve(name, [(r, -h / 2), (r1, h / 2)], seg, M, mat, cap0=True, cap1=True)
    if bevel > 0: bevel_mod(ob, bevel, segments, angle=35)
    return ob

def hexbolt(name, r, h, M=None, mat=None, washer=True):
    """A hex-head screw with a washer, standing on local Y = 0 along +Y."""
    parts = [cylinder(name + '_hex', r, h, 6, (M or Matrix.Identity(4)) @ TM((0, h / 2 + (0.0012 if washer else 0), 0), (0, math.pi / 6, 0)), r * 0.12, 1, mat)]
    if washer: parts.append(cylinder(name + '_w', r * 1.45, 0.0012, 8, (M or Matrix.Identity(4)) @ TM((0, 0.0006, 0)), 0.0, 1, mat))
    return join(parts, name)

# ------------------------------------------------------------------ modifiers and clean-up
def bevel_mod(ob, width, segments=2, angle=30, harden=False, limit='ANGLE'):
    m = ob.modifiers.new('bevel', 'BEVEL'); m.width = width; m.segments = segments; m.limit_method = limit
    if limit == 'ANGLE': m.angle_limit = math.radians(angle)
    m.harden_normals = harden; m.miter_outer = 'MITER_ARC'; m.use_clamp_overlap = True
    return m

def solidify(ob, th, offset=-1.0, rim=True):
    m = ob.modifiers.new('solid', 'SOLIDIFY'); m.thickness = th; m.offset = offset; m.use_rim = rim; m.use_even_offset = True; m.use_quality_normals = True
    return m

def subsurf(ob, levels=1):
    m = ob.modifiers.new('ss', 'SUBSURF'); m.levels = levels; m.render_levels = levels; return m

def boolean(ob, cutter, op='DIFFERENCE'):
    m = ob.modifiers.new('bool', 'BOOLEAN'); m.operation = op; m.object = cutter
    for s in ('EXACT', 'MANIFOLD', 'FLOAT', 'FAST'):
        try: m.solver = s; break
        except TypeError: continue
    return m

def apply(ob):
    """Applies every modifier (except Armature) without the operator context."""
    keep = [(m.name, m.type, getattr(m, 'object', None)) for m in ob.modifiers if m.type == 'ARMATURE']
    for m in list(ob.modifiers):
        if m.type == 'ARMATURE': ob.modifiers.remove(m)
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data; ob.modifiers.clear(); ob.data = me
    if old.users == 0: bpy.data.meshes.remove(old)
    for n, t, o in keep:
        m = ob.modifiers.new(n, t); m.object = o
    drop_empty_slots(ob)
    return ob

def drop_empty_slots(ob):
    """Removes material slots left empty (e.g. by a boolean's cutter); their faces go to slot 0."""
    me = ob.data
    while True:
        bad = [i for i, m in enumerate(me.materials) if m is None]
        if not bad or len(me.materials) == 1: return ob
        i = bad[-1]; idx = [0] * len(me.polygons); me.polygons.foreach_get('material_index', idx)
        idx = [0 if v == i else (v - 1 if v > i else v) for v in idx]
        me.materials.pop(index=i); me.polygons.foreach_set('material_index', idx)

def smooth(ob, on=True):
    for p in ob.data.polygons: p.use_smooth = on
    return ob

def sharp_by_angle(ob, deg=40):
    """Marks edges sharper than deg as sharp (the exporter splits normals there) and shades the rest smooth."""
    bm = bmesh.new(); bm.from_mesh(ob.data); lim = math.radians(deg)
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0) < lim
        else: e.smooth = True
    for f in bm.faces: f.smooth = True
    bm.to_mesh(ob.data); bm.free(); ob.data.update(); return ob

def join(objs, name):
    objs = [o for o in objs if o is not None]
    for o in objs: apply(o)
    if len(objs) == 1: objs[0].name = name; return objs[0]
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    ob = objs[0]; ob.name = name; ob.data.name = name; return ob

def tag(ob, key, value=1):
    """Stores a per-face integer attribute (e.g. 'detail' = 1 for small parts dropped from the far detail level)."""
    me = ob.data; a = me.attributes.get(key) or me.attributes.new(key, 'INT', 'FACE')
    a.data.foreach_set('value', [value] * len(me.polygons)); return ob

def tris(ob):
    me = ob.data; me.calc_loop_triangles(); return len(me.loop_triangles)

def clean(ob, dist=1e-6):
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.dissolve_degenerate(bm, dist=dist * 0.1, edges=bm.edges); bm.to_mesh(ob.data); bm.free(); ob.data.update(); return ob

def copy(ob, name):
    o = ob.copy(); o.data = ob.data.copy(); o.name = name; o.data.name = name; link(o)
    o.modifiers.clear(); return o

# ------------------------------------------------------------------ materials (procedural, then baked)
# A material is a Principled BSDF whose Base Color, Roughness, Metallic and Normal come from four sockets we remember,
# so bake() can route each one to an Emission shader in turn.
PBR = {}  # material name -> dict(color=socket, rough=socket, metal=socket, normal=socket or None)

class Nodes:
    def __init__(self, mat):
        self.m = mat; self.nt = mat.node_tree; self.N = self.nt.nodes; self.L = self.nt.links; self.x = -1200
    def new(self, kind, **props):
        n = self.N.new(kind); n.location = (self.x, len(self.N) * -40); self.x += 30
        for k, v in props.items(): setattr(n, k, v)
        return n
    def link(self, a, b): self.L.new(a, b); return b
    def inp(self, n, name, value=None, src=None):
        s = sock(n.inputs, name)
        if src is not None: self.L.new(src, s)
        elif value is not None: s.default_value = value
        return s
    # small building blocks: each returns an output socket
    def coord(self, kind='Object'):
        if not hasattr(self, '_tc'): self._tc = self.new('ShaderNodeTexCoord')
        return self._tc.outputs[kind]
    def uvmap(self, name='param'):
        n = self.new('ShaderNodeUVMap'); n.uv_map = name; return n.outputs['UV']
    def noise(self, scale, detail=4.0, rough=0.55, vec=None, dims='3D', distortion=0.0):
        n = self.new('ShaderNodeTexNoise'); n.noise_dimensions = dims
        self.inp(n, 'Scale', scale); self.inp(n, 'Detail', detail); self.inp(n, 'Roughness', rough); self.inp(n, 'Distortion', distortion)
        self.inp(n, 'Vector', src=vec if vec is not None else self.coord()); return n.outputs['Fac']
    def voronoi(self, scale, vec=None, feature='F1', out='Distance'):
        n = self.new('ShaderNodeTexVoronoi'); n.feature = feature; self.inp(n, 'Scale', scale); self.inp(n, 'Vector', src=vec if vec is not None else self.coord())
        return n.outputs[out]
    def math(self, op, a, b=None, clamp=False):
        n = self.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: self.L.new(v, n.inputs[i])
        return n.outputs[0]
    def ramp(self, fac, a, b, lo=0.0, hi=1.0):  # map fac from [lo, hi] to [a, b] (floats), clamped
        n = self.new('ShaderNodeMapRange'); n.clamp = True
        self.L.new(fac, n.inputs['Value']); n.inputs['From Min'].default_value = lo; n.inputs['From Max'].default_value = hi
        n.inputs['To Min'].default_value = a; n.inputs['To Max'].default_value = b; return n.outputs['Result']
    def mix(self, fac, a, b, kind='RGBA', blend='MIX'):
        n = self.new('ShaderNodeMix'); n.data_type = kind
        if kind == 'RGBA': n.blend_type = blend
        f = n.inputs[0]
        if isinstance(fac, (int, float)): f.default_value = fac
        else: self.L.new(fac, f)
        sa = [s for s in n.inputs if s.name == 'A' and s.enabled][0]; sb = [s for s in n.inputs if s.name == 'B' and s.enabled][0]
        for s, v in ((sa, a), (sb, b)):
            if isinstance(v, (int, float)): s.default_value = v
            elif isinstance(v, (tuple, list)): s.default_value = tuple(v) + ((1.0,) if len(v) == 3 else ())
            else: self.L.new(v, s)
        return [s for s in n.outputs if s.enabled][0]
    def ao(self, dist=0.02, inside=False, samples=16):
        n = self.new('ShaderNodeAmbientOcclusion'); n.inside = inside; n.samples = samples; self.inp(n, 'Distance', dist); return n.outputs['AO']
    def bump(self, height, strength, distance=0.001, normal=None):
        n = self.new('ShaderNodeBump'); self.inp(n, 'Strength', strength); self.inp(n, 'Distance', distance); self.L.new(height, sock(n.inputs, 'Height'))
        if normal is not None: self.L.new(normal, sock(n.inputs, 'Normal'))
        return n.outputs['Normal']
    def sep(self, vec):
        n = self.new('ShaderNodeSeparateXYZ'); self.L.new(vec, n.inputs[0]); return n.outputs
    def vmath(self, op, a, b=None):
        n = self.new('ShaderNodeVectorMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (tuple, list)): n.inputs[i].default_value = v
            else: self.L.new(v, n.inputs[i])
        return n.outputs[0] if op not in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs[1]

def sock(socks, name):
    for s in socks:
        if s.name == name and getattr(s, 'enabled', True): return s
    for s in socks:
        if s.identifier == name: return s
    raise KeyError(name)

def material(name, build):
    """build(nodes) -> dict(color=, rough=, metal=, normal=) : sockets or constants. Returns the material."""
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; nt.nodes.clear(); n = Nodes(m)
    out = n.new('ShaderNodeOutputMaterial'); out.location = (400, 0); bsdf = n.new('ShaderNodeBsdfPrincipled'); bsdf.location = (100, 0)
    n.L.new(bsdf.outputs[0], out.inputs['Surface'])
    spec = build(n); res = {}
    for key, inp in (('color', 'Base Color'), ('rough', 'Roughness'), ('metal', 'Metallic'), ('normal', 'Normal')):
        v = spec.get(key)
        if v is None: res[key] = None; continue
        if isinstance(v, (int, float)): sock(bsdf.inputs, inp).default_value = v; v = _const(n, v)
        elif isinstance(v, (tuple, list)): sock(bsdf.inputs, inp).default_value = tuple(v) + ((1.0,) if len(v) == 3 else ()); v = _const_rgb(n, v)
        else: n.L.new(v, sock(bsdf.inputs, inp))
        res[key] = v
    if spec.get('coat'): sock(bsdf.inputs, 'Coat Weight').default_value = spec['coat']; sock(bsdf.inputs, 'Coat Roughness').default_value = spec.get('coat_rough', 0.08)
    PBR[m.name] = dict(res, bsdf=bsdf, out=out, nodes=n)
    return m

def _const(n, v):
    node = n.new('ShaderNodeValue'); node.outputs[0].default_value = v; return node.outputs[0]

def _const_rgb(n, v):
    node = n.new('ShaderNodeRGB'); node.outputs[0].default_value = tuple(v) + ((1.0,) if len(v) == 3 else ()); return node.outputs[0]

def srgb(hexv):
    """#rrggbb / 0xrrggbb (sRGB) -> linear tuple for the shader."""
    if isinstance(hexv, str): hexv = int(hexv.lstrip('#'), 16)
    c = [((hexv >> s) & 255) / 255.0 for s in (16, 8, 0)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

# ------------------------------------------------------------------ UVs
def unwrap(ob, angle=50, margin=0.004, density=None):
    """Smart-projects every face, evens out texel density, then packs all islands into 0..1. density: {material name:
    factor} gives some materials more texture (their islands are scaled before packing)."""
    me = ob.data
    if 'UVMap' not in me.uv_layers: me.uv_layers.new(name='UVMap')
    me.uv_layers.active = me.uv_layers['UVMap']; me.uv_layers['UVMap'].active_render = True
    activate(ob); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT'); bpy.ops.uv.average_islands_scale()
    if density:
        bpy.ops.object.mode_set(mode='OBJECT')
        uv = me.uv_layers['UVMap'].data; names = [s.material.name if s.material else '' for s in ob.material_slots]
        for p in me.polygons:
            k = density.get(names[p.material_index] if p.material_index < len(names) else '', 1.0)
            if k != 1.0:
                for li in p.loop_indices: uv[li].uv = uv[li].uv * k
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
    try: bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method='CONCAVE', scale=True)
    except TypeError: bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob

# ------------------------------------------------------------------ baking (Cycles)
def _image(name, size, noncolor, float_buf=False):
    if name in bpy.data.images: bpy.data.images.remove(bpy.data.images[name])
    im = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_buf)
    im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'; return im

def _target(ob, im):
    for s in ob.material_slots:
        m = s.material; nt = m.node_tree
        t = nt.nodes.get('__bake') or nt.nodes.new('ShaderNodeTexImage'); t.name = '__bake'; t.image = im
        for n in nt.nodes: n.select = False
        t.select = True; nt.nodes.active = t

def _route(ob, key):
    """Sends socket `key` of every material to an Emission shader (or back to the BSDF when key is None)."""
    for s in ob.material_slots:
        m = s.material; P = PBR.get(m.name); nt = m.node_tree; out = P['out']
        em = nt.nodes.get('__emit') or nt.nodes.new('ShaderNodeEmission'); em.name = '__emit'; sock(em.inputs, 'Strength').default_value = 1.0
        for l in list(out.inputs['Surface'].links): nt.links.remove(l)
        if key is None: nt.links.new(P['bsdf'].outputs[0], out.inputs['Surface']); continue
        src = P[key]
        for l in list(sock(em.inputs, 'Color').links): nt.links.remove(l)
        nt.links.new(src, sock(em.inputs, 'Color'))
        nt.links.new(em.outputs[0], out.inputs['Surface'])

def bake(ob, size=1024, samples_ao=128, margin=12, hide=(), ao_distance=0.06):
    """Bakes NORMAL (tangent space, from the mesh's own bevels plus every material's bump), AO, and EMIT copies of the
    base colour, roughness and metalness. Returns dict of numpy arrays (size, size, 3 or 1), rows bottom-up like Blender."""
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    for o in hide: o.hide_render = True  # e.g. the glass: it should not shade the AO of what is behind it
    activate(ob)
    bk = sc.render.bake; bk.margin = margin; bk.margin_type = 'EXTEND'; bk.use_clear = True; bk.use_selected_to_active = False
    out = {}
    def run(kind, key, img, samples):
        sc.cycles.samples = samples; _target(ob, img)
        if key: _route(ob, key)
        else: _route(ob, None)
        t0 = __import__('time').time()
        if kind == 'NORMAL':
            bk.normal_space = 'TANGENT'; bk.normal_r, bk.normal_g, bk.normal_b = 'POS_X', 'POS_Y', 'POS_Z'
        bpy.ops.object.bake(type=kind, margin=margin, use_clear=True)
        log('baked %-6s %-5s in %.1fs' % (kind, key or '', __import__('time').time() - t0))
        a = np.empty(size * size * 4, dtype=np.float32); img.pixels.foreach_get(a); return a.reshape(size, size, 4)[..., :3].copy()
    sc.cycles.use_denoising = False
    out['normal'] = run('NORMAL', None, _image('bake_normal', size, True, True), 4)
    ao_set = sc.world.light_settings if sc.world else None
    out['ao'] = run('AO', None, _image('bake_ao', size, True, True), samples_ao)[..., 0]
    out['color'] = run('EMIT', 'color', _image('bake_color', size, False, True), 4)  # float: linear values
    out['rough'] = run('EMIT', 'rough', _image('bake_rough', size, True, True), 4)[..., 0]
    out['metal'] = run('EMIT', 'metal', _image('bake_metal', size, True, True), 4)[..., 0]
    _route(ob, None)
    return out

def lin2srgb(a):
    a = np.clip(a, 0, 1); return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)

def save_png(a, path, noncolor=True):
    """a: (h, w, 3 or 4) floats 0..1 (already in the file's encoding), rows bottom-up. Writes an 8-bit PNG."""
    h, w = a.shape[:2]; c = a.shape[2] if a.ndim == 3 else 1
    rgba = np.ones((h, w, 4), np.float32)
    if c == 1: rgba[..., :3] = (a if a.ndim == 3 else a[..., None])[..., :1]
    else: rgba[..., :c] = a
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=(c == 4), float_buffer=False)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(np.clip(rgba, 0, 1).ravel()); im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)
    return path

def write_maps(maps, folder, base, ao_strength=1.0):
    """Turns bake() output into the three files the game uses: <base>_color.png (sRGB), <base>_normal.png and
    <base>_orm.png (R = AO, G = roughness, B = metalness, the glTF packing)."""
    os.makedirs(folder, exist_ok=True)
    col = lin2srgb(maps['color'])
    orm = np.stack([1 - (1 - maps['ao']) * ao_strength, maps['rough'], maps['metal']], -1)
    return dict(color=save_png(col, os.path.join(folder, base + '_color.png')),
                normal=save_png(maps['normal'], os.path.join(folder, base + '_normal.png')),
                orm=save_png(orm, os.path.join(folder, base + '_orm.png')))

# ------------------------------------------------------------------ detail levels
def decimate(ob, target_tris=None, ratio=None, name=None):
    """A decimated copy (collapse, UVs kept). Give target_tris or ratio."""
    o = copy(ob, name or ob.name + '_dec'); n0 = tris(o)
    r = ratio if ratio is not None else min(1.0, target_tris / max(1, n0))
    if r < 0.999:
        m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = r; m.use_collapse_triangulate = True
        apply(o)
        if target_tris:  # the modifier's ratio is approximate: correct once
            n1 = tris(o)
            if n1 > target_tris * 1.04:
                m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = target_tris / n1; m.use_collapse_triangulate = True; apply(o)
    return o

def drop_tagged(ob, key='detail'):
    """Deletes the faces whose attribute `key` is non-zero (small parts left out of a far detail level)."""
    a = ob.data.attributes.get(key)
    if not a: return ob
    vals = [0] * len(ob.data.polygons); a.data.foreach_get('value', vals)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i, v in enumerate(vals) if v], context='FACES')
    bm.to_mesh(ob.data); bm.free(); ob.data.update(); return ob

# ------------------------------------------------------------------ export
def gltf_material(name, files=None, color=None, rough=0.5, metal=0.0, alpha=1.0, coat=0.0):
    """The material the .glb carries: baked textures (files from write_maps) or plain values."""
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new('ShaderNodeOutputMaterial'); b = N.new('ShaderNodeBsdfPrincipled'); L.new(b.outputs[0], out.inputs['Surface'])
    if files:
        def img(path, noncolor):
            im = bpy.data.images.load(path); im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
            t = N.new('ShaderNodeTexImage'); t.image = im; return t
        tc = img(files['color'], False); L.new(tc.outputs['Color'], sock(b.inputs, 'Base Color'))
        tn = img(files['normal'], True); nm = N.new('ShaderNodeNormalMap'); L.new(tn.outputs['Color'], sock(nm.inputs, 'Color')); L.new(nm.outputs[0], sock(b.inputs, 'Normal'))
        to = img(files['orm'], True); sp = N.new('ShaderNodeSeparateColor'); L.new(to.outputs['Color'], sp.inputs[0])
        L.new(sp.outputs['Green'], sock(b.inputs, 'Roughness')); L.new(sp.outputs['Blue'], sock(b.inputs, 'Metallic'))
        grp = bpy.data.node_groups.get('glTF Material Output')
        if not grp:
            grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
            grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        g = N.new('ShaderNodeGroup'); g.node_tree = grp; L.new(sp.outputs['Red'], g.inputs['Occlusion'])
    else:
        sock(b.inputs, 'Base Color').default_value = tuple(color or (0.5, 0.5, 0.5)) + (1.0,)
        sock(b.inputs, 'Roughness').default_value = rough; sock(b.inputs, 'Metallic').default_value = metal
        if alpha < 1.0:
            sock(b.inputs, 'Alpha').default_value = alpha
            try: m.surface_render_method = 'BLENDED'
            except Exception: pass
    if coat: sock(b.inputs, 'Coat Weight').default_value = coat
    return m

def export_glb(path, objects, rig, draco=True, webp_quality=82):
    """Writes the given skinned mesh objects (named <item>_lod0..2) and their armature to a .glb with Draco geometry
    and WebP textures."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in list(objects) + [rig]: o.select_set(True)
    for o in objects:  # only the baked UV map goes out
        for uv in list(o.data.uv_layers):
            if uv.name != 'UVMap': o.data.uv_layers.remove(uv)
        for a in list(o.data.attributes):
            if a.name in ('detail',): o.data.attributes.remove(a)
    bpy.context.view_layer.objects.active = rig
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_skins=True, export_animations=False,
              export_morph=False, export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
              export_image_format='WEBP', export_image_quality=webp_quality, export_extras=False, export_cameras=False, export_lights=False)
    try: kw['export_image_add_webp'] = False; kw['export_image_webp_fallback'] = False
    except Exception: pass
    if draco:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
                  export_draco_normal_quantization=10, export_draco_texcoord_quantization=12, export_draco_color_quantization=10, export_draco_generic_quantization=12)
    bpy.ops.export_scene.gltf(**kw)
    log('wrote %s (%d bytes)' % (path, os.path.getsize(path)))
    return path

def read_glb_json(path):
    import struct
    raw = open(path, 'rb').read(); n = struct.unpack_from('<I', raw, 12)[0]; return json.loads(raw[20:20 + n])

# ------------------------------------------------------------------ checking
def clearance(helmet_objs, heads, below=1.0, center=(0, 1.69, -0.02)):
    """heads: list of (name, co (N,3 game)). For each head point a ray goes out from `center` (inside the head) through
    the point; the gap is how far beyond the point the ray first meets the item (negative: the point pokes through).
    Rays that leave through an opening (no hit) are skipped, as are points below `below`. Returns
    [(name, smallest gap, game point)]."""
    bm = bmesh.new()
    for o in helmet_objs:
        dg = bpy.context.evaluated_depsgraph_get(); me = o.evaluated_get(dg).to_mesh(); t = bmesh.new(); t.from_mesh(me); t.transform(o.matrix_world)
        tmp = bpy.data.meshes.new('_t'); t.to_mesh(tmp); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp); t.free(); o.evaluated_get(dg).to_mesh_clear()
    bm.normal_update(); tree = BVHTree.FromBMesh(bm)
    res = []
    for name, co in heads:
        best = (1e9, None)
        for p in co:
            if p[1] < below: continue
            q = B(p); c = B(center); d = q - c; L = d.length
            if L < 1e-6: continue
            hit = tree.ray_cast(c, d / L, 1.0)
            if hit[0] is None: continue
            s = (hit[0] - c).length - L
            if s < best[0]: best = (s, tuple(round(v, 4) for v in p))
        res.append((name, best[0], best[1]))
    bm.free(); return res

# ------------------------------------------------------------------ preview renders
def _look(cam, pos_g, at_g):
    p = B(pos_g); t = B(at_g); d = (t - p).normalized()
    cam.matrix_world = (Matrix.Translation(p) @ d.to_track_quat('-Z', 'Y').to_matrix().to_4x4())

def studio(strength=1.0):
    """A neutral studio: grey gradient world (for reflections) plus key, fill and rim area lights."""
    sc = bpy.context.scene; w = sc.world or bpy.data.worlds.new('studio'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    nt = w.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new('ShaderNodeOutputWorld'); bg = N.new('ShaderNodeBackground'); L.new(bg.outputs[0], out.inputs[0])
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Generated'], sep.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); L.new(sep.outputs['Z'], ramp.inputs[0])
    ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[0].color = (0.05, 0.05, 0.055, 1)
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (0.9, 0.92, 0.95, 1)
    L.new(ramp.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 0.6 * strength
    for nm, pos, en, size in (('key', (-1.2, 2.4, -1.6), 260, 1.2), ('fill', (1.6, 1.9, -1.0), 90, 1.6), ('rim', (0.6, 2.4, 1.8), 200, 1.0)):
        ld = bpy.data.lights.new(nm, 'AREA'); ld.energy = en * strength; ld.size = size; lo = link(bpy.data.objects.new(nm, ld)); _look(lo, pos, (0, 1.69, 0))
    return w

def render_views(folder, prefix, views, res=(900, 900), samples=96):
    """views: [(name, cam pos (game), look at (game), focal mm)]. Cycles renders written as PNGs."""
    os.makedirs(folder, exist_ok=True); sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False; sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    cd = bpy.data.cameras.new('cam'); cam = link(bpy.data.objects.new('cam', cd)); sc.camera = cam; cd.clip_start = 0.01
    out = []
    for name, pos, at, f in views:
        cd.lens = f; _look(cam, pos, at); sc.render.filepath = os.path.join(folder, '%s_%s.png' % (prefix, name))
        bpy.ops.render.render(write_still=True); out.append(sc.render.filepath); log('render', sc.render.filepath)
    return out
