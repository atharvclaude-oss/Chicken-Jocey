"""Bake a built room's lighting into textures and export a web-ready .glb.

    blender -b renders/<id>/<id>.blend --python bake_export.py -- --out ../frontend/public/models [--samples 256]

Why bake: real-time lighting in the browser is what makes most 3D rooms look
cheap. Instead, Cycles path-traces the lighting once (bounce light, soft
shadows, lamp glow) and stores it in each object's texture. The browser then
displays those textures unlit, so any viewpoint looks like the offline render.
Trade-off: reflections are frozen and lights can't be switched at runtime.

Each asset is joined into one mesh (fewer draw calls), gets a fresh
non-overlapping UV layout, and keeps its "productId" as glTF extras.
"""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--samples", type=int, default=256)
ap.add_argument("--texel", type=float, default=420, help="baked pixels per meter")
args = ap.parse_args(argv)

scn = bpy.context.scene
room_id = Path(bpy.data.filepath).stem
# GPU settings are user preferences (not saved in the .blend), so set them here.
prefs = bpy.context.preferences.addons["cycles"].preferences
for device_type in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = device_type
        prefs.get_devices()
        break
    except TypeError:
        continue
for d in prefs.devices:
    d.use = d.type == prefs.compute_device_type
scn.cycles.device = "GPU"
scn.cycles.samples = args.samples
scn.render.bake.margin = 6


def surface_area(obj):
    # Scale is applied before this is called, so local face areas are world areas.
    return sum(p.area for p in obj.data.polygons)


def bake_size(obj, shell=False):
    area = max(surface_area(obj), 0.01)
    side = math.sqrt(area) * args.texel
    cap = 4096 if obj.name in ("floor",) else 2048
    return int(min(cap, max(512 if not shell else 256, 2 ** round(math.log2(max(side, 1))))))


def strip_hidden_faces(obj, room_center):
    """Delete shell faces nobody sees (floor underside, wall exteriors) so the
    bake texture is spent only on visible surfaces."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    mw = obj.matrix_world
    doomed = []
    for f in bm.faces:
        n = (mw.to_3x3() @ f.normal).normalized()
        c = mw @ f.calc_center_median()
        if obj.name == "floor":
            keep = n.z > 0.9
        elif obj.name == "ceiling":
            keep = n.z < -0.9
        else:
            to_center = room_center - c
            to_center.z = 0
            keep = n.z > 0.9 or (to_center.length > 0 and n.dot(to_center.normalized()) > 0.3)
        if not keep:
            doomed.append(f)
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()


# 0. Drop animations (some models ship with e.g. door-opening clips). Their
# keyframes would override the placed transforms on export.
for o in scn.objects:
    o.animation_data_clear()

# 1. Collapse each placed asset (root empty + children) into one mesh object.
bpy.ops.object.select_all(action="DESELECT")
units = []
for root in [o for o in scn.objects if o.parent is None and o.type == "EMPTY" and "asset" in o]:
    meshes = [c for c in root.children_recursive if c.type == "MESH" and not c.hide_render]
    curves = [c for c in root.children_recursive if c.type == "CURVE"]
    for c in curves:  # e.g. the floor lamp's arc
        bpy.context.view_layer.objects.active = c
        c.select_set(True)
        bpy.ops.object.convert(target="MESH")
        meshes.append(bpy.context.active_object)
        bpy.ops.object.select_all(action="DESELECT")
    if not meshes:
        continue
    asset_name = root.name
    root.name = asset_name + "_root"
    for m in meshes:
        m.select_set(True)
        # Apply modifiers (bevels, solidify) so they bake and export.
        bpy.context.view_layer.objects.active = m
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = asset_name
    for k in ("productId", "asset"):
        if k in root:
            joined[k] = root[k]
    bpy.ops.object.select_all(action="DESELECT")
    units.append(joined)

# Shell pieces (walls, floor, frames) are already standalone meshes.
shell = [o for o in scn.objects if o.type == "MESH" and o.parent is None and o not in units and not o.hide_render]
for o in shell:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o.select_set(False)
targets = units + shell
floor = bpy.data.objects["floor"]
fmin = floor.matrix_world @ Vector(floor.bound_box[0])
fmax = floor.matrix_world @ Vector(floor.bound_box[6])
room_center = Vector(((fmin.x + fmax.x) / 2, (fmin.y + fmax.y) / 2, 1.2))
for o in shell:
    if not o.name.startswith(("window_", "door_")):
        strip_hidden_faces(o, room_center)

# 2. Bake UVs + diffuse lighting per object.
BAKE_DIR = Path(bpy.data.filepath).parent / "bake"
BAKE_DIR.mkdir(exist_ok=True)
for obj in targets:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    uv = obj.data.uv_layers.new(name="bake")
    obj.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")

    size = bake_size(obj, shell=obj in shell)
    img = bpy.data.images.new(f"{obj.name}_bake", size, size, alpha=False, float_buffer=True)
    nodes_added = []
    for slot in obj.material_slots:
        if not slot.material:
            continue
        slot.material.use_nodes = True
        nt = slot.material.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nt.nodes.active = n
        nodes_added.append((nt, n))
    print(f"BAKE {obj.name} {size}px", flush=True)
    bpy.ops.object.bake(type="COMBINED", pass_filter={"EMIT", "DIRECT", "INDIRECT", "DIFFUSE", "TRANSMISSION"},
                        use_clear=True, margin=6)
    for nt, n in nodes_added:
        nt.nodes.remove(n)
    # The bake is linear HDR. Save it through the scene's view transform (AgX,
    # exposure) so the web texture matches the Cycles preview renders exactly.
    scn.render.image_settings.file_format = "PNG"
    disp_path = BAKE_DIR / f"{obj.name}.png"
    img.save_render(str(disp_path), scene=scn)
    display_img = bpy.data.images.load(str(disp_path))

    # 3. Replace materials with one unlit material showing the bake.
    baked = bpy.data.materials.new(f"{obj.name}_baked")
    baked.use_nodes = True
    nt = baked.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")  # exported as KHR_materials_unlit-like emissive
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = display_img
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "bake"
    nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    # Principled with black base + baked texture as emission: the glTF exporter
    # writes it as an emissive texture, which the web viewer renders as-is.
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Emission Strength"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    nt.nodes.remove(emit)
    obj.data.materials.clear()
    obj.data.materials.append(baked)
    # Keep only the bake UVs so the exported TEXCOORD_0 is the bake layout.
    for layer in list(obj.data.uv_layers):
        if layer.name != "bake":
            obj.data.uv_layers.remove(layer)

# 4. Export only the baked meshes.
for o in scn.objects:
    o.select_set(o in targets)
out_dir = Path(args.out)
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / f"{room_id}.glb"),
    export_format="GLB",
    use_selection=True,
    export_extras=True,
    export_image_format="JPEG",
    export_jpeg_quality=88,
    export_lights=False,
    export_cameras=False,
    export_apply=True,
    export_animations=False,
)
print(f"EXPORTED {out_dir / (room_id + '.glb')}")
