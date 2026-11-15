import { describe, it, expect } from "vitest";
import { buildNotification } from "@/modules/notifications";

describe("buildNotification", () => {
  it("serializes payload and sets defaults", () => {
    const n = buildNotification("u1", "new_comment", { logId: "l1" });
    expect(n.userId).toBe("u1");
    expect(n.type).toBe("new_comment");
    expect(JSON.parse(n.payloadJson)).toEqual({ logId: "l1" });
    expect(n.isRead).toBe(false);
  });
});
