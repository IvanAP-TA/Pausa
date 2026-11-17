/* One-off: QR code on the public Card page and image, "people you brought" on the account page. */
const fs = require("fs");
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 80)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
};

edit("src/app/[locale]/s/[code]/card/page.tsx", [
  ['import { TmdbAttribution } from "@/components/tmdb-attribution";', 'import { TmdbAttribution } from "@/components/tmdb-attribution";\nimport { qrDataUri } from "@/lib/qr";\nimport { siteUrl } from "@/lib/site";'],
  ['      <TmdbAttribution />\n    </main>', `      <figure className="mx-auto grid justify-items-center gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI */}
        <img src={qrDataUri(\`\${siteUrl()}/\${locale}?utm_source=card\`)} alt={t("qrAlt")} width={112} height={112} className="rounded-sm border border-rule" />
        <figcaption className="text-xs text-muted">{t("qr")}</figcaption>
      </figure>
      <TmdbAttribution />
    </main>`],
]);

edit("src/app/api/serata/[code]/card/route.tsx", [
  ['import { loadGoogleFont } from "@/lib/og-font";', 'import { loadGoogleFont } from "@/lib/og-font";\nimport { qrDataUri } from "@/lib/qr";\nimport { siteUrl } from "@/lib/site";'],
  [`      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: og ? 10 : "auto", fontSize: og ? 18 : 28, color: C.muted }}>
        <span>pausa.gnagno.org</span>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: og ? 8 : 12, height: og ? 24 : 36, background: C.accent, borderRadius: 3 }} />
          <div style={{ width: og ? 8 : 12, height: og ? 24 : 36, background: C.accent, borderRadius: 3 }} />
        </div>
      </div>`,
   `      <div style={{ display: "flex", alignItems: "center", justifyContent: og ? "flex-start" : "space-between", width: og ? undefined : "100%", gap: 18, marginTop: og ? 10 : "auto", fontSize: og ? 18 : 28, color: C.muted }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span>pausa.gnagno.org</span>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: og ? 8 : 12, height: og ? 24 : 36, background: C.accent, borderRadius: 3 }} />
            <div style={{ width: og ? 8 : 12, height: og ? 24 : 36, background: C.accent, borderRadius: 3 }} />
          </div>
        </div>
        {!og && (
          // A scan opens Pausa's landing: the Card is the one thing meant to leave the app, so it carries the way in.
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
          <img src={qrDataUri(\`\${siteUrl()}/\${locale}?utm_source=card\`, { dark: C.ink, light: C.paper })} width={150} height={150} alt="" />
        )}
      </div>`],
]);

edit("src/app/[locale]/account/page.tsx", [
  ['import { regionProviders, tmdbEnabled } from "@/lib/tmdb";', 'import { regionProviders, tmdbEnabled } from "@/lib/tmdb";\nimport { FOUNDER_AT, peopleBrought } from "@/lib/core/circles";'],
  ['  const [circles, t, td, mineByUser] = await Promise.all([', '  const [circles, t, td, mineByUser, brought] = await Promise.all(['],
  ['    getDb().then((db) => getUserProviders(db, [user.id])),\n  ]);', '    getDb().then((db) => getUserProviders(db, [user.id])),\n    getDb().then((db) => peopleBrought(db, user.id)),\n  ]);'],
  ['      <LogoutButton', '      {brought > 0 && (\n        <p className="flex flex-wrap items-center gap-2 rounded-md bg-paper-2 p-3 text-sm">\n          {t("brought", { count: brought })}\n          {brought >= FOUNDER_AT && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">{t("founder")}</span>}\n        </p>\n      )}\n\n      <LogoutButton'],
]);

fs.writeFileSync("scripts/messages-batch14.json", JSON.stringify({
  it: { account: { brought: "{count, plural, one {Hai portato una persona in Pausa.} other {Hai portato # persone in Pausa.}}", founder: "Fondatore" }, serata: { result: { qr: "Inquadra per fare la tua Serata", qrAlt: "Codice QR che apre Pausa" } } },
  en: { account: { brought: "{count, plural, one {You brought one person to Pausa.} other {You brought # people to Pausa.}}", founder: "Founder" }, serata: { result: { qr: "Scan to run your own Serata", qrAlt: "QR code that opens Pausa" } } },
  es: { account: { brought: "{count, plural, one {Has traído a una persona a Pausa.} other {Has traído a # personas a Pausa.}}", founder: "Fundador" }, serata: { result: { qr: "Escanea para hacer tu propia Serata", qrAlt: "Código QR que abre Pausa" } } },
}));
