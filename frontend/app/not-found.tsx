import { ButtonLink } from "@/components/common/Button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col items-start px-4 py-32 md:px-8">
      <h1 className="text-4xl font-semibold tracking-tighter md:text-6xl">This page doesn&apos;t exist.</h1>
      <p className="mt-4 text-lg text-muted">The room or product may have been moved or retired.</p>
      <ButtonLink href="/" size="lg" className="mt-8">Browse rooms</ButtonLink>
    </div>
  );
}
