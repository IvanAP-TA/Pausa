import { registerArea } from "@/i18n/messages";

// The personal statistics screen.

const it = {
  myStats: {
    title: "Le tue statistiche",
    hours: "{count, plural, one {# ora} other {# ore}} davanti allo schermo",
    hoursFloor: "Almeno: {count, plural, one {# visione non ha} other {# visioni non hanno}} una durata (una serie registrata tutta insieme, o un titolo senza dati).",
    viewings: "{count, plural, one {# visione} other {# visioni}}",
    films: "{count, plural, one {# film} other {# film}}",
    series: "{count, plural, one {# serie o anime} other {# serie e anime}}",
    episodes: "{count, plural, one {# episodio} other {# episodi}}",
    average: "Voto medio {stars}",
    rated: "{count, plural, one {# voto dato} other {# voti dati}}",
    genres: "Generi",
    genresEmpty: "I generi arrivano con i titoli del catalogo.",
    years: "Anno per anno",
    ratings: "I tuoi voti",
    empty: "Registra qualche visione e qui compaiono i numeri."
  }
};

const en: typeof it = {
  myStats: {
    title: "Your statistics",
    hours: "{count, plural, one {# hour} other {# hours}} in front of the screen",
    hoursFloor: "At least: {count, plural, one {# viewing has} other {# viewings have}} no runtime (a series logged all at once, or a title with no data).",
    viewings: "{count, plural, one {# viewing} other {# viewings}}",
    films: "{count, plural, one {# film} other {# films}}",
    series: "{count, plural, one {# series or anime} other {# series and anime}}",
    episodes: "{count, plural, one {# episode} other {# episodes}}",
    average: "Average rating {stars}",
    rated: "{count, plural, one {# rating given} other {# ratings given}}",
    genres: "Genres",
    genresEmpty: "Genres come with catalogue titles.",
    years: "Year by year",
    ratings: "Your ratings",
    empty: "Log a few viewings and the numbers show up here."
  }
};

const es: typeof it = {
  myStats: {
    title: "Tus estadísticas",
    hours: "{count, plural, one {# hora} other {# horas}} delante de la pantalla",
    hoursFloor: "Como mínimo: {count, plural, one {# visión no tiene} other {# visiones no tienen}} duración (una serie registrada de una vez, o un título sin datos).",
    viewings: "{count, plural, one {# visión} other {# visiones}}",
    films: "{count, plural, one {# película} other {# películas}}",
    series: "{count, plural, one {# serie o anime} other {# series y anime}}",
    episodes: "{count, plural, one {# episodio} other {# episodios}}",
    average: "Nota media {stars}",
    rated: "{count, plural, one {# nota dada} other {# notas dadas}}",
    genres: "Géneros",
    genresEmpty: "Los géneros llegan con los títulos del catálogo.",
    years: "Año por año",
    ratings: "Tus notas",
    empty: "Registra algunas visiones y aquí aparecen los números."
  }
};

registerArea("myStats", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    myStats: typeof it;
  }
}
