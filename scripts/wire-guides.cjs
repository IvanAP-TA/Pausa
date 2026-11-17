/* One-off: guide strings, sitemap entries, footer link and messages. */
const fs = require("fs");

fs.appendFileSync("src/lib/guides.ts", `
export const guideStrings: Record<Locale, { index: string; indexTitle: string; indexLede: string; read: string; try: string; updated: string; back: string }> = {
  it: { index: "Guide", indexTitle: "Guide per scegliere cosa guardare insieme", indexLede: "Metodi pratici per decidere in gruppo, senza litigare e senza perdere la serata.", read: "Leggi la guida", try: "Prova una Serata", updated: "Aggiornato", back: "Tutte le guide" },
  en: { index: "Guides", indexTitle: "Guides to picking what to watch together", indexLede: "Practical ways to decide as a group, without arguing and without losing the evening.", read: "Read the guide", try: "Try a Serata", updated: "Updated", back: "All guides" },
  es: { index: "Guías", indexTitle: "Guías para elegir qué ver juntos", indexLede: "Métodos prácticos para decidir en grupo, sin discutir y sin perder la noche.", read: "Leer la guía", try: "Probar una Serata", updated: "Actualizado", back: "Todas las guías" },
};
`);

let m = fs.readFileSync("src/app/sitemap.ts", "utf8");
m = m.replace('    ...page("/privacy", () => 0.3),', '    ...page("/guide", () => 0.7),\n    ...GUIDE_SLUGS.flatMap((slug) => page("/guide/" + slug, () => 0.8)),\n    ...page("/privacy", () => 0.3),');
m = m.replace('import { siteUrl } from "@/lib/site";', 'import { siteUrl } from "@/lib/site";\nimport { GUIDE_SLUGS } from "@/lib/guides";');
fs.writeFileSync("src/app/sitemap.ts", m);

let l = fs.readFileSync("src/components/landing/landing.tsx", "utf8");
l = l.replace('            <li><Link href="/privacy"', '            <li><Link href="/guide" className="inline-flex min-h-10 items-center underline-offset-4 hover:text-ink hover:underline">{t("footer.guides")}</Link></li>\n            <li><Link href="/privacy"');
fs.writeFileSync("src/components/landing/landing.tsx", l);

fs.writeFileSync("scripts/messages-batch6.json", JSON.stringify({
  it: { landing: { footer: { guides: "Guide" } } },
  en: { landing: { footer: { guides: "Guides" } } },
  es: { landing: { footer: { guides: "Guías" } } },
}));
