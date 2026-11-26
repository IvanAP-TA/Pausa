import { registerArea } from "@/i18n/messages";

// New texts of the Import screens. v1's `import.*` and `imports.*` (steps for each source, what was found, destination and its warning,
// the summary lines, every error, the "take it out of the Cerchia" confirmations) are reused as they are from packages/messages;
// these are what v2 adds: stop and resume, the rejected rows, and the status of an import. Keys live under `importApp.*`.

const it = {
  importApp: {
    source: "Da dove importi",
    stop: "Ferma",
    stopping: "Mi fermo dopo questa richiesta…",
    keepOpen: "Se chiudi la pagina, l'importazione resta aperta: la riprendi da dove era arrivata.",
    stopped: "Fermata a {done} di {total}",
    stoppedBody: "Quello che è già dentro resta, e non si duplica se ricominci. Puoi riprendere da qui.",
    resume: "Riprendi",
    resumeFound: "Questa importazione era già iniziata: {done} di {total} righe sono già dentro.",
    resumeIntoCircle: "Destinazione: la Cerchia «{circle}».",
    resumePrivate: "Destinazione: il tuo spazio privato.",
    resumeCta: "Riprendi dalla riga {done}",
    restartCta: "Ricomincia da capo",
    openBanner: "Hai un'importazione da {source} rimasta a metà ({done} di {total}). Scegli di nuovo lo stesso file per riprenderla.",
    retryIn: "Riprova tra un'ora",
    failedTitle: "Si è fermata a {done} di {total}",
    rejectedTitle: "{count, plural, one {# riga rifiutata} other {# righe rifiutate}}",
    rejectedRow: "Riga {n}: {title} ({reason})",
    rejectedMore: "…e altre {count}.",
    reason: { title: "titolo mancante o troppo lungo", kind: "tipo non valido", review: "recensione troppo lunga" },
    toManage: "Gestisci importazioni",
    status: { running: "In corso", done: "Finita", failed: "Fallita", cancelled: "Annullata" },
    skipped: "{count, plural, one {# già presente o esclusa} other {# già presenti o escluse}}",
    lists: "{count, plural, one {# lista} other {# liste}}",
    failedRows: "{count, plural, one {# riga rifiutata} other {# righe rifiutate}}",
    runningAt: "Ferma a {done} di {total} righe.",
    continue: "Riprendi",
    drop: "Oppure trascina qui il file.",
    deleteLists: "{count, plural, one {Elimina anche la lista creata} other {Elimina anche le # liste create}}",
  },
} as const;

const en = {
  importApp: {
    source: "Where you import from",
    stop: "Stop",
    stopping: "Stopping after this request…",
    keepOpen: "If you close the page, the import stays open: you can pick it up where it got to.",
    stopped: "Stopped at {done} of {total}",
    stoppedBody: "What is already in stays, and is not duplicated if you start again. You can resume from here.",
    resume: "Resume",
    resumeFound: "This import had already started: {done} of {total} rows are already in.",
    resumeIntoCircle: "Destination: the Cerchia “{circle}”.",
    resumePrivate: "Destination: your private space.",
    resumeCta: "Resume from row {done}",
    restartCta: "Start over",
    openBanner: "You have a {source} import left half way ({done} of {total}). Choose the same file again to resume it.",
    retryIn: "Try again in an hour",
    failedTitle: "It stopped at {done} of {total}",
    rejectedTitle: "{count, plural, one {# row refused} other {# rows refused}}",
    rejectedRow: "Row {n}: {title} ({reason})",
    rejectedMore: "…and {count} more.",
    reason: { title: "missing or too long title", kind: "invalid type", review: "review too long" },
    toManage: "Manage imports",
    status: { running: "Running", done: "Done", failed: "Failed", cancelled: "Cancelled" },
    skipped: "{count, plural, one {# already there or left out} other {# already there or left out}}",
    lists: "{count, plural, one {# list} other {# lists}}",
    failedRows: "{count, plural, one {# row refused} other {# rows refused}}",
    runningAt: "Stopped at {done} of {total} rows.",
    continue: "Resume",
    drop: "Or drop the file here.",
    deleteLists: "{count, plural, one {Also delete the list it made} other {Also delete the # lists it made}}",
  },
} as const;

const es = {
  importApp: {
    source: "De dónde importas",
    stop: "Parar",
    stopping: "Me paro tras esta petición…",
    keepOpen: "Si cierras la página, la importación sigue abierta: la retomas donde se quedó.",
    stopped: "Parada en {done} de {total}",
    stoppedBody: "Lo que ya está dentro se queda, y no se duplica si empiezas otra vez. Puedes seguir desde aquí.",
    resume: "Reanudar",
    resumeFound: "Esta importación ya había empezado: {done} de {total} filas ya están dentro.",
    resumeIntoCircle: "Destino: la Cerchia «{circle}».",
    resumePrivate: "Destino: tu espacio privado.",
    resumeCta: "Reanudar desde la fila {done}",
    restartCta: "Empezar de nuevo",
    openBanner: "Tienes una importación de {source} a medias ({done} de {total}). Elige otra vez el mismo archivo para reanudarla.",
    retryIn: "Inténtalo de nuevo dentro de una hora",
    failedTitle: "Se ha parado en {done} de {total}",
    rejectedTitle: "{count, plural, one {# fila rechazada} other {# filas rechazadas}}",
    rejectedRow: "Fila {n}: {title} ({reason})",
    rejectedMore: "…y {count} más.",
    reason: { title: "título ausente o demasiado largo", kind: "tipo no válido", review: "reseña demasiado larga" },
    toManage: "Gestionar importaciones",
    status: { running: "En curso", done: "Terminada", failed: "Fallida", cancelled: "Cancelada" },
    skipped: "{count, plural, one {# ya estaba o se dejó fuera} other {# ya estaban o se dejaron fuera}}",
    lists: "{count, plural, one {# lista} other {# listas}}",
    failedRows: "{count, plural, one {# fila rechazada} other {# filas rechazadas}}",
    runningAt: "Parada en {done} de {total} filas.",
    continue: "Reanudar",
    drop: "O suelta aquí el archivo.",
    deleteLists: "{count, plural, one {Eliminar también la lista creada} other {Eliminar también las # listas creadas}}",
  },
} as const;

registerArea("import", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    import: typeof it;
  }
}
