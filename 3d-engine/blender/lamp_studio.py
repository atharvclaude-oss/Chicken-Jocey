"""Render catalogue cover photos of lamps: one model, lit up, on a dark studio sweep.

    blender -b --python lamp_studio.py -- <jobs.json> [--only slug] [--samples 160]

The Lamps department cover: run from 3d-engine/ with blender/lamp_covers.json --samples 192.
(Collection covers are photos, see frontend/public/images/catalogue/SOURCES.md.)

jobs.json is a list of {"slug", "model" (Poly Haven id), "out", optional "heading",
"tilt", "fill", "glow" (bulb light watts), "emit" (glowing-material strength),
"exposure", "hanging", "inner" (light the centre when no material glows)}. Materials named like a bulb, flame, glass or shade are made
to glow, and a warm point light sits at their centre, so each lamp reads as switched on.
Output is a 4:5 JPEG sized for the catalogue tiles.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import polyhaven  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser()
ap.add_argument("jobs")
ap.add_argument("--only")
ap.add_argument("--samples", type=int, default=160)
args = ap.parse_args(argv)

GLOW_WORDS = ("bulb", "flame", "glass", "globe")
GLOW_SUFFIXES = ("_light", "_lamp")


def glows(name):
    n = name.lower()
    return any(w in n for w in GLOW_WORDS) or n.endswith(GLOW_SUFFIXES) or n.startswith("lamps_")
WARM = (1.0, 0.62, 0.32, 1.0)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    scn.render.engine = "CYCLES"
    scn.cycles.device = "GPU"
    scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = 960, 1200
    scn.render.image_settings.file_format = "JPEG"
    scn.render.image_settings.quality = 88
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.004, 0.004, 0.005, 1)
    scn.world = world
    return scn


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def sweep(floor_z, size):
    """A curved floor-to-wall backdrop behind the model (-y is the camera side)."""
    r, depth, height, width = size * 0.8, size * 2.5, size * 4, size * 8
    prof = [(-depth, 0.0)]
    for i in range(17):
        a = math.pi / 2 * i / 16
        prof.append((size * 0.9 + r * math.sin(a), r - r * math.cos(a)))
    prof.append((size * 0.9 + r, height))
    verts, faces = [], []
    for x in (-width / 2, width / 2):
        verts += [(x, y, floor_z + z) for y, z in prof]
    n = len(prof)
    faces = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
    mesh = bpy.data.meshes.new("sweep")
    mesh.from_pydata(verts, [], faces)
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new("sweep", mesh)
    bpy.context.scene.collection.objects.link(obj)
    mat = bpy.data.materials.new("sweep")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.045, 0.042, 0.04, 1)
    bsdf.inputs["Roughness"].default_value = 0.55
    mesh.materials.append(mat)


def make_glow(mat, strength):
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat.use_nodes else None
    if not bsdf:
        return
    bsdf.inputs["Emission Color"].default_value = WARM
    bsdf.inputs["Emission Strength"].default_value = strength


def area(name, loc, target, size, watts, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.size, data.energy, data.color = size, watts, color
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)


def render(job):
    scn = reset()
    bpy.ops.import_scene.gltf(filepath=str(polyhaven.model(job["model"])))
    meshes = [o for o in scn.objects if o.type == "MESH"]
    mn, mx = bounds(meshes)
    center, size = (mn + mx) / 2, max((mx - mn).length, 0.3)

    glowing = [o for o in meshes if any(s.material and glows(s.material.name) for s in o.material_slots)]
    for mat in {s.material for o in glowing for s in o.material_slots if s.material}:
        if glows(mat.name):
            make_glow(mat, job.get("emit", 4.0))
    if (glowing or job.get("inner")) and job.get("glow", 40):
        gmn, gmx = bounds(glowing) if glowing else (mn, mx)
        data = bpy.data.lights.new("bulb", "POINT")
        data.energy, data.shadow_soft_size, data.color = job.get("glow", 40), 0.03, WARM[:3]
        bulb = bpy.data.objects.new("bulb", data)
        bulb.location = (gmn + gmx) / 2
        scn.collection.objects.link(bulb)

    # Hanging lamps float with the backdrop well below; standing ones sit on it.
    sweep(mn.z - (size * 0.8 if job.get("hanging") else 0.0), size)
    s = size
    area("key", center + Vector((-1.4 * s, -1.2 * s, 1.3 * s)), center, 1.2 * s, 60 * s * s, (1.0, 0.93, 0.85))
    area("rim", center + Vector((1.3 * s, 1.0 * s, 0.9 * s)), center, 0.8 * s, 40 * s * s, (0.85, 0.9, 1.0))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 70
    cam_data.sensor_fit, cam_data.sensor_height = "VERTICAL", 36
    cam = bpy.data.objects.new("cam", cam_data)
    scn.collection.objects.link(cam)
    # Fit to the narrower (horizontal) side of the 4:5 frame.
    fov = 2 * math.atan(36 * 0.8 / (2 * cam_data.lens))
    radius = (mx - mn).length / 2
    dist = radius / math.sin(fov / 2) / job.get("fill", 0.85)
    heading, tilt = math.radians(job.get("heading", 20)), math.radians(job.get("tilt", 12))
    aim = center - Vector((0, 0, job.get("lift", 0.14) * size))
    cam.location = aim + Vector((math.sin(heading) * math.cos(tilt), -math.cos(heading) * math.cos(tilt), math.sin(tilt))) * dist
    cam.rotation_euler = (aim - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.clip_start, cam_data.clip_end = 0.01, dist * 20
    scn.camera = cam

    scn.cycles.samples = args.samples
    scn.view_settings.exposure = job.get("exposure", 0.0)
    try:
        scn.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    out = Path(job["out"]).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    scn.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print("LAMP", job["slug"], out)


for job in json.loads(Path(args.jobs).read_text()):
    if not args.only or job["slug"] in args.only.split(","):
        render(job)
