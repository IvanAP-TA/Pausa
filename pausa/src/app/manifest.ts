import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pausa",
    short_name: "Pausa",
    description: "Il diario privato del tuo gruppo. Film, serie, anime.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1115",
    theme_color: "#0f1115",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
