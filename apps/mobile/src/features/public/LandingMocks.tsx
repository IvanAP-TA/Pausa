// Static pictures of the real app for the landing (hero, "how it works") and the 9:16 card. Plain HTML + CSS classes of
// landing-css.ts: the page has no JavaScript, so nothing here can measure or react. Hidden from assistive tech (the text
// around them says everything they show); none holds a focusable control.
import type { CSSProperties } from "react";
import { useI18n } from "@/i18n";

export const DEMO_FILMS = [
  { key: "spirited", posterPath: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", year: 2001 },
  { key: "matrix", posterPath: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", year: 1999 },
  { key: "shawshank", posterPath: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg", year: 1994 },
  { key: "inception", posterPath: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg", year: 2010 },
] as const;
const CHERNOBYL_POSTER = "/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg";

export const tmdb = (path: string, w: "w185" | "w342" | "w500" = "w342") => `https://image.tmdb.org/t/p/${w}${path}`;
const vars = (o: Record<string, string>) => o as CSSProperties;

export function Pic({ path, w = "w342", size }: { path: string; w?: "w185" | "w342" | "w500"; size?: number }) {
  return (
    <div className="lp-pic" style={size ? { width: size } : undefined}>
      <img src={tmdb(path, w)} alt="" width={200} height={300} loading="lazy" decoding="async" />
    </div>
  );
}

function Av({ name, tint, size = 28 }: { name: string; tint: number; size?: number }) {
  return <span className="lp-av" style={vars({ "--t": `var(--c-tint${tint})`, "--s": `${size}px` })}>{name.slice(0, 1)}</span>;
}

export function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const STAR = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
function StarRow() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24"><path d={STAR} /></svg>
      ))}
    </>
  );
}

export function MockLogCard() {
  const { t } = useI18n();
  return (
    <div aria-hidden="true" className="lp-mock lp-mlog">
      <div className="lp-mwho">
        <Av name="Giulia" tint={4} />
        <strong>{t("landing.mock.who")}</strong>
        <span>{t("landing.mock.action")}</span>
      </div>
      <Pic path={CHERNOBYL_POSTER} />
      <div className="lp-mmeta">
        <p className="lp-title">{t("landing.mock.title")}</p>
        <p className="lp-sm lp-muted">{t("landing.mock.meta")}</p>
        <span className="lp-stars"><span><StarRow /></span><span><StarRow /></span></span>
        <p className="lp-with">
          <span className="lp-sm lp-muted">{t("landing.mock.with")}</span>
          <span className="lp-tag">Marco</span>
          <span className="lp-tag">Sofi</span>
        </p>
      </div>
      <p className="lp-review">{t("landing.mock.review")}</p>
    </div>
  );
}

export function MockMatchup() {
  const { t } = useI18n();
  const [a, b] = [DEMO_FILMS[0], DEMO_FILMS[1]];
  return (
    <div aria-hidden="true" className="lp-mock lp-mmatch">
      <div className="lp-mrow">
        <div style={{ minWidth: 0 }}>
          <p className="lp-title">{t("landing.mock.serataTitle")}</p>
          <p className="lp-sm lp-muted">{t("landing.mock.round")}</p>
        </div>
        <span className="lp-figure lp-tab" style={{ fontSize: "2.074rem" }}>0:24</span>
      </div>
      <div className="lp-segs"><i className="on" /><i className="now" /></div>
      <p className="lp-sm lp-muted">{t("landing.mock.pick")}</p>
      <div className="lp-vs3">
        <div className="lp-mfilm sel"><Pic path={a.posterPath} /><span>{t(`landing.try.films.${a.key}`)}</span></div>
        <span className="lp-vs">vs</span>
        <div className="lp-mfilm"><Pic path={b.posterPath} /><span>{t(`landing.try.films.${b.key}`)}</span></div>
      </div>
      <div className="lp-mpeople">
        <Av name="Giulia" tint={4} size={20} /><Av name="Marco" tint={3} size={20} /><Av name="Sofi" tint={8} size={20} />
        <span style={{ display: "flex", color: "var(--c-ink)", marginLeft: 4 }}><Check /><Check /></span>
      </div>
    </div>
  );
}

export function MockInvite() {
  const { t } = useI18n();
  return (
    <div aria-hidden="true" className="lp-mock lp-minvite">
      <p className="lp-title">{t("landing.mock.invite")}</p>
      <p className="lp-sm lp-muted">{t("landing.mock.inviteExpires")}</p>
      <p className="lp-ink2">{t("landing.mock.inviteCode")}: <strong className="lp-tab" style={{ color: "var(--c-ink)" }}>DIVANO24</strong></p>
      <span className="lp-btn">{t("landing.mock.copy")}</span>
    </div>
  );
}

/** The 9:16 one-sheet, drawn with container-query units so it is the same picture at 130px and at 260px. */
export function Card({ kicker, subtitle, title, posterPath, lines }: { kicker: string; subtitle: string; title: string; posterPath: string; lines: string[] }) {
  const size = title.length > 36 ? "l" : title.length > 18 ? "m" : "";
  return (
    <div className="lp-card">
      <div className="lp-card-in">
        <div className="lp-card-pic"><img src={tmdb(posterPath, "w500")} alt="" width={200} height={300} loading="lazy" decoding="async" /></div>
        <div className="lp-card-body">
          <p className={`lp-card-t ${size}`}>{title}</p>
          <p className="lp-card-sub">{subtitle}</p>
          <div>{[kicker, ...lines].map((l, i) => <p key={i} className="lp-card-row">{l}</p>)}</div>
          <div className="lp-card-foot"><span>pausa.gnagno.org</span><span className="lp-card-bars" aria-hidden="true"><i /><i /></span></div>
        </div>
      </div>
    </div>
  );
}

export function MockResultCard() {
  const { t } = useI18n();
  const f = DEMO_FILMS[0];
  return (
    <div aria-hidden="true">
      <Card kicker={t("landing.mock.cardKicker")} subtitle={t("landing.mock.cardSubtitle")} title={t(`landing.try.films.${f.key}`)} posterPath={f.posterPath} lines={[t("landing.mock.cardLine1"), t("landing.mock.cardLine2")]} />
    </div>
  );
}
