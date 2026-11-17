/* A tiny Sentry reporter (no SDK): turns an error into the envelope Sentry's HTTP API accepts. It is only used when the
 * SENTRY_DSN variable is set, so the project has no monitoring dependency and the person who deploys decides whether to turn it on. */

export type Dsn = { key: string; host: string; projectId: string; protocol: string };

export function parseDsn(dsn: string): Dsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.split("/").filter(Boolean).pop();
    if (!u.username || !projectId) return null;
    return { key: u.username, host: u.host, projectId, protocol: u.protocol.replace(":", "") };
  } catch {
    return null;
  }
}

const STRIP_QUERY = (path: string) => path.split("?")[0]; // never send query strings: they may carry invite codes or tokens

export type ErrorContext = { path?: string; method?: string; route?: string; kind?: string; release?: string; environment?: string };

/** The request to send: URL, headers and body. Pure, so it is unit-tested. */
export function buildSentryRequest(dsn: Dsn, error: unknown, ctx: ErrorContext = {}, now = new Date(), eventId = crypto.randomUUID().replace(/-/g, "")) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: "error",
    environment: ctx.environment ?? "production",
    release: ctx.release,
    exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: stackFrames(err.stack) } }] },
    request: ctx.path ? { url: STRIP_QUERY(ctx.path), method: ctx.method } : undefined,
    tags: { route: ctx.route, kind: ctx.kind },
  };
  const body = [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  return {
    url: `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/`,
    init: {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=pausa/1` },
      body,
    },
  };
}

/** Sentry wants frames oldest first; V8 prints newest first. */
function stackFrames(stack: string | undefined) {
  if (!stack) return [];
  return stack.split("\n").slice(1).map((l) => ({ filename: l.trim(), function: "?" })).reverse().slice(-50);
}

export async function reportToSentry(dsnString: string | undefined, error: unknown, ctx: ErrorContext = {}) {
  const dsn = dsnString ? parseDsn(dsnString) : null;
  if (!dsn) return;
  const { url, init } = buildSentryRequest(dsn, error, ctx);
  await fetch(url, init).catch(() => {}); // monitoring must never turn one error into two
}
