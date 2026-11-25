import { useCallback, useEffect, useRef, useState } from "react";

type State<T> = { data: T | null; error: unknown; loading: boolean };

/**
 * Loads something when the screen opens (and again on `reload`). Cancels the request when the screen goes away or the
 * inputs change, so a slow answer for the previous Cerchia can never overwrite the current one.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: ReadonlyArray<unknown>) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const run = useRef(load);
  run.current = load;
  const abort = useRef<AbortController | null>(null);

  const fetchNow = useCallback(async (keepData: boolean) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setState((s) => ({ data: keepData ? s.data : null, error: null, loading: true }));
    try {
      const data = await run.current(ctl.signal);
      if (!ctl.signal.aborted) setState({ data, error: null, loading: false });
    } catch (error) {
      if (!ctl.signal.aborted && (error as { name?: string })?.name !== "AbortError") setState({ data: null, error, loading: false });
    }
  }, []);

  useEffect(() => {
    void fetchNow(false);
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => fetchNow(true), [fetchNow]);
  return { ...state, reload };
}
