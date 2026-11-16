import { posterUrl } from "@/lib/tmdb-image";

/* The 9:16 share Card, "Sottotitoli su carta": poster on top, a printed caption below (Gloock title, a subtitle line).
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
  return (
    <div className={`w-full [container-type:inline-size] ${className}`}>
      <figure className="relative flex aspect-[9/16] w-full flex-col overflow-hidden rounded-md border border-card-rule bg-card-paper text-center text-card-ink">
        <div className="relative min-h-[40%] flex-1 bg-[#2F5D62]">
          {posterPath && (
            // eslint-disable-next-line @next/next/no-img-element -- TMDB pre-sized poster
            <img src={posterUrl(posterPath, "w500")} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <figcaption className="grid shrink-0 gap-[1.8cqw] border-t-[3px] border-card-accent px-[7cqw] pb-[5.5cqw] pt-[4.5cqw]">
          <span className="text-[max(6.5px,3.4cqw)] font-semibold tracking-[0.1em] text-card-accent">{kicker}</span>
          <span className="line-clamp-4 font-display text-[11.5cqw] leading-[1.03] [overflow-wrap:break-word] [text-wrap:balance]">{title}</span>
          {subtitle && <span className="text-[max(7px,4.4cqw)] font-medium text-card-accent">— {subtitle}</span>}
          <span className="grid gap-[0.6cqw] text-[max(6.5px,3.5cqw)] text-card-muted">
            {lines.map((l) => <span key={l}>{l}</span>)}
          </span>
          <span className="mt-[0.6cqw] flex items-center justify-between text-[max(6px,3cqw)] text-card-muted">
            <span>pausa.gnagno.org</span>
            <span aria-hidden="true" className="flex gap-[0.8cqw]"><i className="block h-[3.4cqw] w-[1.1cqw] rounded-[1px] bg-card-accent" /><i className="block h-[3.4cqw] w-[1.1cqw] rounded-[1px] bg-card-accent" /></span>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
