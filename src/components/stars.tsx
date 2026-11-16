/** Half-star rating display. `rating` is in half stars: 1..10 (= 0.5..5). */
export function Stars({ rating, label, className = "" }: { rating: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={`inline-flex gap-px text-sm leading-none ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rating >= i * 2 ? "100%" : rating >= i * 2 - 1 ? "50%" : "0%";
        return (
          <span key={i} aria-hidden="true" className="relative text-rule">
            ★
            <span className="absolute inset-0 overflow-hidden text-accent" style={{ width: fill }}>★</span>
          </span>
        );
      })}
    </span>
  );
}
