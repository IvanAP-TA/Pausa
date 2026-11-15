const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

export function PosterCard({
  title,
  year,
  posterPath,
}: {
  title: string;
  year?: number | null;
  posterPath?: string | null;
}) {
  return (
    <figure className="group flex flex-col gap-2">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-surface-1">
        {posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${TMDB_IMG}${posterPath}`}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3 text-center text-sm text-ink-dim">
            {title}
          </div>
        )}
      </div>
      <figcaption className="text-sm">
        <span className="text-ink">{title}</span>
        {year ? <span className="text-ink-dim"> · {year}</span> : null}
      </figcaption>
    </figure>
  );
}
