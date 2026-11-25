/**
 * The same film can come back from the search twice: once as a title Pausa already stores ("local:<id>") and once from the catalogue
 * ("tmdb:movie:603"). Two rows for one title would let a person pick it twice; this is what makes them one.
 */
export type TitleLike = { key?: string; kind: string; title: string; year: number | bigint | null };

export const titleIdentity = (t: TitleLike) => `${t.kind}|${t.title.trim().toLowerCase()}|${t.year === null ? "" : Number(t.year)}`;

/** One row per title, in the order the server gave them; of two rows for the same title the stored one (`local:`) is kept. */
export function dedupeTitles<T extends TitleLike & { key: string }>(list: T[]): T[] {
  const byId = new Map<string, T>();
  const order: string[] = [];
  for (const t of list) {
    const id = titleIdentity(t);
    const have = byId.get(id);
    if (!have) {
      byId.set(id, t);
      order.push(id);
    } else if (!have.key.startsWith("local:") && t.key.startsWith("local:")) byId.set(id, t);
  }
  return order.map((id) => byId.get(id)!);
}
