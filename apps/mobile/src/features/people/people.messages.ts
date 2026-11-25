import { registerArea } from "@/i18n/messages";

// Profile, preferences and people. Most wording is the base catalogue's (profile.*, person.*, settings.*, notifPrefs.*).

const it = {
  people: {
    me: { diaryBody: "Tutto quello che hai visto, e con chi lo condividi.", settingsBody: "Lingua, paese, avvisi e silenzi per Cerchia." },
    edit: {
      addFavorite: "Aggiungi un preferito",
      favoriteNone: "Qui trovi solo i titoli che sono già in Pausa. Se non c'è, registralo dal diario e poi aggiungilo.",
      genresFull: "Hai scelto {max} generi: togline uno per sceglierne un altro.",
      done: "Fatto",
    },
    settings: {
      prefsTitle: "Preferenze",
      language: "Lingua per email e avvisi",
      auto: "Quella del browser",
      country: "Paese (per dove guardare)",
      none: "Nessuno",
      circlesTitle: "Le tue Cerchie",
      types: {
        log: "Qualcuno registra una visione",
        comment: "Un commento in una conversazione che seguo",
        reaction: "Una reazione a una mia visione",
        now_watching: "Qualcuno inizia a guardare un titolo",
        serata_invite: "Una Serata si apre",
        circle_join: "Qualcuno entra in una Cerchia",
        mention: "Qualcuno mi nomina",
      },
    },
  },
} as const;

const en = {
  people: {
    me: { diaryBody: "Everything you watched, and who you share it with.", settingsBody: "Language, country, alerts and silences per Circle." },
    edit: {
      addFavorite: "Add a favourite",
      favoriteNone: "Only titles already in Pausa show up here. If it is missing, log it in your diary first, then add it.",
      genresFull: "You picked {max} genres: remove one to pick another.",
      done: "Done",
    },
    settings: {
      prefsTitle: "Preferences",
      language: "Language for emails and alerts",
      auto: "The browser's",
      country: "Country (for where to watch)",
      none: "None",
      circlesTitle: "Your Circles",
      types: {
        log: "Someone logs a viewing",
        comment: "A comment in a conversation I follow",
        reaction: "A reaction to one of my viewings",
        now_watching: "Someone starts watching a title",
        serata_invite: "A Serata opens",
        circle_join: "Someone joins a Circle",
        mention: "Someone mentions me",
      },
    },
  },
} as const;

const es = {
  people: {
    me: { diaryBody: "Todo lo que has visto y con quién lo compartes.", settingsBody: "Idioma, país, avisos y silencios por Círculo." },
    edit: {
      addFavorite: "Añadir un favorito",
      favoriteNone: "Aquí solo salen los títulos que ya están en Pausa. Si falta, regístralo en tu diario y luego añádelo.",
      genresFull: "Has elegido {max} géneros: quita uno para elegir otro.",
      done: "Hecho",
    },
    settings: {
      prefsTitle: "Preferencias",
      language: "Idioma de emails y avisos",
      auto: "El del navegador",
      country: "País (para dónde verlo)",
      none: "Ninguno",
      circlesTitle: "Tus Círculos",
      types: {
        log: "Alguien registra un visionado",
        comment: "Un comentario en una conversación que sigo",
        reaction: "Una reacción a uno de mis visionados",
        now_watching: "Alguien empieza a ver un título",
        serata_invite: "Se abre una Serata",
        circle_join: "Alguien entra en un Círculo",
        mention: "Alguien me menciona",
      },
    },
  },
} as const;

registerArea("people", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    people: typeof it;
  }
}
