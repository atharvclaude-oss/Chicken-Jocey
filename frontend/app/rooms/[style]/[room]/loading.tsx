export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 md:px-8" aria-busy="true" aria-label="Loading room">
      <div className="skeleton mb-4 h-5 w-56 rounded-full" />
      <div className="grid aspect-[3/2] max-h-[66dvh] w-full place-items-center rounded-card bg-stage">
        <div className="w-48 text-center">
          <p className="text-sm text-white/70">Loading room...</p>
          <div className="loading-bar mt-3 h-[3px] rounded-full" />
        </div>
      </div>
      <div className="mt-6 flex justify-between gap-6">
        <div className="space-y-3">
          <div className="skeleton h-4 w-28 rounded-full" />
          <div className="skeleton h-10 w-72 rounded-full" />
        </div>
        <div className="skeleton hidden h-12 w-64 rounded-full md:block" />
      </div>
    </div>
  );
}
