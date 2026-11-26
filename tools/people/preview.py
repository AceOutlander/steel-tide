# Render helpers for checking pipeline steps: preview.shots(objects, path) -> one PNG with front / side / back / face views.
import bpy, math
import numpy as np
from mathutils import Vector, Matrix

def _cam(name, pos, look, ortho):
    cd = bpy.data.cameras.new(name); cd.type = 'ORTHO'; cd.ortho_scale = ortho
    ob = bpy.data.objects.new(name, cd); bpy.context.scene.collection.objects.link(ob)
    p = Vector(pos); l = Vector(look); f = (l - p).normalized(); up = Vector((0, 1, 0))
    r = f.cross(up).normalized(); u = r.cross(f)
    ob.matrix_world = Matrix(((r.x, u.x, -f.x, p.x), (r.y, u.y, -f.y, p.y), (r.z, u.z, -f.z, p.z), (0, 0, 0, 1)))
    return ob

def shots(path, views, res=(700, 1000)):
    """views: list of (name, cam pos, look at, ortho size). Game space (Y up). Writes path_name.png for each."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_cavity = True; sh.cavity_type = 'BOTH'; sh.show_shadows = False
    try: sh.studio_light = 'rim.sl'
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new('w')
    out = []
    for name, pos, look, ortho in views:
        cam = _cam('cam_' + name, pos, look, ortho); sc.camera = cam
        sc.render.filepath = path + '_' + name + '.png'; bpy.ops.render.render(write_still=True); out.append(sc.render.filepath)
        bpy.data.objects.remove(cam)
    return out

BODY = [('front', (0, 0.92, -6), (0, 0.92, 0), 2.0), ('side', (6, 0.92, 0), (0, 0.92, 0), 2.0), ('back', (0, 0.92, 6), (0, 0.92, 0), 2.0)]
FACE = [('face', (0, 1.68, -3), (0, 1.68, 0), 0.42), ('face34', (2, 1.72, -2.4), (0, 1.68, 0), 0.42), ('faceside', (3, 1.68, 0), (0, 1.68, 0), 0.42)]
