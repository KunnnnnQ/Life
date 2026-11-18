"""Builds the rabbit shopkeeper in Blender and exports it for the web.

Run (no Blender UI needed):
  blender -b --factory-startup -P blender/build_rabbit.py -- --out public/assets/rabbit/rabbit.glb

The rabbit is modelled on the user's pet: grey saddle, white face, chest and paws, a dark patch around the left eye,
a white left ear and a grey right ear with a white tip, pink inner ears. It sits in a loaf pose like a real rabbit
(round haunches, low chest, head pushed forward, eyes on the sides of the head).

Each part is a cluster of ellipsoids fused with a voxel remesh, smoothed and decimated, so the surface is one organic
skin rather than visible spheres. Markings are vertex colours (COLOR_0). Parts are separate nodes with their pivots at
the joints so the engine can animate them: body, legs_front (shoulder), head (neck) with ear_L, ear_R (ear bases),
eye_L, eye_R and nose as children. Coordinates below are three.js metres (x right, y up, z = the way the rabbit faces).
"""
import argparse, math, pathlib, sys
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
args = ap.parse_args(argv)
OUT = pathlib.Path(args.out).resolve(); OUT.parent.mkdir(parents=True, exist_ok=True)

def bl(x, y, z): return Vector((x, -z, y))          # three.js -> Blender
def th(v): return (v.x, v.z, -v.y)                  # Blender -> three.js

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c] + [1.0]
GREY, WHITE, PATCH, PINK = srgb("#7d8586"), srgb("#eeeae1"), srgb("#3c4448"), srgb("#d9a0a0")
def mix(a, b, t): t = max(0.0, min(1.0, t)); return [a[i] + (b[i] - a[i]) * t for i in range(4)]
def smooth(e0, e1, x): t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

# name: (pivot, [(centre, radii)], target faces, fused?)
S = lambda *v: v
PARTS = {
    "body": ((0, 0, 0), [
        S((0, .12, -.085), (.125, .12, .135)),            # haunches
        S((-.06, .095, -.08), (.08, .09, .11)), S((.06, .095, -.08), (.08, .09, .11)),
        S((0, .13, .02), (.105, .11, .12)),               # back
        S((0, .11, .10), (.085, .10, .085)),              # chest
        S((0, .16, .10), (.075, .07, .07)),               # shoulders into the head (no visible neck)
        S((0, .06, 0), (.085, .05, .12)),                 # belly
        S((-.075, .022, -.03), (.032, .022, .10)), S((.075, .022, -.03), (.032, .022, .10)),   # hind feet
        S((0, .15, -.215), (.04, .04, .035)),             # tail
    ], 3500),
    "legs_front": ((0, .12, .12), [
        S((-.038, .06, .145), (.028, .05, .03)), S((.038, .06, .145), (.028, .05, .03)),
        S((-.04, .014, .168), (.024, .015, .036)), S((.04, .014, .168), (.024, .015, .036)),
    ], 900),
    "head": ((0, .17, .12), [
        S((0, .225, .165), (.075, .07, .085)),            # cranium
        S((0, .24, .205), (.055, .048, .06)),             # forehead
        S((-.042, .19, .195), (.048, .045, .05)), S((.042, .19, .195), (.048, .045, .05)),   # cheeks
        S((0, .185, .24), (.036, .032, .032)),            # muzzle
        S((0, .165, .22), (.027, .022, .027)),            # chin
        S((0, .20, .12), (.07, .07, .06)),                # back of the head
    ], 3000),
}
EARS = {"ear_L": (-.032, .28, .15), "ear_R": (.032, .28, .15)}
EAR_SHAPE = [S((0, .02, 0), (.02, .03, .013)), S((0, .075, 0), (.032, .065, .012)), S((0, .13, 0), (.024, .028, .01))]
EYES = {"eye_L": (-.063, .225, .2), "eye_R": (.063, .225, .2)}

bpy.ops.wm.read_factory_settings(use_empty=True)
col = bpy.context.scene.collection

def material(name, color, rough):
    m = bpy.data.materials.new(name)
    if not m.node_tree: m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF"); b.inputs["Base Color"].default_value = color; b.inputs["Roughness"].default_value = rough
    return m
FUR, EYE, NOSE = material("fur", WHITE, .9), material("eye", srgb("#0c1114"), .08), material("nose", srgb("#c98b8b"), .5)

def fused(name, pivot, shapes, faces, offset=(0, 0, 0)):
    """Union of ellipsoids → voxel remesh → smooth → decimate. Vertices are relative to the pivot."""
    me = bpy.data.meshes.new(name + "_src"); bm = bmesh.new()
    for c, r in shapes:
        geom = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=18, radius=1.0)
        for v in geom["verts"]:
            p = (v.co.x * r[0] + c[0] + offset[0] - pivot[0], v.co.z * r[1] + c[1] + offset[1] - pivot[1], -v.co.y * r[2] + c[2] + offset[2] - pivot[2])
            v.co = bl(*p)
    bm.to_mesh(me); bm.free()
    src = bpy.data.objects.new(name + "_src", me); col.objects.link(src)
    rem = src.modifiers.new("remesh", "REMESH"); rem.mode = "VOXEL"; rem.voxel_size = .004; rem.use_smooth_shade = True
    sm = src.modifiers.new("smooth", "SMOOTH"); sm.factor = .85; sm.iterations = 30
    dg = bpy.context.evaluated_depsgraph_get()
    tris = len(src.evaluated_get(dg).to_mesh().polygons); src.evaluated_get(dg).to_mesh_clear()
    dec = src.modifiers.new("decimate", "DECIMATE"); dec.ratio = min(1.0, faces / max(tris, 1))
    dg = bpy.context.evaluated_depsgraph_get()
    out = bpy.data.meshes.new_from_object(src.evaluated_get(dg)); out.name = name
    bpy.data.objects.remove(src); bpy.data.meshes.remove(me)
    for p in out.polygons: p.use_smooth = True
    return out

def ellipsoid(name, centre, radii, pivot):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    geom = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
    for v in geom["verts"]:
        v.co = bl(v.co.x * radii[0] + centre[0] - pivot[0], v.co.z * radii[1] + centre[1] - pivot[1], -v.co.y * radii[2] + centre[2] - pivot[2])
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me

def paint(me, pivot, rule):
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for v in me.vertices:
        x, y, z = th(v.co); n = th(v.normal)
        attr.data[v.index].color = rule(x + pivot[0], y + pivot[1], z + pivot[2], n)
    me.color_attributes.active_color = attr

def body_colour(x, y, z, n):
    saddle = smooth(.12, .17, y) * smooth(.14, .07, z)           # grey over the back
    flanks = smooth(.07, .12, y) * smooth(.03, -.05, z)          # and down the haunches
    g = max(saddle, flanks)
    g *= 1 - smooth(-.18, -.2, z) * smooth(.17, .12, y)          # white under the tail
    g *= smooth(.04, .07, y)                                     # white feet and belly
    return mix(WHITE, GREY, g)

def head_colour(x, y, z, n):
    c = WHITE
    crown = smooth(.19, .15, z) * smooth(.2, .24, y)            # grey from the neck joins the saddle
    c = mix(c, GREY, crown * .9)
    d = math.dist((x, y, z), EYES["eye_L"])                      # dark patch around the left eye
    return mix(c, PATCH, smooth(.036, .022, d))

def ear_colour(base, tip_white):
    def rule(x, y, z, n):
        local = y - EARS["ear_L"][1]
        c = mix(base, WHITE, smooth(.1, .12, local)) if tip_white else base
        inner = smooth(.2, .6, n[2]) * smooth(.022, .012, abs(x - (EARS["ear_L"][0] if x < 0 else EARS["ear_R"][0]))) * smooth(.02, .04, local) * smooth(.145, .12, local)
        return mix(c, PINK, inner)
    return rule

def obj(name, me, pivot, parent=None, parent_pivot=(0, 0, 0), mat=FUR):
    o = bpy.data.objects.new(name, me); col.objects.link(o)
    me.materials.append(mat)
    o.location = bl(*pivot) - bl(*parent_pivot) if parent else bl(*pivot)
    if parent: o.parent = parent
    return o

made = {}
for name, (pivot, shapes, faces) in PARTS.items():
    me = fused(name, pivot, shapes, faces)
    paint(me, pivot, {"body": body_colour, "head": head_colour, "legs_front": lambda *a: WHITE}[name])
    made[name] = obj(name, me, pivot)
    print("PART", name, len(me.polygons), flush=True)
head, hp = made["head"], PARTS["head"][0]
for name, pivot in EARS.items():
    me = fused(name, pivot, EAR_SHAPE, 600, offset=pivot)
    paint(me, pivot, ear_colour(WHITE if name == "ear_L" else GREY, name == "ear_R"))
    obj(name, me, pivot, head, hp)
    print("PART", name, len(me.polygons), flush=True)
for name, centre in EYES.items():
    me = ellipsoid(name, centre, (.015, .016, .014), centre)
    obj(name, me, centre, head, hp, EYE)
me = ellipsoid("nose", (0, .195, .271), (.011, .007, .006), (0, .195, .271)); obj("nose", me, (0, .195, .271), head, hp, NOSE)

for o in bpy.context.scene.objects: o.select_set(True)
kw = dict(filepath=str(OUT), export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
          export_normals=True, export_materials="EXPORT", export_lights=False, export_cameras=False)
try: bpy.ops.export_scene.gltf(**kw, export_vertex_color="ACTIVE")
except TypeError: bpy.ops.export_scene.gltf(**kw, export_colors=True)
print("EXPORTED", OUT, flush=True)
