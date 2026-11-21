import { PauseMark } from "@/components/brand";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { ORG_ID, orgNode, websiteNode } from "@/lib/jsonld";
import { siteUrl } from "@/lib/site";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import { DEMO_FILMS } from "./demo-data";
import { HowItWorks } from "./how-it-works";
import { MockInvite, MockLogCard, MockMatchup, MockResultCard } from "./mock-ui";
import { RevealOnScroll } from "./reveal";
import { SmoothScroll } from "./smooth-scroll";
import { InstallApp } from "./install-app";
import { GoogleButton } from "@/components/google-button";
import { SignedInRedirect } from "./signed-in-redirect";
import { StickyCta } from "./sticky-cta";
import { TrySerata } from "./try-serata";
import { Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type Item = { title: string; body: string };
type Faq = { q: string; a: string };

/* One capped container: at 1920 the gutters grow, the grids keep their columns. */
const wrap = "mx-auto w-full max-w-[var(--container)] px-[var(--gutter)]";
const cols = "grid gap-x-[var(--gap-columns)] lg:grid-cols-12";
/* Section heads: the hairline capitals at poster size. */
const head = "font-display font-extralight text-poster leading-[1.02] text-balance";
const lead = "text-lead font-light leading-[1.4] text-ink-2";
const navLink = "inline-flex min-h-11 items-center whitespace-nowrap transition-colors duration-150 hover:text-ink";

const pauseMark = (className = "h-6") => <PauseMark className={className} />;

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
      orgNode(),
      websiteNode(),
      {
        "@type": "WebApplication",
        "@id": `${siteUrl()}/#app`,
        name: "Pausa",
        url: `${siteUrl()}/${locale}`,
        description: t("meta.description"),
        applicationCategory: "EntertainmentApplication",
        operatingSystem: "Any",
        inLanguage: routing.locales,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        publisher: { "@id": ORG_ID() },
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <div className="bg-paper text-ink">
      <SignedInRedirect />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SmoothScroll />
      <RevealOnScroll />

      {/* ───────── header: a solid bar on the ground, no glass ───────── */}
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-rule bg-paper">
        {/* How far down the page the reader is: a 2px amber line under the nav, scaled by Lenis. */}
        <span data-progress aria-hidden="true" className="absolute inset-x-0 -bottom-px block h-0.5 origin-left scale-x-0 bg-accent" />
        <div className={`${wrap} flex h-16 items-center gap-4`}>
          <Link href="/" className="flex items-center gap-2.5" aria-label="Pausa">
            {pauseMark("h-5")}
            <span className="font-display text-3xl leading-none">Pausa</span>
          </Link>
          <nav aria-label={t("nav.menu")} className="ml-8 hidden items-center gap-7 text-sm text-muted lg:flex">
            <a href="#how" className={navLink}>{t("nav.how")}</a>
            <a href="#try" className={navLink}>{t("nav.try")}</a>
            <a href="#privacy" className={navLink}>{t("nav.privacy")}</a>
            <a href="#faq" className={navLink}>{t("nav.faq")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-0 sm:gap-4">
            <ul className="flex items-center text-sm" aria-label={t("nav.language")}>
              {routing.locales.map((l) => (
                <li key={l}>
                  <Link href="/" locale={l} aria-current={l === locale ? "true" : undefined}
                    className={`inline-flex min-h-11 min-w-7 items-center justify-center underline-offset-8 sm:min-w-9 transition-colors duration-150 ${l === locale ? "text-ink underline decoration-accent" : "text-muted hover:text-ink"}`}>
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
            <ThemeToggle className="max-sm:w-9" />
            <a href={signIn} className={`${navLink} px-1 text-sm text-muted max-sm:hidden`}>{t("nav.login")}</a>
            <a href={signIn} className="btn px-4">{t("nav.start")}</a>
          </div>
        </div>
      </header>

      <main>
        {/* ───────── hero: a poster. The headline, one sentence, the actions; the app's own plates beside it ───────── */}
        {/* The same curtain folds and safelight that open every app screen: `isolate` keeps them above the page ground. */}
        <section id="hero" className="projector isolate grid overflow-x-clip py-8 lg:min-h-[calc(100svh-4rem)] lg:content-center">
          <div className={`${wrap} ${cols} items-center gap-y-12`}>
            <div data-scrub="leave" className="min-w-0 lg:col-span-8">
              {/* The hero size, held to the height of the screen so the action stays above the fold. */}
              <h1 className="rise font-display font-extralight leading-none text-balance text-[length:clamp(3.5rem,16.5svh,var(--text-hero))]" style={{ ["--d" as string]: "40ms" }}>{t("hero.title")}</h1>
              <p className={`rise mt-5 max-w-[62ch] ${lead}`} style={{ ["--d" as string]: "120ms" }}>{t("hero.lede")}</p>
              <div className="rise mt-7 flex flex-wrap items-center gap-3" style={{ ["--d" as string]: "200ms" }}>
                <a href={signIn} className="btn btn-primary btn-lg w-full sm:w-fit">{t("hero.cta")}</a>
                <GoogleButton callbackURL={`/${locale}/home`} enabled="check" hint={false}
                  className="min-h-[52px]! rounded-none! border-rule! bg-transparent! px-6! font-display text-xl font-normal! text-ink-2 transition-colors duration-150 hover:border-muted! hover:bg-transparent! hover:text-ink active:translate-y-px" />
                <InstallApp className="btn btn-quiet btn-lg px-6" />
              </div>
              <p className="rise mt-4 max-w-md text-sm text-muted" style={{ ["--d" as string]: "280ms" }}>{t("hero.note")}</p>
            </div>

            <div className="rise min-w-0 lg:col-span-4" style={{ ["--d" as string]: "160ms" }} aria-hidden="true">
              <div data-speed="0.04">
                <MockLogCard />
                <div className="plate grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_132px]">
                  <MockMatchup className="border-t-0 sm:pr-4" />
                  <div className="hidden border-l border-rule py-4 pl-4 sm:block"><MockResultCard /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── problem: a statement on a grained well ───────── */}
        <section className="well grained py-[var(--section-gap-s)]" aria-labelledby="problem">
          <div className={wrap} data-reveal>
            <h2 id="problem" className={`${head} max-w-[68rem]`}>{t("problem.title")}</h2>
            <div className={`${cols} mt-10 lg:mt-14`}>
              <p className={`max-w-[56ch] lg:col-span-6 lg:col-start-7 ${lead}`}>{t("problem.body")}</p>
            </div>
          </div>
        </section>

        {/* ───────── how it works: a pinned plate beside the three steps ───────── */}
        <section id="how" className="scroll-mt-20 pb-[var(--section-gap-l)] pt-[var(--section-gap)]" aria-label={t("how.title")}>
          <HowItWorks
            title={t("how.title")}
            steps={steps}
            visuals={[<MockInvite key="1" />, <MockLogCard key="2" />, <MockMatchup key="3" />]}
          />
        </section>

        {/* ───────── features: a collector's sheet, rows under full-width hairlines ───────── */}
        <section className="pb-[var(--section-gap)]" aria-labelledby="features">
          <div className={wrap}>
            <h2 id="features" data-reveal className={`${head} max-w-[60rem]`}>{t("features.title")}</h2>
            <ul className="rows mt-12 lg:mt-16">
              {features.map((f, i) => (
                <li key={f.title} data-reveal style={{ ["--d" as string]: `${(i % 3) * 40}ms` }} className={`${cols} items-baseline gap-y-2 py-6 lg:py-8`}>
                  <h3 className="title lg:col-span-5">{f.title}</h3>
                  <p className="max-w-[60ch] text-ink-2 lg:col-span-6 lg:col-start-7">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────── try it: the head beside the working Serata, on a well ───────── */}
        <section id="try" className="well scroll-mt-16 py-[var(--section-gap-s)]" aria-labelledby="try-title">
          <div className={`${wrap} ${cols} items-center gap-y-12`}>
            <div className="min-w-0 lg:col-span-5" data-reveal>
              <h2 id="try-title" className={head}>{ts("title")}</h2>
              <p className={`mt-6 max-w-[44ch] ${lead}`}>{ts("body")}</p>
            </div>
            <div className="min-w-0 lg:col-span-6 lg:col-start-7" data-reveal>
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

        {/* ───────── guests: a contact strip, numerals parted by vertical hairlines ───────── */}
        <section className="pb-[var(--section-gap-l)] pt-[var(--section-gap)]" aria-labelledby="guest">
          <div className={wrap}>
            <div className={`${cols} items-end gap-y-6`}>
              <h2 id="guest" data-reveal className={`${head} lg:col-span-7`}>{t("guest.title")}</h2>
              <p data-reveal className={`max-w-[48ch] lg:col-span-4 lg:col-start-9 ${lead}`}>{t("guest.body")}</p>
            </div>
            <ol className="mt-12 grid border-y border-rule sm:grid-cols-3 lg:mt-16">
              {guestSteps.map((s, i) => (
                <li key={s} data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}
                  className="grid content-start gap-3 border-t border-rule py-8 first:border-t-0 sm:border-l sm:border-t-0 sm:px-8 sm:py-10 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0">
                  <span aria-hidden="true" className="figure text-poster">{i + 1}</span>
                  <span className="title">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────── privacy: the head held on the left, the facts as rows ───────── */}
        <section id="privacy" className="scroll-mt-16 pb-[var(--section-gap)]" aria-labelledby="privacy-title">
          <div className={`${wrap} ${cols} gap-y-10`}>
            <h2 id="privacy-title" data-reveal className={`${head} lg:sticky lg:top-28 lg:col-span-4 lg:self-start`}>{t("privacy.title")}</h2>
            <ul className="rows lg:col-span-7 lg:col-start-6">
              {privacy.map((p, i) => (
                <li key={p.title} data-reveal style={{ ["--d" as string]: `${(i % 2) * 40}ms` }}
                  className="grid items-baseline gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <h3 className="title text-2xl">{p.title}</h3>
                  <p className="text-ink-2">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────── FAQ: hairline rows, a plus that turns ───────── */}
        <section id="faq" className="scroll-mt-16 pb-[var(--section-gap-l)]" aria-labelledby="faq-title">
          <div className={wrap}>
            <h2 id="faq-title" data-reveal className={head}>{t("faq.title")}</h2>
            <div className="rows mt-10 lg:mt-14" data-reveal>
              {faq.map((f) => (
                <details key={f.q} className="group">
                  <summary className="group/s flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="title text-2xl sm:text-title">{f.q}</span>
                    <Plus size={24} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-muted transition-[color,transform] duration-200 ease-out group-open:rotate-45 group-hover/s:text-accent motion-reduce:transition-none" />
                  </summary>
                  <p className="max-w-[65ch] pb-7 text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── final call: a grained well, the one amber control ───────── */}
        <section id="final" className="well grained py-[var(--section-gap)]" aria-labelledby="final-title">
          <div className={`${wrap} ${cols} items-end gap-y-8`} data-reveal>
            <h2 id="final-title" data-scrub="arrive" className={`${head} origin-left lg:col-span-8`}>{t("final.title")}</h2>
            <div className="grid gap-6 lg:col-span-4">
              <p className={`max-w-[40ch] ${lead}`}>{t("final.body")}</p>
              <a href={signIn} className="btn btn-primary btn-lg w-full sm:w-fit">{t("hero.cta")}</a>
            </div>
          </div>
        </section>
      </main>

      {/* ───────── footer: a mast, the wordmark large over the links ───────── */}
      <footer className="border-t border-rule pb-28 pt-[var(--space-3xl)] md:pb-10">
        <div className={wrap}>
          <p data-speed-x="-0.12" className="flex items-center gap-[0.14em] text-figure leading-none">{pauseMark("h-[0.6em]")}<span className="font-display font-extralight leading-none">Pausa</span></p>
          <p className="mt-4 text-muted">{t("footer.tagline")}</p>
          <div className={`plate ${cols} mt-10 gap-y-6 pt-6`}>
            <ul className="flex flex-wrap items-center gap-x-6 text-sm lg:col-span-4">
              <li><Link href="/guide" className="link inline-flex min-h-11 items-center">{t("footer.guides")}</Link></li>
              <li><Link href="/privacy" className="link inline-flex min-h-11 items-center">{t("footer.privacy")}</Link></li>
              <li><Link href="/terms" className="link inline-flex min-h-11 items-center">{t("footer.terms")}</Link></li>
            </ul>
            <ul className="flex flex-wrap items-center gap-x-5 text-sm lg:col-span-4" aria-label={t("footer.language")}>
              {routing.locales.map((l) => (
                <li key={l}>
                  <Link href="/" locale={l} aria-current={l === locale ? "true" : undefined}
                    className={`inline-flex min-h-11 items-center underline-offset-8 transition-colors duration-150 ${l === locale ? "text-ink underline decoration-accent" : "text-muted hover:text-ink"}`}>
                    {{ it: "Italiano", en: "English", es: "Español" }[l]}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 lg:col-span-4">
              <InstallApp className="link inline-flex min-h-11 w-fit items-center gap-2 text-sm" />
              <div className="max-w-md"><TmdbAttribution /></div>
            </div>
          </div>
        </div>
      </footer>

      <StickyCta label={t("hero.cta")} href={signIn} />
    </div>
  );
}
