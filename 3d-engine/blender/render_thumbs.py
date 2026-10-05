"""Render a square catalogue thumbnail for every shoppable product in a built room.

    blender -b renders/<id>/<id>.blend --python render_thumbs.py -- --out ../frontend/public/images/products [--size 800]

Each product is shown alone, framed from the front-right, with the room's own
materials and lighting.
"""
import argparse
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--size", type=int, default=800)
args = ap.parse_args(argv)

out_dir = Path(args.out).resolve()
out_dir.mkdir(parents=True, exist_ok=True)

scn = bpy.context.scene
scn.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in scn.render.bl_rna.properties["engine"].enum_items] else scn.render.engine
scn.render.resolution_x = scn.render.resolution_y = args.size
scn.render.image_settings.file_format = "JPEG"
scn.render.image_settings.quality = 90
scn.render.film_transparent = False
backdrop = bpy.data.worlds.new("thumb_backdrop")
backdrop.use_nodes = True
backdrop.node_tree.nodes["Background"].inputs["Color"].default_value = (0.92, 0.92, 0.91, 1)
backdrop.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
scn.world = backdrop

cam_data = bpy.data.cameras.new("thumb_cam")
cam_data.lens = 40
cam = bpy.data.objects.new("thumb_cam", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam

groups = defaultdict(list)
for root in scn.objects:
    if root.parent is None and "productId" in root:
        groups[root["productId"]].append(root)

for product_id, roots in sorted(groups.items()):
    members = [o for r in roots for o in [r, *r.children_recursive]]
    member_set = set(members)
    for o in scn.objects:
        o.hide_render = o not in member_set and o.type != "LIGHT"

    corners = []
    for o in members:
        if o.type == "MESH":
            corners += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector([min(c[i] for c in corners) for i in range(3)])
    hi = Vector([max(c[i] for c in corners) for i in range(3)])
    center = (lo + hi) / 2
    size = max(hi[i] - lo[i] for i in range(3))
    direction = Vector((1.0, -1.0, 0.45)).normalized()
    cam.location = center + direction * max(size, 0.4) * 1.45
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

    scn.render.filepath = str(out_dir / product_id)
    bpy.ops.render.render(write_still=True)
    print("THUMB", product_id, flush=True)
