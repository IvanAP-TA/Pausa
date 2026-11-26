import { registerArea } from "@/i18n/messages";

// The base catalogue already owns `person.*` (a Cerchia member's profile), so the director/author page uses `authorPage.*`.

const it = { authorPage: { films: "Film", series: "Serie", anime: "Anime", born: "Nascita: {date}", died: "Morte: {date}", noWorks: "Nessuna opera da regista o autore.", role: { director: "Regia", creator: "Creazione", author: "Autore originale" }, back: "Indietro", open: "Apri {title}" } } as const;
const en = { authorPage: { films: "Films", series: "Series", anime: "Anime", born: "Born: {date}", died: "Died: {date}", noWorks: "No works as director or author.", role: { director: "Director", creator: "Creator", author: "Original author" }, back: "Back", open: "Open {title}" } } as const;
const es = { authorPage: { films: "Películas", series: "Series", anime: "Anime", born: "Nacimiento: {date}", died: "Muerte: {date}", noWorks: "Ninguna obra como director o autor.", role: { director: "Dirección", creator: "Creación", author: "Autor original" }, back: "Atrás", open: "Abrir {title}" } } as const;

registerArea("authorPage", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    authorPage: typeof it;
  }
}
