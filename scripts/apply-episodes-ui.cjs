/* One-off: wires season/episode into the forms, the feed and the log card. */
const fs = require("fs");
const root = "src/";
const rep = (p, pairs) => {
  let s = fs.readFileSync(root + p, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("MISSING in " + p + ": " + a.slice(0, 70)); continue; }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(root + p, s);
};

const input = (extra) => `<input type="number" name="season" min={1} max={99} inputMode="numeric" ${extra} className="tabular min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60" />`;

rep("app/[locale]/c/[circleId]/log/log-form.tsx", [
  [`        <label className="grid gap-1.5 text-sm text-muted">
          {t("progress")}
          <input name="progress" maxLength={20} placeholder={t("progressPlaceholder")}
            className="tabular min-h-12 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60" />
        </label>`,
  `        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm text-muted">{t("progress")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm text-muted">
              {t("season")}
              <input type="number" name="season" min={1} max={99} inputMode="numeric" disabled={picked.kind === "movie"} placeholder={picked.kind === "anime" ? "–" : "1"}
                className="tabular min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60 disabled:opacity-40" />
            </label>
            <label className="grid gap-1.5 text-sm text-muted">
              {t("episode")}
              <input type="number" name="episode" min={1} max={9999} inputMode="numeric" placeholder="1"
                className="tabular min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-3 text-ink placeholder:text-muted/60" />
            </label>
          </div>
        </fieldset>`],
  [`      <label className="grid gap-1.5 text-sm text-muted">
        {t("review")}`,
  `      {picked.kind !== "movie" && (
        <label className="grid gap-1.5 text-sm text-muted sm:max-w-40">
          {t("seasonLogged")}
          ${input('placeholder={t("wholeShow")}')}
        </label>
      )}

      <label className="grid gap-1.5 text-sm text-muted">
        {t("review")}`],
]);

