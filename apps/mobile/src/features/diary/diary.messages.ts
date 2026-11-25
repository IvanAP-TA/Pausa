import { registerArea } from "@/i18n/messages";

// Texts of the diary area (feed, thread, my diary, log form, title page, notifications). What the v1 catalogue already says well
// (feed.*, log.*, comments.*, notifications.*, space.*, manage.report.*) is reused from the base catalogue, not copied.

const it = {
  diary: {
    rating: { less: "Mezza stella in meno", more: "Mezza stella in più", clear: "Senza voto" },
    episodeOf: "Stagione {season} · episodio {episode}",
    nav: { label: "Sezioni della Cerchia", feed: "Feed", people: "Persone", recent: "Ultime visioni", allFeed: "Tutto il feed" },
    feed: {
      refresh: "Aggiorna",
      active: "{count, plural, one {# filtro} other {# filtri}}",
      noneBody: "Prova a togliere qualche filtro.",
      more: "Carica altri",
      yearHint: "Anno di uscita, quattro cifre.",
    },
    thread: {
      back: "Il feed",
      reactions: "Reazioni",
      replyingTo: "Rispondi a {name}",
      replyLabel: "La tua risposta",
      editComment: "Modifica il commento",
      reply: "Rispondi",
      replyTo: "Rispondi a {name}",
      show: "Mostra",
    },
    log: {
      minChars: "Scrivi almeno due lettere.",
      change: "Cambia titolo",
      today: "Oggi",
      yesterday: "Ieri",
      dateInvalid: "Scrivi la data così: 2026-11-25.",
      dateFuture: "La data non può essere nel futuro.",
      numberInvalid: "Un numero da 1 a {max}.",
      episodeNeedsSeason: "Per l'episodio serve la stagione.",
      optional: "Facoltativo.",
      platformOther: "Un'altra piattaforma",
      shareHint: "{count, plural, one {Lo vede # Cerchia.} other {Lo vedono # Cerchie.}}",
    },
    progress: { title: "Continua a guardare", started: "Iniziata" },
    share: {
      change: "Cambia chi lo vede",
      save: "Salva",
      saved: "Fatto: ora lo vede chi hai scelto.",
      with: "Chi lo vede: {names}",
    },
    title: { seasons: "Stagioni", mine: "Le tue visioni", none: "Non l'hai ancora registrato.", partial: "Ho guardato solo le visioni più recenti: le più vecchie stanno nel diario." },
    notif: {
      mention: "<b>{name}</b> ti ha nominato su {title}",
      other: "<b>{name}</b> ha fatto qualcosa in {circle}",
      unreadOne: "Non letta",
      filter: "Da quale Cerchia",
      readCircle: "Segna lette: {name}",
      readAll: "Segna tutte lette",
    },
  },
} as const;

const en = {
  diary: {
    rating: { less: "Half a star less", more: "Half a star more", clear: "No rating" },
    episodeOf: "Season {season} · episode {episode}",
    nav: { label: "Sections of the Circle", feed: "Feed", people: "People", recent: "Latest viewings", allFeed: "The whole feed" },
    feed: {
      refresh: "Refresh",
      active: "{count, plural, one {# filter} other {# filters}}",
      noneBody: "Try removing a filter.",
      more: "Load more",
      yearHint: "Release year, four digits.",
    },
    thread: {
      back: "The feed",
      reactions: "Reactions",
      replyingTo: "Replying to {name}",
      replyLabel: "Your reply",
      editComment: "Edit the comment",
      reply: "Reply",
      replyTo: "Reply to {name}",
      show: "Show",
    },
    log: {
      minChars: "Type at least two letters.",
      change: "Change title",
      today: "Today",
      yesterday: "Yesterday",
      dateInvalid: "Write the date like this: 2026-11-25.",
      dateFuture: "The date cannot be in the future.",
      numberInvalid: "A number from 1 to {max}.",
      episodeNeedsSeason: "An episode needs its season.",
      optional: "Optional.",
      platformOther: "Another platform",
      shareHint: "{count, plural, one {# Circle can see it.} other {# Circles can see it.}}",
    },
    progress: { title: "Continue watching", started: "Started" },
    share: {
      change: "Change who sees it",
      save: "Save",
      saved: "Done: the people you chose can see it now.",
      with: "Who sees it: {names}",
    },
    title: { seasons: "Seasons", mine: "Your viewings", none: "You have not logged it yet.", partial: "I only looked at your most recent viewings: older ones are in the diary." },
    notif: {
      mention: "<b>{name}</b> mentioned you on {title}",
      other: "<b>{name}</b> did something in {circle}",
      unreadOne: "Unread",
      filter: "From which Circle",
      readCircle: "Mark read: {name}",
      readAll: "Mark all read",
    },
  },
} as const;

const es = {
  diary: {
    rating: { less: "Media estrella menos", more: "Media estrella más", clear: "Sin nota" },
    episodeOf: "Temporada {season} · episodio {episode}",
    nav: { label: "Secciones del Círculo", feed: "Feed", people: "Personas", recent: "Últimos visionados", allFeed: "Todo el feed" },
    feed: {
      refresh: "Actualizar",
      active: "{count, plural, one {# filtro} other {# filtros}}",
      noneBody: "Prueba a quitar algún filtro.",
      more: "Cargar más",
      yearHint: "Año de estreno, cuatro cifras.",
    },
    thread: {
      back: "El feed",
      reactions: "Reacciones",
      replyingTo: "Respondes a {name}",
      replyLabel: "Tu respuesta",
      editComment: "Editar el comentario",
      reply: "Responder",
      replyTo: "Responder a {name}",
      show: "Mostrar",
    },
    log: {
      minChars: "Escribe al menos dos letras.",
      change: "Cambiar título",
      today: "Hoy",
      yesterday: "Ayer",
      dateInvalid: "Escribe la fecha así: 2026-11-25.",
      dateFuture: "La fecha no puede ser futura.",
      numberInvalid: "Un número del 1 al {max}.",
      episodeNeedsSeason: "Para el episodio hace falta la temporada.",
      optional: "Opcional.",
      platformOther: "Otra plataforma",
      shareHint: "{count, plural, one {Lo ve # Círculo.} other {Lo ven # Círculos.}}",
    },
    progress: { title: "Sigue viendo", started: "Empezada" },
    share: {
      change: "Cambiar quién lo ve",
      save: "Guardar",
      saved: "Hecho: ahora lo ven quienes elegiste.",
      with: "Quién lo ve: {names}",
    },
    title: { seasons: "Temporadas", mine: "Tus visionados", none: "Aún no lo has registrado.", partial: "Solo miré tus visionados más recientes: los antiguos están en el diario." },
    notif: {
      mention: "<b>{name}</b> te ha mencionado en {title}",
      other: "<b>{name}</b> ha hecho algo en {circle}",
      unreadOne: "Sin leer",
      filter: "De qué Círculo",
      readCircle: "Marcar leídas: {name}",
      readAll: "Marcar todas leídas",
    },
  },
} as const;

registerArea("diary", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    diary: typeof it;
  }
}
