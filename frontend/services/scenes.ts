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
  },
];

export async function getScene(id?: string): Promise<RoomScene> {
  return scenes.find((s) => s.id === id) ?? scenes[0];
}
