// The Worker in front of the web client: files from the asset host, private deep links mapped to their shell, a real 404.
// Needs a built client (`npm run build:web` in apps/mobile); without one the checks are skipped, not failed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base, check, finish } from "./smoke-lib.mjs";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "mobile", "dist");
if (!fs.existsSync(path.join(dist, "it", "home.html"))) {
  console.log("  (skipped: apps/mobile/dist has no build)");
  finish();
}
const get = async (p, init) => {
  const r = await fetch(base + p, { redirect: "manual", ...init });
  return { status: r.status, type: r.headers.get("content-type") ?? "", text: await r.text() };
};
let r;
for (const [accept, to] of [["it-IT,it;q=0.9", "/it/"], ["en-US,en", "/en/"], ["fr", "/it/"]]) {
  const root = await fetch(base + "/", { redirect: "manual", headers: { "accept-language": accept } });
  check(`the root goes to the landing (${accept} -> ${to})`, root.status === 302 && new URL(root.headers.get("location"), base).pathname === to, `${root.status} ${root.headers.get("location")}`);
}
r = await get("/it/privacy");
check("a public page comes from the asset host (200, HTML)", r.status === 200 && r.type.includes("text/html") && r.text.includes("<title"), String(r.status));
r = await get("/it/home");
check("a private page with a file of its own (200)", r.status === 200 && r.text.includes("<script"));
const shell = await get("/it/c/[id]");
for (const p of ["/it/c/abc123", "/en/c/abc123/settings", "/it/c/abc123/log/l1", "/it/c/abc123/people/u1", "/it/c/abc123/feed", "/it/join/ABCD", "/it/log/l1", "/it/t/local:x1", "/it/s/6QLMP4", "/it/lists/l1"]) {
  r = await get(p);
  check(`deep link ${p} gets an app shell (200 HTML with the app script)`, r.status === 200 && r.type.includes("text/html") && r.text.includes("<script"), `${r.status} ${r.text.slice(0, 80)}`);
}
if (fs.existsSync(path.join(dist, "_headers"))) {
  // The Worker hands back the shell of a deep link: it must carry the same security headers as a file served by the asset host.
  const deep = await fetch(base + "/it/c/abc123");
  const file = await fetch(base + "/it/home");
  const csp = deep.headers.get("content-security-policy");
  check("a deep link served by the Worker carries the CSP, like the files of the asset host", !!csp && csp === file.headers.get("content-security-policy"), `${csp} | ${file.headers.get("content-security-policy")}`);
  check("and the other protections (frame-ancestors, nosniff, HSTS)", (csp ?? "").includes("frame-ancestors") && deep.headers.get("x-content-type-options") === "nosniff" && !!deep.headers.get("strict-transport-security"), JSON.stringify([...deep.headers]));
}
check("the same shell for any id", (await get("/it/c/zzz999")).text === shell.text && shell.status === 200);
r = await get("/it/c/abc123/nope");
check("an unknown path under a private prefix is a real 404", r.status === 404, String(r.status));
r = await get("/it/does-not-exist");
check("an unknown public path is a real 404 with the 404 page, not a soft 200", r.status === 404 && r.text.length > 200, String(r.status));
r = await get("/fr/c/abc123");
check("an unsupported language is a 404", r.status === 404, String(r.status));
r = await get("/api/nope");
check("an unknown API path is a JSON 404, not the client", r.status === 404 && r.type.includes("json"), r.type);
r = await get("/it/c/abc123", { method: "POST", body: "{}" });
check("POST to a client path is refused", r.status === 404 || r.status === 405, String(r.status));
finish();
