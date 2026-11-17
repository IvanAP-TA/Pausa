/* One-off: apply the per-person limits at the start of each action. */
const fs = require("fs");
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 80)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
};

edit("src/lib/actions.ts", [
  ["export async function createCircle(formData: FormData) {\n  const user = await requireUser();\n", "export async function createCircle(formData: FormData) {\n  const user = await requireUser();\n  await enforce(\"createCircle\", user.id);\n"],
  ["export async function joinCircle(formData: FormData) {\n  const user = await requireUser();\n", "export async function joinCircle(formData: FormData) {\n  const user = await requireUser();\n  await enforce(\"joinCircle\", user.id);\n"],
  ["export async function createInviteAction(formData: FormData) {\n  const user = await requireUser();\n", "export async function createInviteAction(formData: FormData) {\n  const user = await requireUser();\n  await enforce(\"createInvite\", user.id);\n"],
  ["export async function createLog(formData: FormData) {\n  const user = await requireUser();\n", "export async function createLog(formData: FormData) {\n  const user = await requireUser();\n  await enforce(\"createLog\", user.id);\n"],
  ["export async function toggleReaction(logId: string, emoji: string) {\n  const user = await requireUser();\n", "export async function toggleReaction(logId: string, emoji: string) {\n  const user = await requireUser();\n  await enforce(\"react\", user.id);\n"],
  ["export async function addComment(formData: FormData) {\n  const user = await requireUser();\n", "export async function addComment(formData: FormData) {\n  const user = await requireUser();\n  await enforce(\"comment\", user.id);\n"],
  ["export async function searchMedia(query: string, localeParam: string): Promise<MediaSummary[]> {\n  await requireUser();\n", "export async function searchMedia(query: string, localeParam: string): Promise<MediaSummary[]> {\n  const user = await requireUser();\n  if (!(await allow(\"search\", user.id))) return [];\n"],
  ['import { pushNotifications } from "./push";', 'import { pushNotifications } from "./push";\nimport { allow, enforce } from "./limit-guard";'],
]);

edit("src/lib/serata/actions.ts", [
  ["export async function createSerata(formData: FormData) {\n  const user = await requireUser();\n", "export async function createSerata(formData: FormData) {\n  const user = await requireUser();\n  await enforce(\"createSerata\", user.id);\n"],
  ['import { pushNotifications } from "@/lib/push";', 'import { pushNotifications } from "@/lib/push";\nimport { enforce } from "@/lib/limit-guard";'],
]);

edit("src/lib/import/actions.ts", [
  ["export async function importChunk(input: unknown): Promise<ImportChunkResult> {\n  const user = await requireUser();\n", "export async function importChunk(input: unknown): Promise<ImportChunkResult> {\n  const user = await requireUser();\n  if (!(await allow(\"importRows\", user.id))) return { ok: false, error: \"invalid\" };\n"],
]);
let imp = fs.readFileSync("src/lib/import/actions.ts", "utf8");
if (!imp.includes("limit-guard")) {
  imp = imp.replace(/(import[^\n]*\n)(?!import)/, (m) => m + 'import { allow } from "../limit-guard";\n');
  fs.writeFileSync("src/lib/import/actions.ts", imp);
}

// Cron: the Worker's scheduled handler runs the cleanup.
edit("worker.ts", [
  ["export * from \"./.open-next/worker.js\";\nexport default openNext;",
   `export * from "./.open-next/worker.js";

export default {
  fetch: (...args) => openNext.fetch(...args),
  // Daily housekeeping (cron trigger in wrangler.jsonc): old guests, expired sessions and sign-in links, stale counters.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCleanup(drizzle(env.DB, { schema })).then((r) => console.log("[pausa] cleanup", JSON.stringify(r))));
  },
};`],
  ['import openNext from "./.open-next/worker.js";', 'import openNext from "./.open-next/worker.js";\nimport { drizzle } from "drizzle-orm/d1";\nimport * as schema from "./src/db/schema";\nimport { runCleanup } from "./src/lib/core/cleanup";'],
]);
