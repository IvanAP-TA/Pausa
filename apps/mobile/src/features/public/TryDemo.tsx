// "Prova una Serata" with no JavaScript: a real, tiny Serata (4 titles, 2 matches, a final). The state is which radios are
// checked; landing-css.ts shows the panel that matches (`:has()`), and "Ricomincia" is a form reset. Choosing is pressing a poster.
import { useI18n } from "@/i18n";
import { Card, DEMO_FILMS, Pic } from "./LandingMocks";

type Film = (typeof DEMO_FILMS)[number] & { id: (typeof LETTER)[number]; title: string };
const LETTER = ["a", "b", "c", "d"] as const;

function Segs({ stage }: { stage: 0 | 1 | 2 }) {
  return (
    <div className="lp-segs" aria-hidden="true">
      {[0, 1, 2].map((i) => <i key={i} className={i < stage ? "on" : i === stage ? "now" : ""} />)}
    </div>
  );
}

export function TryDemo({ ctaHref }: { ctaHref: string }) {
  const { t } = useI18n();
  const films = DEMO_FILMS.map((f, i) => ({ ...f, id: LETTER[i], title: t(`landing.try.films.${f.key}`) }));
  const progress = (n: number) => t("landing.try.progress", { n });

  const pick = (f: Film, name: string, cls: string, extra = "") => (
    <label key={`${name}-${f.id}`} className={`lp-pick ${extra}`}>
      <input type="radio" name={name} value={f.id} className={`lp-sr ${cls}`} />
      <Pic path={f.posterPath} />
      <span>
        <b>{f.title}</b>
        <small>{f.year}</small>
      </span>
    </label>
  );
  const pair = (a: Film, b: Film, name: string, cls: (f: Film) => string, extra: (f: Film) => string = () => "") => (
    <div className="lp-pair">
      {pick(a, name, cls(a), extra(a))}
      <span className="lp-vs" aria-hidden="true">{t("landing.try.vs")}</span>
      {pick(b, name, cls(b), extra(b))}
    </div>
  );
  const head = (round: string, n: number) => (
    <>
      <legend>
        <span className="lp-prog">
          <span className="lp-title">{round}</span>
          <span className="lp-sm lp-muted lp-tab">{progress(n)}</span>
        </span>
      </legend>
      <Segs stage={(n - 1) as 0 | 1 | 2} />
      <p className="lp-sm lp-ink2">{t("landing.try.pick")}</p>
    </>
  );

  return (
    <form className="lp-try-form" aria-live="polite">
      <fieldset className="lp-p1">
        {head(t("landing.try.rounds.first"), 1)}
        {pair(films[0], films[1], "g1", (f) => `lp-g1 lp-g1-${f.id}`)}
      </fieldset>
      <fieldset className="lp-p2">
        {head(t("landing.try.rounds.second"), 2)}
        {pair(films[2], films[3], "g2", (f) => `lp-g2 lp-g2-${f.id}`)}
      </fieldset>
      <fieldset className="lp-p3">
        {head(t("landing.try.rounds.final"), 3)}
        <div className="lp-pair lp-pair-final" data-vs={t("landing.try.vs")}>
          {films.map((f) => pick(f, "f", `lp-f lp-f-${f.id}`, `lp-fo lp-fo-${f.id}`))}
        </div>
      </fieldset>
      <div className="lp-res">
        {films.map((f) => (
          <div key={f.id} className={`lp-res-card lp-c lp-c-${f.id}`}>
            <Card
              kicker={t("landing.mock.cardKicker")}
              subtitle={t("landing.mock.cardSubtitle")}
              title={f.title}
              posterPath={f.posterPath}
              lines={[t("landing.try.cardLine1"), t("landing.try.cardLine2")]}
            />
          </div>
        ))}
        <div className="lp-res-actions">
          <a href={ctaHref} className="lp-btn lp-btn-primary">{t("landing.try.cta")}</a>
          <button type="reset" className="lp-btn lp-btn-quiet">{t("landing.try.again")}</button>
        </div>
      </div>
    </form>
  );
}
