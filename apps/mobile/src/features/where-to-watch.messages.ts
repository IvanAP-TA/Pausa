import { registerArea } from "@/i18n/messages";

const it = {
  watch: {
    title: "Dove guardarlo",
    open: "Apri {site}",
    anilist: "Siti di streaming segnalati da AniList: la disponibilità cambia da paese a paese.",
    country: "Abbonamenti in {country}, dati di JustWatch. In evidenza i tuoi servizi.",
    none: "Nessun abbonamento lo include in {country}.",
    unknown: "Non sappiamo ancora dove si può guardare.",
  },
};
const en: typeof it = {
  watch: {
    title: "Where to watch",
    open: "Open {site}",
    anilist: "Streaming sites listed by AniList: availability changes from country to country.",
    country: "Subscriptions in {country}, data by JustWatch. Yours are highlighted.",
    none: "No subscription includes it in {country}.",
    unknown: "We do not know yet where to watch it.",
  },
};
const es: typeof it = {
  watch: {
    title: "Dónde verlo",
    open: "Abrir {site}",
    anilist: "Sitios de streaming indicados por AniList: la disponibilidad cambia según el país.",
    country: "Suscripciones en {country}, datos de JustWatch. Destacados tus servicios.",
    none: "Ninguna suscripción lo incluye en {country}.",
    unknown: "Aún no sabemos dónde se puede ver.",
  },
};

registerArea("watch", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    watch: typeof it;
  }
}
