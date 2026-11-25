// Texts of the static offline page (dist/offline.html, written by scripts/postexport.mjs). Plain data with no imports so `node` can
// read it as-is, like src/seo/site.ts. The in-app texts about updates and the queue are in src/features/offline/offline.messages.ts.
export const OFFLINE_TEXTS: Record<string, { title: string; body: string; retry: string; home: string }> = {
  it: {
    title: "Sei offline",
    body: "Pausa non riesce a raggiungere la rete. Controlla la connessione e riprova.",
    retry: "Riprova",
    home: "Torna all'inizio",
  },
  en: {
    title: "You are offline",
    body: "Pausa cannot reach the network. Check your connection and try again.",
    retry: "Try again",
    home: "Back to start",
  },
  es: {
    title: "Sin conexión",
    body: "Pausa no puede conectarse a la red. Revisa tu conexión e inténtalo de nuevo.",
    retry: "Reintentar",
    home: "Volver al inicio",
  },
};
