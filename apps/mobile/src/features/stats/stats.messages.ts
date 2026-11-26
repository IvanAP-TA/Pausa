import { registerArea } from "@/i18n/messages";

// Ranking and insights reuse ranking.* and insights.* of the base catalogue; only what is new lives here.

const it = {
  stats: {
    ranking: { genre: "Genere", pageOf: "Pagina {page} di {pages}", defaultVotes: "Predefinito", vote: "Vota {title}",
      kindLabel: "Tipo", sortOff: "{label}: nessun ordine", sortDesc: "{label}: decrescente", sortAsc: "{label}: crescente",
      years: "Anni di uscita", yearsAll: "Intera durata", yearsLast: "{count, plural, one {Ultimo anno} other {Ultimi # anni}}",
      decade: "Anni {short}", decadeFull: "Anni {year}", custom: "Range custom", from: "Dal", to: "Al", apply: "Applica",
      more: "+{count}", moreLabel: "{count, plural, one {Mostra 1 altro voto} other {Mostra altri # voti}}", less: "Mostra meno", noVote: "–",
    },
    insights: {
      saved: "Immagine salvata: la trovi tra i download.",
      shared: "Fatto.",
      noneYet: "Ancora niente: servono più voti da più persone.",
    },
  },
} as const;

const en = {
  stats: {
    ranking: { genre: "Genre", pageOf: "Page {page} of {pages}", defaultVotes: "Default", vote: "Rate {title}",
      kindLabel: "Type", sortOff: "{label}: no order", sortDesc: "{label}: descending", sortAsc: "{label}: ascending",
      years: "Release years", yearsAll: "All time", yearsLast: "{count, plural, one {Last year} other {Last # years}}",
      decade: "{short}s", decadeFull: "{year}s", custom: "Custom range", from: "From", to: "To", apply: "Apply",
      more: "+{count}", moreLabel: "{count, plural, one {Show 1 more vote} other {Show # more votes}}", less: "Show less", noVote: "–",
    },
    insights: {
      saved: "Image saved: look in your downloads.",
      shared: "Done.",
      noneYet: "Nothing yet: it takes more votes from more people.",
    },
  },
} as const;

const es = {
  stats: {
    ranking: { genre: "Género", pageOf: "Página {page} de {pages}", defaultVotes: "Predeterminado", vote: "Puntuar {title}",
      kindLabel: "Tipo", sortOff: "{label}: sin orden", sortDesc: "{label}: descendente", sortAsc: "{label}: ascendente",
      years: "Años de estreno", yearsAll: "Todo", yearsLast: "{count, plural, one {Último año} other {Últimos # años}}",
      decade: "Años {short}", decadeFull: "Años {year}", custom: "Rango personalizado", from: "Desde", to: "Hasta", apply: "Aplicar",
      more: "+{count}", moreLabel: "{count, plural, one {Mostrar 1 voto más} other {Mostrar # votos más}}", less: "Mostrar menos", noVote: "–",
    },
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
