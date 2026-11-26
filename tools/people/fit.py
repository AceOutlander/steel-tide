# Shared by the people pipeline: make an MPFB (MakeHuman, CC0) human in Blender and fit it to the game's skeleton.
# Game space: metres, Y up, forward = -Z, right = +X, origin at the soles. Blender/MPFB: Z up, the figure faces -Y, its left is +X.
import bpy, bmesh, math, os, sys
import numpy as np
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

# The game's skeleton (js/units/v2/human.js, SK): name, parent, bind position.
SK = [
    ('hips', -1, 0, 0.955, 0), ('spine', 0, 0, 1.07, 0.004), ('chest', 1, 0, 1.24, 0.004), ('neck', 2, 0, 1.495, 0.012), ('head', 3, 0, 1.59, 0.006),
    ('uarmR', 2, 0.198, 1.42, 0), ('larmR', 5, 0.198, 1.125, 0), ('handR', 6, 0.198, 0.861, 0), ('finR', 7, 0.198, 0.75, 0), ('fin2R', 8, 0.198, 0.721, 0), ('thumbR', 7, 0.195, 0.82, -0.031),
    ('uarmL', 2, -0.198, 1.42, 0), ('larmL', 11, -0.198, 1.125, 0), ('handL', 12, -0.198, 0.861, 0), ('finL', 13, -0.198, 0.75, 0), ('fin2L', 14, -0.198, 0.721, 0), ('thumbL', 13, -0.195, 0.82, -0.031),
    ('ulegR', 0, 0.092, 0.955, 0), ('llegR', 17, 0.092, 0.515, 0), ('footR', 18, 0.092, 0.085, 0),
    ('ulegL', 0, -0.092, 0.955, 0), ('llegL', 20, -0.092, 0.515, 0), ('footL', 21, -0.092, 0.085, 0),
]
BI = {b[0]: i for i, b in enumerate(SK)}
SKP = np.array([b[2:5] for b in SK], dtype=np.float64)
NB = len(SK)
N_BODY = 13380  # the body proper; everything after it in base.obj is helper geometry

def g2(v):  # Blender -> game
    return np.array([-v[0], v[2], v[1]], dtype=np.float64)

def bone_map(name):
    side = 'L' if name.endswith('_l') else 'R' if name.endswith('_r') else ''
    n = name[:-2] if side else name
    if n in ('Root', 'pelvis'): return 'hips'
    if n in ('spine_01', 'spine_02'): return 'spine'
    if n in ('spine_03', 'clavicle'): return 'chest'
    if n == 'neck_01': return 'neck'
    if n == 'head': return 'head'
    if n == 'upperarm': return 'uarm' + side
    if n == 'lowerarm': return 'larm' + side
    if n == 'hand': return 'hand' + side
    if n.startswith('thumb'): return 'thumb' + side
    if n.endswith('_01'): return 'fin' + side
    if n.endswith('_02') or n.endswith('_03'): return 'fin2' + side
    if n == 'thigh': return 'uleg' + side
    if n == 'calf': return 'lleg' + side
    if n in ('foot', 'ball'): return 'foot' + side
    raise KeyError(name)

def unit(v):
    return v / np.linalg.norm(v)

def rot_between(a, b):  # smallest rotation taking unit a to unit b
    a = unit(a); b = unit(b); v = np.cross(a, b); c = float(np.dot(a, b)); s = np.linalg.norm(v)
    if s < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / (s * s))

def frame(a, b):  # orthonormal frame with first axis a, second axis b made perpendicular to a
    a = unit(a); b = unit(b - a * np.dot(a, b)); return np.stack([a, b, np.cross(a, b)], axis=1)

def make_human(macro_over, race):
    """Returns dict: co (N,3 game space, MPFB size), faces (list of index lists), uv per face corner, W (N, NB) weights,
    J (bone name -> head position), eyes (centre, radius) per side."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update(macro_over); macro['race'] = race
    bm_obj = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
    rig = HumanService.add_builtin_rig(bm_obj, 'game_engine', import_weights=True)
    J = {}
    for b in rig.data.bones:
        J[b.name] = g2(rig.matrix_world @ b.head_local); J[b.name + '.tail'] = g2(rig.matrix_world @ b.tail_local)
    # the shaped mesh (shape keys applied), rest pose
    dg = bpy.context.evaluated_depsgraph_get(); ev = bm_obj.evaluated_get(dg); me = ev.to_mesh()
    nv = len(me.vertices); co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    mw = np.array(bm_obj.matrix_world); co = co @ mw[:3, :3].T + mw[:3, 3]
    co = np.stack([-co[:, 0], co[:, 2], co[:, 1]], axis=1)
    gname = {g.index: g.name for g in bm_obj.vertex_groups}
    W = np.zeros((nv, NB)); helper = {}; WC = {'L': np.zeros(nv), 'R': np.zeros(nv)}
    for v in me.vertices:
        for ge in v.groups:
            n = gname[ge.group]
            if n in J and not n.endswith('.tail'):
                try: W[v.index, BI[bone_map(n)]] += ge.weight
                except KeyError: pass
                if n.startswith('clavicle'): WC['L' if n.endswith('_l') else 'R'][v.index] += ge.weight
            elif n.startswith('helper-') or n in ('scalp', 'ears', 'lips'):
                helper.setdefault(n, []).append(v.index)
    uvl = me.uv_layers.active.data
    faces, fuv = [], []
    for p in me.polygons:
        vs = list(p.vertices)
        if max(vs) >= N_BODY: continue
        faces.append(vs); fuv.append([tuple(uvl[li].uv) for li in p.loop_indices])
    eyes = {}
    for k, nm in (('L', 'helper-l-eye'), ('R', 'helper-r-eye')):
        pts = co[helper[nm]]; c = (pts.min(0) + pts.max(0)) / 2; eyes[k] = (c, float((pts.max(0) - pts.min(0)).max() / 2))
    ev.to_mesh_clear()
    s = W[:N_BODY].sum(1, keepdims=True); s[s == 0] = 1; Wb = W[:N_BODY] / s
    return dict(co=co[:N_BODY].copy(), faces=faces, fuv=fuv, W=Wb, WC={k: v[:N_BODY] / s[:, 0] for k, v in WC.items()}, J=J, eyes=eyes, groups={k: [i for i in v if i < N_BODY] for k, v in helper.items()})

def fit(H, head_h=0.232, log=print):
    """Moves H['co'] onto the game's skeleton and bind pose (arms and legs straight down). Adds H['fit'] (N,3) and
    H['eyes_fit']."""
    co, W, J = H['co'], H['W'], H['J']
    A = np.zeros((NB, 3, 3)); T = np.zeros((NB, 3))
    def setT(name, M, src, dst):
        i = BI[name]; A[i] = M; T[i] = np.asarray(dst) - M @ np.asarray(src)
    hipy = J['thigh_l'][1]; anky = J['foot_l'][1]; shy = J['upperarm_l'][1]
    hv = np.where(W[:, BI['head']] > 0.98)[0]; hp = co[hv]
    crown = hp[:, 1].max()
    front = hp[(np.abs(hp[:, 0]) < 0.02) & (hp[:, 2] < np.percentile(hp[:, 2], 30))]; chin = front[:, 1].min()
    s = 1.80 / crown * H.get('bulk', 1.0)  # overall size from the stature
    z0 = (J['thigh_l'][2] + J['thigh_r'][2]) / 2
    log('scale s=%.4f  src stature %.3f hip %.3f ankle %.3f shoulder %.3f head pivot %.3f' % (s, crown, hipy, anky, shy, J['head'][1]))
    S = np.diag([s, s, s])
    zc = (J['upperarm_l'][2] + J['upperarm_r'][2]) / 2  # the shoulders' line: it goes over the hips' line (upright posture)
    Y = lambda n: SKP[BI[n]][1]
    hips_inv = lambda y: hipy + (y - Y('ulegL')) / s
    setT('hips', S, [0, hips_inv(Y('hips')), z0], SKP[BI['hips']])
    setT('spine', S, [0, hips_inv(Y('spine')), (z0 + zc) / 2 + SKP[BI['spine']][2] / s], SKP[BI['spine']])
    setT('chest', S, [0, hips_inv(Y('chest')), zc + SKP[BI['chest']][2] / s], SKP[BI['chest']])
    chest_inv = hips_inv
    log('shoulder joint: as modelled (arms out) %.3f, skeleton %.3f; shoulders were %.3f ahead of the hips' % ((shy - hipy) * s + Y('ulegL'), Y('uarmL'), (z0 - zc) * s))
    # --- head: sized by chin-to-crown, crown at 1.80; it keeps its natural place over the chest (H['head_dz'] reports it)
    sh = head_h / (crown - chin)
    cz = (hp[:, 2].min() + hp[:, 2].max()) / 2
    dz = (cz - zc) * s * H.get('head_fwd', 0.5)
    log('head: crown %.3f chin %.3f width %.3f depth %.3f -> scale %.3f (body %.3f); natural centre z %.4f, used %.4f' % (crown, chin, (hp[:, 0].max() - hp[:, 0].min()), (hp[:, 2].max() - hp[:, 2].min()), sh, s, (cz - zc) * s, dz))
    Sh = np.diag([sh, sh, sh]); hsrc = np.array([0, crown, cz]); hdst = np.array([0, 1.802, dz]); H['head_dz'] = dz; H['head_scale'] = sh
    setT('head', Sh, hsrc, hdst)
    # neck: between the chest's top and the head's bottom
    y_n = chest_inv(1.495); y_hd = (1.59 - hdst[1]) / sh + crown
    kn = (1.59 - 1.495) / max(1e-6, y_hd - y_n)
    setT('neck', np.diag([s, kn, s]), [0, y_n, zc + 0.012 / s], SKP[BI['neck']] + np.array([0, 0, dz * 0.45]))
    log('neck stretch kn/s=%.3f' % (kn / s))
    down = np.array([0.0, -1.0, 0.0])
    for sd, sfx, sg in (('L', '_l', -1.0), ('R', '_r', 1.0)):
        # --- leg: straightened, lengths matched
        hp_, kp, ap = J['thigh' + sfx], J['calf' + sfx], J['foot' + sfx]
        for nm, a, b, ya, yb in (('uleg', hp_, kp, Y('ulegL'), Y('llegL')), ('lleg', kp, ap, Y('llegL'), Y('footL'))):
            d = b - a; R = rot_between(d, down); k = (ya - yb) / np.linalg.norm(d)
            M = (np.diag([s, k, s])) @ R
            setT(nm + sd, M, a, SKP[BI[nm + sd]])
        toe = J['ball' + sfx] - ap; yaw = math.atan2(toe[0], -toe[2])  # turn the toes straight ahead
        Ry = np.array([[math.cos(yaw), 0, math.sin(yaw)], [0, 1, 0], [-math.sin(yaw), 0, math.cos(yaw)]])
        setT('foot' + sd, S @ Ry, ap, SKP[BI['foot' + sd]])
        # --- arm: upper arm and forearm straight down, the elbow's hinge along X, palm toward the thigh
        sp, ep, wp = J['upperarm' + sfx], J['lowerarm' + sfx], J['hand' + sfx]
        u = unit(ep - sp); f = unit(wp - ep); hinge = unit(np.cross(u, f))  # the elbow bends about this
        hx = np.array([1.0, 0, 0]) * (1 if np.dot(hinge, [1, 0, 0]) > 0 else -1)
        # bend direction: with the forearm swinging forward for positive rotation about +X
        tgt = frame(down, hx)
        Ru = tgt @ frame(u, hinge).T; Rf = tgt @ frame(f, hinge).T
        ku = (Y('uarmL') - Y('larmL')) / np.linalg.norm(ep - sp); kf = (Y('larmL') - Y('handL')) / np.linalg.norm(wp - ep)
        setT('uarm' + sd, np.diag([s, ku, s]) @ Ru, sp, SKP[BI['uarm' + sd]])
        setT('larm' + sd, np.diag([s, kf, s]) @ Rf, ep, SKP[BI['larm' + sd]])
        kn1 = np.mean([J[n + '_01' + sfx] for n in ('index', 'middle', 'ring', 'pinky')], axis=0)
        kn2 = np.mean([J[n + '_02' + sfx] for n in ('index', 'middle', 'ring', 'pinky')], axis=0)
        hd = unit(kn1 - wp); across = J['index_01' + sfx] - J['pinky_01' + sfx]  # pinky -> index
        # hand: fingers down, the index finger forward (-Z), so the palm faces the thigh
        Rh = frame(down, np.array([0, 0, -1.0])) @ frame(hd, across).T
        khand = s * H.get('hand', 1.0)  # natural size, hung from the knuckles so the fingers curl about the skeleton's joint
        Mh = khand * Rh
        for nm in ('hand', 'fin', 'fin2', 'thumb'): setT(nm + sd, Mh, kn1, SKP[BI['fin' + sd]])
        fitp = lambda p: Mh @ (p - kn1) + SKP[BI['fin' + sd]]
        H.setdefault('joints', {})[sd] = dict(pip=fitp(kn2), thumb=fitp(J['thumb_01' + sfx]), wrist=fitp(wp), tip=fitp(J['middle_03' + sfx + '.tail']))
        log('%s arm: ku/s %.3f kf/s %.3f elbow bend %.1f deg; fitted %s' % (sd, ku / s, kf / s, math.degrees(math.acos(np.dot(u, f))), {k: np.round(v, 4).tolist() for k, v in H['joints'][sd].items()}))
        log('%s leg: thigh k/s %.3f shin k/s %.3f' % (sd, (Y('ulegL') - Y('llegL')) / np.linalg.norm(kp - hp_) / s, (Y('llegL') - Y('footL')) / np.linalg.norm(ap - kp) / s))
    out = np.zeros_like(co)
    ic = BI['chest']
    for sd, sfx in (('L', '_l'), ('R', '_r')):
        sc = J['clavicle' + sfx]; sj = J['upperarm' + sfx]; scf = A[ic] @ sc + T[ic]; tgt = SKP[BI['uarm' + sd]] - scf; srcv = A[ic] @ (sj - sc)
        R = rot_between(srcv, tgt); k = np.linalg.norm(tgt) / np.linalg.norm(srcv); M = (k * R) @ A[ic]
        w = H['WC'][sd][:, None]
        out += w * ((co @ M.T + (scf - M @ sc)) - (co @ A[ic].T + T[ic]))
        log('%s collar bone: turned %.1f deg, length x%.3f' % (sd, math.degrees(math.acos(min(1, float(np.dot(unit(srcv), unit(tgt)))))), k))
    for i in range(NB):
        w = W[:, i:i + 1]
        if not w.any(): continue
        out += w * (co @ A[i].T + T[i])
    H['fit'] = out; H['A'] = A; H['T'] = T
    ih = BI['head']; H['eyes_fit'] = {k: (c @ A[ih].T + T[ih], r * sh) for k, (c, r) in H['eyes'].items()}
    return H

def to_object(name, co, faces, W=None, fuv=None):
    """A Blender mesh object straight from game-space arrays (no axis change: used for cutting, smoothing, decimating)."""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(c) for c in co], [], faces); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if W is not None:
        for i, b in enumerate(SK):
            vg = ob.vertex_groups.new(name=b[0]); idx = np.where(W[:, i] > 1e-4)[0]
            for j in idx: vg.add([int(j)], float(W[j, i]), 'REPLACE')
    if fuv is not None:
        uvl = me.uv_layers.new(name='UVMap'); k = 0
        for p, uvs in zip(me.polygons, fuv):
            for li, uv in zip(p.loop_indices, uvs): uvl.data[li].uv = uv
    for p in me.polygons: p.use_smooth = True
    return ob
