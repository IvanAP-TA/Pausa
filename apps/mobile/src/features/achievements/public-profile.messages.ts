import { registerArea } from "@/i18n/messages";

// The public profile page a member of the global board can turn on.

const it = {
  publicProfile: {
    since: "In classifica dal {date}",
    score: "{count, plural, one {# punto} other {# punti}} · {rank}º posto",
    milestones: "Traguardi raggiunti",
    none: "Nessun traguardo ancora.",
    notFound: "Questa pagina non c'è.",
    notFoundBody: "La persona l'ha spenta, è uscita dalla classifica, o l'indirizzo è sbagliato.",
    cta: "Pausa è il diario privato dei gruppi di amici.",
    ctaButton: "Prova Pausa"
  }
};

const en: typeof it = {
  publicProfile: {
    since: "On the leaderboard since {date}",
    score: "{count, plural, one {# point} other {# points}} · #{rank}",
    milestones: "Milestones reached",
    none: "No milestones yet.",
    notFound: "This page is not here.",
    notFoundBody: "The person turned it off, left the leaderboard, or the address is wrong.",
    cta: "Pausa is the private diary for groups of friends.",
    ctaButton: "Try Pausa"
  }
};

const es: typeof it = {
  publicProfile: {
    since: "En la clasificación desde el {date}",
    score: "{count, plural, one {# punto} other {# puntos}} · {rank}.º puesto",
    milestones: "Logros alcanzados",
    none: "Ningún logro todavía.",
    notFound: "Esta página no existe.",
    notFoundBody: "La persona la desactivó, salió de la clasificación o la dirección es incorrecta.",
    cta: "Pausa es el diario privado de los grupos de amigos.",
    ctaButton: "Probar Pausa"
  }
};

registerArea("publicProfile", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    publicProfile: typeof it;
  }
}
