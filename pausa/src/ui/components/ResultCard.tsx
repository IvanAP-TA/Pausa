const IMG = "https://image.tmdb.org/t/p/w500";

// Shareable 9:16 result card.
export function ResultCard({
  title,
  year,
  posterPath,
  circleName,
}: {
  title: string;
  year?: number | null;
  posterPath?: string | null;
  circleName?: string | null;
}) {
  return (
    <div
      className="relative mx-auto flex w-full max-w-[320px] flex-col justify-between overflow-hidden rounded-2xl border border-line bg-base-alt p-6"
      style={{ aspectRatio: "9 / 16" }}
    >
      <div>
        <p className="font-display text-xl text-ink">Pausa</p>
        {circleName && <p className="text-sm text-ink-dim">{circleName}</p>}
      </div>

      <div className="flex flex-col items-center gap-4 text-center">
        {posterPath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${IMG}${posterPath}`}
            alt={title}
            className="w-40 rounded-lg border border-line shadow-2xl shadow-black/50"
          />
        )}
        <div>
          <p className="text-sm text-mandarin">La Serata ha deciso</p>
          <h2 className="mt-1 font-display text-3xl font-semibold leading-tight text-ink">
            {title}
          </h2>
          {year && <p className="text-ink-dim">{year}</p>}
        </div>
      </div>

      <p className="text-center text-xs text-ink-dim">Stasera si guarda questo.</p>
    </div>
  );
}
