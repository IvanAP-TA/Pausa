/* One-off: render the slow "For you" list in a Suspense boundary so the rest of Insights does not wait for TMDB. */
const fs = require("fs");
const p = "src/app/[locale]/c/[circleId]/insights/page.tsx";
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf('        {!mine.enabled ? (');
const end = s.indexOf('        <p className="text-xs text-muted">{tf("credit")}</p>');
if (start < 0 || end < 0) throw new Error("markers not found");
const body = s.slice(start, end);
s = s.slice(0, start) + '        <Suspense fallback={<p role="status" className="text-sm text-muted">{tf("loading")}</p>}>\n          <ForYou userId={user.id} locale={locale} circleId={circleId} />\n        </Suspense>\n' + s.slice(end);

s = s.replace("tc, tf, mine, format] = await Promise.all([", "tc, tf, format] = await Promise.all([");
s = s.replace("    personalPicks(user.id, locale),\n", "");
s = s.replace('import { personalPicks } from "@/lib/discover";', 'import { Suspense } from "react";\nimport { personalPicks } from "@/lib/discover";');

const component = `
/** TMDB-backed and slow: streamed in after the rest of the page. */
async function ForYou({ userId, locale, circleId }: { userId: string; locale: string; circleId: string }) {
  const [mine, tf, tk, format] = await Promise.all([personalPicks(userId, locale), getTranslations("discover"), getTranslations("kind"), getFormatter()]);
  const list = (names: string[]) => format.list(names, { type: "conjunction" });
  return (
    <>
${body.replace(/^/gm, "  ").replace(/^ {2}$/gm, "")}    </>
  );
}
`;
s += component;
fs.writeFileSync(p, s);

const msgs = {
  it: { discover: { loading: "Cerco idee per te…" } },
  en: { discover: { loading: "Looking for ideas for you…" } },
  es: { discover: { loading: "Buscando ideas para ti…" } },
};
fs.writeFileSync("scripts/messages-batch8.json", JSON.stringify(msgs));
