import { Link } from "@/i18n/navigation";
import { LEGAL_UPDATED, contactEmail, legalEntity, legalDoc } from "@/lib/legal";
import type { Locale } from "@/i18n/routing";

export function LegalPage({ kind, locale }: { kind: "privacy" | "terms"; locale: Locale }) {
  const doc = legalDoc(kind, locale);
  const email = contactEmail();
  const entity = legalEntity();
  return (
    <main className="projector mx-auto grid max-w-2xl gap-8 px-5 py-12">
      <Link href="/" className="inline-flex min-h-10 w-fit items-center font-display text-lg text-ink">Pausa</Link>
      <header className="grid gap-2">
        <h1 className="font-display text-[2rem] leading-tight">{doc.title}</h1>
        <p className="text-xs text-muted">{doc.updated}: {LEGAL_UPDATED}</p>
        <p className="text-muted">{doc.intro}</p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.h} className="grid gap-2">
          <h2 className="font-display text-xl">{s.h}</h2>
          {s.p.map((p) => <p key={p} className="text-[15px] leading-relaxed">{p}</p>)}
        </section>
      ))}
      {(entity || email) && (
        <p className="border-t border-rule pt-6 text-sm text-muted">
          {entity}{entity && email ? " · " : ""}{email && <a href={`mailto:${email}`} className="underline underline-offset-4 hover:text-ink">{email}</a>}
        </p>
      )}
    </main>
  );
}
