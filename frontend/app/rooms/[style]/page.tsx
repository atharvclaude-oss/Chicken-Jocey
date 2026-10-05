import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/common/Reveal";
import { RoomCard } from "@/components/room/RoomCard";
import { getRooms, getStyle, getStyles } from "@/services/rooms";

export async function generateStaticParams() {
  const styles = await getStyles();
  return styles.map((s) => ({ style: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/rooms/[style]">): Promise<Metadata> {
  const style = await getStyle((await params).style);
  if (!style) return {};
  return { title: `${style.name} rooms`, description: style.tagline };
}

export default async function StylePage({ params }: PageProps<"/rooms/[style]">) {
  const { style: slug } = await params;
  const [style, rooms] = await Promise.all([getStyle(slug), getRooms(slug)]);
  if (!style) notFound();

  const [featured, ...rest] = rooms;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 md:px-8 md:pt-10">
      <Link href="/rooms" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> All styles
      </Link>
      <Reveal className="mt-8">
        <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">{style.name}</h1>
        <p className="mt-4 max-w-[50ch] text-lg text-muted">
          {style.tagline} Choose a room you like.
        </p>
      </Reveal>

      {rooms.length === 0 ? (
        <div className="mt-14 rounded-card border border-dashed border-line px-6 py-16 text-center">
          <p className="font-medium">No rooms in this style yet</p>
          <p className="mt-2 text-sm text-muted">New rooms are added every few weeks.</p>
        </div>
      ) : (
        <div className="mt-12 grid gap-x-6 gap-y-14 md:grid-cols-2">
          <Reveal className="md:col-span-2">
            <RoomCard room={featured} featured preload />
          </Reveal>
          {rest.map((room, i) => (
            <Reveal key={room.id} delay={0.08 * i}>
              <RoomCard room={room} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
