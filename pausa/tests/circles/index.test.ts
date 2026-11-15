import { describe, it, expect } from "vitest";
import { generateInviteCode, validateInvite } from "@/modules/circles";

describe("invite code", () => {
  it("generates 8-char uppercase alnum", () => {
    const c = generateInviteCode();
    expect(c).toMatch(/^[A-Z0-9]{8}$/);
  });
});

describe("validateInvite", () => {
  const base = { expiresAt: new Date(2000), maxUses: 5, uses: 2 } as const;
  it("accepts valid invite", () => {
    expect(validateInvite(base, 1000).ok).toBe(true);
  });
  it("rejects expired", () => {
    expect(validateInvite(base, 3000).ok).toBe(false);
  });
  it("rejects exhausted", () => {
    expect(validateInvite({ ...base, uses: 5 }, 1000).ok).toBe(false);
  });
});
