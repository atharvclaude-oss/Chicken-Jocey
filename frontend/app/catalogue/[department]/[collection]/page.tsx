import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { getCollection, getDepartments, getDepartment } from "@/services/products";
import { pluralize } from "@/utils/format";

export async function generateStaticParams() {
  const params: { department: string; collection: string }[] = [];
  for (const d of await getDepartments()) {
    for (const c of (await getDepartment(d.slug))!.collections) params.push({ department: d.slug, collection: c.slug });
  }
  return params;
}

export async function generateMetadata({ params }: PageProps<"/catalogue/[department]/[collection]">): Promise<Metadata> {
  const { department, collection } = await params;
  const found = await getCollection(department, collection);
  return found ? { title: `${found.collection.name} ${found.department.name}`, description: found.collection.description } : {};
}

export default async function CollectionPage({ params }: PageProps<"/catalogue/[department]/[collection]">) {
  const { department, collection } = await params;
  const found = await getCollection(department, collection);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 md:px-8">
      <Link
        href={`/catalogue/${found.department.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft size={16} /> {found.department.name}
      </Link>
      <h1 className="mt-6 text-4xl font-semibold tracking-tighter md:text-6xl">{found.collection.name}</h1>
      <p className="mt-4 max-w-[48ch] text-lg text-muted">{found.collection.description}</p>
      <p className="mt-10 text-sm text-muted">{pluralize(found.products.length, "piece")}</p>
      <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-4 lg:gap-x-6">
        {found.products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
