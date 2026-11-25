// Push: device registration, delivery of new notifications to Expo (a mock stands in for it), dead devices forgotten, nothing
// sent twice. The email digest is not covered here: it needs a mail key, which a local run does not have.
import crypto from "node:crypto";
import { base, call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

const MOCK = process.env.MOCK ?? "http://127.0.0.1:9911";
const pushed = async () => (await fetch(MOCK + "/__push")).json();
const tick = () => fetch(base + "/cdn-cgi/handler/scheduled?cron=*+*+*+*+*");
let r;
sql("DELETE FROM rate_limit");
const ann = await signIn(mail("push-ann"));
const ben = await signIn(mail("push-ben"));

r = await call("POST", "/api/me/push", { body: { kind: "expo", endpoint: "ExponentPushToken[x]" } });
check("registering needs a session", r.status === 401);
r = await call("POST", "/api/me/push", { cookie: ann.cookie, body: { kind: "expo", endpoint: "https://evil.example/x" } });
check("an Expo device must send an Expo token", r.status === 400);
r = await call("POST", "/api/me/push", { cookie: ann.cookie, body: { kind: "webpush", endpoint: "https://push.example/abc" } });
check("Web Push needs its keys", r.status === 400);
const tok = `ExponentPushToken[ok-${run}]`;
const gone = `ExponentPushToken[gone-${run}]`;
r = await call("POST", "/api/me/push", { cookie: ann.cookie, body: { kind: "expo", endpoint: tok, locale: "en" } });
check("registered (204)", r.status === 204, r.text);
await call("POST", "/api/me/push", { cookie: ann.cookie, body: { kind: "expo", endpoint: gone, locale: "it" } });
r = await call("POST", "/api/me/push", { cookie: ann.cookie, body: { kind: "expo", endpoint: tok, locale: "es" } });
check("the same device twice is one row, language refreshed", r.status === 204 && sql(`SELECT locale FROM push_subscription WHERE endpoint='${tok}'`).map((x) => x.locale).join() === "es");

// A notification for Ann: Ben joins her Cerchia.
const C = (await call("POST", "/api/circles", { cookie: ann.cookie, body: { name: "Notifiche" } })).json;
await call("POST", "/api/circles/join", { cookie: ben.cookie, body: { code: C.inviteCode } });
check("a join notification exists and is unpushed", sql(`SELECT 1 AS x FROM notification WHERE user_id='${ann.id}' AND type='circle_join' AND pushed_at IS NULL`).length === 1);
const before = (await pushed()).length;
await tick();
const sent = (await pushed()).slice(before).filter((m) => m.to === tok || m.to === gone);
check("both devices got one message, worded in each device's language, opening the Cerchia", sent.length === 2 && sent.some((m) => m.to === tok && m.body.includes("se ha unido")) && sent.some((m) => m.to === gone && m.body.includes("è entrato")) && sent.every((m) => m.data.url === `/c/${C.id}` && m.title === "Notifiche"), JSON.stringify(sent));
check("the notification is marked pushed", sql(`SELECT 1 AS x FROM notification WHERE user_id='${ann.id}' AND type='circle_join' AND pushed_at IS NULL`).length === 0);
check("the device Expo reported as gone was forgotten, the other kept", sql(`SELECT endpoint FROM push_subscription WHERE user_id='${ann.id}'`).map((x) => x.endpoint).join() === tok);
const after = (await pushed()).length;
await tick();
check("a second tick sends nothing again", (await pushed()).length === after);

// A person with no device: the notification is handled (marked) without any call.
await call("POST", "/api/circles/join", { cookie: (await signIn(mail("push-cy"))).cookie, body: { code: C.inviteCode } });
const n2 = (await pushed()).length;
await tick();
check("people without a device cost no call (one message for Ann only), and everything is marked", (await pushed()).length === n2 + 1 && sql(`SELECT 1 AS x FROM notification WHERE pushed_at IS NULL AND created_at > ${Date.now() - 600000}`).length === 0);

r = await call("DELETE", "/api/me/push", { cookie: ben.cookie, body: { endpoint: tok } });
check("someone else cannot remove Ann's device", sql(`SELECT 1 AS x FROM push_subscription WHERE endpoint='${tok}'`).length === 1);
r = await call("DELETE", "/api/me/push", { cookie: ann.cookie, body: { endpoint: tok } });
check("Ann can remove her own", r.status === 204 && sql(`SELECT 1 AS x FROM push_subscription WHERE endpoint='${tok}'`).length === 0);

// ═════════ Web Push: VAPID-signed, no payload ═════════
const PUB = process.env.VAPID_PUBLIC_B64;
r = await call("GET", "/api/push/key");
check("the public key for subscribing is served", r.status === 200 && r.json.publicKey === PUB, r.text);
const wpOk = `${MOCK}/webpush/ok-${run}`;
const wpGone = `${MOCK}/webpush/gone-${run}`;
const wp = await signIn(mail("push-wp"));
const owner = await signIn(mail("push-wpowner"));
for (const [i, e] of [wpOk, wpGone].entries()) sql(`INSERT INTO push_subscription(id,user_id,kind,endpoint,p256dh,auth,locale) VALUES ('wp-${run}-${i}','${wp.id}','webpush','${e}','k','a','it')`);
const C2 = (await call("POST", "/api/circles", { cookie: wp.cookie, body: { name: "WebPush" } })).json;
await call("POST", "/api/circles/join", { cookie: owner.cookie, body: { code: C2.inviteCode } });
const wbefore = (await (await fetch(MOCK + "/__webpush")).json()).length;
await tick();
const got = (await (await fetch(MOCK + "/__webpush")).json()).slice(wbefore).filter((x) => x.path.endsWith(`-${run}`));
check("both Web Push devices were called once, with an empty body and a TTL", got.length === 2 && got.every((g) => g.length === "0" && g.ttl === "3600"), JSON.stringify(got));
const auth = got.find((g) => g.path.includes("/ok-"))?.authorization ?? "";
const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(auth);
check("the Authorization header is `vapid t=<jwt>, k=<public key>`", !!m && m[4] === PUB, auth.slice(0, 80));
if (m) {
  const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
  const header = JSON.parse(Buffer.from(m[1], "base64url").toString());
  const x = Buffer.from(PUB, "base64url");
  const pubKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: x.subarray(1, 33).toString("base64url"), y: x.subarray(33).toString("base64url") }, format: "jwk" });
  const valid = crypto.verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url"));
  check("the JWT is ES256 with a signature that verifies against the public key", header.alg === "ES256" && header.typ === "JWT" && valid);
  const nowS = Math.floor(Date.now() / 1000);
  check("audience is the push service origin, subject is the contact, expiry is within 12 hours", claims.aud === MOCK && claims.sub === "mailto:test@pausa.test" && claims.exp > nowS && claims.exp <= nowS + 12 * 3600 + 5, JSON.stringify(claims));
}
check("the service that said 410 is forgotten, the other device is kept", sql(`SELECT endpoint FROM push_subscription WHERE user_id='${wp.id}'`).map((x) => x.endpoint).join() === wpOk);
const wafter = (await (await fetch(MOCK + "/__webpush")).json()).length;
await tick();
check("nothing is sent twice", (await (await fetch(MOCK + "/__webpush")).json()).length === wafter);
finish();
