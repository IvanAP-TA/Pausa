import { describe, it, expect } from "vitest";
import { validateListScope } from "@/modules/lists";

describe("validateListScope", () => {
  it("personal requires ownerUserId, not circleId", () => {
    expect(validateListScope({ scope: "personal", ownerUserId: "u" }).ok).toBe(true);
    expect(validateListScope({ scope: "personal", circleId: "c" }).ok).toBe(false);
  });
  it("circle requires circleId, not ownerUserId", () => {
    expect(validateListScope({ scope: "circle", circleId: "c" }).ok).toBe(true);
    expect(validateListScope({ scope: "circle", ownerUserId: "u" }).ok).toBe(false);
  });
});
