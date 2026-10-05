"""Convert a room's HDRI into a display-ready equirectangular JPG for the web
viewer's window view (same AgX look and exposure as the bake).

    blender -b --python export_view.py -- rooms/<id>.json <out.jpg>
"""
import json
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import polyhaven  # noqa: E402

spec_path, out = sys.argv[sys.argv.index("--") + 1:][:2]
spec = json.loads((HERE.parent / spec_path).read_text())
env = spec["environment"]

scn = bpy.context.scene
scn.view_settings.view_transform = "AgX"
scn.view_settings.look = "AgX - Medium High Contrast"
scn.view_settings.exposure = 0.6 + (env.get("strength", 1.0) ** 0.5 - 1)
scn.render.image_settings.file_format = "JPEG"
scn.render.image_settings.quality = 85

img = bpy.data.images.load(str(polyhaven.hdri(env["hdri"], "2k")))
img.save_render(str(Path(out).resolve()), scene=scn)
print("VIEW", out)
