import { posterUrl } from "@/lib/tmdb-image";

/* Muted placeholder tints for titles without TMDB artwork (no saturated slop). */
const TINTS = ["#3B4A5C", "#4F5B4A", "#2F5D62", "#8A5A2B", "#5C6B3A", "#2B4E6E", "#5A4B6E", "#6E2F2F"];
function tintFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

type Props = {
  media: { id: string; title: string; posterPath: string | null };
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function Poster({ media, size = "md", className = "" }: Props) {
  const base = `relative aspect-[2/3] overflow-hidden rounded-sm bg-paper-3 ${className}`;
  if (media.posterPath) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element -- TMDB serves pre-sized images; no optimizer on Workers yet */}
        <img
          src={posterUrl(media.posterPath, size === "lg" ? "w500" : size === "md" ? "w342" : "w185")}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span className={`${base} flex items-end`} style={{ backgroundColor: tintFor(media.id) }} aria-hidden="true">
      {size !== "sm" && (
        <b className="p-2 font-display text-[13px] font-semibold leading-tight text-[#F4F1EC] [overflow-wrap:anywhere]">
          {media.title}
        </b>
      )}
    </span>
  );
}
