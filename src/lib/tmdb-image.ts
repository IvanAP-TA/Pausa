/** Client-safe TMDB image URL helper (the API client in tmdb.ts is server-only). */
export function posterUrl(path: string, size: "w92" | "w185" | "w342" | "w500" = "w342") {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
