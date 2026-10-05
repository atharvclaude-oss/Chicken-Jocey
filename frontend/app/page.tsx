import { SceneCarousel } from "@/components/room3d/SceneCarousel";
import { getProductsByIds, getRoomCounts } from "@/services/products";
import { getScenes } from "@/services/scenes";

export default async function HomePage() {
  const [scenes, roomCounts] = await Promise.all([getScenes(), getRoomCounts()]);
  const productLists = await Promise.all(scenes.map((s) => getProductsByIds(s.productIds)));
  const productsByScene = Object.fromEntries(scenes.map((s, i) => [s.id, productLists[i]]));

  return <SceneCarousel scenes={scenes} productsByScene={productsByScene} roomCounts={roomCounts} />;
}
