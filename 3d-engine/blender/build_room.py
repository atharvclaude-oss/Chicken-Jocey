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
    walls = {
        "back": ((W + 2 * t, t, H), (W / 2, D + t / 2, H / 2)),
        "front": ((W + 2 * t, t, H), (W / 2, -t / 2, H / 2)),
        "left": ((t, D, H), (-t / 2, D / 2, H / 2)),
        "right": ((t, D, H), (W + t / 2, D / 2, H / 2)),
    }
    windows = {o["wall"]: o for o in spec.get("openings", []) if o["type"] == "window"}

    for side, (size, loc) in walls.items():
        if side in windows and side in ("left", "right"):
            w = windows[side]
            y0, y1 = w["center"] - w["width"] / 2, w["center"] + w["width"] / 2
            z0, z1 = w["sill"], w["sill"] + w["height"]
            x = loc[0]
            # Four pieces around the opening.
            box(f"wall_{side}_a", (t, y0, H), (x, y0 / 2, H / 2), wall_m)
            box(f"wall_{side}_b", (t, D - y1, H), (x, (y1 + D) / 2, H / 2), wall_m)
            box(f"wall_{side}_c", (t, y1 - y0, z0), (x, (y0 + y1) / 2, z0 / 2), wall_m)
            box(f"wall_{side}_d", (t, y1 - y0, H - z1), (x, (y0 + y1) / 2, (z1 + H) / 2), wall_m)
            # Slim black steel frame; mullions roughly every 0.9 m.
            fx = W + 0.03 if side == "right" else -0.03
            f = 0.045
            p = f"window_{side}"
            box(f"{p}_frame_l", (0.06, f, z1 - z0), (fx, y0 + f / 2, (z0 + z1) / 2), frame_m)
            box(f"{p}_frame_r", (0.06, f, z1 - z0), (fx, y1 - f / 2, (z0 + z1) / 2), frame_m)
            box(f"{p}_frame_t", (0.06, y1 - y0, f), (fx, (y0 + y1) / 2, z1 - f / 2), frame_m)
            box(f"{p}_frame_b", (0.06, y1 - y0, f), (fx, (y0 + y1) / 2, z0 + f / 2), frame_m)
            n = max(0, round((y1 - y0) / 0.9) - 1)
            for i in range(1, n + 1):
                yy = y0 + (y1 - y0) * i / (n + 1)
                box(f"{p}_mullion_{i}", (0.05, 0.03, z1 - z0), (fx, yy, (z0 + z1) / 2), frame_m)
            inward = -1 if side == "right" else 1
            edge = W if side == "right" else 0.0
            box(f"{p}_sill", (0.2, y1 - y0 + 0.1, 0.03), (edge + inward * 0.06, (y0 + y1) / 2, z0 - 0.015), base_m)
            if w.get("blind"):
                build_blind(p, edge + inward * 0.07, y0, y1, z0, z1, w["blind"], faces=inward)
        else:
            accent = mats.get("accent_wall")
            m = wall_m
            if accent and accent["wall"] == side:
                m = textured("accent_wall", mats["walls"]["texture"], mats["walls"].get("tile", 2), color=accent["color"],
                             detail=True, normal=mats["walls"].get("normal", 0.5))
            box(f"wall_{side}", size, loc, m)

    # Baseboards.
    bh = mats["baseboard"]["height"]
    box("baseboard_back", (W, 0.015, bh), (W / 2, D - 0.0075, bh / 2), base_m)
    box("baseboard_front", (W, 0.015, bh), (W / 2, 0.0075, bh / 2), base_m)
    box("baseboard_left", (0.015, D, bh), (0.0075, D / 2, bh / 2), base_m)
    box("baseboard_right", (0.015, D, bh), (W - 0.0075, D / 2, bh / 2), base_m)


def build_blind(prefix, x, y0, y1, z0, z1, coverage, faces=-1):
    """Zebra roller blind: cassette at the top, striped fabric down to `coverage`."""
    cass = principled("blind_cassette", hex_rgb("#efede8"), rough=0.5)
    fabric = bpy.data.materials.new("blind_fabric")
    fabric.use_nodes = True
    nt = fabric.node_tree
    b = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
    # Alternating sheer / solid bands, 7.5 cm each: z position -> stripes.
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
    # Sheer bands let daylight through and glow a little, like the real fabric.
    alpha = nt.nodes.new("ShaderNodeMapRange")
    alpha.inputs["To Min"].default_value = 0.35
    alpha.inputs["To Max"].default_value = 1.0
    nt.links.new(band.outputs[0], alpha.inputs["Value"])
    nt.links.new(alpha.outputs["Result"], b.inputs["Alpha"])

    width = y1 - y0 + 0.08
    drop = (z1 - z0) * coverage
    box(f"{prefix}_blind_cassette", (0.09, width, 0.09), (x, (y0 + y1) / 2, z1 + 0.04), cass, 0.01)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x + 0.01, (y0 + y1) / 2, z1 - drop / 2),
                                     rotation=(0, math.radians(90 * faces), 0))  # +Z normal -> faces (x) into the room
    panel = bpy.context.active_object
    panel.name = f"{prefix}_blind"
    panel.scale = (drop, width - 0.02, 1)
    bpy.ops.object.transform_apply(scale=True)
    panel.data.materials.append(fabric)
    box(f"{prefix}_blind_bar", (0.03, width - 0.02, 0.025), (x + 0.01, (y0 + y1) / 2, z1 - drop), cass, 0.005)


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
