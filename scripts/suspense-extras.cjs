/* One-off: stream the diary's secondary sections (first steps, memories) after the feed instead of before it. */
const fs = require("fs");
const p = "src/app/[locale]/c/[circleId]/page.tsx";
let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const start = s.indexOf("      {onboarding && !onboarding.done && (");
const end = s.indexOf("      {feed.length === 0 && before ? (");
if (start < 0 || end < 0) throw new Error("markers not found");
const body = s.slice(start, end);
s = s.slice(0, start) + '      {!before && (\n        <Suspense fallback={null}>\n          <Extras circleId={circleId} userId={user.id} locale={locale} now={now} />\n        </Suspense>\n      )}\n\n' + s.slice(end);

s = s.replace("memories, onboarding, tr, ta] = await Promise.all([", "ta] = await Promise.all([");
s = s.replace("    before ? Promise.resolve([]) : memoriesFor(db, circleId, now, { locale }),\n    before ? Promise.resolve(null) : onboardingFor(db, circleId, user.id),\n    getTranslations(\"retention\"),\n", "");
s = s.replace("  const db = await getDb();\n", "");
s = s.replace('import { getDb } from "@/db";', 'import { Suspense } from "react";\nimport { getDb } from "@/db";');

s += `
/** First steps and memories: nice to have, never in the way. They stream in after the feed. */
async function Extras({ circleId, userId, locale, now }: { circleId: string; userId: string; locale: string; now: Date }) {
  const db = await getDb();
  const [memories, onboarding, tr] = await Promise.all([memoriesFor(db, circleId, now, { locale }), onboardingFor(db, circleId, userId), getTranslations("retention")]);
  return (
    <>
${body.replace(/^/gm, "  ").replace(/^ {2}$/gm, "")}    </>
  );
}
`;
fs.writeFileSync(p, s);

fs.writeFileSync("src/app/[locale]/c/[circleId]/loading.tsx", `/** Shown at once while a page of a Cerchia is being prepared: navigation feels instant instead of frozen. */
export default function Loading() {
  const bar = "animate-pulse rounded-sm bg-paper-3 motion-reduce:animate-none";
  return (
    <main className="grid gap-4 px-4 pb-6 pt-6" aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">…</span>
      <div className={\`\${bar} h-8 w-48\`} />
      <div className={\`\${bar} h-3 w-32\`} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-[72px_1fr] gap-3 rounded-md bg-paper-2 p-4">
          <div className={\`\${bar} aspect-[2/3] w-[72px]\`} />
          <div className="grid content-start gap-2">
            <div className={\`\${bar} h-5 w-3/4\`} />
            <div className={\`\${bar} h-3 w-1/2\`} />
            <div className={\`\${bar} h-3 w-2/3\`} />
          </div>
        </div>
      ))}
    </main>
  );
}
`);
