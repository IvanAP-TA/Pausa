/** Deterministic tint index (0-7) for a name, so two Cerchie or titles with no artwork are told apart by colour. */
export function tintIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 8;
}
