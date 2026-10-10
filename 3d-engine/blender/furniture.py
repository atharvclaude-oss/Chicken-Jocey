"""Furniture modeled in code, for pieces with no good free model.

Each builder takes (spec, idx, h) where h is the build_room module (for its
helpers: box, principled, textured, group, ...) and returns the placed root.
Local axes for every piece: it faces -y, origin at the floor-level center.

Materials use real texture detail (linen weave, leather grain, oak) so the
baked result reads as physical objects, not flat CG shapes.
"""

import math
from pathlib import Path

import bpy

ART = Path(__file__).resolve().parent / "art"

# ---------------------------------------------------------------- materials


def oak(h):
    return h.textured("oak", "laminate_floor_02", 0.6, tint=(1.05, 0.93, 0.78))


def linen(h, name, color):
    return h.textured(name, "rough_linen", 0.25, color=color, detail=True, normal=1.2)


def leather(h, name, color):
    return h.textured(name, "fabric_leather_02", 0.5, color=color, detail=True, normal=0.9)


def lacquer(h, name, color):
    return h.principled(name, h.hex_rgb(color), rough=0.32)


def image_material(name, path, rough=0.5, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(path), check_existing=True)
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    if emit:
        nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emit
    return m


# ---------------------------------------------------------------- helpers


def soft(h, obj, levels=2, wrinkle=0.0, scale=0.12):
    """Round a beveled box into a soft textile shape, optionally wrinkled."""
    sub = obj.modifiers.new("subd", "SUBSURF")
    sub.levels = sub.render_levels = levels
    if wrinkle:
        tex = bpy.data.textures.new(f"wrinkle_{obj.name}", "CLOUDS")
        tex.noise_scale = scale
        tex.noise_depth = 3
        d = obj.modifiers.new("wrinkle", "DISPLACE")
        d.texture = tex
        d.texture_coords = "GLOBAL"
        d.strength = wrinkle
        d.mid_level = 0.5
        obj.modifiers.new("subd2", "SUBSURF").levels = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


def plane(name, size, loc, rot, mat):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = (*size, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


# ---------------------------------------------------------------- pieces


def bed(spec, idx, h):
    """Storage bed: white frame, oak slatted headboard and drawer fronts,
    wrinkled linen bedding. Headboard at +y, foot at -y."""
    mw, ml = spec.get("size", [1.37, 1.91])  # mattress
    fw, fl = mw + 0.1, ml + 0.1
    white = lacquer(h, f"bed_white_{idx}", spec.get("frame", "#ecebe7"))
    wood = oak(h)
    sheet = linen(h, "bed_sheet", spec.get("sheet", "#a59b91"))
    duvet_m = linen(h, "bed_duvet", spec.get("duvet", "#d9d2c6"))
    box = h.box
    parts = []
    base_h = 0.36
    parts.append(box(f"bed_{idx}_base", (fw, fl, base_h - 0.03), (0, 0, 0.03 + (base_h - 0.03) / 2), white, 0.008))
    upholstered = spec.get("headboard") == "upholstered"
    n = 0 if upholstered else int((fl - 0.1) / 0.042)
    for sx in (-1, 1):  # oak slat drawer fronts on both long sides
        for i in range(n):
            y = -fl / 2 + 0.065 + i * 0.042
            parts.append(box(f"bed_{idx}_slat_{sx}_{i}", (0.018, 0.03, base_h - 0.09),
                             (sx * (fw / 2 + 0.009), y, 0.06 + (base_h - 0.09) / 2), wood, 0.004))
    parts.append(soft(h, box(f"bed_{idx}_mattress", (mw, ml, 0.22), (0, 0, base_h + 0.11), sheet, 0.05), 1))
    # Duvet: turned down at the top, wrinkled, draping over both sides.
    dl = ml * 0.74
    dy = -ml / 2 + dl / 2 - 0.04
    parts.append(soft(h, box(f"bed_{idx}_duvet", (mw + 0.1, dl, 0.1), (0, dy, base_h + 0.26), duvet_m, 0.045), 3, 0.045, 0.09))
    parts.append(soft(h, box(f"bed_{idx}_duvet_fold", (mw + 0.08, 0.22, 0.06),
                             (0, dy + dl / 2 - 0.08, base_h + 0.31), duvet_m, 0.03), 2, 0.015))
    for sx in (-1, 1):
        flap = box(f"bed_{idx}_drape_{sx}", (0.035, dl, 0.27), (sx * (mw / 2 + 0.07), dy, base_h + 0.135), duvet_m, 0.015)
        parts.append(soft(h, flap, 1, 0.012))
    hb_w, hb_h, hb_z0 = fw + 0.06, 1.0, 0.25
    hy = fl / 2 + 0.03
    if upholstered:
        # Padded fabric headboard with vertical channels; optional padded side
        # panel along one long side (daybed style), spec["side_panel"] = +1/-1 (local x).
        fab = h.textured(f"bed_fabric_{idx}", "rough_linen", 0.3, color=spec.get("frame", "#6e6862"), detail=True, normal=1.6)
        parts[0].data.materials.clear()
        parts[0].data.materials.append(fab)
        ch = max(3, round(hb_w / 0.18))
        for i in range(ch):
            x = -hb_w / 2 + hb_w / ch * (i + 0.5)
            parts.append(soft(h, box(f"bed_{idx}_hb_channel_{i}", (hb_w / ch - 0.006, 0.08, hb_h * 0.9),
                                     (x, hy, hb_z0 + hb_h * 0.45 + 0.02), fab, 0.035), 2, 0.006))
        if spec.get("side_panel"):
            sx = spec["side_panel"]
            for i in range(max(3, round(fl / 0.25))):
                y = -fl / 2 + fl / max(3, round(fl / 0.25)) * (i + 0.5)
                parts.append(soft(h, box(f"bed_{idx}_side_channel_{i}", (0.08, fl / max(3, round(fl / 0.25)) - 0.006, 0.55),
                                         (sx * (fw / 2 + 0.04), y, base_h + 0.25), fab, 0.035), 2, 0.006))
        return h.group(f"bed_{idx}", parts, spec)
    # Headboard: white frame around vertical oak slats.
    t = 0.045
    parts += [
        box(f"bed_{idx}_hb_top", (hb_w, 0.05, t), (0, hy, hb_z0 + hb_h - t / 2), white, 0.006),
        box(f"bed_{idx}_hb_l", (t, 0.05, hb_h), (-hb_w / 2 + t / 2, hy, hb_z0 + hb_h / 2), white, 0.006),
        box(f"bed_{idx}_hb_r", (t, 0.05, hb_h), (hb_w / 2 - t / 2, hy, hb_z0 + hb_h / 2), white, 0.006),
        box(f"bed_{idx}_hb_back", (hb_w - 0.02, 0.012, hb_h - 0.02), (0, hy + 0.018, hb_z0 + hb_h / 2), white),
    ]
    inner = hb_w - 2 * t
    n = int(inner / 0.04)
    for i in range(n):
        x = -inner / 2 + inner / n * (i + 0.5)
        parts.append(box(f"bed_{idx}_hb_slat_{i}", (0.028, 0.035, hb_h - t), (x, hy - 0.005, hb_z0 + (hb_h - t) / 2), wood, 0.004))
    return h.group(f"bed_{idx}", parts, spec)


def pillows(spec, idx, h):
    """Two sleeping pillows leaning on the headboard plus a small accent cushion."""
    m = linen(h, "pillow_linen", spec.get("color", "#b4aaa0"))
    accent = linen(h, "pillow_accent", spec.get("accent", "#6f6a63"))
    parts = []
    for i, (x, rz) in enumerate(((-0.34, 6), (0.34, -8))):
        o = h.box(f"pillows_{idx}_{i}", (0.64, 0.17, 0.44), (x, 0, 0.18), m, 0.06)
        o.rotation_euler = (math.radians(-20), 0, math.radians(rz))
        parts.append(soft(h, o, 2, 0.014))
    o = h.box(f"pillows_{idx}_accent", (0.42, 0.13, 0.32), (0.12, -0.2, 0.1), accent, 0.05)
    o.rotation_euler = (math.radians(-28), 0, math.radians(-12))
    parts.append(soft(h, o, 2, 0.008))
    return h.group(f"pillows_{idx}", parts, spec)


def throw_blanket(spec, idx, h):
    """Folded knit throw across the foot of the bed, hanging over one side."""
    m = h.textured(f"throw_{idx}", "wool_boucle", 0.3, color=spec.get("color", "#7c7873"), detail=True, normal=1.4)
    w = spec.get("width", 1.2)
    top = h.box(f"throw_{idx}_top", (w, 0.42, 0.05), (0, 0, 0.03), m, 0.022)
    side = h.box(f"throw_{idx}_hang", (0.035, 0.42, 0.34), (w / 2 + 0.01, 0, -0.15), m, 0.015)
    return h.group(f"throw_{idx}", [soft(h, top, 3, 0.035, 0.12), soft(h, side, 2, 0.025, 0.1)], spec)


def desk(spec, idx, h):
    """White sit-stand desk; long side along x, user sits at -y."""
    w, d = spec.get("size", [1.4, 0.7])
    white = lacquer(h, f"desk_top_{idx}", spec.get("color", "#efeeea"))
    frame = h.principled(f"desk_frame_{idx}", h.hex_rgb(spec.get("frame", "#e6e5e1")), rough=0.3, metal=0.4)
    top = 0.74
    box = h.box
    parts = [box(f"desk_{idx}_top", (w, d, 0.028), (0, 0, top - 0.014), white, 0.005)]
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.12)
        parts += [
            box(f"desk_{idx}_col_{sx}", (0.07, 0.05, top - 0.06), (x, 0.05, (top - 0.06) / 2 + 0.03), frame, 0.008),
            box(f"desk_{idx}_foot_{sx}", (0.065, d - 0.04, 0.035), (x, 0, 0.0175), frame, 0.008),
            box(f"desk_{idx}_arm_{sx}", (0.05, d - 0.12, 0.03), (x, 0, top - 0.045), frame, 0.005),
        ]
    parts.append(box(f"desk_{idx}_beam", (w - 0.24, 0.04, 0.06), (0, 0.05, top - 0.07), frame, 0.005))
    return h.group(f"desk_{idx}", parts, spec)


def monitor(spec, idx, h):
    """27-inch monitor showing a code editor; screen faces -y."""
    black = h.principled("monitor_black", h.hex_rgb("#141516"), rough=0.35, metal=0.4)
    screen = image_material("monitor_screen", ART / "screen_code.jpg", rough=0.12, emit=1.6)
    box = h.box
    parts = [
        box(f"monitor_{idx}_base", (0.24, 0.18, 0.012), (0, 0.05, 0.006), black, 0.004),
        box(f"monitor_{idx}_neck", (0.04, 0.025, 0.36), (0, 0.08, 0.18), black, 0.004),
        box(f"monitor_{idx}_body", (0.62, 0.03, 0.37), (0, 0.04, 0.42), black, 0.004),
        plane(f"monitor_{idx}_screen", (0.6, 0.338), (0, 0.0245, 0.425), (math.radians(90), 0, 0), screen),
    ]
    return h.group(f"monitor_{idx}", parts, spec)


def keyboard(spec, idx, h):
    """Low-profile keyboard and mouse on a felt desk mat."""
    felt = h.textured(f"deskmat_{idx}", "wool_boucle", 0.15, color="#3a3b3e", detail=True, normal=0.6)
    case = h.principled("kb_case", h.hex_rgb("#2a2b2e"), rough=0.4, metal=0.2)
    keys = h.principled("kb_keys", h.hex_rgb("#e8e6e1"), rough=0.5)
    box = h.box
    parts = [
        box(f"kb_{idx}_mat", (0.8, 0.32, 0.004), (0.08, 0, 0.002), felt, 0.002),
        box(f"kb_{idx}_case", (0.34, 0.12, 0.02), (0, 0, 0.014), case, 0.004),
    ]
    for r in range(5):
        for c in range(14):
            parts.append(box(f"kb_{idx}_k{r}_{c}", (0.019, 0.019, 0.008),
                             (-0.153 + c * 0.0235, -0.047 + r * 0.0235, 0.028), keys, 0.002))
    m = box(f"kb_{idx}_mouse", (0.06, 0.1, 0.03), (0.3, 0, 0.019), case, 0.02)
    parts.append(soft(h, m, 2))
    return h.group(f"keyboard_{idx}", parts, spec)


def office_chair(spec, idx, h):
    """Gaming-style office chair: five-star base, leather seat, tall back with
    white side bolsters; faces -y."""
    black = leather(h, f"chair_black_{idx}", spec.get("color", "#1a1b1d"))
    white = leather(h, f"chair_white_{idx}", spec.get("accent", "#e6e5e1"))
    metal = h.principled("chair_metal", h.hex_rgb("#a7a9ad"), rough=0.2, metal=1.0)
    box = h.box
    parts = []
    for i in range(5):
        a = math.radians(90 + i * 72)
        leg = box(f"chair_{idx}_leg_{i}", (0.3, 0.04, 0.03), (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.08), metal, 0.008)
        leg.rotation_euler = (0, 0, a)
        parts.append(leg)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=(math.cos(a) * 0.3, math.sin(a) * 0.3, 0.03))
        caster = bpy.context.active_object
        caster.name = f"chair_{idx}_caster_{i}"
        caster.data.materials.append(black)
        parts.append(caster)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.32, location=(0, 0, 0.25))
    col = bpy.context.active_object
    col.name = f"chair_{idx}_column"
    col.data.materials.append(metal)
    parts.append(col)
    parts.append(soft(h, box(f"chair_{idx}_seat", (0.52, 0.5, 0.1), (0, -0.02, 0.45), black, 0.035), 2, 0.004))
    for sx in (-1, 1):
        parts.append(soft(h, box(f"chair_{idx}_seat_bolster_{sx}", (0.08, 0.48, 0.07), (sx * 0.24, -0.02, 0.51), white, 0.03), 2))
    back = box(f"chair_{idx}_back", (0.5, 0.11, 0.82), (0, 0.23, 0.93), black, 0.04)
    back.rotation_euler = (math.radians(-8), 0, 0)
    parts.append(soft(h, back, 2, 0.004))
    for sx in (-1, 1):
        wing = box(f"chair_{idx}_back_wing_{sx}", (0.09, 0.12, 0.7), (sx * 0.24, 0.215, 0.92), white, 0.035)
        wing.rotation_euler = (math.radians(-8), 0, math.radians(sx * -10))
        parts.append(soft(h, wing, 2))
        parts.append(box(f"chair_{idx}_arm_post_{sx}", (0.035, 0.035, 0.2), (sx * 0.29, 0.0, 0.58), black, 0.008))
        parts.append(soft(h, box(f"chair_{idx}_arm_pad_{sx}", (0.08, 0.26, 0.035), (sx * 0.29, -0.02, 0.69), black, 0.012), 1))
    return h.group(f"office_chair_{idx}", parts, spec)


def tripod_lamp(spec, idx, h):
    """Tripod table lamp: oak legs, linen drum shade, warm bulb + light."""
    wood = oak(h)
    shade_m = h.principled("lamp_linen_shade", h.hex_rgb("#efe8da"), rough=0.9)
    # Translucent shade: lets light glow through like real linen.
    shade_m.node_tree.nodes["Principled BSDF"].inputs["Transmission Weight"].default_value = 0.35
    bulb = h.principled("lamp_bulb_glow", h.hex_rgb("#fff3dd"), emit=(1.0, 0.82, 0.58, 1), emit_strength=20)
    parts = []
    for i in range(3):
        a = math.radians(90 + i * 120)
        leg = h.box(f"tripod_{idx}_leg_{i}", (0.018, 0.018, 0.34), (math.cos(a) * 0.07, math.sin(a) * 0.07, 0.165), wood, 0.004)
        leg.rotation_euler = (math.sin(a) * math.radians(-12), math.cos(a) * math.radians(12), 0)
        parts.append(leg)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=0.2, location=(0, 0, 0.42), vertices=64, end_fill_type="NOTHING")
    shade = bpy.context.active_object
    shade.name = f"tripod_{idx}_shade"
    shade.modifiers.new("solid", "SOLIDIFY").thickness = 0.004
    shade.data.materials.append(shade_m)
    bpy.ops.object.shade_smooth()
    parts.append(shade)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=(0, 0, 0.4))
    b = bpy.context.active_object
    b.name = f"tripod_{idx}_bulb"
    b.data.materials.append(bulb)
    parts.append(b)
    light = h.link(bpy.data.objects.new(f"tripod_{idx}_light", bpy.data.lights.new(f"tripod_{idx}_light", "POINT")))
    light.data.energy = spec.get("watts", 25) * 4
    light.data.color = h.kelvin_rgb(2700)
    light.data.shadow_soft_size = 0.06
    light.location = (0, 0, 0.4)
    parts.append(light)
    return h.group(f"tripod_lamp_{idx}", parts, spec)


def ceiling_light(spec, idx, h):
    """Flush recessed downlight with a warm spot light."""
    height = h.SPEC["room"]["height"]
    trim = h.principled("downlight_trim", h.hex_rgb("#f2f1ee"), rough=0.4)
    glow = h.principled("downlight_glow", h.hex_rgb("#fff3e0"), emit=(1.0, 0.85, 0.65, 1), emit_strength=18)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.008, location=(0, 0, height - 0.004), vertices=48)
    ring = bpy.context.active_object
    ring.name = f"ceiling_light_{idx}_trim"
    ring.data.materials.append(trim)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.004, location=(0, 0, height - 0.009), vertices=48)
    lens = bpy.context.active_object
    lens.name = f"ceiling_light_{idx}_lens"
    lens.data.materials.append(glow)
    L = spec.get("light", {"watts": 40, "kelvin": 2700})
    light = h.link(bpy.data.objects.new(f"ceiling_light_{idx}_lamp", bpy.data.lights.new(f"ceiling_light_{idx}_lamp", "SPOT")))
    light.data.energy = L["watts"] * 4
    light.data.spot_size = math.radians(100)
    light.data.spot_blend = 0.8
    light.data.shadow_soft_size = 0.05
    light.data.color = h.kelvin_rgb(L.get("kelvin", 2700))
    light.location = (0, 0, height - 0.015)
    return h.group(f"ceiling_light_{idx}", [ring, lens, light], spec)


def cabinet(spec, idx, h):
    """Sized storage piece (wardrobe, dresser, shelf unit) for measured layouts.

    spec["size"] = [width, depth, height] in meters; faces -y. Tall pieces get
    two doors, low ones get drawer fronts, so stand-ins still read as furniture.
    """
    w, d, ht = spec.get("size", [1.0, 0.5, 0.8])
    body = lacquer(h, f"cabinet_body_{idx}", spec.get("color", "#ecebe7"))
    front = oak(h) if spec.get("oak_front", True) else body
    knob = h.principled("cabinet_knob", h.hex_rgb("#2a2a2c"), rough=0.3, metal=0.9)
    box = h.box
    parts = [box(f"cabinet_{idx}_body", (w, d, ht - 0.06), (0, 0, 0.06 + (ht - 0.06) / 2), body, 0.006)]
    parts.append(box(f"cabinet_{idx}_plinth", (w - 0.04, d - 0.06, 0.06), (0, 0.02, 0.03), body))
    gap = 0.006
    if ht > 1.3:  # wardrobe: two tall doors
        for sx in (-1, 1):
            parts.append(box(f"cabinet_{idx}_door_{sx}", (w / 2 - gap * 1.5, 0.02, ht - 0.12),
                             (sx * w / 4, -d / 2 - 0.009, 0.06 + (ht - 0.06) / 2), front, 0.003))
            parts.append(box(f"cabinet_{idx}_knob_{sx}", (0.02, 0.03, 0.18), (sx * 0.05, -d / 2 - 0.03, ht * 0.55), knob, 0.004))
    else:  # dresser / sideboard: stacked drawers
        rows = max(2, min(5, round((ht - 0.06) / 0.22)))
        dh = (ht - 0.06) / rows
        for r in range(rows):
            z = 0.06 + dh * (r + 0.5)
            parts.append(box(f"cabinet_{idx}_drawer_{r}", (w - 2 * gap, 0.02, dh - gap), (0, -d / 2 - 0.009, z), front, 0.003))
            parts.append(box(f"cabinet_{idx}_pull_{r}", (min(0.2, w * 0.3), 0.025, 0.018), (0, -d / 2 - 0.03, z), knob, 0.004))
    return h.group(f"cabinet_{idx}", parts, spec)


def bookshelf(spec, idx, h):
    """Open shelf unit (no back doors) with a few books and objects; faces -y.

    spec["size"] = [width, depth, height]; spec["shelves"] = shelf count.
    """
    import random
    w, d, ht = spec.get("size", [0.8, 0.3, 1.8])
    n = spec.get("shelves", 5)
    frame = lacquer(h, f"bookshelf_frame_{idx}", spec.get("color", "#1d1e20"))
    box = h.box
    t = 0.025
    parts = [
        box(f"bookshelf_{idx}_side_l", (t, d, ht), (-w / 2 + t / 2, 0, ht / 2), frame, 0.003),
        box(f"bookshelf_{idx}_side_r", (t, d, ht), (w / 2 - t / 2, 0, ht / 2), frame, 0.003),
        box(f"bookshelf_{idx}_back", (w - 2 * t, 0.008, ht - 0.04), (0, d / 2 - 0.004, ht / 2), frame),
    ]
    gap = (ht - 0.05) / n
    covers = [h.principled(f"book_{c}", h.hex_rgb(c), rough=0.6) for c in
              ("#8a3b2e", "#2f4a63", "#d8d2c4", "#4d5b45", "#b08a4f", "#2a2a2c", "#9a9fa6")]
    rng = random.Random(idx)
    for i in range(n + 1):
        z = 0.04 + i * gap
        parts.append(box(f"bookshelf_{idx}_shelf_{i}", (w - 2 * t, d - 0.01, t), (0, -0.005, z), frame, 0.002))
        if i == n:
            break
        # Books on most shelves: a run of uprights from one side, leaving air.
        x = -w / 2 + t + 0.02
        end = x + (w - 2 * t) * rng.uniform(0.45, 0.8)
        while x < end:
            bw, bh = rng.uniform(0.022, 0.045), min(gap - 0.05, rng.uniform(0.18, 0.27))
            parts.append(box(f"bookshelf_{idx}_book_{i}_{len(parts)}", (bw, d * 0.75, bh),
                             (x + bw / 2, -0.01, z + t / 2 + bh / 2), rng.choice(covers), 0.002))
            x += bw + 0.002
    return h.group(f"bookshelf_{idx}", parts, spec)


BUILDERS = {
    "bookshelf": bookshelf,
    "bed": bed,
    "pillows": pillows,
    "throw_blanket": throw_blanket,
    "desk": desk,
    "monitor": monitor,
    "keyboard": keyboard,
    "office_chair": office_chair,
    "tripod_lamp": tripod_lamp,
    "ceiling_light": ceiling_light,
    "cabinet": cabinet,
}
