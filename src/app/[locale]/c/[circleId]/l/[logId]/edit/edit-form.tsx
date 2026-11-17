"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { updateLogAction } from "@/lib/manage-actions";
import { Stars } from "@/components/stars";

type Props = {
  logId: string; circleId: string; today: string;
  showSeason: boolean;
  initial: { season: number | null; watchedOn: string; rating: number | null; review: string | null; platform: string | null; containsSpoilers: boolean };
  members: { id: string; name: string }[];
  initialWith: string[];
};

export function EditLogForm({ showSeason, logId, circleId, today, initial, members, initialWith }: Props) {
  const t = useTranslations("log");
  const tf = useTranslations("feed");
  const te = useTranslations("manage");
  const locale = useLocale();
  const [rating, setRating] = useState(initial.rating ?? 0);

  return (
    <form action={updateLogAction} className="grid gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="logId" value={logId} />
      <input type="hidden" name="circleId" value={circleId} />
      <input type="hidden" name="rating" value={rating} />

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted">{t("rating")}</legend>
        <div className="flex items-center gap-4">
          <input type="range" min={0} max={10} step={1} value={rating} onChange={(e) => setRating(Number(e.target.value))}
            aria-label={t("rating")} aria-valuetext={rating ? tf("rating", { stars: rating / 2 }) : t("noRating")}
            className="flex-1 accent-[var(--color-accent)]" />
          {rating ? <Stars rating={rating} label={tf("rating", { stars: rating / 2 })} className="text-lg" /> : <span className="text-sm text-muted">{t("noRating")}</span>}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-sm text-muted">
          {t("watchedOn")}
          <input type="date" name="watchedOn" defaultValue={initial.watchedOn} max={today} required className="min-h-12 rounded-sm border border-rule bg-paper-2 px-3 text-ink" />
        </label>
        <label className="grid gap-1.5 text-sm text-muted">
          {t("platform")}
          <input name="platform" maxLength={60} defaultValue={initial.platform ?? ""} className="min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink" />
        </label>
      </div>

      {showSeason && (
        <label className="grid gap-1.5 text-sm text-muted sm:max-w-40">
          {t("seasonLogged")}
          <input type="number" name="season" min={1} max={99} inputMode="numeric" defaultValue={initial.season ?? ""} placeholder={t("wholeShow")} className="tabular min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60" />
        </label>
      )}

      <label className="grid gap-1.5 text-sm text-muted">
        {t("review")}
        <textarea name="review" rows={4} maxLength={4000} defaultValue={initial.review ?? ""} className="rounded-sm border border-rule bg-paper-2 p-3 text-[15px] text-ink" />
      </label>

      <label className="flex min-h-8 items-center gap-3 text-sm">
        <input type="checkbox" name="containsSpoilers" defaultChecked={initial.containsSpoilers} className="size-5 accent-[var(--color-accent)]" />{t("spoilers")}
      </label>

      {members.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm text-muted">{t("with")}</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label key={m.id} className="cursor-pointer">
                <input type="checkbox" name="watchedWith" value={m.id} defaultChecked={initialWith.includes(m.id)} className="peer sr-only" />
                <span className="inline-flex min-h-9 items-center rounded-full border border-rule px-3.5 text-sm text-muted transition-colors peer-checked:border-second peer-checked:bg-second peer-checked:text-on-second peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                  {m.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <button className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover">{te("saveChanges")}</button>
    </form>
  );
}
