import { Suspense } from "react";
import { SceneCarousel } from "@/components/room3d/SceneCarousel";
import { getProductsByIds, getRoomCounts } from "@/services/products";
import { getScenes } from "@/services/scenes";

export default async function HomePage() {
  const [scenes, roomCounts] = await Promise.all([getScenes(), getRoomCounts()]);
  const productLists = await Promise.all(scenes.map((s) => getProductsByIds(s.productIds)));
  const productsByScene = Object.fromEntries(scenes.map((s, i) => [s.id, productLists[i]]));

  // The carousel reads ?room/?product/?view on the client, so the page itself
  // stays static; the fallback is the same dark stage the room loads on.
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-4rem)] w-full bg-stage" />}>
      <SceneCarousel scenes={scenes} productsByScene={productsByScene} roomCounts={roomCounts} />
    </Suspense>
  );
}
