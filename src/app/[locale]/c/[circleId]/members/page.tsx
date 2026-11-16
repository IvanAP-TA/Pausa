import { cookies, headers } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getMembers } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import { CopyInvite } from "./copy-invite";
import { AccountControls } from "./account-controls";

export default async function Members({ params }: PageProps<"/[locale]/c/[circleId]/members">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circle, members, t] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getMembers(circleId),
    getTranslations("circle"),
  ]);

  const h = await headers();
  const origin = process.env.BETTER_AUTH_URL ?? `https://${h.get("host")}`;
  const inviteUrl = `${origin}/${locale}/join/${circle!.inviteCode}`;

  return (
    <main className="grid gap-8 px-4 pb-8 pt-6">
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{circle!.name}</h1>

      <section className="grid gap-3 rounded-md bg-second-deep p-4 text-on-second">
        <h2 className="font-display text-lg font-semibold">{t("inviteTitle")}</h2>
        <p className="text-sm text-on-second-muted">{t("inviteBody")}</p>
        <p className="text-sm">
          {t("code")}: <span className="tabular font-semibold tracking-widest">{circle!.inviteCode}</span>
        </p>
        <CopyInvite url={inviteUrl} />
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm text-muted">{t("members")} · {members.length}</h2>
        <ul className="grid gap-1">
          {members.map((m) => (
            <li key={m.id} className="flex min-h-12 items-center gap-3 border-b border-rule">
              <Avatar user={m} size={32} />
              <span className="font-semibold">{m.name}</span>
              {m.role === "admin" && <span className="ml-auto rounded-full border border-rule px-2 text-[11px] text-muted">{t("admin")}</span>}
            </li>
          ))}
        </ul>
      </section>

      <AccountControls initialTheme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />
      <TmdbAttribution />
    </main>
  );
}
