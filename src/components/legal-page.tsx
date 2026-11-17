import { Link } from "@/i18n/navigation";
import { LEGAL_UPDATED, contactEmail, legalEntity, legalDoc } from "@/lib/legal";
import type { Locale } from "@/i18n/routing";

export function LegalPage({ kind, locale }: { kind: "privacy" | "terms"; locale: Locale }) {
  const doc = legalDoc(kind, locale);
  const email = contactEmail();
  const entity = legalEntity();
  return (
    <main className="projector mx-auto grid w-full max-w-[72rem] gap-10 px-4 pb-16 pt-6 lg:px-8">
      <Link href="/" className="inline-flex min-h-11 w-fit items-center font-display text-2xl text-ink">Pausa</Link>
      <header className="grid min-w-0 gap-4">
        <h1 className="display text-poster max-w-[22ch]">{doc.title}</h1>
        <p className="text-sm text-muted">{doc.updated}: {LEGAL_UPDATED}</p>
        <p className="subtitle max-w-[60ch]">{doc.intro}</p>
      </header>
      {/* Each section is a plate: the subhead in the margin from 64rem, the text at a reading measure beside it. */}
      {doc.sections.map((s) => (
        <section key={s.h} className="plate grid gap-4 pt-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12">
          <h2 className="title">{s.h}</h2>
          <div className="grid min-w-0 max-w-[65ch] content-start gap-4 leading-relaxed">
            {s.p.map((p) => <p key={p}>{p}</p>)}
          </div>
        </section>
      ))}
      {(entity || email) && (
        <p className="plate grid gap-1 pt-6 text-sm text-muted">
          {entity && <span>{entity}</span>}
          {email && <a href={`mailto:${email}`} className="link inline-flex min-h-11 w-fit items-center">{email}</a>}
        </p>
      )}
    </main>
  );
}
