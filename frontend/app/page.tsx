import { RoomExperience3D } from "@/components/room3d/RoomExperience3D";
import { getProductsByIds, getRoomCounts } from "@/services/products";
import { getScene } from "@/services/scenes";

// Products tagged (via productId) in the baked room model.
// TODO: derive from the scene manifest once the pipeline writes one.
const SCENE_PRODUCTS = ["oak-gallery-frame", "woven-wool-rug", "arc-floor-lamp", "dome-pendant"];

export default async function HomePage() {
  const [room, products, roomCounts] = await Promise.all([
    getScene(),
    getProductsByIds(SCENE_PRODUCTS),
    getRoomCounts(),
  ]);
  return <RoomExperience3D room={room} products={products} roomCounts={roomCounts} />;
}
