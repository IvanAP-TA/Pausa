import { posterUrl } from "@/lib/tmdb-image";

/* The 9:16 share Card, "Sottotitoli su carta": poster on top, a printed caption below (Gloock title, a subtitle line).
 * Fixed card-* colours: the Card looks the same in light and dark, because it's what leaves the app. */

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
    <figure className={`relative flex aspect-[9/16] w-full flex-col overflow-hidden rounded-md border border-card-rule bg-card-paper text-center text-card-ink ${className}`}>
      <div className="relative min-h-0 flex-1 bg-[#2F5D62]">
        {posterPath && (
          // eslint-disable-next-line @next/next/no-img-element -- TMDB pre-sized poster
          <img src={posterUrl(posterPath, "w500")} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <figcaption className="grid gap-2 border-t-[3px] border-card-accent px-5 pb-5 pt-4">
        <span className="text-[11px] font-semibold tracking-[0.1em] text-card-accent">{kicker}</span>
        <span className="font-display text-[clamp(1.9rem,8.5vw,2.5rem)] leading-[1.02] [overflow-wrap:anywhere]">{title}</span>
        {subtitle && <span className="text-sm font-medium text-card-accent">— {subtitle}</span>}
        <span className="grid gap-0.5 text-[11px] text-card-muted">
          {lines.map((l) => <span key={l}>{l}</span>)}
        </span>
        <span className="mt-1 flex items-center justify-between text-[10px] text-card-muted">
          <span>pausa.gnagno.org</span>
          <span aria-hidden="true" className="flex gap-[3px]"><i className="block h-3 w-1 rounded-[1px] bg-card-accent" /><i className="block h-3 w-1 rounded-[1px] bg-card-accent" /></span>
        </span>
      </figcaption>
    </figure>
  );
}
