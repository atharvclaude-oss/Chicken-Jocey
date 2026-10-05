import type { Metadata } from "next";
import Link from "next/link";
import { TagEditor } from "@/components/admin/TagEditor";
import { getProducts } from "@/services/products";
import { scenes } from "@/services/scenes";

export const metadata: Metadata = { title: "Tag room", robots: { index: false } };

// TODO(auth): restrict /admin to the team before this ships.
export default async function TagPage({ searchParams }: PageProps<"/admin/tag">) {
  const { room: roomId } = await searchParams;
  const splatRooms = scenes.filter((s) => s.splat);
  const room = splatRooms.find((s) => s.id === roomId);
  const products = await getProducts();

  if (!room) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Tag a scanned room</h1>
        <ul className="mt-6 space-y-2">
          {splatRooms.map((s) => (
            <li key={s.id}>
              <Link className="underline underline-offset-4" href={`/admin/tag?room=${s.id}`}>{s.name}</Link>
            </li>
          ))}
          {splatRooms.length === 0 && <li className="text-muted">No scanned rooms yet.</li>}
        </ul>
      </div>
    );
  }
  return <TagEditor room={room} products={products} />;
}
