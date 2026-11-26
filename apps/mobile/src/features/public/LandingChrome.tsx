// Header, footer, install help and sticky CTA of the landing: HTML + CSS only (the page has no JavaScript).
import { LOCALES, useI18n, type Locale } from "@/i18n";

const MARK =
  "M0 0h28v28H0zM2.5 3h3v3.5h-3zM2.5 9.25h3v3.5h-3zM2.5 15.5h3v3.5h-3zM2.5 21.5h3v3.5h-3zM22.5 3h3v3.5h-3zM22.5 9.25h3v3.5h-3zM22.5 15.5h3v3.5h-3zM22.5 21.5h3v3.5h-3zM9.5 7h3.5v14H9.5zM15 7h3.5v14H15z";

export function Mark({ height }: { height: string }) {
  return (
    <svg viewBox="0 0 28 28" style={{ height, width: "auto", aspectRatio: "1" }} aria-hidden="true">
      <path d={MARK} fill="var(--c-accent)" fillRule="evenodd" />
    </svg>
  );
}

const icon = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Plus = () => (
  <svg {...icon} width={24} height={24}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
);
const SunMoon = () => (
  <svg {...icon}><path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.3 17.7-1.4 1.4" /><path d="m19.1 4.9-1.4 1.4" /></svg>
);
const Download = () => (
  <svg {...icon} width={18} height={18}><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg>
);

const NAMES: Record<Locale, string> = { it: "Italiano", en: "English", es: "Español" };

export function Header({ locale, signIn }: { locale: Locale; signIn: string }) {
  const { t, href } = useI18n();
  return (
    <header className="lp-header">
      {/* How far down the page the reader is (scroll-driven; absent where the browser cannot do that). */}
      <span className="lp-progress" aria-hidden="true" />
      <div className="lp-wrap lp-bar">
        <a href={href()} className="lp-brand" aria-label={t("app.nav.home")}>
          <Mark height="1.25rem" />
          <span>Pausa</span>
        </a>
        <nav aria-label={t("landing.nav.menu")} className="lp-nav">
          <a href="#how" className="lp-a">{t("landing.nav.how")}</a>
          <a href="#try" className="lp-a">{t("landing.nav.try")}</a>
          <a href="#privacy" className="lp-a">{t("landing.nav.privacy")}</a>
          <a href="#faq" className="lp-a">{t("landing.nav.faq")}</a>
        </nav>
        <div className="lp-tools">
          <ul className="lp-langs" aria-label={t("landing.nav.language")}>
            {LOCALES.map((l) => (
              <li key={l}>
                <a href={`/${l}`} lang={l} className="lp-lang" aria-current={l === locale ? "true" : undefined}>{l}</a>
              </li>
            ))}
          </ul>
          {/* The theme, with no script: a checkbox that `:root:has(:checked)` reads. It lasts for this page only (no cookie). */}
          <label className="lp-theme-btn lp-ctl">
            <input type="checkbox" className="lp-sr lp-theme" />
            <span className="lp-sr">{t("common.theme")}</span>
            <SunMoon />
          </label>
          <a href={signIn} className="lp-a lp-login">{t("landing.nav.login")}</a>
          <a href={signIn} className="lp-btn lp-start">{t("landing.nav.start")}</a>
        </div>
      </div>
    </header>
  );
}

/**
 * "Download the app" with no script: `beforeinstallprompt` cannot be caught, so this is the instructions panel legacy shows
 * where the browser offers no install prompt. Hidden by CSS once the page runs as an installed app.
 */
export function InstallApp({ variant }: { variant: "button" | "link" }) {
  const { t } = useI18n();
  const items = (["ios", "android", "desktop"] as const).map((p) => (
    <li key={p}>
      <strong>{t(`landing.install.${p}.name`)}</strong>
      <span>{t(`landing.install.${p}.steps`)}</span>
    </li>
  ));
  return (
    <details className="lp-install">
      <summary className={variant === "button" ? "lp-btn lp-btn-quiet lp-btn-lg" : "lp-install-link"} style={variant === "button" ? { padding: "0 24px" } : undefined}>
        <Download />
        {t("landing.install.button")}
      </summary>
      <div className="lp-install-panel">
        <p className="lp-title" role="heading" aria-level={2}>{t("landing.install.title")}</p>
        <p className="lp-ink2">{t("landing.install.intro")}</p>
        <ol className="lp-rows">{items}</ol>
      </div>
    </details>
  );
}

export function Footer({ locale }: { locale: Locale }) {
  const { t, href } = useI18n();
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <p className="lp-mast"><Mark height="0.6em" /><span>Pausa</span></p>
        <p className="lp-tagline">{t("landing.footer.tagline")}</p>
        <div className="lp-plate lp-cols">
          <ul className="lp-flist links lp-s4">
            <li><a href={href("/guide")}>{t("landing.footer.guides")}</a></li>
            <li><a href={href("/privacy")}>{t("landing.footer.privacy")}</a></li>
            <li><a href={href("/terms")}>{t("landing.footer.terms")}</a></li>
          </ul>
          <ul className="lp-flist lg lp-s4" aria-label={t("landing.footer.language")}>
            {LOCALES.map((l) => (
              <li key={l}>
                <a href={`/${l}`} lang={l} aria-current={l === locale ? "true" : undefined}>{NAMES[l]}</a>
              </li>
            ))}
          </ul>
          <div className="lp-side lp-s4">
            <InstallApp variant="link" />
            <p className="lp-attr">{t("tmdb.attribution")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** A bottom bar on phones: sticky, shown once the hero has left and until the closing call is in view (see landing-css.ts). */
export function StickyCta({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <div className="lp-cta" role="complementary" aria-label={t("landing.hero.cta")}>
      <a href={href} className="lp-btn lp-btn-primary lp-btn-lg lp-btn-block" style={{ width: "100%" }}>{t("landing.hero.cta")}</a>
    </div>
  );
}
