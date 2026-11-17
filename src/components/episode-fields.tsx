"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeLimits } from "@/lib/core/episodes";

const input = "field tabular";

/**
 * Season and episode inputs. When the counts of the title are known the season is a menu and the episode input stops at the
 * season's last episode; when they are not, both are plain numbers (1..99 and 1..9999), exactly as before.
 * `seasonName` / `episodeName` are the form field names (the watching form and the log form use different ones).
 */
export function EpisodeFields({ limits, seasonName, episodeName, defaultSeason = null, defaultEpisode = null, disabled = false, optionalSeasonLabel }: {
  limits: EpisodeLimits | null | undefined; seasonName: string; episodeName: string;
  defaultSeason?: number | null; defaultEpisode?: number | null; disabled?: boolean; optionalSeasonLabel?: string;
}) {
  const t = useTranslations("log");
  const [season, setSeason] = useState<string>(defaultSeason ? String(defaultSeason) : "");
  const seasons = limits?.seasons ?? [];
  const chosen = season ? Number(season) : null;
  const maxEpisode = chosen !== null && seasons.length ? seasons.find((s) => s.season === chosen)?.episodes : seasons.length ? undefined : limits?.total ?? undefined;

  return (
    <div className="grid grid-cols-2 items-end gap-3">
      <label className="field-label">
        {optionalSeasonLabel ?? t("season")}
        {seasons.length > 0 ? (
          <select name={seasonName} value={season} onChange={(e) => setSeason(e.target.value)} disabled={disabled} className={input}>
            <option value="">{t("wholeShow")}</option>
            {seasons.map((s) => <option key={s.season} value={s.season}>{t("seasonOf", { n: s.season, count: s.episodes })}</option>)}
          </select>
        ) : (
          <input type="number" name={seasonName} min={1} max={99} inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value)} disabled={disabled} placeholder="1" className={input} />
        )}
      </label>
      <label className="field-label">
        {t("episode")}
        <input type="number" name={episodeName} min={1} max={maxEpisode ?? 9999} inputMode="numeric" defaultValue={defaultEpisode ?? ""} placeholder={maxEpisode ? `1 / ${maxEpisode}` : "1"} disabled={disabled} className={input} />
      </label>
    </div>
  );
}
