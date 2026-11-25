import { createElement } from "react";
import { SITE_URL } from "./site";

// JSON-LD is not part of expo-router's Metadata type. A <script type="application/ld+json"> created inside the page
// component lands in the static HTML (measured in T0(e)), which is all a crawler needs: no JavaScript runs for it.

export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;

export const orgNode = () => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Pausa",
  url: SITE_URL,
});

export const websiteNode = () => ({
  "@type": "WebSite",
  "@id": SITE_ID,
  name: "Pausa",
  url: `${SITE_URL}/`,
  inLanguage: ["it", "en", "es"],
  publisher: { "@id": ORG_ID },
});

export const breadcrumb = (items: Array<{ name: string; url: string }>) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
});

/** `<` becomes < so a string inside the data can never close the script element. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export function JsonLd({ nodes }: { nodes: unknown[] }) {
  return createElement("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: ldJson({ "@context": "https://schema.org", "@graph": nodes }) },
  });
}
