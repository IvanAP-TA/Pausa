// Signed, stateless magic-link token: base64url(email|expiresAt).hmac
// HMAC-SHA256 via Web Crypto (edge-compatible).

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

export async function signMagicToken(
  secret: string,
  email: string,
  nowMs: number,
  ttlMs: number,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = nowMs + ttlMs;
  const payload = b64urlEncode(new TextEncoder().encode(`${email}|${expiresAt}`));
  const sig = await hmac(secret, payload);
  return { token: `${payload}.${sig}`, expiresAt };
}

export type VerifyResult = { ok: true; email: string } | { ok: false };

export async function verifyMagicToken(
  secret: string,
  token: string,
  nowMs: number,
): Promise<VerifyResult> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false };
  const expected = await hmac(secret, payload);
  if (sig !== expected) return { ok: false };
  try {
    const decoded = new TextDecoder().decode(b64urlDecode(payload));
    const [email, exp] = decoded.split("|");
    if (!email || !exp) return { ok: false };
    if (Number(exp) < nowMs) return { ok: false };
    return { ok: true, email };
  } catch {
    return { ok: false };
  }
}
