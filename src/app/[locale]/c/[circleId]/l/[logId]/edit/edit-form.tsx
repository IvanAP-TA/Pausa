"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { updateLogAction } from "@/lib/manage-actions";
import { EpisodeFields } from "@/components/episode-fields";
import type { EpisodeLimits } from "@/lib/core/episodes";
import { RatingField } from "@/app/[locale]/c/[circleId]/log/log-form";
import { PersonChip } from "@/components/person-chip";

type Props = {
  logId: string; circleId: string; today: string;
  showSeason: boolean;
  limits: EpisodeLimits | null;
  initial: { season: number | null; episode: number | null; watchedOn: string; rating: number | null; review: string | null; platform: string | null; containsSpoilers: boolean };
  members: { id: string; name: string; image?: string | null }[];
  initialWith: string[];
};

export function EditLogForm({ limits, showSeason, logId, circleId, today, initial, members, initialWith }: Props) {
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

      <RatingField rating={rating} onChange={setRating} label={t("rating")} valueText={rating ? tf("rating", { stars: rating / 2 }) : t("noRating")} emptyText={t("noRating")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">
          {t("watchedOn")}
          <input type="date" name="watchedOn" defaultValue={initial.watchedOn} max={today} required className="field tabular" />
        </label>
        <label className="field-label">
          {t("platform")}
          <input name="platform" maxLength={60} defaultValue={initial.platform ?? ""} className="field" />
        </label>
      </div>

      {showSeason && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-2 text-sm text-ink-2">{t("episodeLogged")}</legend>
          <EpisodeFields limits={limits} seasonName="season" episodeName="logEpisode" defaultSeason={initial.season} defaultEpisode={initial.episode} optionalSeasonLabel={t("seasonLogged")} />
        </fieldset>
      )}

      <label className="field-label">
        {t("review")}
        <textarea name="review" rows={4} maxLength={4000} defaultValue={initial.review ?? ""} className="field" />
      </label>

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="containsSpoilers" defaultChecked={initial.containsSpoilers} className="size-5 shrink-0 accent-accent" />{t("spoilers")}
      </label>

      {members.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm text-ink-2">{t("with")}</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <PersonChip key={m.id} name="watchedWith" value={m.id} user={m} defaultChecked={initialWith.includes(m.id)} />
            ))}
          </div>
        </fieldset>
      )}

      <button className="btn btn-primary w-full sm:w-fit">{te("saveChanges")}</button>
    </form>
  );
}
