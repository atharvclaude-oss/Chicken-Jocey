import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { RoomExperience } from "@/components/room/RoomExperience";
import { getProductsByIds, getRoomCounts } from "@/services/products";
import { getRoom, getRooms, getStyle } from "@/services/rooms";
import { formatPriceWhole } from "@/utils/format";

export async function generateStaticParams() {
  const rooms = await getRooms();
  return rooms.map((r) => ({ style: r.styleSlug, room: r.slug }));
}

export async function generateMetadata({ params }: PageProps<"/rooms/[style]/[room]">): Promise<Metadata> {
  const { style, room: slug } = await params;
  const room = await getRoom(style, slug);
  if (!room) return {};
  return {
    title: room.name,
    description: `${room.blurb} ${room.productCount} pieces, ${formatPriceWhole(room.totalCents)} for the complete room.`,
    openGraph: { images: [room.image] },
  };
}

export default async function RoomPage({ params }: PageProps<"/rooms/[style]/[room]">) {
  const { style: styleSlug, room: roomSlug } = await params;
  const [style, room] = await Promise.all([getStyle(styleSlug), getRoom(styleSlug, roomSlug)]);
  if (!style || !room) notFound();

  const productIds = [...new Set(room.assets.map((a) => a.productId))];
  const [products, roomCounts] = await Promise.all([getProductsByIds(productIds), getRoomCounts()]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 md:px-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-muted">
        <Link href="/rooms" className="hover:text-fg">Rooms</Link>
        <CaretRight size={12} />
        <Link href={`/rooms/${style.slug}`} className="hover:text-fg">{style.name}</Link>
        <CaretRight size={12} />
        <span className="text-fg">{room.name}</span>
      </nav>
      <RoomExperience room={room} styleName={style.name} products={products} roomCounts={roomCounts} />
    </div>
  );
}
