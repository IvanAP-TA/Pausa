import { describe, it, expect } from "vitest";
import { signMagicToken, verifyMagicToken } from "@/modules/auth/token";

const SECRET = "test-secret";

describe("magic token", () => {
  it("round-trips email within expiry", async () => {
    const { token } = await signMagicToken(SECRET, "a@b.com", 1_000_000, 60_000);
    const res = await verifyMagicToken(SECRET, token, 1_030_000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.email).toBe("a@b.com");
  });

  it("rejects expired token", async () => {
    const { token } = await signMagicToken(SECRET, "a@b.com", 1_000_000, 60_000);
    const res = await verifyMagicToken(SECRET, token, 2_000_000);
    expect(res.ok).toBe(false);
  });

  it("rejects tampered signature", async () => {
    const { token } = await signMagicToken(SECRET, "a@b.com", 1_000_000, 60_000);
    const res = await verifyMagicToken("wrong-secret", token, 1_010_000);
    expect(res.ok).toBe(false);
  });
});
