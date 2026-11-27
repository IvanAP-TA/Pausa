import { registerArea } from "@/i18n/messages";

// The invite's QR code on the Cerchia page (v1 had one on the card of the Serata only; this one is for the Cerchia's door).
const it = { circleQr: { show: "Mostra il QR", hide: "Nascondi il QR", alt: "Codice QR dell'invito alla Cerchia", hint: "Inquadralo con la fotocamera: apre l'invito." } };
const en: typeof it = { circleQr: { show: "Show the QR code", hide: "Hide the QR code", alt: "QR code of the Circle invite", hint: "Point a phone camera at it: it opens the invite." } };
const es: typeof it = { circleQr: { show: "Mostrar el QR", hide: "Ocultar el QR", alt: "Código QR de la invitación al Círculo", hint: "Enfócalo con la cámara: abre la invitación." } };

registerArea("circleQr", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    circleQr: typeof it;
  }
}
