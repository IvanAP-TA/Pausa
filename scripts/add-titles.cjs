/* One-off: a descriptive <title> for each private page (screen readers announce it on navigation). */
const fs = require("fs");

const pages = [
  ["src/app/[locale]/c/[circleId]/page.tsx", "tabs", "diary"],
  ["src/app/[locale]/c/[circleId]/serata/page.tsx", "tabs", "serata"],
  ["src/app/[locale]/c/[circleId]/lists/page.tsx", "tabs", "lists"],
  ["src/app/[locale]/c/[circleId]/members/page.tsx", "tabs", "circle"],
  ["src/app/[locale]/c/[circleId]/log/page.tsx", "tabs", "log"],
  ["src/app/[locale]/c/[circleId]/l/[logId]/page.tsx", "tabs", "diary"],
  ["src/app/[locale]/c/[circleId]/notifications/page.tsx", "notifications", "title"],
  ["src/app/[locale]/c/[circleId]/insights/page.tsx", "insights", "title"],
  ["src/app/[locale]/account/page.tsx", "account", "title"],
];

for (const [file, ns, key] of pages) {
  let s = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (s.includes("export async function generateMetadata")) continue;
  s = s.replace(/export const metadata = \{ robots: \{ index: false \} \};?\n/, "");
  const fn = `export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "${ns}" });
  return { title: t("${key}"), robots: { index: false } };
}

`;
  const at = s.search(/export default (async )?function/);
  if (at < 0) { console.error("no default export in " + file); continue; }
  s = s.slice(0, at) + fn + s.slice(at);
  if (!/getTranslations[^\n]*from "next-intl\/server"/.test(s)) {
    s = s.replace(/import \{([^}]*)\} from "next-intl\/server";/, (m, g) => `import {${g.includes("getTranslations") ? g : g.replace(/\s*$/, ", getTranslations ")}} from "next-intl/server";`);
  }
  fs.writeFileSync(file, s);
}

// Skip link target and the link itself, in the locale layout.
const lay = "src/app/[locale]/layout.tsx";
let l = fs.readFileSync(lay, "utf8").replace(/\r\n/g, "\n");
if (!l.includes("skip-link")) {
  l = l.replace("<NextIntlClientProvider>{children}</NextIntlClientProvider>",
    `<NextIntlClientProvider>
          <a href="#main" className="skip-link">{skip}</a>
          <div id="main" tabIndex={-1} className="outline-none">{children}</div>
        </NextIntlClientProvider>`);
  l = l.replace("  const theme = parseTheme", "  const skip = ({ it: \"Vai al contenuto\", en: \"Skip to content\", es: \"Saltar al contenido\" } as Record<string, string>)[locale] ?? \"Skip to content\";\n  const theme = parseTheme");
  fs.writeFileSync(lay, l);
}
