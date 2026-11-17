/* One-off: report forms, operator page, delete Cerchia. */
const fs = require("fs");
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 80)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
};

fs.writeFileSync("src/lib/operator.ts", `/** Emails allowed into the operator pages (env ADMIN_EMAILS, comma-separated). In development the first seed person may. */
export function isOperator(email: string | null | undefined) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? (process.env.NODE_ENV === "development" ? "giulia@pausa.test" : ""))
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
`);

edit("src/app/[locale]/admin/metrics/page.tsx", [
  [/\/\*\* Emails allowed to see this page[^]*?\n}\n\n/.exec(fs.readFileSync("src/app/[locale]/admin/metrics/page.tsx", "utf8"))[0], ""],
  ["!allowed(session.user.email)", "!isOperator(session.user.email)"],
  ['import { computeMetrics } from "@/lib/core/metrics";', 'import { computeMetrics } from "@/lib/core/metrics";\nimport { isOperator } from "@/lib/operator";'],
]);

edit("src/lib/manage-actions.ts", [
  ['import { getCircleForMember } from "./data";', 'import { getCircleForMember } from "./data";\nimport { isOperator } from "./operator";\nimport { enforce } from "./limit-guard";\nimport { REPORT_REASONS, createReport, resolveReport } from "./core/moderation";\nimport { deleteCircle } from "./core/circles";'],
]);
fs.appendFileSync("src/lib/manage-actions.ts", `
/* ───────────── Moderation ───────────── */

export async function reportAction(formData: FormData) {
  const user = await requireUser();
  await enforce("report", user.id);
  const input = z.object({
    kind: z.enum(["comment", "log"]),
    targetId: id,
    reason: z.enum(REPORT_REASONS as [string, ...string[]]),
    note: z.string().trim().max(500).optional(),
  }).parse({ kind: formData.get("kind"), targetId: formData.get("targetId"), reason: formData.get("reason"), note: formData.get("note") ?? undefined });
  await createReport(await getDb(), { reporterId: user.id, kind: input.kind, targetId: input.targetId, reason: input.reason as (typeof REPORT_REASONS)[number], note: input.note });
  const back = String(formData.get("back") ?? "");
  redirect(back.startsWith("/") && !back.startsWith("//") ? \`\${back}\${back.includes("?") ? "&" : "?"}reported=1\` : "/");
}

/** Operator pages only: anyone else gets the same 404 as a page that does not exist. */
export async function resolveReportAction(formData: FormData) {
  const user = await requireUser();
  if (!isOperator(user.email)) throw new Error("Not found");
  await resolveReport(await getDb(), { reportId: id.parse(formData.get("reportId")), action: z.enum(["dismiss", "remove"]).parse(formData.get("action")) });
  revalidatePath("/[locale]/admin/reports", "page");
}

/** Closing a Cerchia is not undoable: the admin types its name back. */
export async function deleteCircleAction(formData: FormData) {
  const user = await requireUser();
  const circleId = id.parse(formData.get("circleId"));
  const locale = localeFrom(formData.get("locale"));
  const circle = await getCircleForMember(circleId, user.id);
  if (!circle || circle.role !== "admin") redirect(\`/\${locale}/c/\${circleId}/members?e=forbidden\`);
  if (String(formData.get("name") ?? "").trim() !== circle.name) redirect(\`/\${locale}/c/\${circleId}/members?e=confirm\`);
  await deleteCircle(await getDb(), { circleId, actorId: user.id });
  revalidatePath("/", "layout");
  redirect(\`/\${locale}\`);
}
`);

// Operator page for reports.
fs.mkdirSync("src/app/[locale]/admin/reports", { recursive: true });
fs.writeFileSync("src/app/[locale]/admin/reports/page.tsx", `import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { isOperator } from "@/lib/operator";
import { openReports, recentlyResolved } from "@/lib/core/moderation";
import { resolveReportAction } from "@/lib/manage-actions";

export const metadata = { title: "Segnalazioni", robots: { index: false } };

const REASON = { spam: "Spam", abuse: "Abuso", privacy: "Privacy", other: "Altro" } as const;

/** Operator-only list of open reports. Anyone else gets a 404. */
export default async function Reports({ params }: PageProps<"/[locale]/admin/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous || !isOperator(session.user.email)) notFound();
  const db = await getDb();
  const [open, done] = await Promise.all([openReports(db), recentlyResolved(db)]);

  return (
    <main className="projector mx-auto grid max-w-2xl gap-6 px-5 py-12">
      <h1 className="font-display text-[2rem] leading-tight">Segnalazioni</h1>
      {open.length === 0 ? <p className="text-muted">Nessuna segnalazione aperta.</p> : (
        <ul className="grid gap-3">
          {open.map((r) => (
            <li key={r.id} className="grid gap-2 rounded-md border border-rule bg-paper-2 p-4">
              <p className="text-xs text-muted">{r.kind === "comment" ? "Commento" : "Visione"} · {REASON[r.reason]} · da {r.reporter ?? "utente eliminato"}{r.circleName ? \` · \${r.circleName}\` : ""}</p>
              <p className="text-[15px] [overflow-wrap:anywhere]">{r.excerpt ?? "(contenuto non più disponibile)"}</p>
              {r.note && <p className="text-sm text-muted">Nota: {r.note}</p>}
              <div className="flex gap-2">
                <form action={resolveReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="action" value="remove" />
                  <button className="min-h-10 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">Rimuovi il contenuto</button></form>
                <form action={resolveReportAction}><input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="action" value="dismiss" />
                  <button className="min-h-10 rounded-full border border-rule px-4 text-sm hover:bg-paper-3">Ignora</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm text-muted">Chiuse di recente</h2>
          <ul className="grid gap-1 text-sm text-muted">
            {done.map((r) => <li key={r.id}>{r.resolution === "removed" ? "Rimosso" : "Ignorata"}: {r.excerpt ?? "—"}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
`);

// (the thread, members page and component are handled by wire-moderation2.cjs)
