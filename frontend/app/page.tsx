import { RoomExperience3D } from "@/components/room3d/RoomExperience3D";
import { getProductsByIds, getRoomCounts } from "@/services/products";
import { getScene, scenes } from "@/services/scenes";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { room: roomId } = await searchParams;
  const room = await getScene(typeof roomId === "string" ? roomId : undefined);
  const [products, roomCounts] = await Promise.all([getProductsByIds(room.productIds), getRoomCounts()]);
  return (
    <RoomExperience3D
      key={room.id}
      room={room}
      rooms={scenes.map((s) => ({ id: s.id, name: s.name }))}
      products={products}
      roomCounts={roomCounts}
    />
  );
}
