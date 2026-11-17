/** Shown at once while a page of a Cerchia is being prepared: navigation feels instant instead of frozen. */
export default function Loading() {
  const bar = "animate-pulse rounded-sm bg-paper-3 motion-reduce:animate-none";
  return (
    <main className="grid gap-4 px-4 pb-6 pt-6" aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">…</span>
      <div className={`${bar} h-8 w-48`} />
      <div className={`${bar} h-3 w-32`} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-[72px_1fr] gap-3 rounded-md bg-paper-2 p-4">
          <div className={`${bar} aspect-[2/3] w-[72px]`} />
          <div className="grid content-start gap-2">
            <div className={`${bar} h-5 w-3/4`} />
            <div className={`${bar} h-3 w-1/2`} />
            <div className={`${bar} h-3 w-2/3`} />
          </div>
        </div>
      ))}
    </main>
  );
}
