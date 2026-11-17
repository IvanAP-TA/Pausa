import { Star } from "lucide-react";

/** Half-star rating display. `rating` is in half stars: 1..10 (= 0.5..5). The rating is one of a log's two anchors, so it is set large. */
export function Stars({ rating, label, className = "" }: { rating: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={`inline-flex gap-0.5 text-xl leading-none ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rating >= i * 2 ? "100%" : rating >= i * 2 - 1 ? "50%" : "0%";
        return (
          <span key={i} aria-hidden="true" className="relative block size-[1em] text-rule">
            <Star fill="currentColor" strokeWidth={0} className="size-full" />
            <span className="absolute inset-0 overflow-hidden text-accent" style={{ width: fill }}>
              <Star fill="currentColor" strokeWidth={0} className="size-[1em] max-w-none" />
            </span>
          </span>
        );
      })}
    </span>
  );
}
