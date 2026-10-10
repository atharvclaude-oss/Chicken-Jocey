"""Build a room in Blender from a JSON room spec, then render previews.

    blender -b --python build_room.py -- rooms/sleek-lounge-01.json [--out DIR] [--samples N] [--cams hero,corner]

The spec format (see rooms/*.json) is deliberately the same shape a future
photo-analysis step would output: room size, materials, openings, and objects
with positions. Objects tagged with "productId" keep it as a custom property,
which survives glTF export (as "extras") so the web viewer can map clicks to
catalogue products.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parent
sys.path.insert(0, str(HERE))
import furniture  # noqa: E402
import polyhaven  # noqa: E402
import sketchfab  # noqa: E402

WALL_T = 0.12  # wall thickness (m), built outside the room footprint


# ---------------------------------------------------------------- helpers

def hex_rgb(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)


def kelvin_rgb(k):
    """Approximate blackbody color for warm interior lights."""
    table = {2200: (1.0, 0.62, 0.32), 2700: (1.0, 0.72, 0.45), 3000: (1.0, 0.77, 0.54), 4000: (1.0, 0.86, 0.73)}
    return table[min(table, key=lambda t: abs(t - k))]


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def box(name, size, loc, mat=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 3, "ANGLE"
    if mat:
        o.data.materials.append(mat)
    return o


def principled(name, color=(0.8, 0.8, 0.8, 1), rough=0.5, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = emit
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def textured(name, tex_id, tile=1.0, tint=None, color=None, res="2k", rough_min=None, detail=False, normal=0.8):
    """PBR material from a Poly Haven texture set, box-mapped in object space so
    walls/floors of any size tile at real-world scale without UV work."""
    maps = polyhaven.texture(tex_id, res)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / tile, 1 / tile, 1 / tile)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def img(key, non_color=False):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(str(maps[key]), check_existing=True)
        n.projection, n.projection_blend = "BOX", 0.2
        if non_color:
            n.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"])
        return n

    if detail:
        # Surface detail only (weave, grain, plaster): flat color + the texture's
        # normal and roughness. Avoids the source texture's own hue (e.g. blue linen).
        b.inputs["Base Color"].default_value = hex_rgb(color) if color else (0.8, 0.8, 0.8, 1)
        diff = None
    else:
        diff = img("diff")
    if diff is None:
        pass
    elif color:  # recolor (e.g. paint) while keeping the texture's variation
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = hex_rgb(color)
        nt.links.new(diff.outputs["Color"], mix.inputs[7])
        # Multiply by a ~0.85 grey texture then brighten to land near the target color.
        bright = nt.nodes.new("ShaderNodeBrightContrast")
        bright.inputs["Bright"].default_value = 0.0
        nt.links.new(mix.outputs[2], bright.inputs["Color"])
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Value"].default_value = 1.25
        nt.links.new(bright.outputs["Color"], hsv.inputs["Color"])
        nt.links.new(hsv.outputs["Color"], b.inputs["Base Color"])
    elif tint:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[7].default_value = (*tint, 1)
        nt.links.new(diff.outputs["Color"], mix.inputs[6])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    else:
        nt.links.new(diff.outputs["Color"], b.inputs["Base Color"])

    if "rough" in maps:
        rough = img("rough", True).outputs["Color"]
        if rough_min is not None:  # tame glossy hot spots (e.g. lacquered floors)
            remap = nt.nodes.new("ShaderNodeMapRange")
            remap.inputs["To Min"].default_value = rough_min
            remap.inputs["To Max"].default_value = 0.85
            nt.links.new(rough, remap.inputs["Value"])
            rough = remap.outputs["Result"]
        nt.links.new(rough, b.inputs["Roughness"])
    if "nor" in maps:
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal
        nt.links.new(img("nor", True).outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], b.inputs["Normal"])
    return m


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def group(name, objs, spec):
    """Parent objects under an empty placed per spec (pos/rot/scale)."""
    root = link(bpy.data.objects.new(name, None))
    for o in objs:
        if o.parent is None:
            o.parent = root
    x, y = spec["pos"][:2]
    z = spec["pos"][2] if len(spec["pos"]) > 2 else 0.0
    root.location = (x, y, z)
    root.rotation_euler = (0, 0, math.radians(spec.get("rot", 0)))
    s = spec.get("scale", 1.0)
    root.scale = (s, s, s)
    if "productId" in spec:
        root["productId"] = spec["productId"]
    root["asset"] = spec["asset"]
    return root


# ---------------------------------------------------------------- room shell

def build_shell(spec):
    W, D, H = (spec["room"][k] for k in ("width", "depth", "height"))
    mats = spec["materials"]
    floor_m = textured("floor", mats["floor"]["texture"], mats["floor"].get("tile", 1), tint=mats["floor"].get("tint"),
                       rough_min=mats["floor"].get("rough_min"))
    if mats["walls"].get("texture"):
        wall_m = textured("walls", mats["walls"]["texture"], mats["walls"].get("tile", 2), color=mats["walls"]["color"],
                          detail=mats["walls"].get("detail", False), normal=mats["walls"].get("normal", 0.8))
    else:
        wall_m = principled("walls", hex_rgb(mats["walls"]["color"]), rough=0.9)
    ceil_m = principled("ceiling", hex_rgb(mats["ceiling"]["color"]), rough=0.9)
    base_m = principled("baseboard", hex_rgb(mats["baseboard"]["color"]), rough=0.45)
    frame_m = principled("window_frame", hex_rgb("#151617"), rough=0.35, metal=0.6)

    box("floor", (W, D, 0.05), (W / 2, D / 2, -0.025), floor_m)
    box("ceiling", (W + 2 * WALL_T, D + 2 * WALL_T, 0.05), (W / 2, D / 2, H + 0.025), ceil_m)

    t = WALL_T
    accent = mats.get("accent_wall")
    accent_m = None
    if accent:
        accent_m = (textured("accent_wall", mats["walls"]["texture"], mats["walls"].get("tile", 2), color=accent["color"],
                             detail=True, normal=mats["walls"].get("normal", 0.5))
                    if mats["walls"].get("texture") else principled("accent_wall", hex_rgb(accent["color"]), rough=0.9))
    door_m = principled("door", hex_rgb(mats.get("door", {}).get("color", "#efeee9")), rough=0.4)
    handle_m = principled("door_handle", hex_rgb("#2a2a2c"), rough=0.3, metal=0.9)

    for side in ("back", "front", "left", "right"):
        along_x = side in ("back", "front")
        # Front/back walls run past the corners so the shell is closed.
        u_lo, u_hi = (-t, W + t) if along_x else (0.0, D)
        m = accent_m if accent and accent["wall"] == side else wall_m
        ops = sorted((o for o in spec.get("openings", []) if o["wall"] == side), key=lambda o: o["center"])
        u = u_lo
        for i, o in enumerate(ops):
            o0, o1 = o["center"] - o["width"] / 2, o["center"] + o["width"] / 2
            z0 = 0.0 if o["type"] == "door" else o["sill"]
            z1 = min(z0 + o["height"], H - 0.02)
            if o0 > u:
                wall_box(f"wall_{side}_{i}a", side, (u + o0) / 2, H / 2, o0 - u, H, t, -t / 2, m, W, D)
            if z0 > 0:
                wall_box(f"wall_{side}_{i}b", side, (o0 + o1) / 2, z0 / 2, o1 - o0, z0, t, -t / 2, m, W, D)
            if z1 < H:
                wall_box(f"wall_{side}_{i}c", side, (o0 + o1) / 2, (z1 + H) / 2, o1 - o0, H - z1, t, -t / 2, m, W, D)
            if o["type"] == "window":
                build_window(f"window_{side}_{i}", side, o0, o1, z0, z1, o, frame_m, base_m, W, D)
            else:
                build_door(f"door_{side}_{i}", side, o0, o1, z1, door_m, handle_m, W, D)
            u = o1
        if u < u_hi:
            name = f"wall_{side}" if not ops else f"wall_{side}_end"
            wall_box(name, side, (u + u_hi) / 2, H / 2, u_hi - u, H, t, -t / 2, m, W, D)

    # Baseboards.
    bh = mats["baseboard"]["height"]
    box("baseboard_back", (W, 0.015, bh), (W / 2, D - 0.0075, bh / 2), base_m)
    box("baseboard_front", (W, 0.015, bh), (W / 2, 0.0075, bh / 2), base_m)
    box("baseboard_left", (0.015, D, bh), (0.0075, D / 2, bh / 2), base_m)
    box("baseboard_right", (0.015, D, bh), (W - 0.0075, D / 2, bh / 2), base_m)


def wall_frame(side, W, D):
    """(inner-face coordinate, inward normal sign) for a wall."""
    return {"left": (0.0, 1), "right": (W, -1), "front": (0.0, 1), "back": (D, -1)}[side]


def wall_box(name, side, u, z, du, dz, depth, n, mat, W, D, bevel=0.0):
    """Box placed relative to a wall: u along it, z up, n along the inward
    normal measured from the wall's inner face (negative = inside the wall)."""
    face, inward = wall_frame(side, W, D)
    c = face + inward * n
    if side in ("left", "right"):
        return box(name, (depth, du, dz), (c, u, z), mat, bevel)
    return box(name, (du, depth, dz), (u, c, z), mat, bevel)


def build_window(p, side, u0, u1, z0, z1, o, frame_m, base_m, W, D):
    """Slim black steel frame, mullions roughly every 0.9 m, sill, optional blind."""
    f = 0.045
    zc, du, dz = (z0 + z1) / 2, u1 - u0, z1 - z0
    wall_box(f"{p}_frame_l", side, u0 + f / 2, zc, f, dz, 0.06, -0.03, frame_m, W, D)
    wall_box(f"{p}_frame_r", side, u1 - f / 2, zc, f, dz, 0.06, -0.03, frame_m, W, D)
    wall_box(f"{p}_frame_t", side, (u0 + u1) / 2, z1 - f / 2, du, f, 0.06, -0.03, frame_m, W, D)
    wall_box(f"{p}_frame_b", side, (u0 + u1) / 2, z0 + f / 2, du, f, 0.06, -0.03, frame_m, W, D)
    n = max(0, round(du / 0.9) - 1)
    for i in range(1, n + 1):
        wall_box(f"{p}_mullion_{i}", side, u0 + du * i / (n + 1), zc, 0.03, dz, 0.05, -0.03, frame_m, W, D)
    wall_box(f"{p}_sill", side, (u0 + u1) / 2, z0 - 0.015, du + 0.1, 0.03, 0.2, 0.04, base_m, W, D)
    if o.get("blind"):
        build_blind(p, side, u0, u1, z0, z1, o["blind"], W, D)


def build_door(p, side, u0, u1, z1, door_m, handle_m, W, D):
    """Closed interior door: casing around the opening, slab, lever handle."""
    du = u1 - u0
    c = 0.06  # casing width
    wall_box(f"{p}_casing_l", side, u0 - c / 2, z1 / 2, c, z1, 0.02, 0.01, door_m, W, D, 0.004)
    wall_box(f"{p}_casing_r", side, u1 + c / 2, z1 / 2, c, z1, 0.02, 0.01, door_m, W, D, 0.004)
    wall_box(f"{p}_casing_t", side, (u0 + u1) / 2, z1 + c / 2, du + 2 * c, c, 0.02, 0.01, door_m, W, D, 0.004)
    wall_box(f"{p}_slab", side, (u0 + u1) / 2, z1 / 2, du - 0.01, z1 - 0.01, 0.04, -0.03, door_m, W, D, 0.003)
    wall_box(f"{p}_handle", side, u1 - 0.08, 1.0, 0.12, 0.02, 0.05, 0.015, handle_m, W, D, 0.005)


def build_blind(prefix, side, u0, u1, z0, z1, coverage, W, D):
    """Zebra roller blind: cassette at the top, striped fabric down to `coverage`."""
    cass = principled("blind_cassette", hex_rgb("#efede8"), rough=0.5)
    fabric = bpy.data.materials.new("blind_fabric")
    fabric.use_nodes = True
    nt = fabric.node_tree
    b = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
    # Alternating sheer / solid bands, 7.5 cm each: height -> stripes.
    wave = nt.nodes.new("ShaderNodeMath")
    wave.operation = "PINGPONG"
    wave.inputs[1].default_value = 0.075
    nt.links.new(sep.outputs["Z"], wave.inputs[0])
    band = nt.nodes.new("ShaderNodeMath")
    band.operation = "GREATER_THAN"
    band.inputs[1].default_value = 0.0375
    nt.links.new(wave.outputs[0], band.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = hex_rgb("#d9cdb6")  # sheer band (backlit)
    mix.inputs[7].default_value = hex_rgb("#cbbb9c")  # solid band
    nt.links.new(band.outputs[0], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    alpha = nt.nodes.new("ShaderNodeMapRange")
    alpha.inputs["To Min"].default_value = 0.35
    alpha.inputs["To Max"].default_value = 1.0
    nt.links.new(band.outputs[0], alpha.inputs["Value"])
    nt.links.new(alpha.outputs["Result"], b.inputs["Alpha"])

    width = u1 - u0 + 0.08
    drop = (z1 - z0) * coverage
    uc = (u0 + u1) / 2
    wall_box(f"{prefix}_blind_cassette", side, uc, z1 + 0.04, width, 0.09, 0.09, 0.07, cass, W, D, 0.01)
    face, inward = wall_frame(side, W, D)
    c = face + inward * 0.08
    if side in ("left", "right"):
        loc, rot, scale = (c, uc, z1 - drop / 2), (0, math.radians(90 * inward), 0), (drop, width - 0.02, 1)
    else:  # plane normal +Z rotated about X to face along +/-y (into the room)
        loc, rot, scale = (uc, c, z1 - drop / 2), (math.radians(-90 * inward), 0, 0), (width - 0.02, drop, 1)
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    panel = bpy.context.active_object
    panel.name = f"{prefix}_blind"
    panel.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    panel.data.materials.append(fabric)
    wall_box(f"{prefix}_blind_bar", side, uc, z1 - drop, width - 0.02, 0.025, 0.03, 0.08, cass, W, D, 0.005)


def build_environment(spec):
    env = spec["environment"]
    world = bpy.data.worlds.new("world")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    tex = nt.nodes.new("ShaderNodeTexEnvironment")
    tex.image = bpy.data.images.load(str(polyhaven.hdri(env["hdri"])))
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(env.get("rotation", 0)))
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = env.get("strength", 1.0)

    # Low afternoon sun through the window for a defined light pool on the floor.
    if env.get("sun", 3.5) <= 0:
        return
    sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")))
    sun.data.energy = env.get("sun", 3.5)
    sun.data.angle = math.radians(1.5)
    sun.data.color = (1.0, 0.9, 0.78)
    elev, azim = env.get("sun_angle", [62, -68])  # tilt from vertical, heading
    sun.rotation_euler = (math.radians(elev), 0, math.radians(azim))


# ---------------------------------------------------------------- objects

def import_polyhaven(spec, idx):
    asset_id = spec["asset"].split(":", 1)[1]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(polyhaven.model(asset_id)))
    new = [o for o in bpy.data.objects if o not in before]
    root = group(f"{asset_id}_{idx}", new, spec)
    if "hang" in spec:  # ceiling fixture: lift so its top meets the ceiling
        bpy.context.view_layer.update()
        mn, mx = bounds([o for o in new])
        H = SPEC["room"]["height"]
        root.location.z += H - mx.z
        if "light" in spec:
            L = spec["light"]
            light = link(bpy.data.objects.new(f"{asset_id}_light", bpy.data.lights.new(f"{asset_id}_light", "POINT")))
            light.data.energy = L["watts"] * 4
            light.data.color = kelvin_rgb(L.get("kelvin", 2700))
            light.data.shadow_soft_size = 0.08
            light.location = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z + 0.16 + (H - mx.z))
    return root


def add_point_light(name, loc, watts, kelvin, soft=0.08):
    light = link(bpy.data.objects.new(name, bpy.data.lights.new(name, "POINT")))
    light.data.energy = watts * 4
    light.data.color = kelvin_rgb(kelvin)
    light.data.shadow_soft_size = soft
    light.location = loc
    return light


def import_sketchfab(spec, idx):
    """Sketchfab models arrive at arbitrary scale and facing. The spec says how to fix both:
    "face": extra rotation (degrees) so the model's front points at -y, like everything else;
    "fit": {"axis": "x"|"y"|"z", "size": metres} sets the real size along one axis
    (after "face"). The model is then centred, set on the floor, and placed per pos/rot."""
    uid = spec["asset"].split(":", 1)[1]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(sketchfab.model(uid)))
    imported = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    # Keep only textured meshes, frozen where they sit: rigs, empties and material-less helper
    # shapes (e.g. bone display spheres) would otherwise break baking.
    new = [o for o in imported if o.type == "MESH" and o.data.materials and not o.hide_render]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in new:
        mw = o.matrix_world.copy()
        if any(m.type == "ARMATURE" for m in o.modifiers):
            # Rigged mesh: freeze the pose the rig gives it (its raw rest shape can be far off).
            posed = bpy.data.meshes.new_from_object(o.evaluated_get(depsgraph))
            o.modifiers.clear()
            o.data = posed
        o.parent = None
        o.matrix_world = mw
    for o in imported:
        if o not in new:
            bpy.data.objects.remove(o, do_unlink=True)
    if "decimate" in spec:  # keep web files light: baked textures carry the fine detail
        for o in new:
            d = o.modifiers.new("decimate", "DECIMATE")
            d.ratio = spec["decimate"]
            d.use_collapse_triangulate = True
    norm = link(bpy.data.objects.new(f"sketchfab_{idx}_fit", None))
    for o in new:
        if o.parent is None:
            o.parent = norm
    norm.rotation_euler = (0, 0, math.radians(spec.get("face", 0)))
    bpy.context.view_layer.update()
    mn, mx = bounds(new)
    fit = spec["fit"]
    axis = "xyz".index(fit["axis"])
    s = fit["size"] / (mx - mn)[axis]
    norm.scale = (s, s, s)
    bpy.context.view_layer.update()
    mn, mx = bounds(new)
    norm.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)
    root = group(f"sketchfab_{idx}", [norm], spec)
    bpy.context.view_layer.update()
    mn, mx = bounds(new)
    H = SPEC["room"]["height"]
    if "hang" in spec:  # ceiling fixture: lift so its top meets the ceiling
        root.location.z += H - mx.z
        bpy.context.view_layer.update()
        mn, mx = bounds(new)
    if "light" in spec:
        L = spec["light"]
        z = mn.z + (mx.z - mn.z) * L.get("at", 0.3 if "hang" in spec else 0.75)
        add_point_light(f"sketchfab_{idx}_light", ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, z),
                        L["watts"], L.get("kelvin", 2700), L.get("soft", 0.08))
    return root


def proc_area_light(spec, idx):
    light = link(bpy.data.objects.new(f"area_{idx}", bpy.data.lights.new(f"area_{idx}", "AREA")))
    light.data.energy = spec.get("watts", 40)
    light.data.color = kelvin_rgb(spec.get("kelvin", 3000))
    light.data.size = spec.get("size", 1.5)
    light.location = tuple(spec["pos"])
    return light


def proc_rug(spec, idx):
    w, d = spec["size"]
    m = (textured(f"rug_{idx}", spec["texture"], spec.get("tile", 0.4), color=spec.get("color"),
                  tint=spec.get("tint"), detail=spec.get("detail", False)) if spec.get("texture")
         else principled(f"rug_{idx}", hex_rgb(spec.get("color", "#d8d0c0")), rough=1.0))
    parts = [box(f"rug_{idx}_mesh", (w, d, 0.012), (0, 0, 0.006), m, bevel=0.005)]
    if spec.get("border"):  # simple printed border band, inset from the edge
        bm = principled(f"rug_{idx}_border", hex_rgb(spec["border"]), rough=0.95)
        bw, inset, z = 0.07, 0.12, 0.0125
        for name, size, loc in (
            ("t", (w - 2 * inset, bw, 0.001), (0, d / 2 - inset, z)),
            ("b", (w - 2 * inset, bw, 0.001), (0, -d / 2 + inset, z)),
            ("l", (bw, d - 2 * inset, 0.001), (-w / 2 + inset, 0, z)),
            ("r", (bw, d - 2 * inset, 0.001), (w / 2 - inset, 0, z)),
        ):
            parts.append(box(f"rug_{idx}_border_{name}", size, loc, bm))
    return group(f"rug_{idx}", parts, spec)


def proc_framed_print(spec, idx):
    w, h = spec["size"]
    oak = textured("oak_frame", "herringbone_parquet", 0.5, tint=(1.0, 0.85, 0.7))
    mat_m = principled("passepartout", hex_rgb("#efede8"), rough=0.9)
    art = bpy.data.materials.new(f"art_{idx}")
    art.use_nodes = True
    tex = art.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(HERE / spec["image"]))
    b = art.node_tree.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.85
    art.node_tree.links.new(tex.outputs["Color"], b.inputs["Base Color"])

    fw, depth = 0.035, 0.03
    parts = [
        box(f"frame_{idx}_t", (w, depth, fw), (0, -depth / 2, h / 2 - fw / 2), oak, 0.003),
        box(f"frame_{idx}_b", (w, depth, fw), (0, -depth / 2, -h / 2 + fw / 2), oak, 0.003),
        box(f"frame_{idx}_l", (fw, depth, h - 2 * fw), (-w / 2 + fw / 2, -depth / 2, 0), oak, 0.003),
        box(f"frame_{idx}_r", (fw, depth, h - 2 * fw), (w / 2 - fw / 2, -depth / 2, 0), oak, 0.003),
        box(f"frame_{idx}_mat", (w - 2 * fw, 0.004, h - 2 * fw), (0, -0.008, 0), mat_m),
    ]
    # Artwork plane with UVs from the default cube projection: use a plane instead.
    aw, ah = (w - 2 * fw) * 0.72, (h - 2 * fw) * 0.78
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.0105, 0), rotation=(math.radians(90), 0, 0))
    plane = bpy.context.active_object
    plane.name = f"frame_{idx}_art"
    plane.scale = (aw, ah, 1)
    plane.data.materials.append(art)
    parts.append(plane)
    return group(f"framed_print_{idx}", parts, spec)


def proc_arc_floor_lamp(spec, idx):
    reach = spec.get("reach", 1.3)
    marble = principled("lamp_marble", hex_rgb("#d9d6d0"), rough=0.25)
    brass = principled("lamp_steel", hex_rgb("#1a1a1b"), rough=0.3, metal=0.9)
    shade_m = principled("lamp_shade", hex_rgb("#141415"), rough=0.4, metal=0.7)
    bulb_m = principled("lamp_bulb", hex_rgb("#fff4e0"), emit=(1.0, 0.8, 0.55, 1), emit_strength=25)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.05, location=(0, 0, 0.025), vertices=64)
    base = bpy.context.active_object
    base.data.materials.append(marble)
    bv = base.modifiers.new("bevel", "BEVEL")
    bv.width, bv.segments = 0.008, 3

    # Arc: a bezier from the base up and over to the shade (reach is along -y,
    # the object's "front", so rot points the arc where the spec says).
    curve = bpy.data.curves.new(f"arc_{idx}", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.011
    curve.bevel_resolution = 4
    sp = curve.splines.new("BEZIER")
    sp.bezier_points.add(1)
    p0, p1 = sp.bezier_points
    top = 1.95
    p0.co = (0, 0, 0.05)
    p0.handle_left = (0, 0, -0.3)
    p0.handle_right = (0, 0, 1.5)
    p1.co = (0, -reach, top - 0.05)
    p1.handle_left = (0, -reach + 0.55, top + 0.45)
    p1.handle_right = (0, -reach - 0.2, top - 0.2)
    arc = link(bpy.data.objects.new(f"arc_{idx}_curve", curve))
    arc.data.materials.append(brass)

    # Dome shade, hanging open-side down at the arc's end.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(0, -reach, top - 0.12), segments=64, ring_count=32)
    shade = bpy.context.active_object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in shade.data.vertices:
        v.select = v.co.z < -0.02
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    shade.scale = (1, 1, 0.75)
    sol = shade.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.004
    shade.data.materials.append(shade_m)
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(0, -reach, top - 0.07))
    bulb = bpy.context.active_object
    bulb.data.materials.append(bulb_m)

    light = link(bpy.data.objects.new(f"arc_lamp_{idx}_light", bpy.data.lights.new(f"arc_lamp_{idx}_light", "SPOT")))
    light.data.energy = 320
    light.data.color = kelvin_rgb(2700)
    light.data.spot_size = math.radians(110)
    light.data.spot_blend = 0.6
    light.data.shadow_soft_size = 0.05
    light.location = (0, -reach, top - 0.11)
    return group(f"arc_floor_lamp_{idx}", [base, arc, shade, bulb, light], spec)


PROC = {
    "rug": proc_rug,
    "framed_print": proc_framed_print,
    "arc_floor_lamp": proc_arc_floor_lamp,
    "area_light": proc_area_light,
}


# ---------------------------------------------------------------- render

def setup_render(samples, exposure=0.6):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    scn.cycles.device = "GPU"
    scn.cycles.samples = samples
    scn.cycles.use_denoising = True
    scn.cycles.denoiser = "OPTIX"
    scn.cycles.max_bounces = 8
    scn.view_settings.view_transform = "AgX"
    scn.view_settings.look = "AgX - Medium High Contrast"
    scn.view_settings.exposure = exposure
    scn.render.resolution_x, scn.render.resolution_y = 1600, 1000


def add_cameras(spec):
    cams = {}
    for name, c in spec["cameras"].items():
        cam = link(bpy.data.objects.new(f"cam_{name}", bpy.data.cameras.new(f"cam_{name}")))
        cam.location = c["pos"]
        cam.rotation_euler = (Vector(c["target"]) - Vector(c["pos"])).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = c.get("lens", 24)
        cam.data.clip_start = 0.05
        cams[name] = (cam, c)
    return cams


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", default=str(ENGINE / "renders"))
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--cams", default="")
    args = ap.parse_args(argv)

    global SPEC
    spec_path = Path(args.spec)
    if not spec_path.is_absolute():
        spec_path = ENGINE / spec_path
    SPEC = json.loads(spec_path.read_text())

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Rooms specify exposure either top-level ("exposure") or under "render".
    setup_render(args.samples, SPEC.get("render", {}).get("exposure", SPEC.get("exposure", 0.6)))
    build_shell(SPEC)
    build_environment(SPEC)
    for i, obj in enumerate(SPEC["objects"]):
        kind, name = obj["asset"].split(":", 1)
        if kind == "polyhaven":
            import_polyhaven(obj, i)
        elif kind == "sketchfab":
            import_sketchfab(obj, i)
        elif kind == "proc":
            if name in PROC:
                PROC[name](obj, i)
            else:
                furniture.BUILDERS[name](obj, i, sys.modules[__name__])
    cams = add_cameras(SPEC)

    out = Path(args.out) / SPEC["id"]
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / f"{SPEC['id']}.blend"))

    wanted = [c for c in args.cams.split(",") if c] or list(cams)
    scn = bpy.context.scene
    for name in wanted:
        cam, c = cams[name]
        hidden = [o for o in scn.objects if any(o.name.startswith(h) for h in c.get("hide", []))]
        for o in hidden:
            o.hide_render = True
        scn.camera = cam
        scn.render.filepath = str(out / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        for o in hidden:
            o.hide_render = False
        print(f"RENDERED {scn.render.filepath}")


SPEC = {}
if __name__ == "__main__":
    main()
