import { useCallback, useEffect, useRef, useState } from "react";

export type Page<T> = { items: T[]; next: string | null };

type State<T> = {
  items: T[];
  next: string | null;
  /** First page: "loading" until it answers, "error" if it failed. */
  status: "loading" | "ready" | "error";
  error: unknown;
  /** Next pages: a failure here keeps what is already on screen and offers a retry. */
  more: "idle" | "loading" | "error";
  moreError: unknown;
};

const initial = <T,>(): State<T> => ({ items: [], next: null, status: "loading", error: null, more: "idle", moreError: null });

/**
 * A keyset-paginated list (`next` is the opaque cursor the server hands back). Reloads from the first page when `deps` change,
 * ignores answers that belong to an older request, never asks for the same page twice at once, and lets a screen patch items
 * in place (`setItems`) for optimistic edits and removals.
 */
export function usePages<T>(fetchPage: (before: string | null, signal: AbortSignal) => Promise<Page<T>>, deps: ReadonlyArray<unknown>) {
  const [state, setState] = useState<State<T>>(initial<T>());
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const abort = useRef<AbortController | null>(null);
  const busyMore = useRef(false);
  const live = useRef(state);
  live.current = state;

  const first = useCallback(async (keep: boolean) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    busyMore.current = false;
    setState((s) => (keep ? { ...s, status: s.items.length ? s.status : "loading", error: null } : initial<T>()));
    try {
      const page = await fetchRef.current(null, ctl.signal);
      if (!ctl.signal.aborted) setState({ items: page.items, next: page.next, status: "ready", error: null, more: "idle", moreError: null });
    } catch (error) {
      if (!ctl.signal.aborted && (error as { name?: string })?.name !== "AbortError") setState((s) => ({ ...s, status: "error", error }));
    }
  }, []);

  useEffect(() => {
    void first(false);
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(async () => {
    const s = live.current;
    if (!s.next || busyMore.current || s.status !== "ready") return;
    busyMore.current = true;
    const ctl = abort.current ?? new AbortController();
    setState((x) => ({ ...x, more: "loading", moreError: null }));
    try {
      const page = await fetchRef.current(s.next, ctl.signal);
      if (!ctl.signal.aborted) setState((x) => ({ ...x, items: [...x.items, ...page.items], next: page.next, more: "idle" }));
    } catch (moreError) {
      if (!ctl.signal.aborted && (moreError as { name?: string })?.name !== "AbortError") setState((x) => ({ ...x, more: "error", moreError }));
    } finally {
      busyMore.current = false;
    }
  }, []);

  const setItems = useCallback((fn: (items: T[]) => T[]) => setState((s) => ({ ...s, items: fn(s.items) })), []);
  const reload = useCallback(() => first(true), [first]);
  return { ...state, loadMore, reload, setItems };
}
