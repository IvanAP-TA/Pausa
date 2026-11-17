/* One-off: profile link + logout in the sidebar, feed header and account page. */
const fs = require("fs");
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 70)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(p, s);
};

edit("src/components/tab-bar.tsx", [
  ['export function TabBar({ circleId }: { circleId: string }) {', 'export function TabBar({ circleId, me }: { circleId: string; me: { id: string; name: string; image?: string | null } }) {'],
  ['  const t = useTranslations("tabs");', '  const t = useTranslations("tabs");\n  const ta = useTranslations("account");'],
  ['      {tab("circle", `${base}/members`)}\n    </nav>', `      {tab("circle", \`\${base}/members\`)}
      {/* Desktop only: who you are, and the way out. On phones the same lives in the Cerchia tab and the diary header. */}
      <div className="hidden lg:mt-auto lg:grid lg:gap-1 lg:border-t lg:border-rule lg:pt-4">
        <Link href="/account" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-paper-2">
          <Avatar user={me} size={28} />
          <span className="min-w-0"><span className="block truncate font-semibold">{me.name}</span><span className="block text-xs text-muted">{ta("profile")}</span></span>
        </Link>
        <LogoutButton className="flex min-h-11 items-center rounded-md px-3 text-left text-sm text-muted hover:bg-paper-2 hover:text-ink" />
      </div>
    </nav>`],
  ['import { Link, usePathname } from "@/i18n/navigation";', 'import { Link, usePathname } from "@/i18n/navigation";\nimport { Avatar } from "./avatar";\nimport { LogoutButton } from "./logout-button";'],
]);

edit("src/app/[locale]/c/[circleId]/layout.tsx", [
  ["<TabBar circleId={circleId} />", "<TabBar circleId={circleId} me={{ id: user.id, name: user.name, image: user.image }} />"],
]);

edit("src/app/[locale]/c/[circleId]/page.tsx", [
  [`          <Link
            href={\`/c/\${circleId}/notifications\`}`, `          <Link href="/account" aria-label={tr("profile")} className="grid size-11 place-items-center rounded-full hover:bg-paper-2 lg:hidden">
            <Avatar user={{ id: user.id, name: user.name, image: user.image }} size={30} />
          </Link>
          <Link
            href={\`/c/\${circleId}/notifications\`}`],
]);

edit("src/app/[locale]/account/page.tsx", [
  ['import { Link } from "@/i18n/navigation";', 'import { Link } from "@/i18n/navigation";\nimport { LogoutButton } from "@/components/logout-button";'],
  ['      <form action={updateProfileAction} className="grid gap-3">', '      <LogoutButton className="min-h-11 w-fit rounded-full border border-rule px-5 text-sm font-semibold hover:bg-paper-2" />\n\n      <form action={updateProfileAction} className="grid gap-3">'],
]);

fs.writeFileSync("scripts/messages-batch7.json", JSON.stringify({
  it: { account: { logout: "Esci", loggingOut: "Esco…", profile: "Il tuo profilo" } },
  en: { account: { logout: "Log out", loggingOut: "Logging out…", profile: "Your profile" } },
  es: { account: { logout: "Cerrar sesión", loggingOut: "Saliendo…", profile: "Tu perfil" } },
}));
