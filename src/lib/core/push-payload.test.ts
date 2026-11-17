import { describe, expect, it } from "vitest";
import { createECDH, generateKeyPairSync, randomBytes } from "node:crypto";
import { buildPushPayload } from "@block65/webcrypto-web-push";

/* Checks that keys in the format scripts/vapid.cjs produces, and a subscription like a browser's, give a valid encrypted
 * request: the part of Web Push we do not control, proven once so a wrong key format cannot surprise us in production. */

function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
  return { subject: "https://pausa.gnagno.org", publicKey: point.toString("base64url"), privateKey: privateKey.export({ format: "jwk" }).d! };
}

describe("web push payload", () => {
  it("builds an encrypted, VAPID-signed request for a browser subscription", async () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      expirationTime: null,
      keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") },
    };
    const req = await buildPushPayload({ data: { title: "Divano Club", body: "Giulia ha visto Chernobyl", url: "/it" }, options: { ttl: 3600 } }, sub, vapidKeys());
    expect(req.method.toUpperCase()).toBe("POST");
    expect(req.headers["content-encoding"]).toBe("aes128gcm");
    expect(req.headers.ttl).toBe("3600");
    expect(req.headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(req.body.byteLength).toBeGreaterThan(80); // header + ciphertext, never the plain text
    expect(Buffer.from(req.body).toString("utf8")).not.toContain("Chernobyl");
  });
});
