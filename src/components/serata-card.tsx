import { posterUrl } from "@/lib/tmdb-image";

/* The 9:16 share Card, set as a one-sheet: the poster full-bleed on top, the title in hairline display capitals,
 * the facts as hairline rows, the wordmark small at the foot.
 * Fixed card-* colours: the Card looks the same in light and dark, because it's what leaves the app.
 *
 * Everything is sized in `cqw` (1% of the Card's own width), so the Card is the same picture at 150px (the landing's
 * illustration) and at 340px (the real result): the poster always keeps the same share of the height, and the title
 * never has to break a word. The outer wrapper is the size container; an element can't measure itself. */

type Props = {
  kicker: string;
  title: string;
  subtitle?: string;
  posterPath: string | null;
  lines: string[];
  className?: string;
};

export function SerataCard({ kicker, title, subtitle, posterPath, lines, className = "" }: Props) {
  // The hairline capitals step down as the title grows, so a long one still sits in four lines.
  const titleSize = title.length > 36 ? "text-[11cqw]" : title.length > 18 ? "text-[14cqw]" : "text-[19cqw]";
  return (
    <div className={`w-full [container-type:inline-size] ${className}`}>
      <figure className="relative flex aspect-[9/16] w-full flex-col overflow-hidden border border-card-rule bg-card-paper text-left text-card-ink">
        <div className="relative min-h-[40%] flex-1 bg-card-rule">
          {posterPath && (
            // eslint-disable-next-line @next/next/no-img-element -- TMDB pre-sized poster
            <img src={posterUrl(posterPath, "w500")} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <figcaption className="grid shrink-0 gap-[2.4cqw] px-[6cqw] pb-[5cqw] pt-[5cqw]">
          <span className={`line-clamp-4 font-display font-extralight leading-[0.98] [text-wrap:balance] ${titleSize}`}>{title}</span>
          {subtitle && <span className="text-[max(7px,4.6cqw)] font-light leading-tight">{subtitle}</span>}
          <span className="grid text-[max(6.5px,3.8cqw)] leading-tight text-card-muted">
            <span className="border-t border-card-rule py-[1.6cqw]">{kicker}</span>
            {lines.map((l) => <span key={l} className="border-t border-card-rule py-[1.6cqw] tabular-nums">{l}</span>)}
          </span>
          <span className="flex items-center justify-between border-t border-card-rule pt-[2.4cqw] text-[max(6px,3.4cqw)] text-card-muted">
            <span>pausa.gnagno.org</span>
            <span aria-hidden="true" className="flex gap-[0.8cqw]"><i className="block h-[3.4cqw] w-[1.1cqw] bg-card-accent" /><i className="block h-[3.4cqw] w-[1.1cqw] bg-card-accent" /></span>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
