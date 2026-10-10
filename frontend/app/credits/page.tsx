import type { Metadata } from "next";
import credits from "@/services/model-credits.json";

export const metadata: Metadata = { title: "Credits", description: "The 3D models and assets our rooms are built with." };

// CC-BY models must credit their creators. Regenerate model-credits.json when a room adds Sketchfab models.
export default function CreditsPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-24 pt-14 md:px-8">
      <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">Credits</h1>
      <p className="mt-4 max-w-[60ch] text-muted">
        Some furniture in our rooms is built from 3D models shared by these creators on Sketchfab. Textures, lighting
        and other models come from <a className="underline underline-offset-4" href="https://polyhaven.com">Poly Haven</a> (CC0).
      </p>
      <ul className="mt-10 divide-y divide-line border-y border-line">
        {credits.map((c) => (
          <li key={c.url} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between">
            <a className="font-medium hover:underline" href={c.url} rel="noopener noreferrer" target="_blank">{c.name}</a>
            <span className="text-sm text-muted">
              by <a className="hover:text-fg" href={c.author_url} rel="noopener noreferrer" target="_blank">{c.author}</a> · {c.license_label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
