import { registerArea } from "@/i18n/messages";

// What a milestone card says (shared by the Traguardi screen and the public profile page: kept small on purpose).

const it = {
  milestone: {
    kinds: {
      viewings: "Visioni",
      reviews: "Recensioni",
      serate: "Serate",
      hosted: "Serate aperte da te",
      genres: "Generi esplorati",
      rewatches: "Rivisti"
    },
    progress: "{value} su {next}",
    top: "In cima: {value}",
    none: "Ancora nessuno",
    level: "Livello {level} di {levels}"
  }
};

const en: typeof it = {
  milestone: {
    kinds: {
      viewings: "Viewings",
      reviews: "Reviews",
      serate: "Movie nights",
      hosted: "Movie nights you opened",
      genres: "Genres explored",
      rewatches: "Rewatched"
    },
    progress: "{value} of {next}",
    top: "At the top: {value}",
    none: "None yet",
    level: "Level {level} of {levels}"
  }
};

const es: typeof it = {
  milestone: {
    kinds: {
      viewings: "Visiones",
      reviews: "Reseñas",
      serate: "Noches de cine",
      hosted: "Noches abiertas por ti",
      genres: "Géneros explorados",
      rewatches: "Vueltos a ver"
    },
    progress: "{value} de {next}",
    top: "En la cima: {value}",
    none: "Ninguno todavía",
    level: "Nivel {level} de {levels}"
  }
};

registerArea("milestone", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    milestone: typeof it;
  }
}
