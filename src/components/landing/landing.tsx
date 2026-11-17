import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import { DEMO_FILMS } from "./demo-data";
import { HowItWorks } from "./how-it-works";
import { MockInvite, MockLogCard, MockMatchup, MockResultCard } from "./mock-ui";
import { RevealOnScroll } from "./reveal";
import { SmoothScroll } from "./smooth-scroll";
import { InstallApp } from "./install-app";
import { GoogleButton } from "@/components/google-button";
import { googleEnabled } from "@/lib/auth";
import { StickyCta } from "./sticky-cta";
import { TrySerata } from "./try-serata";

type Item = { title: string; body: string };
type Faq = { q: string; a: string };

const btnPrimary = "inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-7 text-[17px] font-semibold text-on-accent transition-[background-color,transform] duration-200 hover:bg-accent-hover active:translate-y-px";
const btnGhost = "inline-flex min-h-12 items-center justify-center rounded-full border border-rule px-6 text-[17px] font-semibold transition-colors duration-200 hover:border-muted";
const section = "px-5 py-20 md:py-28";
const h2 = "font-display text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.05]";

function pauseMark(className = "h-6") {
  return (
    <svg viewBox="0 0 20 28" className={className} aria-hidden="true">
      <rect x="1" y="1" width="6.5" height="26" rx="2" fill="var(--color-accent)" />
      <rect x="12.5" y="1" width="6.5" height="26" rx="2" fill="var(--color-accent)" />
    </svg>
  );
}

export function Landing() {
  const t = useTranslations("landing");
  const locale = useLocale();
  const steps = t.raw("how.steps") as Item[];
  const features = t.raw("features.items") as Item[];
  const privacy = t.raw("privacy.items") as Item[];
  const faq = t.raw("faq.items") as Faq[];
  const guestSteps = t.raw("guest.steps") as string[];
  const ts = useTranslations("landing.try");
  const signIn = `/${locale}/sign-in`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "Pausa",
        url: `${siteUrl()}/${locale}`,
        description: t("meta.description"),
        applicationCategory: "EntertainmentApplication",
        operatingSystem: "Any",
        inLanguage: routing.locales,
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <div className="bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SmoothScroll />
      <RevealOnScroll />

      {/* ───────── header ───────── */}
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Pausa">
            {pauseMark("h-5")}
            <span className="font-display text-2xl leading-none">Pausa</span>
          </Link>
          <nav aria-label={t("nav.menu")} className="ml-6 hidden items-center gap-6 text-[15px] text-muted md:flex">
            <a href="#how" className="hover:text-ink">{t("nav.how")}</a>
            <a href="#try" className="hover:text-ink">{t("nav.try")}</a>
            <a href="#privacy" className="hover:text-ink">{t("nav.privacy")}</a>
            <a href="#faq" className="hover:text-ink">{t("nav.faq")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <ul className="flex items-center text-[13px]" aria-label={t("nav.language")}>
              {routing.locales.map((l) => (
                <li key={l}>
                  <Link href="/" locale={l} aria-current={l === locale ? "true" : undefined}
                    className={`inline-flex min-h-10 min-w-9 items-center justify-center rounded-full uppercase ${l === locale ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}>
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
            <a href={signIn} className="hidden min-h-10 items-center px-2 text-[15px] text-muted hover:text-ink sm:inline-flex">{t("nav.login")}</a>
            <a href={signIn} className="inline-flex min-h-10 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover">{t("nav.start")}</a>
          </div>
        </div>
      </header>

      <main>
        {/* ───────── hero ───────── */}
        <section id="hero" className="relative overflow-hidden px-5 pb-16 pt-12 md:pb-24 md:pt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.05fr_.95fr] md:gap-8">
            <div>
              <h1 className="rise font-display text-[clamp(2.5rem,6.2vw,4.6rem)] leading-[1.02]" style={{ ["--d" as string]: "40ms" }}>{t("hero.title")}</h1>
              <p className="rise mt-6 max-w-xl text-[1.15rem] leading-relaxed text-muted" style={{ ["--d" as string]: "160ms" }}>{t("hero.lede")}</p>
              <div className="rise mt-9 flex flex-wrap gap-3" style={{ ["--d" as string]: "280ms" }}>
                <a href={signIn} className={btnPrimary}>{t("hero.cta")}</a>
                <GoogleButton callbackURL={`/${locale}`} enabled={googleEnabled()} hint={false} className="px-6 text-[17px]" />
                <InstallApp className={btnGhost} />
              </div>
              <p className="rise mt-5 max-w-md text-sm text-muted" style={{ ["--d" as string]: "380ms" }}>{t("hero.note")}</p>
            </div>

            <div className="rise relative mx-auto h-[595px] w-full max-w-[460px] md:h-[600px]" style={{ ["--d" as string]: "200ms" }} aria-hidden="true">
              <div data-speed="0.07" className="absolute left-0 top-0 z-10 w-[min(68vw,285px)]"><div className="-rotate-3"><MockLogCard /></div></div>
              <div data-speed="0.16" className="absolute right-0 top-[262px] z-20 w-[min(66vw,265px)] md:top-[170px]"><div className="rotate-2"><MockMatchup /></div></div>
              <div data-speed="0.04" className="absolute bottom-0 left-3 z-0 hidden w-[150px] md:left-6 md:block md:w-[190px]"><div className="-rotate-1"><MockResultCard /></div></div>
            </div>
          </div>
        </section>

        {/* ───────── problem ───────── */}
        <section className="border-y border-rule bg-paper-2 px-5 py-20 md:py-28" aria-labelledby="problem">
          <div className="mx-auto max-w-3xl text-center" data-reveal>
            <h2 id="problem" className="font-display text-[clamp(1.8rem,4.2vw,3rem)] leading-[1.12]">{t("problem.title")}</h2>
            <p className="mx-auto mt-6 max-w-xl text-[1.1rem] leading-relaxed text-muted">{t("problem.body")}</p>
          </div>
        </section>

        {/* ───────── how it works ───────── */}
        <section id="how" className="scroll-mt-20 py-20 md:py-28" aria-label={t("how.title")}>
          <HowItWorks
            title={t("how.title")}
            steps={steps}
            visuals={[<MockInvite key="1" />, <MockLogCard key="2" />, <MockMatchup key="3" />]}
          />
        </section>

        {/* ───────── features ───────── */}
        <section className="border-t border-rule bg-paper-2 px-5 py-20 md:py-28" aria-labelledby="features">
          <div className="mx-auto max-w-6xl">
            <h2 id="features" data-reveal className={`${h2} max-w-3xl`}>{t("features.title")}</h2>
            <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {features.map((f, i) => (
                <li key={f.title} data-reveal style={{ ["--d" as string]: `${(i % 3) * 90}ms` }}
                  className="group grid content-start gap-2 rounded-md border border-rule bg-paper p-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-muted">
                  <span aria-hidden="true" className="mb-2 block h-[3px] w-8 rounded-full bg-accent transition-[width] duration-300 group-hover:w-14" />
                  <h3 className="font-display text-[1.45rem] leading-tight">{f.title}</h3>
                  <p className="text-muted">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────── try it ───────── */}
        <section id="try" className="scroll-mt-16 bg-second-deep px-5 py-20 text-on-second md:py-28" aria-labelledby="try-title">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-2xl text-center" data-reveal>
              <h2 id="try-title" className={h2}>{ts("title")}</h2>
              <p className="mt-5 text-[1.1rem] leading-relaxed text-on-second-muted">{ts("body")}</p>
            </div>
            <div data-reveal>
              <TrySerata
                ctaHref={signIn}
                films={DEMO_FILMS.map((f) => ({ ...f, title: ts(`films.${f.key}`) }))}
                strings={{
                  pick: ts("pick"), progress: ts.raw("progress") as string, first: ts("rounds.first"), second: ts("rounds.second"), final: ts("rounds.final"),
                  vs: ts("vs"), again: ts("again"), cta: ts("cta"),
                  kicker: t("mock.cardKicker"), subtitle: t("mock.cardSubtitle"), line1: ts("cardLine1"), line2: ts("cardLine2"),
                }}
              />
            </div>
          </div>
        </section>

        {/* ───────── guests ───────── */}
        <section className={section} aria-labelledby="guest">
          <div className="mx-auto max-w-4xl text-center">
            <h2 id="guest" data-reveal className={h2}>{t("guest.title")}</h2>
            <p data-reveal className="mx-auto mt-5 max-w-2xl text-[1.1rem] leading-relaxed text-muted">{t("guest.body")}</p>
            <ol className="mt-12 grid gap-4 sm:grid-cols-3">
              {guestSteps.map((s, i) => (
                <li key={s} data-reveal style={{ ["--d" as string]: `${i * 120}ms` }} className="grid justify-items-center gap-3 rounded-md border border-rule bg-paper-2 p-6">
                  <span aria-hidden="true" className="tabular grid size-10 place-items-center rounded-full bg-accent font-display text-xl text-on-accent">{i + 1}</span>
                  <span className="font-display text-xl leading-tight">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────── privacy ───────── */}
        <section id="privacy" className="scroll-mt-16 border-y border-rule bg-paper-2 px-5 py-20 md:py-28" aria-labelledby="privacy-title">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
            <h2 id="privacy-title" data-reveal className={h2}>{t("privacy.title")}</h2>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {privacy.map((p, i) => (
                <li key={p.title} data-reveal style={{ ["--d" as string]: `${(i % 2) * 100}ms` }} className="grid content-start gap-2 border-t-2 border-ink pt-4">
                  <h3 className="font-display text-[1.35rem] leading-tight">{p.title}</h3>
                  <p className="text-muted">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────── FAQ ───────── */}
        <section id="faq" className={`${section} scroll-mt-16`} aria-labelledby="faq-title">
          <div className="mx-auto max-w-3xl">
            <h2 id="faq-title" data-reveal className={h2}>{t("faq.title")}</h2>
            <div className="mt-10 divide-y divide-rule border-y border-rule" data-reveal>
              {faq.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-display text-[1.25rem] leading-snug marker:content-none">
                    {f.q}
                    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-rule text-lg text-muted transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-5 pr-10 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── final CTA ───────── */}
        <section id="final" className="bg-accent px-5 py-24 text-center text-on-accent md:py-32" aria-labelledby="final-title">
          <div className="mx-auto max-w-2xl" data-reveal>
            <h2 id="final-title" className="font-display text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.02]">{t("final.title")}</h2>
            <p className="mx-auto mt-5 max-w-md text-[1.1rem] opacity-90">{t("final.body")}</p>
            <a href={signIn} className="mt-9 inline-flex min-h-14 items-center justify-center rounded-full bg-ink px-9 text-[18px] font-semibold text-paper transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-px">{t("hero.cta")}</a>
          </div>
        </section>
      </main>

      {/* ───────── footer ───────── */}
      <footer className="border-t border-rule px-5 py-10 pb-28 md:pb-10">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-3">
            <p className="flex items-center gap-2.5">{pauseMark("h-4")}<span className="font-display text-xl">Pausa</span></p>
            <p className="text-sm text-muted">{t("footer.tagline")}</p>
            <InstallApp className="inline-flex min-h-10 w-fit items-center text-sm font-semibold text-ink underline underline-offset-4 hover:text-accent" />
            <div className="max-w-md"><TmdbAttribution /></div>
          </div>
          <div className="grid gap-3 md:justify-items-end">
          <ul className="flex items-center gap-4 text-sm text-muted">
            <li><Link href="/guide" className="inline-flex min-h-10 items-center underline-offset-4 hover:text-ink hover:underline">{t("footer.guides")}</Link></li>
            <li><Link href="/privacy" className="inline-flex min-h-10 items-center underline-offset-4 hover:text-ink hover:underline">{t("footer.privacy")}</Link></li>
            <li><Link href="/terms" className="inline-flex min-h-10 items-center underline-offset-4 hover:text-ink hover:underline">{t("footer.terms")}</Link></li>
          </ul>
          <ul className="flex items-center gap-1 text-sm" aria-label={t("footer.language")}>
            {routing.locales.map((l) => (
              <li key={l}>
                <Link href="/" locale={l} aria-current={l === locale ? "true" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-full px-3 ${l === locale ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}>
                  {{ it: "Italiano", en: "English", es: "Español" }[l]}
                </Link>
              </li>
            ))}
          </ul>
          </div>
        </div>
      </footer>

      <StickyCta label={t("hero.cta")} href={signIn} />
    </div>
  );
}
