"""Builds the static shop and street in Blender, bakes indirect lighting into lightmaps, and exports them for the web.

Run (no Blender UI needed):
  blender -b --factory-startup -P blender/build_shop.py -- --assets assets-src/polyhaven --out public/assets/shop [--samples 768] [--size 2048]

Outputs in --out:
  shop_shell.glb      static geometry: SHOP (shop shell) and STREET (road, kerbs, buildings), each with two UV sets
                      (TEXCOORD_0 = world-scale tiling, TEXCOORD_1 = lightmap) and named materials (`name@shop` / `name@street`),
                      plus COL_* boxes that the engine turns into Rapier colliders.
  lm_shop.webp, lm_street.webp   baked indirect diffuse light (sRGB-encoded), applied in three.js as lightMap.

Direct light and shadows stay real-time in the browser so moving props and the rabbit are lit correctly; the bake adds the
soft bounce light and occlusion that real-time lighting cannot afford. Layout of props and lights comes from
app/world/layout.json, shared with the engine. Three.js coordinates (x, y-up, z-toward-street) map to Blender as (x, -z, y).
"""
import argparse, json, math, pathlib, sys
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--assets", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--layout", default=str(pathlib.Path(__file__).resolve().parent.parent / "app" / "world" / "layout.json"))
ap.add_argument("--samples", type=int, default=768)
ap.add_argument("--size", type=int, default=2048)
args = ap.parse_args(argv)
ASSETS, OUT = pathlib.Path(args.assets).resolve(), pathlib.Path(args.out).resolve()
OUT.mkdir(parents=True, exist_ok=True)
L = json.loads(pathlib.Path(args.layout).read_text(encoding="utf-8"))
FLOOR, SIDEWALK, CZ, CTOP = L["floor"], L["sidewalk"], L["counterZ"], L["counterTop"]

def bl(x, y, z):            # three.js position -> Blender position
    return Vector((x, -z, y))

# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind; prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == kind
            scene.cycles.device = "GPU"; print("BAKE DEVICE", kind); break
    except Exception: pass
scene.cycles.samples = args.samples
scene.cycles.max_bounces = 6; scene.cycles.diffuse_bounces = 4

# ---------- materials ----------
MATS = {}
def material(name, group, color, emission=None, strength=0.0):
    key = f"{name}@{group}"
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(key); m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    rgb = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    srgb = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
    bsdf.inputs["Base Color"].default_value = (*srgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    if emission:
        e = tuple(int(emission[i:i + 2], 16) / 255 for i in (1, 3, 5))
        bsdf.inputs["Emission Color"].default_value = (*e, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    MATS[key] = m
    return m

# Approximate albedo of each surface (the bake only needs the colour of bounced light).
SURF = {"brick": "#7f746c", "plaster": "#c9c4b6", "wood_floor": "#8f6f50", "planks_green": "#3f6f62", "counter_front": "#6d7f71",
        "counter_top": "#8d6a49", "asphalt": "#2c3338", "sidewalk": "#666e71", "curb": "#7b807a", "roof": "#2a3a38",
        "ceiling": "#cfc8b8", "frame": "#2f5b51", "brass": "#c49b62", "awning_mint": "#3f7c6f", "awning_cream": "#efe2c2",
        "window_off": "#1f2c33"}

# ---------- geometry ----------
PARTS = {"shop": [], "street": []}
def box(group, mat, size, center, rot_x=0.0, pivot=None):
    """Axis-aligned box (three.js size w,h,d and centre). World-scale planar UVs in metres for texture tiling."""
    w, h, d = size
    mesh = bpy.data.meshes.new("box"); obj = bpy.data.objects.new(f"{group}_{mat}", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h))
    if rot_x:
        # Rotation about three.js X (Blender X) around a pivot, used for the tilted awning.
        from mathutils import Matrix
        # three +X rotation sends +z (Blender -Y) down to -y (Blender -Z): a positive rotation about Blender X.
        m = Matrix.Rotation(rot_x, 4, "X")
        off = bl(*center) - (bl(*pivot) if pivot else bl(*center))
        for v in bm.verts: v.co = m @ (v.co + off) - off
    for v in bm.verts: v.co += bl(*center)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            c = loop.vert.co
            loop[uv].uv = (c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)
    bm.to_mesh(mesh); bm.free()
    obj.data.materials.append(material(mat, group, SURF.get(mat, "#808080")))
    PARTS[group].append(obj)
    return obj

COLLIDERS = []
def collider(name, center, half):
    mesh = bpy.data.meshes.new(name); obj = bpy.data.objects.new(f"COL_{name}", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * half[0] * 2, v.co.y * half[2] * 2, v.co.z * half[1] * 2)) + bl(*center)
    bm.to_mesh(mesh); bm.free()
    obj.hide_render = True; COLLIDERS.append(obj)

# Street: road, sidewalks, kerb.
box("street", "asphalt", (60, .2, 12), (0, -.1, 12))
box("street", "sidewalk", (60, .3, 3.3), (0, 0, 4.35))
box("street", "sidewalk", (60, .3, 2.2), (0, 0, 19.1))
box("street", "curb", (60, .16, .18), (0, .08, 6.05))
collider("ground", (0, -.25, 12), (30, .25, 6)); collider("walk_near", (0, 0, 4.35), (30, SIDEWALK, 1.65)); collider("walk_far", (0, 0, 19.1), (30, SIDEWALK, 1.1))
for x in (-20, 20): collider(f"bound_{x}", (x, 2, 10), (.2, 2, 12))
# Neighbouring buildings and the far side of the street.
for side in (-1, 1):
    box("street", "brick", (11.2, 7.5, 8), (side * 10.3, 3.75, -1.3)); collider(f"neighbour_{side}", (side * 10.3, 3.75, -1.3), (5.6, 3.75, 4))
for i in range(7):
    x = (i - 3) * 8.2; h = 9 + (i % 3) * 2
    box("street", "brick", (7.6, h, 5), (x, 4.5 + (i % 3), 23)); collider(f"far_{i}", (x, 5, 23), (3.8, 5, 2.5))
    for j in range(8):
        wx, wy = x - 2.6 + (j % 4) * 1.75, 2.6 + (j // 4) * 2.6
        o = box("street", "window_off", (.9, 1.2, .05), (wx, wy, 20.47))
        if (i * 3 + j) % 4 == 0:
            o.data.materials[0] = material("window_on", "street", "#ffd59a", "#f3b86c", 6.0)

# Shop shell.
box("shop", "wood_floor", (8.8, .3, 6.2), (0, FLOOR - .15, -.45)); collider("floor", (0, FLOOR / 2, -.45), (4.4, FLOOR / 2, 3.1))
box("shop", "plaster", (9.2, 4.6, .3), (0, FLOOR + 2.3, -3.65)); collider("back", (0, 2.5, -3.65), (4.6, 2.5, .15))
for x in (-4.55, 4.55):
    box("shop", "plaster", (.3, 4.6, 6.6), (x, FLOOR + 2.3, -.45)); collider(f"side_{x}", (x, 2.5, -.45), (.15, 2.5, 3.3))
for x in (-4.72, 4.72): box("shop", "brick", (.05, 4.6, 6.6), (x, FLOOR + 2.3, -.45))
box("shop", "roof", (9.6, .25, 7), (0, FLOOR + 4.68, -.45))
box("shop", "ceiling", (8.9, .05, 6.3), (0, FLOOR + 4.55, -.45))
box("shop", "planks_green", (6.7, 1, .3), (-1.15, FLOOR + .5, 2.7)); collider("knee", (-1.15, FLOOR + .5, 2.7), (3.35, .6, .15))
box("shop", "brick", (9.4, .9, .32), (0, FLOOR + 4.15, 2.7))
for x in (-4.5, -1.4, 2.12): box("shop", "frame", (.12, 2.8, .2), (x, FLOOR + 2.4, 2.72))
box("shop", "frame", (6.7, .12, .22), (-1.15, FLOOR + 1.03, 2.72)); box("shop", "frame", (6.7, .14, .22), (-1.15, FLOOR + 3.72, 2.72))
box("shop", "brick", (.3, 3.7, .32), (4.45, FLOOR + 1.85, 2.7)); collider("pier", (4.45, 2, 2.7), (.15, 2, .16))
collider("glass", (-1.15, FLOOR + 2.4, 2.72), (3.3, 1.4, .08))
box("shop", "brass", (6.6, .1, .42), (-1.15, FLOOR + 1.08, 2.86))
box("shop", "frame", (2.3, .14, .2), (3.2, FLOOR + 3.2, 2.72))
# Awning: tilted fabric stripes with a valance.
pivot = (0, FLOOR + 3.9, 2.95)
for i in range(18):
    m = "awning_cream" if i % 2 else "awning_mint"; x = -4.25 + i * .5
    box("shop", m, (.5, .04, 1.25), (x, FLOOR + 3.9, 2.95 + .45), rot_x=.22, pivot=pivot)
    box("shop", m, (.5, .22, .03), (x, FLOOR + 3.9 - .12, 2.95 + 1.07), rot_x=.22, pivot=pivot)
# Counter.
box("shop", "counter_front", (5.9, 1.0, .95), (-.2, FLOOR + .5, CZ))
box("shop", "counter_top", (6.15, .07, 1.15), (-.2, CTOP - .03, CZ)); collider("counter", (-.2, FLOOR + .53, CZ), (3.08, .55, .58))

# ---------- props (occluders and bounce only; the engine places its own copies) ----------
def import_prop(p):
    path = next((ASSETS / p["model"]).glob("*.gltf"))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None or o.parent not in new]
    if p.get("node"):
        keep = [o for o in roots if o.name.startswith(p["node"])]
        for o in roots:
            if o not in keep:
                for c in [o, *o.children_recursive]: bpy.data.objects.remove(c, do_unlink=True)
        roots = keep
        # Centre the kept node horizontally, like the engine's pick().
        pts = [r.matrix_world @ Vector(c) for r in roots for c in r.bound_box]
        cx, cy = (min(v.x for v in pts) + max(v.x for v in pts)) / 2, (min(v.y for v in pts) + max(v.y for v in pts)) / 2
        for r in roots: r.location.x -= cx; r.location.y -= cy
    holder = bpy.data.objects.new(f"PROP_{p['model']}", None); bpy.context.collection.objects.link(holder)
    for r in roots: r.parent = holder
    holder.location = bl(*p["pos"]); holder.rotation_euler.z = p.get("rotY", 0); holder.scale = [p.get("scale", 1)] * 3
for p in L["props"]: import_prop(p)

# ---------- lights ----------
def hexrgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
for i, l in enumerate(L["lights"]):
    if l["type"] == "directional":
        d = bpy.data.lights.new(f"sun{i}", "SUN"); d.energy = l["intensity"]; d.angle = math.radians(2)
    elif l["type"] == "spot":
        d = bpy.data.lights.new(f"spot{i}", "SPOT"); d.energy = 4 * math.pi * l["intensity"]
        d.spot_size = 2 * l["angle"]; d.spot_blend = l["penumbra"]; d.shadow_soft_size = .08
    else:
        d = bpy.data.lights.new(f"point{i}", "POINT"); d.energy = 4 * math.pi * l["intensity"]; d.shadow_soft_size = .06
    d.color = hexrgb(l["color"])
    o = bpy.data.objects.new(d.name, d); bpy.context.collection.objects.link(o); o.location = bl(*l["pos"])
    if "target" in l:
        o.rotation_euler = (bl(*l["target"]) - o.location).to_track_quat("-Z", "Y").to_euler()
# Night HDRI, same strength as the engine's environment.
world = bpy.data.worlds.new("night"); scene.world = world; world.use_nodes = True
env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(str(next((ASSETS / L["environment"]["hdri"]).glob("*.hdr"))))
bg = world.node_tree.nodes["Background"]; bg.inputs["Strength"].default_value = L["environment"]["intensity"]
world.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])

# ---------- join, lightmap UVs, bake ----------
def join(group):
    objs = PARTS[group]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = group.upper(); o.data.name = group.upper()
    return o

def lightmap(obj, name):
    lm = obj.data.uv_layers.new(name="lightmap"); obj.data.uv_layers.active = lm
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.004, area_weight=1.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=.004, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new(name, args.size, args.size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    for m in obj.data.materials:
        node = m.node_tree.nodes.new("ShaderNodeTexImage"); node.image = img
        m.node_tree.nodes.active = node
    return img

def denoise(img, radius=3, passes=2, tolerance=.22):
    """Edge-preserving smoothing: each pixel averages only neighbours of similar brightness, so island borders,
    corners and shadow edges stay crisp while Monte Carlo speckle is removed (Cycles does not denoise bakes)."""
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
    a = px.reshape(h, w, 4)[:, :, :3]
    for _ in range(passes):
        lum = a.mean(axis=2)
        acc = np.zeros_like(a); wsum = np.zeros((h, w), dtype=np.float32)
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                s = np.roll(np.roll(a, dy, 0), dx, 1); sl = np.roll(np.roll(lum, dy, 0), dx, 1)
                wt = (np.abs(sl - lum) <= tolerance * np.maximum(lum, .02)).astype(np.float32) * np.exp(-(dx * dx + dy * dy) / (2 * radius * radius))
                acc += s * wt[:, :, None]; wsum += wt
        a = acc / np.maximum(wsum, 1e-6)[:, :, None]
    out = px.reshape(h, w, 4); out[:, :, :3] = a
    img.pixels.foreach_set(out.ravel())

bake_targets = []
for group in ("shop", "street"):
    obj = join(group); img = lightmap(obj, f"lm_{group}"); bake_targets.append((obj, img))
scene.render.bake.margin = 8
for obj, img in bake_targets:
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    print("BAKING", obj.name, flush=True)
    # Indirect only: the browser adds direct light and shadows in real time.
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"INDIRECT"}, use_clear=True, margin=8)
    denoise(img)
    img.filepath_raw = str(OUT / f"{img.name}.webp"); img.file_format = "WEBP"
    scene.render.image_settings.quality = 90
    img.save()
    print("SAVED", img.filepath_raw, flush=True)
    # The lightmap node must not leak into the exported materials.
    for m in obj.data.materials:
        for n in [n for n in m.node_tree.nodes if n.type == "TEX_IMAGE"]: m.node_tree.nodes.remove(n)

# ---------- export ----------
bpy.ops.object.select_all(action="DESELECT")
for obj, _ in bake_targets: obj.select_set(True)
for c in COLLIDERS: c.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / "shop_shell.glb"), export_format="GLB", use_selection=True,
                          export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                          export_materials="EXPORT", export_lights=False, export_cameras=False)
print("EXPORTED", OUT / "shop_shell.glb", flush=True)
