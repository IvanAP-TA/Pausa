import { ApiFailure, failureFromBody } from "./errors";

export type ClientOptions = {
  /** "" = same origin (production web). A full origin for native and for web dev against `wrangler dev`. */
  baseUrl: string;
  fetch?: typeof fetch;
  /** Bearer token for native. Web returns null and relies on the cookie. */
  getToken?: () => Promise<string | null>;
  /** Web sends the HttpOnly cookie. */
  credentials?: RequestCredentials;
  /** Called when a call other than sign-in answers 401, so the app can drop its session. */
  onUnauthorized?: () => void;
};

export type RequestInitLite = { body?: unknown; signal?: AbortSignal; auth?: boolean; /** Extra request headers (`Idempotency-Key`). */ headers?: Record<string, string> };

export function createClient(opts: ClientOptions) {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function send(method: string, path: string, init: RequestInitLite = {}): Promise<Response> {
    const headers: Record<string, string> = { accept: "application/json", ...init.headers };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const token = await opts.getToken?.();
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await doFetch(opts.baseUrl + path, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: opts.credentials,
        signal: init.signal,
      });
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") throw e;
      throw new ApiFailure("network", 0);
    }
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // not JSON (a proxy error page): treated as `internal` by failureFromBody
      }
      const failure = failureFromBody(res.status, body, res.headers.get("retry-after"));
      if (res.status === 401 && init.auth !== false) opts.onUnauthorized?.();
      throw failure;
    }
    return res;
  }

  return {
    send,
    async json<T>(method: string, path: string, init?: RequestInitLite): Promise<T> {
      const res = await send(method, path, init);
      return (await res.json()) as T;
    },
    async none(method: string, path: string, init?: RequestInitLite): Promise<void> {
      await send(method, path, init);
    },
  };
}

export type Client = ReturnType<typeof createClient>;
