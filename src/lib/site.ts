/** Public origin of the site, for canonical links, the sitemap and social previews. */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "https://pausa.gnagno.org").replace(/\/$/, "");
}
