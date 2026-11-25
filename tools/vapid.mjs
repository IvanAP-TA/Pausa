// Generates a VAPID key pair (P-256) for Web Push, in the shape crates/api expects.
//   VAPID_PUBLIC_KEY   plain variable: 65-byte uncompressed point, base64url   -> wrangler.jsonc "vars"
//   VAPID_PRIVATE_JWK  SECRET: the private key as a JWK (with "d")             -> npx wrangler secret put VAPID_PRIVATE_JWK
// Usage: node tools/vapid.mjs   (prints both; nothing is written to disk)
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
console.log(`VAPID_PUBLIC_KEY=${point.toString("base64url")}`);
console.log(`VAPID_PRIVATE_JWK=${JSON.stringify({ kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d })}`);
