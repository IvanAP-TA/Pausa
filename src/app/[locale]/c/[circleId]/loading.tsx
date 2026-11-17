/** Shown at once while a page of a Cerchia is being prepared: a skeleton in the shape of the diary, so navigation feels instant instead of frozen. */
export default function Loading() {
  return (
    <main className="grid gap-6 px-4 pb-8 pt-8" aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">…</span>
      <div className="grid gap-3">
        <div className="skeleton h-12 w-56" />
        <div className="skeleton h-4 w-40" />
      </div>
      <div className="grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="plate grid grid-cols-[104px_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[128px_minmax(0,1fr)]">
            <div className="skeleton aspect-[2/3]" />
            <div className="grid content-start gap-3">
              <div className="skeleton h-8 w-3/4" />
              <div className="skeleton h-4 w-1/2" />
              <div className="skeleton h-5 w-28" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
