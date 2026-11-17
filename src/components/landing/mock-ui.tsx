import { useTranslations } from "next-intl";
import { Avatar } from "@/components/avatar";
import { Poster } from "@/components/poster";
import { SerataCard } from "@/components/serata-card";
import { Stars } from "@/components/stars";
import { CHERNOBYL_POSTER, DEMO_FILMS } from "./demo-data";
import { Check } from "lucide-react";

/* Static, decorative pictures of the real app, built from the real components. They're hidden from assistive tech
 * (the section text says everything they show) and contain no focusable controls.
 * They are set the way the app sets them: a plate under a hairline, the poster as a print, the title in display capitals. */

const g = { id: "u-giulia", name: "Giulia" };
const m = { id: "u-marco", name: "Marco" };
const s = { id: "u-sofi", name: "Sofi" };

const tick = (
  <Check size={16} strokeWidth={1.6} aria-hidden="true" />
);

export function MockLogCard({ className = "" }: { className?: string }) {
  const t = useTranslations("landing.mock");
  return (
    <div aria-hidden="true" className={`plate grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-3 py-4 text-left ${className}`}>
      <div className="col-span-full flex items-center gap-2 text-sm text-muted">
        <Avatar user={g} />
        <strong className="text-ink">{t("who")}</strong>
        <span>{t("action")}</span>
      </div>
      <Poster media={{ id: "chernobyl", title: t("title"), posterPath: CHERNOBYL_POSTER }} size="md" />
      <div className="grid min-w-0 content-start gap-1.5">
        <p className="title">{t("title")}</p>
        <p className="text-sm text-muted">{t("meta")}</p>
        <Stars className="mt-1" rating={9} label={t("rating")} />
        <p className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted">{t("with")}</span>
          <span className="tag">{m.name}</span>
          <span className="tag">{s.name}</span>
        </p>
      </div>
      <p className="subtitle col-span-full">{t("review")}</p>
    </div>
  );
}

export function MockMatchup({ className = "" }: { className?: string }) {
  const t = useTranslations("landing.mock");
  const tf = useTranslations("landing.try.films");
  const [a, b] = [DEMO_FILMS[0], DEMO_FILMS[1]];
  return (
    <div aria-hidden="true" className={`plate grid content-start gap-3 py-4 text-left ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="title text-2xl">{t("serataTitle")}</p>
          <p className="text-sm text-muted">{t("round")}</p>
        </div>
        <span className="figure text-3xl">0:24</span>
      </div>
      <div className="flex gap-1">
        <i className="h-0.5 flex-1 bg-ink" />
        <i className="h-0.5 flex-1 bg-accent" />
      </div>
      <p className="text-sm text-muted">{t("pick")}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <div className="grid gap-1.5 border-2 border-accent">
          <Poster media={{ id: a.key, title: tf(a.key), posterPath: a.posterPath }} size="md" />
          <span className="px-1 pb-1 text-sm font-semibold leading-tight">{tf(a.key)}</span>
        </div>
        <span className="self-center font-display text-lg text-muted">vs</span>
        <div className="grid gap-1.5 border-2 border-transparent">
          <Poster media={{ id: b.key, title: tf(b.key), posterPath: b.posterPath }} size="md" />
          <span className="px-1 pb-1 text-sm font-semibold leading-tight">{tf(b.key)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-muted">
        <Avatar user={g} size={20} /><Avatar user={m} size={20} /><Avatar user={s} size={20} />
        <span className="ml-1 flex text-ink">{tick}{tick}</span>
      </div>
    </div>
  );
}

export function MockInvite() {
  const t = useTranslations("landing.mock");
  return (
    <div aria-hidden="true" className="well grid gap-3 p-6 text-left">
      <p className="title">{t("invite")}</p>
      <p className="text-sm text-muted">{t("inviteExpires")}</p>
      <p className="text-ink-2">{t("inviteCode")}: <span className="tabular font-semibold text-ink">DIVANO24</span></p>
      <span className="btn mt-2 w-fit">{t("copy")}</span>
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
