import "server-only";

/* Review access (see core/review.ts). The reviewer types a password on /review; if it matches REVIEW_PASSWORD we ask Better Auth for
 * a normal sign-in link for REVIEW_EMAIL, but keep it in memory instead of emailing it, and follow it. The account is therefore an
 * ordinary session, with nothing added to the auth setup. With the variables unset, none of this exists. */

type Slot = { want?: string; url?: string };
const slot = () => ((globalThis as { __pausaReview?: Slot }).__pausaReview ??= {});

export const reviewEmail = () => process.env.REVIEW_EMAIL?.trim().toLowerCase() || null;
export const reviewEnabled = () => Boolean(reviewEmail() && process.env.REVIEW_PASSWORD);

/** Constant-time comparison of two strings (hashes first, so lengths do not leak). */
export async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < a!.length; i++) diff |= a![i]! ^ b![i]!;
  return diff === 0;
}

/** Called right before asking for the link: the next link for this address is kept, not sent. */
export function wantReviewLink(email: string) {
  slot().want = email;
  slot().url = undefined;
}

/** Called by the magic-link sender: true when the link was kept (so it must not be emailed). */
export function keepReviewLink(email: string, url: string): boolean {
  const s = slot();
  if (!reviewEnabled() || s.want !== email.toLowerCase() || email.toLowerCase() !== reviewEmail()) return false;
  s.url = url;
  s.want = undefined;
  return true;
}

export function takeReviewLink(): string | undefined {
  const s = slot();
  const url = s.url;
  s.url = undefined;
  s.want = undefined;
  return url;
}
