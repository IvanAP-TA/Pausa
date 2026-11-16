import type { MetadataRoute } from "next";

// No custom install prompt: iOS uses "Add to Home Screen", Android shows its own banner.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pausa",
    short_name: "Pausa",
    description: "Il diario privato della tua Cerchia: film, serie, anime.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2EEE5",
    theme_color: "#F2EEE5",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
