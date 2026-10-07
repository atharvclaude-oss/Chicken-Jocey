import { Suspense } from "react";
import { SceneCarousel } from "@/components/room3d/SceneCarousel";
import { getProductsByIds, getRoomCounts } from "@/services/products";
import { getCapturedScenes } from "@/services/captured";
import { getScenes } from "@/services/scenes";

// Scanned rooms appear as soon as their worker publishes them, so never prerender this page.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [staticScenes, captured, roomCounts] = await Promise.all([getScenes(), getCapturedScenes(), getRoomCounts()]);
  const scenes = [...staticScenes, ...captured];
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
