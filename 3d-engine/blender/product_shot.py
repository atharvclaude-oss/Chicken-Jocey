"""Render a catalogue photo of one object inside a built room.

    blender -b renders/<id>/<id>.blend --python product_shot.py -- <object_root_name> <out.jpg> [--angle 35] [--tilt 25]

Frames the named object (a placed asset's root, e.g. "rug_6") from the given
angle, so product photos match exactly what shoppers click in the 3D room.
"""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser()
ap.add_argument("root")
ap.add_argument("out")
ap.add_argument("--angle", type=float, default=35, help="heading around the object, degrees (0 = from the front)")
ap.add_argument("--tilt", type=float, default=25, help="camera elevation, degrees")
ap.add_argument("--fill", type=float, default=0.85, help="how much of the frame the object fills")
ap.add_argument("--samples", type=int, default=96)
args = ap.parse_args(argv)

scn = bpy.context.scene
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
scn.cycles.device = "GPU"
scn.cycles.samples = args.samples
scn.render.resolution_x = scn.render.resolution_y = 900
scn.render.image_settings.file_format = "JPEG"
scn.render.image_settings.quality = 90

root = bpy.data.objects[args.root]
meshes = [o for o in root.children_recursive if o.type in ("MESH", "CURVE")]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
center = (mn + mx) / 2
radius = (mx - mn).length / 2

cam_data = bpy.data.cameras.new("product_cam")
cam_data.lens = 50
cam = bpy.data.objects.new("product_cam", cam_data)
scn.collection.objects.link(cam)
fov = 2 * math.atan(cam_data.sensor_width / (2 * cam_data.lens))
dist = radius / math.sin(fov / 2) / args.fill
# Heading is relative to the object's own facing (its root's rotation), front = -y.
heading = root.rotation_euler.z + math.radians(args.angle)
tilt = math.radians(args.tilt)
offset = Vector((math.sin(heading) * math.cos(tilt), -math.cos(heading) * math.cos(tilt), math.sin(tilt)))
cam.location = center + offset * dist
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_data.clip_start = 0.02
scn.camera = cam

# Hide nearby walls/ceiling that would block a close shot.
for o in scn.objects:
    if o.name.startswith(("wall_front", "ceiling")):
        o.hide_render = True

scn.render.filepath = str(Path(args.out).resolve())
bpy.ops.render.render(write_still=True)
print("SHOT", scn.render.filepath)
