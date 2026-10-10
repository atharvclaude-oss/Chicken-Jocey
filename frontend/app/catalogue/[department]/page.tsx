import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { CatalogueTile } from "@/components/catalogue/CatalogueTile";
import { getDepartment, getDepartments } from "@/services/products";

export async function generateStaticParams() {
  return (await getDepartments()).map((d) => ({ department: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/catalogue/[department]">): Promise<Metadata> {
  const dept = await getDepartment((await params).department);
  return dept ? { title: dept.name, description: `${dept.name} by collection.` } : {};
}

export default async function DepartmentPage({ params }: PageProps<"/catalogue/[department]">) {
  const dept = await getDepartment((await params).department);
  if (!dept) notFound();

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 md:px-8">
      <Link href="/catalogue" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} /> Catalogue
      </Link>
      <h1 className="mt-6 text-4xl font-semibold tracking-tighter md:text-6xl">{dept.name}</h1>
      {dept.collections.length === 0 && (
        <div className="mt-10 rounded-card border border-line p-10 text-center md:mt-12 md:p-16">
          <p className="text-2xl font-semibold tracking-tight md:text-3xl">{dept.name} is arriving soon.</p>
          <p className="mx-auto mt-3 max-w-[46ch] text-muted">We only list pieces once the supplier, price and shipping are checked. Lighting is ready now.</p>
          <Link href="/catalogue/lighting" className="mt-8 inline-flex rounded-full bg-fg px-6 py-3 text-sm font-medium text-bg">
            Shop lighting
          </Link>
        </div>
      )}
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:mt-12 lg:gap-6">
        {dept.collections.map((c, i) => (
          <CatalogueTile
            key={c.slug}
            href={`/catalogue/${dept.slug}/${c.slug}`}
            image={c.coverImage}
            label={c.name}
            preload={i < 2}
          />
        ))}
      </div>
    </div>
  );
}
