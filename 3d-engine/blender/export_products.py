"""Export each shoppable product in a built room as a standalone .glb for the catalogue.

    blender -b renders/<id>/<id>.blend --python export_products.py -- --out ../frontend/public/models/products

Objects that share a productId are exported together into one file. Materials stay
PBR (not baked), so the files work in any glTF viewer.
"""
import argparse
import sys
from collections import defaultdict
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
args = ap.parse_args(argv)

out_dir = Path(args.out)
out_dir.mkdir(parents=True, exist_ok=True)

groups = defaultdict(list)
for root in bpy.context.scene.objects:
    if root.parent is None and "productId" in root:
        groups[root["productId"]].append(root)

for product_id, roots in sorted(groups.items()):
    bpy.ops.object.select_all(action="DESELECT")
    for root in roots:
        for obj in [root, *root.children_recursive]:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    path = out_dir / f"{product_id}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_lights=False,
        export_cameras=False,
        export_extras=True,
    )
    print("PRODUCT", product_id, path, file=sys.stdout)
