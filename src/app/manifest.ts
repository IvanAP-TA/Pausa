import type { MetadataRoute } from "next";
import { CARD } from "@/lib/card-theme";

// Installable from the browser: the landing has a "Get the app" button (one tap where the browser allows it, steps elsewhere).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pausa",
    short_name: "Pausa",
    description: "Il diario privato della tua Cerchia: film, serie, anime.",
    start_url: "/?app=1", // the installed app opens on /home (my Cerchia), not on the public landing
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: CARD.paper,
    theme_color: CARD.paper,
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
