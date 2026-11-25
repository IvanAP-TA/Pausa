// Changing the sign-in email: asked while signed in, confirmed from the new address by the same person, single use.
import { base, call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

let r;
sql("DELETE FROM rate_limit");
const oldMail = mail("em-old");
const newMail = mail("em-new");
const ann = await signIn(oldMail);
const ann2 = await signIn(oldMail); // a second device
const ben = await signIn(mail("em-ben"));
const get = (url, cookie) => fetch(base + url, { redirect: "manual", headers: cookie ? { cookie } : {} });
const linkPath = (devLink) => { const u = new URL(devLink); return u.pathname + u.search; };

r = await call("POST", "/api/account/email", { body: { email: newMail } });
check("asking needs a session", r.status === 401);
r = await call("POST", "/api/account/email", { cookie: ann.cookie, body: { email: "not-an-email" } });
check("a malformed address is refused", r.status === 400);
const guest = await call("POST", "/api/auth/guest", { body: { name: "Ospite" } });
const gcookie = guest.cookies.find((c) => c.startsWith("pausa_session="))?.split(";")[0];
r = await call("POST", "/api/account/email", { cookie: gcookie, body: { email: newMail } });
check("a guest has no email to change", r.status === 400, r.text);
r = await call("POST", "/api/account/email", { cookie: ann.cookie, body: { email: mail("em-ben") } });
check("an address somebody else uses answers the same shape and sends nothing (no link in the dev answer)", r.status === 200 && r.json.ok === true && !r.json.devLink, r.text);
check("and no token was made for it", sql(`SELECT 1 AS x FROM login_token WHERE kind='email_change' AND email='${mail("em-ben")}'`).length === 0);

r = await call("POST", "/api/account/email", { cookie: ann.cookie, body: { email: newMail.toUpperCase(), locale: "en" } });
check("a free address gets a link (dev answer carries it)", r.status === 200 && !!r.json.devLink, r.text);
const link = linkPath(r.json.devLink);
check("only the hash is stored, for the new address, for Ann", sql(`SELECT email, user_id FROM login_token WHERE kind='email_change' ORDER BY created_at DESC LIMIT 1`)[0]?.email === newMail && !JSON.stringify(sql("SELECT token_hash FROM login_token")).includes(new URL(r.json.devLink).searchParams.get("token")));

r = await get(link);
check("without a session the link does nothing", r.status === 303 && (r.headers.get("location") ?? "").includes("email=failed"), r.headers.get("location"));
r = await get(link, ben.cookie);
check("another signed-in person cannot use it", (r.headers.get("location") ?? "").includes("email=failed"));
check("and the email did not change, the link is still usable", sql(`SELECT email FROM user WHERE id='${ann.id}'`)[0].email === oldMail);
r = await get(link, ann.cookie);
check("Ann confirms: redirected to her account page", r.status === 303 && (r.headers.get("location") ?? "").includes("/en/me/account") && (r.headers.get("location") ?? "").includes("email=changed"), r.headers.get("location"));
check("the email changed and is verified; the email sign-in method follows", sql(`SELECT email, email_verified FROM user WHERE id='${ann.id}'`)[0].email === newMail && sql(`SELECT provider_account_id FROM account WHERE user_id='${ann.id}' AND provider='email'`).every((x) => x.provider_account_id === newMail));
check("this session stays, the other device is signed out", (await call("GET", "/api/me", { cookie: ann.cookie })).status === 200 && (await call("GET", "/api/me", { cookie: ann2.cookie })).status === 401);
r = await get(link, ann.cookie);
check("the link works once", (r.headers.get("location") ?? "").includes("email=failed"));
const again = await signIn(newMail);
check("signing in with the new address reaches the same person", again.id === ann.id);
r = await call("POST", "/api/auth/magic-link", { body: { email: oldMail, next: "/", locale: "it" } });
const old = await get(linkPath(r.json.devLink));
const meOld = old.headers.getSetCookie?.().find((c) => c.startsWith("pausa_session="))?.split(";")[0];
check("the old address now makes a different, new account", meOld && (await call("GET", "/api/me", { cookie: meOld })).json.id !== ann.id);

// an expired link
r = await call("POST", "/api/account/email", { cookie: ben.cookie, body: { email: mail("em-ben2") } });
sql(`UPDATE login_token SET expires_at = ${Date.now() - 1000} WHERE kind='email_change' AND email='${mail("em-ben2")}'`);
r = await get(linkPath(r.json.devLink), ben.cookie);
check("an expired link is refused", (r.headers.get("location") ?? "").includes("email=failed"));
finish();
