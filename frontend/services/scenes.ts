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
  /** Display label shown over the room. */
  style: string;
  /** Catalogue style (mock-data `styles`) the room is filed under in the backend. */
  styleSlug: string;
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
  /** Where walk mode starts, in room coordinates (meters from the front-left corner). */
  walkStart: { x: number; y: number; lookAt: { x: number; y: number } };
  /** Catalogue products tagged (via productId) in the baked model. */
  productIds: string[];
}

export const scenes: RoomScene[] = [
  {
    id: "sleek-lounge-01",
    name: "Graphite Lounge",
    style: "Sleek Masculine",
    styleSlug: "sleek-masculine",
    model: "/models/sleek-lounge-01.glb",
    background: "/models/sleek-lounge-01-view.jpg",
    backgroundRotation: 200,
    size: { width: 5.0, depth: 4.2, height: 2.8 },
    walkStart: { x: 1.2, y: 0.5, lookAt: { x: 3.0, y: 3.2 } },
    productIds: ["oak-gallery-frame", "woven-wool-rug", "arc-floor-lamp", "dome-pendant"],
  },
  {
    id: "living-room-02",
    name: "Living Room 02",
    style: "Living Room",
    styleSlug: "warm-minimal",
    model: "/models/living-room-02.glb",
    size: { width: 5.2, depth: 4.2, height: 2.7 },
    walkStart: { x: 2.8, y: 1.05, lookAt: { x: 2.39, y: 3.5 } },
    productIds: [
      "living-sofa",
      "living-armchair",
      "living-coffee-table",
      "living-rug",
      "living-side-table",
      "living-vase",
      "living-tv-stand",
      "living-art",
      "living-pendant",
      "living-bookshelf",
      "living-plant-a",
      "living-plant-b",
    ],
  },
  {
    // Measured from a phone video (COLMAP + SpatialLM): see 3d-engine/rooms/zeke-bedroom-01.json
    id: "zeke-bedroom-01",
    name: "Zeke's Bedroom",
    style: "From your video",
    styleSlug: "gaming-minimal",
    model: "/models/zeke-bedroom-01.glb?v=measured-2", // bump when the .glb changes so browsers refetch
    background: "/models/zeke-bedroom-01-view.jpg",
    backgroundRotation: 70,
    size: { width: 3.4, depth: 4.1, height: 2.7 },
    walkStart: { x: 2.05, y: 0.4, lookAt: { x: 2.6, y: 3.8 } },
    productIds: ["linen-throw-pillow", "tripod-table-lamp", "faux-potted-plant", "cream-shag-rug", "oak-gallery-frame", "gaming-chair"],
  },
  {
    // Measured from a phone video (COLMAP + SpatialLM): see 3d-engine/rooms/samir-room-01.json
    id: "samir-room-01",
    name: "Samir's Room",
    style: "From your video",
    styleSlug: "warm-minimal",
    model: "/models/samir-room-01.glb?v=measured-2", // bump when the .glb changes so browsers refetch
    background: "/models/samir-room-01-view.jpg",
    backgroundRotation: 70,
    size: { width: 4.2, depth: 3.65, height: 2.55 },
    walkStart: { x: 0.7, y: 0.5, lookAt: { x: 3.0, y: 3.0 } },
    productIds: ["linen-throw-pillow", "tripod-table-lamp", "cream-shag-rug", "oak-gallery-frame", "gaming-chair"],
  },
];

export async function getScenes(): Promise<RoomScene[]> {
  return scenes;
}
