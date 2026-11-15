export function starsFromRating(
  rating: number | null,
): { full: number; half: number; empty: number } {
  if (rating === null) return { full: 0, half: 0, empty: 5 };
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  return { full, half, empty: 5 - full - half };
}
