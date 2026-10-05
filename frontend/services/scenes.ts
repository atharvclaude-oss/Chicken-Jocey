// 3D room scenes produced by the Blender pipeline in /3d-engine.
// TODO(backend): serve this from the rooms API alongside the 2D room data.

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
];

export async function getScenes(): Promise<RoomScene[]> {
  return scenes;
}
