import { registerArea } from "@/i18n/messages";

// Why a sign-in link did not work (the API sends the person back here with `signin_error`).
const it = { signinError: { link: "Questo link non funziona più: è scaduto (dura 15 minuti) o è già stato usato. Chiedine uno nuovo qui sotto.", disabled: "Questo account è stato sospeso. Scrivici se pensi sia un errore." } };
const en: typeof it = { signinError: { link: "This link no longer works: it expired (it lasts 15 minutes) or was already used. Ask for a new one below.", disabled: "This account has been suspended. Write to us if you think it is a mistake." } };
const es: typeof it = { signinError: { link: "Este enlace ya no funciona: caducó (dura 15 minutos) o ya se usó. Pide uno nuevo aquí abajo.", disabled: "Esta cuenta ha sido suspendida. Escríbenos si crees que es un error." } };

registerArea("signinError", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    signinError: typeof it;
  }
}
