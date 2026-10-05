# 3d-engine

Pipeline that turns a room spec (JSON) into a baked, web-ready 3D room.

```
rooms/<id>.json  ->  build_room.py  ->  renders/<id>/<id>.blend + preview PNGs
                 ->  bake_export.py ->  frontend/public/models/<id>.glb
                 ->  export_view.py ->  frontend/public/models/<id>-view.jpg (window view)
```

Requires Blender 5.2+ (`blender` below is the path to blender.exe). An NVIDIA GPU makes rendering and baking much faster.

```bash
# 1. Build the scene and render previews (hero, corner, birdseye cameras)
blender -b --python blender/build_room.py -- rooms/sleek-lounge-01.json --samples 64

# 2. Bake lighting into textures and export the .glb for the website
blender -b renders/sleek-lounge-01/sleek-lounge-01.blend --python blender/bake_export.py -- --out ../frontend/public/models

# 3. Export the window view image
blender -b --python blender/export_view.py -- rooms/sleek-lounge-01.json ../frontend/public/models/sleek-lounge-01-view.jpg
```

## Room spec

See `rooms/sleek-lounge-01.json`. Coordinates are meters from the front-left floor corner (x = width, y = depth, z = up). Objects are either:

- `polyhaven:<asset_id>`: CC0 models downloaded from [Poly Haven](https://polyhaven.com) and cached in `.cache/`
- `proc:<name>`: modeled in code (`rug`, `framed_print`, `arc_floor_lamp`)

Add `"productId"` to any object to make it clickable and shoppable in the web viewer. It is exported as glTF extras.

The spec has the same shape a photo-analysis step would produce (room size, openings, objects with positions), so customer-photo rooms can reuse this pipeline later.

## Why bake

Cycles path-traces the lighting once (bounce light, soft shadows, lamp glow) and stores it in each object's texture. The browser shows those textures unlit, so every viewpoint looks like the offline render. The trade-off is that reflections are fixed and lights can't be switched in the browser.
