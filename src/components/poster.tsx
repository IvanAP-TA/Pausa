import { posterUrl } from "@/lib/tmdb-image";

/* Placeholder tints for titles without TMDB artwork: low-chroma tokens, so none outshouts a real poster. */
const TINTS = 8;
function tintFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `var(--color-tint-${(h % TINTS) + 1})`;
}

type Props = {
  media: { id: string; title: string; posterPath: string | null };
  /** sm: a thumbnail in a row · md: a feed plate · lg / hero: the picture leads the screen. */
  size?: "sm" | "md" | "lg" | "hero";
  /** The first picture of a screen: loaded at once, at high priority. */
  priority?: boolean;
  className?: string;
};

/** A poster is a print: square corners, no frame, no shadow. It sits on the ground as an object. */
export function Poster({ media, size = "md", priority = false, className = "" }: Props) {
  // A span is inline by default and aspect-ratio ignores inline boxes: the image variant must be block, the fallback flex.
  const base = `poster relative aspect-[2/3] overflow-hidden bg-paper-3 ${className}`;
  if (media.posterPath) {
    return (
      <span className={`block ${base}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- TMDB serves pre-sized images; no optimizer on Workers yet */}
        <img
          src={posterUrl(media.posterPath, size === "lg" || size === "hero" ? "w500" : size === "md" ? "w342" : "w185")}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span className={`flex items-end ${base}`} style={{ backgroundColor: tintFor(media.id) }} aria-hidden="true">
      <b className={`font-display font-normal leading-none text-on-tint ${size === "hero" || size === "lg" ? "p-3 text-3xl" : size === "md" ? "p-2 text-lg" : "p-1 text-xs"}`}>
        {media.title}
      </b>
    </span>
  );
}
