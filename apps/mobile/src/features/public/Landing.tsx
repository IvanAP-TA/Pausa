// The landing, complete as static HTML: the Serata demo, FAQ, install help, progress line, reveal, how-it-works crossfade and
// sticky CTA are CSS or native HTML (see landing-css.ts). One small script, /public/public.js, adds what HTML cannot: the saved
// theme, the move to /home for someone signed in, the Google button, smooth scrolling (Lenis) and parallax.
import type { CSSProperties } from "react";
import { Platform } from "react-native";
import { useI18n, type Locale } from "@/i18n";
import { SITE_URL, publicUrl } from "@/seo/site";
import { JsonLd, orgNode, websiteNode } from "@/seo/jsonld";
import { Footer, Header, InstallApp, Plus, StickyCta } from "./LandingChrome";
import { MockInvite, MockLogCard, MockMatchup, MockResultCard } from "./LandingMocks";
import { LANDING_CSS } from "./landing-css";
import { PublicPage } from "./PublicPage";
import { TryDemo } from "./TryDemo";

type Step = { title: string; body: string };
type Faq = { q: string; a: string };
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** The landing's structured data: the four nodes of INVENTORY 1.3 (Organization, WebSite, WebApplication, FAQPage). */
export function landingNodes(locale: Locale, description: string, faq: Faq[]) {
  const url = publicUrl(locale);
  return [
    orgNode(),
    websiteNode(),
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Pausa",
      url,
      description,
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Any",
      inLanguage: ["it", "en", "es"],
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
}

export function LandingBody({ locale }: { locale: Locale }) {
  const { t, raw, href } = useI18n();
  if (Platform.OS !== "web") return null; // public pages exist only as static HTML
  const signIn = href("/sign-in");
  const steps = raw<Step[]>("landing.how.steps");
  const features = raw<Step[]>("landing.features.items");
  const guestSteps = raw<string[]>("landing.guest.steps");
  const privacy = raw<Step[]>("landing.privacy.items");
  const faq = raw<Faq[]>("landing.faq.items");
  const visuals = [<MockInvite key="1" />, <MockLogCard key="2" />, <MockMatchup key="3" />];
  return (
    <div className="lp lp-root" data-landing data-locale={locale}>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <JsonLd nodes={landingNodes(locale, t("landing.meta.description"), faq)} />
      <Header locale={locale} signIn={signIn} />

      <main id="main">
        {/* hero: the headline, one sentence, the actions; the app's own plates beside it */}
        <section id="hero" className="lp-hero lp-sec" aria-labelledby="hero-title">
          <div className="lp-wrap lp-cols lp-hero-grid">
            <div className="lp-min0 lp-s8" data-scrub="leave">
              <h1 id="hero-title" className="lp-rise" style={delay(40)}>{t("landing.hero.title")}</h1>
              <p className="lp-rise lp-lead" style={{ ...delay(120), marginTop: 20, maxWidth: "62ch" }}>{t("landing.hero.lede")}</p>
              <div className="lp-rise lp-hero-actions" style={delay(200)}>
                <a href={signIn} className="lp-btn lp-btn-primary lp-btn-lg lp-btn-block">{t("landing.hero.cta")}</a>
                {/* Shown by /public.js when Google sign-in is on and the browser can use it (not an in-app browser). */}
                <a href={`/api/auth/google/start?${new URLSearchParams({ next: `/${locale}/home`, locale })}`} className="lp-btn lp-btn-lg lp-btn-block lp-google" data-google hidden>
                  <GoogleG />
                  {t("auth.google")}
                </a>
                <InstallApp variant="button" />
              </div>
              <p className="lp-rise lp-note" style={delay(280)}>{t("landing.hero.note")}</p>
            </div>
            <div className="lp-rise lp-min0 lp-s4" style={delay(160)} aria-hidden="true">
              <div data-speed="0.04">
                <MockLogCard />
                <div className="lp-mhead">
                  <MockMatchup />
                  <div className="lp-mres"><MockResultCard /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* problem: a statement on a grained well */}
        <section className="lp-well lp-grained lp-problem" aria-labelledby="problem">
          <div className="lp-wrap" data-reveal>
            <h2 id="problem" className="lp-head" style={{ maxWidth: "68rem" }}>{t("landing.problem.title")}</h2>
            <div className="lp-cols">
              <p className="lp-lead lp-s6 lp-st7">{t("landing.problem.body")}</p>
            </div>
          </div>
        </section>

        {/* how it works: a pinned plate beside the three steps (crossfade driven by scroll where the browser can) */}
        <section id="how" className="lp-how lp-sec" aria-labelledby="how-title">
          <div className="lp-wrap">
            <h2 id="how-title" className="lp-head" data-reveal style={{ maxWidth: "60rem" }}>{t("landing.how.title")}</h2>
            <div className="lp-how-grid">
              <ol className="lp-how-steps">
                {steps.map((s, i) => (
                  <li key={i} className={`lp-step lp-k${i + 1}`}>
                    <div className="lp-step-row" data-reveal>
                      <span aria-hidden="true" className="lp-figure lp-poster">{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <h3 className="lp-title">{s.title}</h3>
                        <p>{s.body}</p>
                      </div>
                    </div>
                    <div className="lp-step-vis" aria-hidden="true">{visuals[i]}</div>
                  </li>
                ))}
              </ol>
              <div className="lp-how-side" aria-hidden="true">
                <div className="lp-how-pin">
                  {visuals.map((v, i) => (
                    <div key={i} className={`lp-how-vis lp-v${i + 1}`}><div>{v}</div></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* features: a collector's sheet, rows under full-width hairlines */}
        <section className="lp-features" aria-labelledby="features">
          <div className="lp-wrap">
            <h2 id="features" className="lp-head" data-reveal style={{ maxWidth: "60rem" }}>{t("landing.features.title")}</h2>
            <ul className="lp-rows">
              {features.map((f, i) => (
                <li key={i} data-reveal>
                  <h3 className="lp-title">{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* try it: the head beside the working Serata, on a well */}
        <section id="try" className="lp-well lp-try lp-sec" aria-labelledby="try-title">
          <div className="lp-wrap lp-cols">
            <div className="lp-min0 lp-s5" data-reveal>
              <h2 id="try-title" className="lp-head">{t("landing.try.title")}</h2>
              <p className="lp-lead" style={{ marginTop: 24, maxWidth: "44ch" }}>{t("landing.try.body")}</p>
            </div>
            <div className="lp-min0 lp-s6 lp-st7" data-reveal>
              <TryDemo ctaHref={signIn} />
            </div>
          </div>
        </section>

        {/* guests: a contact strip, numerals parted by vertical hairlines */}
        <section className="lp-guest" aria-labelledby="guest">
          <div className="lp-wrap">
            <div className="lp-cols">
              <h2 id="guest" className="lp-head lp-s7" data-reveal>{t("landing.guest.title")}</h2>
              <p className="lp-lead lp-s4 lp-st9" data-reveal>{t("landing.guest.body")}</p>
            </div>
            <ol>
              {guestSteps.map((s, i) => (
                <li key={i} data-reveal>
                  <span aria-hidden="true" className="lp-figure lp-poster">{i + 1}</span>
                  <span className="lp-title">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* privacy: the head held on the left, the facts as rows */}
        <section id="privacy" className="lp-privacy lp-sec" aria-labelledby="privacy-title">
          <div className="lp-wrap lp-cols">
            <h2 id="privacy-title" className="lp-head lp-privacy-head lp-s4" data-reveal>{t("landing.privacy.title")}</h2>
            <ul className="lp-rows lp-s7 lp-st6">
              {privacy.map((p, i) => (
                <li key={i} data-reveal>
                  <h3 className="lp-title">{p.title}</h3>
                  <p>{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ: hairline rows, a plus that turns */}
        <section id="faq" className="lp-faq lp-sec" aria-labelledby="faq-title">
          <div className="lp-wrap">
            <h2 id="faq-title" className="lp-head" data-reveal>{t("landing.faq.title")}</h2>
            <div className="lp-rows" data-reveal>
              {faq.map((f, i) => (
                <details key={i}>
                  <summary>
                    <span className="lp-title">{f.q}</span>
                    <Plus />
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* final call: a grained well, the one amber control */}
        <section id="final" className="lp-well lp-grained lp-final" aria-labelledby="final-title">
          <div className="lp-wrap lp-cols" data-reveal>
            <h2 id="final-title" className="lp-head lp-s8" data-scrub="arrive" style={{ transformOrigin: "left" }}>{t("landing.final.title")}</h2>
            <div className="lp-final-side lp-s4">
              <p className="lp-lead">{t("landing.final.body")}</p>
              <a href={signIn} className="lp-btn lp-btn-primary lp-btn-lg lp-btn-block">{t("landing.hero.cta")}</a>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />
      <StickyCta href={signIn} />
    </div>
  );
}

/** Google's "G" in its own colours (Google's sign-in guidelines), as `GoogleMark` draws it in the app. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.2a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.7 1.8l3.5-3.5A12 12 0 0 0 1.2 6.6l4 3.1c1-2.9 3.6-4.9 6.8-4.9z" />
    </svg>
  );
}

export function Landing({ locale }: { locale: Locale }) {
  return (
    <PublicPage locale={locale} ownLandmarks>
      <LandingBody locale={locale} />
    </PublicPage>
  );
}
