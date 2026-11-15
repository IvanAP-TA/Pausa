export function isValidRating(r: number | null): boolean {
  if (r === null) return true;
  if (r < 0.5 || r > 5) return false;
  return Number.isInteger(r * 2);
}
