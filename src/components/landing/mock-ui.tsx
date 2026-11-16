import { useTranslations } from "next-intl";
import { Avatar } from "@/components/avatar";
import { Poster } from "@/components/poster";
import { SerataCard } from "@/components/serata-card";
import { Stars } from "@/components/stars";
import { CHERNOBYL_POSTER, DEMO_FILMS } from "./demo-data";

/* Static, decorative pictures of the real app, built from the real components. They're hidden from assistive tech
 * (the section text says everything they show) and contain no focusable controls. */

const g = { id: "u-giulia", name: "Giulia" };
const m = { id: "u-marco", name: "Marco" };
const s = { id: "u-sofi", name: "Sofi" };

export function MockLogCard() {
  const t = useTranslations("landing.mock");
  return (
    <div aria-hidden="true" className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-rule bg-paper-2 p-4 text-left shadow-[0_18px_40px_-24px_rgb(0_0_0/.35)]">
      <div className="col-span-full flex items-center gap-2 text-[13px] text-muted">
        <Avatar user={g} />
        <strong className="font-semibold text-ink">{t("who")}</strong>
        <span>{t("action")}</span>
      </div>
      <Poster media={{ id: "chernobyl", title: t("title"), posterPath: CHERNOBYL_POSTER }} size="md" />
      <div className="min-w-0">
        <p className="font-display text-[1.3rem] leading-tight">{t("title")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("meta")}</p>
        <Stars className="mt-1.5" rating={9} label={t("rating")} />
      </div>
      <p className="subtitle col-span-full text-[14px] leading-snug">{t("review")}</p>
      <div className="col-span-full flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{t("with")}</span>
        <span className="rounded-full bg-second px-2.5 py-0.5 text-xs text-on-second">{m.name}</span>
        <span className="rounded-full bg-second px-2.5 py-0.5 text-xs text-on-second">{s.name}</span>
      </div>
    </div>
  );
}

export function MockMatchup() {
  const t = useTranslations("landing.mock");
  const tf = useTranslations("landing.try.films");
  const [a, b] = [DEMO_FILMS[0], DEMO_FILMS[1]];
  return (
    <div aria-hidden="true" className="grid gap-3 rounded-md border border-rule bg-paper-2 p-4 text-left shadow-[0_18px_40px_-24px_rgb(0_0_0/.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl leading-tight">{t("serataTitle")}</p>
          <p className="text-xs text-muted">{t("round")}</p>
        </div>
        <span className="tabular grid size-10 place-items-center rounded-full border-[3px] border-accent text-[11px] font-semibold">0:24</span>
      </div>
      <div className="flex gap-1">
        <i className="h-1 flex-1 rounded-full bg-second" />
        <i className="h-1 flex-1 rounded-full bg-accent" />
      </div>
      <p className="text-xs text-muted">{t("pick")}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <div className="grid gap-1 rounded-sm border-2 border-accent p-0">
          <Poster media={{ id: a.key, title: tf(a.key), posterPath: a.posterPath }} size="md" />
          <span className="px-1 pb-1 text-[11px] font-semibold leading-tight">{tf(a.key)}</span>
        </div>
        <span className="self-center font-display text-xs text-muted">vs</span>
        <div className="grid gap-1 rounded-sm border-2 border-transparent">
          <Poster media={{ id: b.key, title: tf(b.key), posterPath: b.posterPath }} size="md" />
          <span className="px-1 pb-1 text-[11px] font-semibold leading-tight">{tf(b.key)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Avatar user={g} size={20} /><Avatar user={m} size={20} /><Avatar user={s} size={20} />
        <span className="ml-1 text-second-text">✓ ✓</span>
      </div>
    </div>
  );
}

export function MockInvite() {
  const t = useTranslations("landing.mock");
  return (
    <div aria-hidden="true" className="grid gap-3 rounded-md bg-second-deep p-5 text-left text-on-second shadow-[0_18px_40px_-24px_rgb(0_0_0/.45)]">
      <p className="font-display text-xl">{t("invite")}</p>
      <p className="text-sm text-on-second-muted">{t("inviteExpires")}</p>
      <p className="text-sm">{t("inviteCode")}: <span className="tabular font-semibold tracking-[0.16em]">DIVANO24</span></p>
      <span className="w-fit rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent">{t("copy")}</span>
    </div>
  );
}

export function MockResultCard({ className = "" }: { className?: string }) {
  const t = useTranslations("landing.mock");
  const tf = useTranslations("landing.try.films");
  const f = DEMO_FILMS[0];
  return (
    <div aria-hidden="true" className={className}>
      <SerataCard kicker={t("cardKicker")} subtitle={t("cardSubtitle")} title={tf(f.key)} posterPath={f.posterPath} lines={[t("cardLine1"), t("cardLine2")]} />
    </div>
  );
}
