import { siteUrl } from "./site";

/* Shared schema.org nodes. Every page carries the full Organization and WebSite nodes in its own @graph (@id references are
 * not followed across pages), and points to them by @id from its own nodes. */

export const ORG_ID = () => `${siteUrl()}/#organization`;
export const SITE_ID = () => `${siteUrl()}/#website`;

export function orgNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID(),
    name: "Pausa",
    url: siteUrl(),
    logo: { "@type": "ImageObject", url: `${siteUrl()}/pwa-icon/512`, width: 512, height: 512 },
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID(),
    name: "Pausa",
    url: `${siteUrl()}/`,
    inLanguage: ["it", "en", "es"],
    publisher: { "@id": ORG_ID() },
  };
}

/** A calendar date ("2026-11-17") as a full date-time in Italian time, as Google prefers for articles. */
export const isoDateTime = (day: string) => `${day}T09:00:00+01:00`;

/** JSON for a <script type="application/ld+json">, with "<" escaped so it can never close the script tag. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
