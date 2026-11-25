import type { ApiError, ErrorCode } from "@pausa/api-types";
import type { MessageKey } from "@/i18n/messages";

/**
 * Every server error code, mapped to a message key. `satisfies Record<ErrorCode, ...>` makes a new code in the Rust
 * `ErrorCode` enum (regenerated into packages/api-types) a compile error here until it has text.
 */
export const ERROR_KEYS = {
  unauthorized: "app.apiErrors.unauthorized",
  forbidden: "app.apiErrors.forbidden",
  not_found: "app.apiErrors.not_found",
  invalid: "app.apiErrors.invalid",
  rate_limited: "app.apiErrors.rate_limited",
  conflict: "app.apiErrors.conflict",
  invite_revoked: "app.apiErrors.invite_revoked",
  invite_expired: "app.apiErrors.invite_expired",
  invite_exhausted: "app.apiErrors.invite_exhausted",
  circle_full: "app.apiErrors.circle_full",
  must_transfer: "app.apiErrors.must_transfer",
  catalog_unavailable: "app.apiErrors.catalog_unavailable",
  internal: "app.apiErrors.internal",
} as const satisfies Record<ErrorCode, MessageKey>;

export const NETWORK_KEY = "app.apiErrors.network" satisfies MessageKey;
const RATE_UNKNOWN_KEY = "app.apiErrors.rate_limited_unknown" satisfies MessageKey;

export const isErrorCode = (v: unknown): v is ErrorCode => typeof v === "string" && Object.prototype.hasOwnProperty.call(ERROR_KEYS, v);

/** A failed call: either the server's `{code, retryAfter}` contract or a network failure (`code: "network"`). */
export class ApiFailure extends Error {
  constructor(
    readonly code: ErrorCode | "network",
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(`API ${code} (${status})`);
    this.name = "ApiFailure";
  }
}

/** Parses an error response body. Anything that is not the contract becomes `internal`: the client never shows raw text. */
export function failureFromBody(status: number, body: unknown, retryAfterHeader?: string | null): ApiFailure {
  const b = (body && typeof body === "object" ? body : {}) as Partial<ApiError>;
  const code: ErrorCode = isErrorCode(b.code) ? b.code : "internal";
  const header = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const retryAfter = typeof b.retryAfter === "number" ? b.retryAfter : Number.isFinite(header) ? header : null;
  return new ApiFailure(code, status, code === "rate_limited" ? retryAfter : null);
}

type T = (key: MessageKey, values?: Record<string, string | number>) => string;

/** The sentence to show for any thrown value. */
export function errorMessage(t: T, error: unknown): string {
  if (!(error instanceof ApiFailure)) return t(ERROR_KEYS.internal);
  if (error.code === "network") return t(NETWORK_KEY);
  if (error.code === "rate_limited") {
    return error.retryAfter === null ? t(RATE_UNKNOWN_KEY) : t(ERROR_KEYS.rate_limited, { seconds: error.retryAfter });
  }
  return t(ERROR_KEYS[error.code]);
}
