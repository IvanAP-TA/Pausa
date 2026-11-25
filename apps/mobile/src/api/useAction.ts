import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs one write at a time and tracks it: `busy` while it runs, `error` when it throws (shown through `errorMessage`).
 * `run` resolves to the value, or `undefined` if it failed, so the caller can do `if (await run(...)) ...`.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<{ value: T } | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const value = await fn();
      return { value };
    } catch (e) {
      if (alive.current) setError(e);
      return undefined;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  return { run, busy, error, clear: () => setError(null) };
}
