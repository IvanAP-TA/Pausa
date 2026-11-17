# Sicurezza: cosa è stato controllato e cosa no

Revisione fatta a mano sul codice a fine sviluppo (17 novembre 2026). Non sostituisce un penetration test.

## Controllato

| Area | Esito |
|---|---|
| **Autenticazione delle azioni** | Ogni azione server (`src/lib/*actions*.ts`, `serata/actions.ts`) comincia con `requireUser()` o `requireAnySession()` (ospiti, solo Serata). Le regole di proprietà (chi può modificare/eliminare cosa) stanno in `src/lib/core/*` e hanno test su un database vero. |
| **Privacy tra Cerchie** | Ogni lettura passa da `getCircleForMember` / `logVisibleTo`. Una Cerchia a cui non appartieni risponde 404. Le segnalazioni accettano solo contenuti che il segnalatore può vedere. |
| **Input** | Tutti i campi sono validati con zod (lunghezze, tipi, valori ammessi). Le query usano Drizzle con parametri, mai testo concatenato. Il contenuto degli utenti è mostrato da React (escape automatico); il JSON-LD sfugge `<`. |
| **Reindirizzamenti** | `next` del login accetta solo percorsi della stessa lingua; `back` delle segnalazioni solo percorsi relativi non `//`; Better Auth controlla gli origin fidati. |
| **Segreti** | Nessun segreto nel repository né nella cronologia git (controllo con ricerca di chiavi note); `.env*` ignorato salvo `.env.example`. Le chiavi di sviluppo (TMDB, VAPID) vanno rigenerate per la produzione. |
| **Scorciatoie di sviluppo** | `/api/dev/login` risponde 404 fuori da `NODE_ENV=development` e da host locali; i limiti di accesso sono spenti solo in sviluppo. |
| **Abusi** | Accesso: 5 link email / 10 minuti e 10 ospiti / ora per IP. Azioni: limiti per persona (Cerchie, inviti, log, commenti, reazioni, Serate, ricerche, importazioni, segnalazioni) in `src/lib/core/limits.ts`. Ospiti vecchi senza Cerchia, sessioni e link scaduti si cancellano ogni giorno. |
| **Dati personali** | Esportazione JSON e cancellazione dell'account dalla pagina Account; la cancellazione passa le Cerchie create a un altro membro. Cookie solo tecnici. |
| **Notifiche push** | Solo account veri; ogni persona rimuove solo i propri dispositivi; invio best-effort che non può far fallire un'azione. |
| **Header HTTP** | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (in `next.config.ts`). |
| **Pagine operatore** | `/admin/metrics` e `/admin/reports`: 404 per chi non è in `ADMIN_EMAILS`; l'azione di risoluzione ricontrolla l'identità. |

## Non fatto (da decidere)

- **Content-Security-Policy**: non impostata. Il tema e gli script inline di Next richiedono i nonce; va aggiunta con un middleware se il modello di rischio lo richiede.
- **Test di intrusione** e scansione automatica delle dipendenze (`npm audit` segnala avvisi su pacchetti di sviluppo; da valutare in CI con Dependabot).
- **2FA** e controllo di dispositivi: l'accesso è solo via link email o Google.
- **Antivirus/ritaglio delle immagini**: non si caricano file dagli utenti (le locandine vengono da TMDB), quindi non serve oggi.
- **Rate limit per indirizzo IP sulle azioni**: oggi è per persona; chi crea molti account è frenato solo dai limiti di accesso.
