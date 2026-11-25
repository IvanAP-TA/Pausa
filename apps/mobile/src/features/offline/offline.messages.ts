import { registerArea } from "@/i18n/messages";

// Texts of the offline area: the "update available" banner of the service worker and the diary's outbox ("waiting to be sent").

const it = {
  offline: {
    update: { available: "Aggiornamento disponibile", cta: "Aggiorna", ctaLabel: "Aggiorna Pausa all'ultima versione" },
    pending: {
      title: "In attesa di invio",
      count: "{count, plural, one {# visione} other {# visioni}} da inviare",
      hint: "Sono salvate su questo dispositivo e partono da sole appena torna la connessione.",
      waiting: "In attesa di rete",
      sending: "Invio in corso",
      failed: "Non inviata",
      offlineNow: "Sei offline.",
      retry: "Riprova",
      retryLabel: "Riprova a inviare {title}",
      discard: "Scarta",
      discardLabel: "Scarta {title}",
      discardConfirm: "Scarta davvero",
      queued: "Sei offline: la visione è salvata e verrà inviata appena possibile.",
      sent: "{count, plural, one {Visione inviata.} other {# visioni inviate.}}",
      watchedOn: "Vista il {date}",
    },
  },
} as const;

const en = {
  offline: {
    update: { available: "Update available", cta: "Update", ctaLabel: "Update Pausa to the latest version" },
    pending: {
      title: "Waiting to be sent",
      count: "{count, plural, one {# viewing} other {# viewings}} to send",
      hint: "They are saved on this device and go out by themselves as soon as the connection is back.",
      waiting: "Waiting for a connection",
      sending: "Sending",
      failed: "Not sent",
      offlineNow: "You are offline.",
      retry: "Try again",
      retryLabel: "Try sending {title} again",
      discard: "Discard",
      discardLabel: "Discard {title}",
      discardConfirm: "Discard for good",
      queued: "You are offline: the viewing is saved and will be sent as soon as possible.",
      sent: "{count, plural, one {Viewing sent.} other {# viewings sent.}}",
      watchedOn: "Watched on {date}",
    },
  },
} as const;

const es = {
  offline: {
    update: { available: "Actualización disponible", cta: "Actualizar", ctaLabel: "Actualizar Pausa a la última versión" },
    pending: {
      title: "Pendiente de envío",
      count: "{count, plural, one {# visión} other {# visiones}} por enviar",
      hint: "Están guardadas en este dispositivo y salen solas en cuanto vuelva la conexión.",
      waiting: "Esperando conexión",
      sending: "Enviando",
      failed: "No enviada",
      offlineNow: "Estás sin conexión.",
      retry: "Reintentar",
      retryLabel: "Reintentar el envío de {title}",
      discard: "Descartar",
      discardLabel: "Descartar {title}",
      discardConfirm: "Descartar de verdad",
      queued: "Estás sin conexión: la visión queda guardada y se enviará en cuanto sea posible.",
      sent: "{count, plural, one {Visión enviada.} other {# visiones enviadas.}}",
      watchedOn: "Vista el {date}",
    },
  },
} as const;

registerArea("offline", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    offline: typeof it;
  }
}
