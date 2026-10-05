// 3D room scenes produced by the Blender pipeline in /3d-engine.
// TODO(backend): serve this from the rooms API alongside the 2D room data.

/** A photoreal scanned room (Gaussian splat), shown instead of a baked model. */
export interface SplatConfig {
  /** .ply / .spz / .splat file. */
  url: string;
  /** Align the scan: COLMAP output is arbitrarily oriented (often upside down). */
  rotation?: [number, number, number];
  scale?: number;
  position?: [number, number, number];
  view: {
    /** What the camera looks at (roughly the room's center). */
    target: [number, number, number];
    /** Overview camera position. */
    overview: [number, number, number];
    /** Walk-mode standing point. */
    eye: [number, number, number];
  };
  /** Product click zones placed by our team, in world coordinates. */
  tags?: { productId: string; position: [number, number, number] }[];
}

export interface RoomScene {
  id: string;
  name: string;
  style: string;
  /** Baked .glb exported by 3d-engine/blender/bake_export.py */
  model: string;
  /** Equirectangular view seen through the windows. */
  background?: string;
  /** Rotation (degrees, around the vertical axis) to line the view up with the Blender bake. */
  backgroundRotation?: number;
  /** Room size in meters, matching the room spec (x = width, y = depth). */
  size: { width: number; depth: number; height: number };
  /** Photoreal scan; when set, it replaces `model`. */
  splat?: SplatConfig;
  /** Catalogue products tagged (productId) in the baked model. */
  productIds: string[];
  /** Where walk mode starts, in room coordinates (meters from the front-left corner). */
  walkStart: { x: number; y: number; lookAt: { x: number; y: number } };
}

export const scenes: RoomScene[] = [
  {
    id: "sleek-lounge-01",
    name: "Graphite Lounge",
    style: "Sleek Masculine",
    model: "/models/sleek-lounge-01.glb",
    background: "/models/sleek-lounge-01-view.jpg",
    backgroundRotation: 200,
    size: { width: 5.0, depth: 4.2, height: 2.8 },
    walkStart: { x: 1.2, y: 0.5, lookAt: { x: 3.0, y: 3.2 } },
    productIds: ["oak-gallery-frame", "woven-wool-rug", "arc-floor-lamp", "dome-pendant"],
  },
  {
    // Built from a single customer photo: see 3d-engine/rooms/zeke-bedroom-01.json
    id: "zeke-bedroom-01",
    name: "Zeke's Bedroom",
    style: "From your photo",
    model: "/models/zeke-bedroom-01.glb",
    background: "/models/zeke-bedroom-01-view.jpg",
    backgroundRotation: 70,
    size: { width: 4.3, depth: 4.9, height: 2.8 },
    walkStart: { x: 0.8, y: 0.6, lookAt: { x: 2.4, y: 4.0 } },
    productIds: ["linen-throw-pillow", "tripod-table-lamp", "faux-potted-plant", "cream-shag-rug", "oak-gallery-frame", "gaming-chair"],
  },
];

export async function getScene(id?: string): Promise<RoomScene> {
  return scenes.find((s) => s.id === id) ?? scenes[0];
}
