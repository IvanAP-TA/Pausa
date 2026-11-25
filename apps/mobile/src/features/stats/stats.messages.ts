import { registerArea } from "@/i18n/messages";

// Ranking and insights reuse ranking.* and insights.* of the base catalogue; only what is new lives here.

const it = {
  stats: {
    ranking: { pageOf: "Pagina {page} di {pages}", defaultVotes: "Predefinito" },
    insights: {
      saved: "Immagine salvata: la trovi tra i download.",
      shared: "Fatto.",
      noneYet: "Ancora niente: servono più voti da più persone.",
    },
  },
} as const;

const en = {
  stats: {
    ranking: { pageOf: "Page {page} of {pages}", defaultVotes: "Default" },
    insights: {
      saved: "Image saved: look in your downloads.",
      shared: "Done.",
      noneYet: "Nothing yet: it takes more votes from more people.",
    },
  },
} as const;

const es = {
  stats: {
    ranking: { pageOf: "Página {page} de {pages}", defaultVotes: "Predeterminado" },
    insights: {
      saved: "Imagen guardada: búscala en tus descargas.",
      shared: "Hecho.",
      noneYet: "Aún nada: hacen falta más notas de más personas.",
    },
  },
} as const;

registerArea("stats", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    stats: typeof it;
  }
}
