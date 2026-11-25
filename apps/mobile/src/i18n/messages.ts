// Message catalogues. One JSON per locale in packages/messages. In the app shell each locale is its own chunk, loaded on
// demand (`import()` below: Metro splits it). Static pages cannot await, so they register their catalogue synchronously
// through `registerMessages` (see src/i18n/public.ts, which only public routes import).
import type { Locale } from "./locales";
import type it from "@messages/it.json";
import { loaders } from "./loaders";

export type Messages = typeof it;

type Leaves<T, P extends string = ""> = T extends string
  ? P
  : T extends readonly unknown[]
    ? never
    : { [K in keyof T & string]: Leaves<T[K], P extends "" ? K : `${P}.${K}`> }[keyof T & string];

/**
 * Area catalogues: a screen (or a group of screens) keeps its own texts in its own file, in the three languages, and registers them
 * with `registerArea`. Nothing here has to be edited to add one, and the texts travel in the same chunk as the screen. To get typed
 * keys, the area file augments this interface (see src/features/areas/README.md):
 *   declare module "@/i18n/messages" { interface AreaMessageMap { myArea: typeof it } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AreaMessageMap {}
type AreaMessages = AreaMessageMap[keyof AreaMessageMap];

/** Every dotted path that ends in a string, e.g. `auth.title`, from the base catalogue and from every registered area. Arrays are read with `raw()`. */
export type MessageKey = Leaves<Messages> | Leaves<AreaMessages>;

const areas = new Map<string, Record<Locale, unknown>>();
export const registerArea = (name: string, byLocale: Record<Locale, unknown>) => {
  areas.set(name, byLocale);
};
/** For tests: every registered area with its three catalogues. */
export const registeredAreas = () => [...areas.entries()];

/** Base catalogue first, then the areas. */
export function lookupAny(messages: unknown, locale: Locale, key: string): unknown {
  const base = lookup(messages, key);
  if (base !== undefined) return base;
  for (const byLocale of areas.values()) {
    const v = lookup(byLocale[locale], key);
    if (v !== undefined) return v;
  }
  return undefined;
}

const catalogues = new Map<Locale, Messages>();

export const getMessages = (locale: Locale) => catalogues.get(locale);
export const registerMessages = (locale: Locale, messages: unknown) => {
  catalogues.set(locale, messages as Messages);
};

export async function loadMessages(locale: Locale): Promise<Messages> {
  const have = catalogues.get(locale);
  if (have) return have;
  const mod = await loaders[locale]();
  registerMessages(locale, mod.default);
  return catalogues.get(locale)!;
}

/** Walks `a.b.c` (or `a.items.0.q`) through a catalogue. */
export function lookup(messages: unknown, key: string): unknown {
  let cur: unknown = messages;
  for (const part of key.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
