import type { Locale } from "@/i18n/routing";

/**
 * Privacy notice and terms, written to match what Pausa actually does today (cookies, processors, retention).
 * DRAFT: it has not been reviewed by a lawyer, and the controller's identity and contact must be filled in
 * (CONTACT_EMAIL, LEGAL_ENTITY) before launch. Keep it in step with the code: a new processor or cookie means a new line here.
 */
export type LegalDoc = { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] };

export const LEGAL_UPDATED = "2026-11-17";

export const contactEmail = () => process.env.CONTACT_EMAIL ?? "";
export const legalEntity = () => process.env.LEGAL_ENTITY ?? "";

const privacy: Record<Locale, LegalDoc> = {
  it: {
    title: "Informativa sulla privacy",
    updated: "Ultimo aggiornamento",
    intro: "Pausa è un diario privato per gruppi di amici. Qui spieghiamo quali dati trattiamo, perché, e come puoi controllarli.",
    sections: [
      { h: "Quali dati trattiamo", p: [
        "Account: la tua email e il nome che scegli (con Google, anche l'immagine del profilo). Se entri in una Serata come ospite, solo il nome che inserisci.",
        "Contenuti: film, serie e anime che registri, voti, recensioni, commenti, reazioni, liste, stato «sto guardando», voti nelle Serate.",
        "Tecnici: indirizzo IP e user agent delle sessioni, per la sicurezza dell'accesso e per limitare gli abusi.",
      ] },
      { h: "Chi vede i tuoi contenuti", p: [
        "Solo i membri delle Cerchie a cui appartieni. Pausa non ha profili pubblici né feed pubblici. L'unica cosa pensata per uscire dall'app è la Card della Serata, che mostra il titolo scelto e non chi ha votato cosa.",
      ] },
      { h: "Perché li trattiamo", p: [
        "Per fornirti il servizio che hai richiesto (esecuzione del contratto) e per la sicurezza e la prevenzione degli abusi (legittimo interesse). Non facciamo profilazione pubblicitaria e non vendiamo dati.",
      ] },
      { h: "Cookie", p: [
        "Usiamo solo cookie tecnici: la sessione di accesso, il tema chiaro/scuro e la lingua. Non usiamo cookie di analisi o pubblicitari, quindi non serve un banner di consenso.",
      ] },
      { h: "Servizi di terzi", p: [
        "Cloudflare: hosting e database. Resend: invio dell'email con il link di accesso. Google: solo se scegli «Accedi con Google». TMDB e AniList: quando cerchi un titolo, la ricerca (non la tua identità) viene inviata a loro; le locandine vengono caricate dai loro server, che quindi vedono il tuo indirizzo IP. Se attivata, Cloudflare Web Analytics conta le visite in forma aggregata, senza cookie e senza identificarti. I dati dei titoli arrivano da TMDB (questo prodotto usa l'API TMDB ma non è approvato né certificato da TMDB) e da AniList.",
      ] },
      { h: "Per quanto tempo", p: [
        "Finché non elimini l'account. Se elimini un log o un commento, sparisce subito. Se lasci una Cerchia, i tuoi contenuti restano visibili agli altri membri finché non li elimini o non elimini l'account.",
      ] },
      { h: "I tuoi diritti", p: [
        "Puoi accedere ai tuoi dati, scaricarli in formato JSON, correggere il nome ed eliminare l'account in qualsiasi momento dalla pagina Account: l'eliminazione è immediata e cancella i tuoi log, commenti, reazioni e liste personali. Puoi inoltre chiedere la limitazione o opporti al trattamento, e proporre reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).",
      ] },
      { h: "Contatti", p: ["Per qualsiasi richiesta sui tuoi dati scrivi all'indirizzo indicato in fondo a questa pagina."] },
    ],
  },
  en: {
    title: "Privacy notice",
    updated: "Last updated",
    intro: "Pausa is a private diary for groups of friends. This explains what data we handle, why, and how you control it.",
    sections: [
      { h: "What we handle", p: [
        "Account: your email and the name you choose (with Google, also your profile picture). If you join a Serata as a guest, only the name you enter.",
        "Content: films, series and anime you log, ratings, reviews, comments, reactions, lists, your \"now watching\" status, your votes in Serate.",
        "Technical: IP address and user agent of your sessions, for sign-in security and to limit abuse.",
      ] },
      { h: "Who sees your content", p: [
        "Only the members of the Cerchie you belong to. Pausa has no public profiles or public feeds. The only thing meant to leave the app is the Serata Card, which shows the chosen title and not who voted for what.",
      ] },
      { h: "Why we handle it", p: [
        "To provide the service you asked for (contract) and for security and abuse prevention (legitimate interest). We do not profile you for advertising and we do not sell data.",
      ] },
      { h: "Cookies", p: [
        "Only strictly necessary cookies: the sign-in session, the light/dark theme and the language. No analytics or advertising cookies, so no consent banner is needed.",
      ] },
      { h: "Third parties", p: [
        "Cloudflare: hosting and database. Resend: sending the sign-in email. Google: only if you choose \"Sign in with Google\". TMDB and AniList: when you search a title, the search (not your identity) is sent to them; posters load from their servers, which therefore see your IP address. If enabled, Cloudflare Web Analytics counts visits in aggregate, with no cookies and without identifying you. Title data comes from TMDB (this product uses the TMDB API but is not endorsed or certified by TMDB) and AniList.",
      ] },
      { h: "How long", p: [
        "Until you delete your account. Deleting a log or a comment removes it immediately. If you leave a Cerchia, your content stays visible to its members until you delete it or delete your account.",
      ] },
      { h: "Your rights", p: [
        "From the Account page you can see your data, download it as JSON, fix your name and delete your account at any time: deletion is immediate and removes your logs, comments, reactions and personal lists. You can also ask to restrict or object to processing, and complain to your data protection authority.",
      ] },
      { h: "Contact", p: ["For any request about your data, write to the address at the bottom of this page."] },
    ],
  },
  es: {
    title: "Política de privacidad",
    updated: "Última actualización",
    intro: "Pausa es un diario privado para grupos de amigos. Aquí explicamos qué datos tratamos, por qué y cómo puedes controlarlos.",
    sections: [
      { h: "Qué datos tratamos", p: [
        "Cuenta: tu email y el nombre que elijas (con Google, también la imagen de perfil). Si entras en una Serata como invitado, solo el nombre que escribas.",
        "Contenido: películas, series y anime que registras, valoraciones, reseñas, comentarios, reacciones, listas, el estado «estoy viendo», tus votos en las Serate.",
        "Técnicos: dirección IP y user agent de las sesiones, para la seguridad del acceso y limitar abusos.",
      ] },
      { h: "Quién ve tu contenido", p: [
        "Solo los miembros de las Cerchie a las que perteneces. Pausa no tiene perfiles ni feeds públicos. Lo único pensado para salir de la app es la Card de la Serata, que muestra el título elegido y no quién votó qué.",
      ] },
      { h: "Para qué los tratamos", p: [
        "Para prestarte el servicio que pediste (ejecución del contrato) y para la seguridad y la prevención de abusos (interés legítimo). No hacemos perfiles publicitarios ni vendemos datos.",
      ] },
      { h: "Cookies", p: [
        "Solo cookies técnicas: la sesión de acceso, el tema claro/oscuro y el idioma. No usamos cookies de analítica ni publicidad, así que no hace falta un banner de consentimiento.",
      ] },
      { h: "Terceros", p: [
        "Cloudflare: alojamiento y base de datos. Resend: envío del email de acceso. Google: solo si eliges «Entrar con Google». TMDB y AniList: al buscar un título se les envía la búsqueda (no tu identidad); los pósteres se cargan desde sus servidores, que por tanto ven tu dirección IP. Si se activa, Cloudflare Web Analytics cuenta las visitas de forma agregada, sin cookies y sin identificarte. Los datos de los títulos vienen de TMDB (este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB) y de AniList.",
      ] },
      { h: "Durante cuánto tiempo", p: [
        "Hasta que elimines tu cuenta. Al borrar un registro o un comentario desaparece al instante. Si dejas una Cerchia, tu contenido sigue visible para sus miembros hasta que lo borres o elimines la cuenta.",
      ] },
      { h: "Tus derechos", p: [
        "Desde la página Cuenta puedes ver tus datos, descargarlos en JSON, corregir tu nombre y eliminar la cuenta cuando quieras: la eliminación es inmediata y borra tus registros, comentarios, reacciones y listas personales. También puedes pedir la limitación u oponerte al tratamiento, y reclamar ante la autoridad de protección de datos.",
      ] },
      { h: "Contacto", p: ["Para cualquier solicitud sobre tus datos escribe a la dirección que aparece al final de esta página."] },
    ],
  },
};

const terms: Record<Locale, LegalDoc> = {
  it: {
    title: "Termini di servizio",
    updated: "Ultimo aggiornamento",
    intro: "Usando Pausa accetti queste regole semplici.",
    sections: [
      { h: "Il servizio", p: ["Pausa è un diario privato di gruppo per film, serie e anime, con uno strumento per decidere insieme cosa guardare. È offerto così com'è, senza garanzie di disponibilità continua."] },
      { h: "Il tuo account", p: ["Sei responsabile di ciò che pubblichi nelle tue Cerchie. Devi avere almeno 14 anni (o l'età minima di consenso digitale del tuo paese). Gli amministratori di una Cerchia possono rimuovere membri e revocare inviti."] },
      { h: "Contenuti", p: ["Resti titolare di ciò che scrivi. Ci dai solo il permesso di conservarlo e mostrarlo ai membri delle tue Cerchie per far funzionare il servizio. Non pubblicare contenuti illegali, molesti o che violano diritti altrui."] },
      { h: "Dati dei titoli", p: ["Locandine e informazioni sui titoli provengono da TMDB e AniList e restano soggette ai loro termini. Questo prodotto usa l'API TMDB ma non è approvato né certificato da TMDB."] },
      { h: "Uso corretto", p: ["Non abusare del servizio: niente tentativi di accesso non autorizzato, invii massivi di inviti o link di accesso, né uso automatizzato che ne comprometta il funzionamento. Possiamo sospendere gli account che lo fanno."] },
      { h: "Modifiche e chiusura", p: ["Puoi eliminare il tuo account in qualsiasi momento dalla pagina Account. Possiamo aggiornare questi termini; se cambiano in modo rilevante te lo diremo nell'app."] },
    ],
  },
  en: {
    title: "Terms of service",
    updated: "Last updated",
    intro: "By using Pausa you agree to these simple rules.",
    sections: [
      { h: "The service", p: ["Pausa is a private group diary for films, series and anime, with a tool to decide together what to watch. It is provided as is, with no guarantee of continuous availability."] },
      { h: "Your account", p: ["You are responsible for what you post in your Cerchie. You must be at least 14 (or the minimum digital age of consent in your country). A Cerchia's admins can remove members and revoke invites."] },
      { h: "Content", p: ["You keep ownership of what you write. You only give us permission to store it and show it to the members of your Cerchie so the service works. Do not post anything illegal, abusive or that infringes others' rights."] },
      { h: "Title data", p: ["Posters and title information come from TMDB and AniList and remain subject to their terms. This product uses the TMDB API but is not endorsed or certified by TMDB."] },
      { h: "Fair use", p: ["Do not abuse the service: no unauthorised access attempts, mass sending of invites or sign-in links, or automated use that harms it. We may suspend accounts that do."] },
      { h: "Changes and closing", p: ["You can delete your account at any time from the Account page. We may update these terms; if they change materially we will tell you in the app."] },
    ],
  },
  es: {
    title: "Términos del servicio",
    updated: "Última actualización",
    intro: "Al usar Pausa aceptas estas reglas sencillas.",
    sections: [
      { h: "El servicio", p: ["Pausa es un diario privado de grupo para películas, series y anime, con una herramienta para decidir juntos qué ver. Se ofrece tal cual, sin garantía de disponibilidad continua."] },
      { h: "Tu cuenta", p: ["Eres responsable de lo que publicas en tus Cerchie. Debes tener al menos 14 años (o la edad mínima de consentimiento digital de tu país). Los administradores de una Cerchia pueden expulsar miembros y revocar invitaciones."] },
      { h: "Contenido", p: ["Sigues siendo titular de lo que escribes. Solo nos das permiso para guardarlo y mostrarlo a los miembros de tus Cerchie para que el servicio funcione. No publiques nada ilegal, abusivo o que vulnere derechos ajenos."] },
      { h: "Datos de los títulos", p: ["Los pósteres y la información de los títulos vienen de TMDB y AniList y siguen sujetos a sus términos. Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB."] },
      { h: "Uso correcto", p: ["No abuses del servicio: nada de intentos de acceso no autorizado, envíos masivos de invitaciones o enlaces de acceso, ni uso automatizado que lo perjudique. Podemos suspender las cuentas que lo hagan."] },
      { h: "Cambios y cierre", p: ["Puedes eliminar tu cuenta en cualquier momento desde la página Cuenta. Podemos actualizar estos términos; si cambian de forma relevante te lo diremos en la app."] },
    ],
  },
};

export const legalDoc = (kind: "privacy" | "terms", locale: Locale) => (kind === "privacy" ? privacy : terms)[locale];
