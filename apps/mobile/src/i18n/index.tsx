import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { parse, render, type Values } from "./format";
import { getMessages, loadMessages, lookupAny, type MessageKey, type Messages } from "./messages";
import type { Locale } from "./locales";

export { LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from "./locales";
export type { MessageKey } from "./messages";

type Tags = Record<string, (children: ReactNode) => ReactNode>;

export type I18n = {
  locale: Locale;
  /** Plain string. Throws in development for an unknown key so a typo cannot ship as visible text. */
  t: (key: MessageKey, values?: Values) => string;
  /** Message with tags, e.g. `<b>{name}</b> ha visto…`, rendered with the given element builders. */
  rich: (key: MessageKey, values: Values, tags: Tags) => ReactNode;
  /** Non-string values: arrays of strings and nested objects (`landing.faq.items`). */
  raw: <T = unknown>(key: string) => T;
  /** `/it` + path. */
  href: (path?: string) => string;
  date: (ms: number) => string;
  messages: Messages;
};

const Ctx = createContext<I18n | null>(null);

function build(locale: Locale, messages: Messages): I18n {
  const get = (key: string): string => {
    const v = lookupAny(messages, locale, key);
    if (typeof v !== "string") {
      if (process.env.NODE_ENV !== "production") throw new Error(`Missing message "${key}" for ${locale}`);
      return key;
    }
    return v;
  };
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return {
    locale,
    messages,
    t: (key, values = {}) => render<never>(parse(get(key)), locale, values).join(""),
    rich: (key, values, tags) => {
      const parts = render<ReactNode>(parse(get(key)), locale, values, tags);
      return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
    },
    raw: <T,>(key: string) => lookupAny(messages, locale, key) as T,
    href: (path = "") => `/${locale}${path}`,
    date: (ms) => dateFormat.format(new Date(ms)),
  };
}

/** Builds an I18n outside React (static metadata, tests). */
export const i18nFor = (locale: Locale, messages: Messages) => build(locale, messages);

/**
 * `deferred`: always render `fallback` on the very first render, even if the catalogue is already there. The app shell is exported
 * as static HTML with that fallback and then hydrated; rendering real text on the server (where every catalogue is registered)
 * and null in the browser would be a hydration mismatch. Public pages are not hydrated (no JavaScript) and render at once.
 */
export function I18nProvider({ locale, children, fallback = null, deferred = false }: { locale: Locale; children: ReactNode; fallback?: ReactNode; deferred?: boolean }) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [mounted, setMounted] = useState(!deferred);
  useEffect(() => setMounted(true), []);
  const messages = mounted ? getMessages(locale) : undefined;
  useEffect(() => {
    if (mounted && !messages) loadMessages(locale).then(force, (e) => console.error("Could not load the messages for", locale, e));
  }, [locale, messages, mounted]);
  const value = useMemo(() => (messages ? build(locale, messages) : null), [locale, messages]);
  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

export const useT = () => useI18n().t;

/** Stable `href` builder for effects. */
export function useHref() {
  const { locale } = useI18n();
  return useCallback((path = "") => `/${locale}${path}`, [locale]);
}
