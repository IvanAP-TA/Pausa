import { starsFromRating } from "./star-rating-logic";

const STAR_PATH =
  "M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z";

/** Fill fraction 0, 0.5 or 1 for a single star slot. SSR-safe (no random ids). */
function StarSlot({ fill }: { fill: 0 | 0.5 | 1 }) {
  return (
    <span className="relative inline-block" style={{ width: 16, height: 16 }}>
      <Svg className="absolute inset-0 text-line" fillPath={false} />
      {fill > 0 && (
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${fill * 100}%` }}
        >
          <Svg className="text-forest" fillPath />
        </span>
      )}
    </span>
  );
}

function Svg({ className, fillPath }: { className: string; fillPath: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d={STAR_PATH}
        fill={fillPath ? "currentColor" : "transparent"}
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function StarRating({ rating }: { rating: number | null }) {
  const { full, half } = starsFromRating(rating);
  const slots: (0 | 0.5 | 1)[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < full) slots.push(1);
    else if (i === full && half === 1) slots.push(0.5);
    else slots.push(0);
  }
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={rating === null ? "Nessun voto" : `${rating} su 5`}
    >
      {slots.map((f, i) => (
        <StarSlot key={i} fill={f} />
      ))}
    </span>
  );
}
