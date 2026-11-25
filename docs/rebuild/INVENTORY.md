# INVENTORY — comportamento attuale di Pausa (Next.js 16)

Ricavato dal codice (lettura statica, nulla eseguito) il 2026-11-25. Quattro parti; le lacune sono in `GAPS.md`, i costi di CPU in `BUDGET.md`. `file:line` si riferiscono al repo prima del rebuild.

# Parte 1 — Cerchie, accesso, account, notifiche, operatore
# Inventario 1 — Cerchie, membership, inviti, impostazioni, moderazione, notifiche/push, digest, auth, account, operatore, limiti, cron

Fonte: lettura integrale del codice in `C:\Users\Giuseppe\Desktop\Personal Project\Pausa` (nessun file modificato, niente eseguito). I percorsi sono relativi alla radice del repo; i numeri di riga sono quelli del file sorgente. Dove una cosa è dedotta dal codice e non verificata in esecuzione è scritto "dedotto". Dove il codice non basta a decidere è scritto "non chiaro".

Convenzioni: "utente vero" = sessione Better Auth con `isAnonymous` falso; "ospite" = sessione anonima (esiste solo per la Serata). Tutte le pagine sono sotto `/[locale]/` con `locale ∈ {it,en,es}`, default `it`, prefisso sempre presente (`src/i18n/routing.ts`).

---

## 1. Schermate

### 1.1 `/[locale]/home` — ingresso dell'app
- File: `src/app/[locale]/home/page.tsx`.
- Chi: utente vero. Non loggato oppure ospite → redirect a `/[locale]` (landing pubblica) (riga 21-23).
- Cosa fa: se l'utente ha almeno una Cerchia fa redirect a `/[locale]/c/<id>`, scegliendo quella del cookie `pausa-circle` se l'utente ne fa ancora parte, altrimenti la prima per `joinedAt` crescente (riga 25-30). Con zero Cerchie mostra due form: "crea Cerchia" (`name`, `required`, `maxLength=60`) e "entra con codice" (`code`, `minLength=4`, `maxLength=16`, maiuscole).
- Dati letti: `circle_member` + `circle` (`getMyCircles`, `src/lib/data.ts:24`).
- Azioni collegate: `createCircle`, `joinCircle`.

### 1.2 `/[locale]/sign-in` — accesso
- File: `src/app/[locale]/sign-in/page.tsx`, `sign-in-form.tsx`, `src/components/google-button.tsx`.
- Chi: anonimo e ospite. Un utente vero già loggato viene rimandato a `callbackURL` (riga 16). L'ospite resta sulla pagina: accedere lo "promuove" ad account vero.
- Parametro `?next=`: accettato solo se inizia con `/<locale>/`; altrimenti `callbackURL = /<locale>/home` (riga 13).
- Contenuto: pulsante "Continua con Google" (solo se `GOOGLE_CLIENT_ID`+`GOOGLE_CLIENT_SECRET` sono impostati; nascosto nei browser in-app — WhatsApp, Instagram, WebView Android/iOS — rilevati da `isEmbeddedBrowser`, `src/lib/embedded-browser.ts`; in quel caso compare il testo `auth.embeddedHint`), form email per il link magico (`type=email`, `required`). Dopo l'invio lo stato diventa "sent" e la form sparisce (nessun pulsante "rimanda").
- Solo in `NODE_ENV=development`: quattro link rapidi a `/api/dev/login` per `giulia|marco|sofi|luca@pausa.test`.
- Shell nativa (Tauri): il link magico viene chiesto con `callbackURL = /api/native/done?next=<callbackURL>`; il pulsante Google naviga a `/api/native/start?next=...` (vedi 3.4).
- Dati letti: sessione (`session`, cookie cache).

### 1.3 `/[locale]/join/[code]` — pagina dell'invito
- File: `src/app/[locale]/join/[code]/page.tsx`.
- Chi: chiunque può aprirla. L'ordine dei controlli conta:
  1. `peekInvite` (non consuma l'invito). Se il codice non esiste o lo stato non è `active` viene mostrata **a chiunque, anche anonimo** una pagina con il motivo: `not_found` / `expired` / `revoked` / `exhausted` (riga 16-27).
  2. Solo se l'invito è attivo: se non c'è sessione o la sessione è ospite → redirect a `/[locale]/sign-in?next=/[locale]/join/<code>` (riga 30-33).
  3. Utente vero: mostra il nome della Cerchia e il pulsante che invia `joinCircle` con `code` nascosto.
- Dati letti: `invite` + `circle.name`.
- Nota: il nome della Cerchia non è mai mostrato a un anonimo; lo stato di un codice sì. La pagina (GET) non ha rate limit.
- Nota: chi è già membro e apre un invito scaduto vede "scaduto" (la pagina non guarda la membership), anche se `redeemInvite` lo lascerebbe passare.

### 1.4 `/[locale]/me/circles` — le mie Cerchie
- File: `src/app/[locale]/me/circles/page.tsx` (dentro `me/layout.tsx`).
- Chi: utente vero (`requireUser`).
- Contenuto: elenco delle Cerchie con etichetta "admin" dove il ruolo è `admin`; form "entra" (`code`, `minLength=4`, `maxLength=300`: qui si può incollare il link intero) e form "crea" (`name`, `maxLength=60`).
- Dati letti: `circle_member` + `circle`.

### 1.5 `/[locale]/c/[circleId]/members` — la pagina della Cerchia (membri, inviti, impostazioni)
- File: `src/app/[locale]/c/[circleId]/members/page.tsx`, `copy-invite.tsx`.
- Chi: membro (il layout dà 404 ai non membri). Le parti da admin sono rese solo se `role === "admin"`.
- Contenuto, nell'ordine:
  - Titolo = nome della Cerchia; **admin**: form rinomina (`name`, `maxLength=60`).
  - Banner errore da `?e=` con valori ammessi `forbidden | last_admin | not_member | confirm | word` (riga 60).
  - Sezione inviti: **tutti i membri** vedono gli inviti attivi (codice, scadenza, usi `uses` o `uses/maxUses`) e possono copiare il link `<origin>/<locale>/join/<code>` (`origin = BETTER_AUTH_URL` oppure `https://<Host>`). **Admin**: pulsante "revoca" per invito e form "nuovo invito" con `expiry` (`1d|7d|30d|never`, default `7d`) e `maxUses` (vuoto = illimitato, oppure `1|5|10|25`). Gli inviti non attivi (scaduti, revocati, esauriti) non sono mostrati a nessuno.
  - Elenco membri in ordine di ingresso: avatar, nome (link al profilo `/c/<id>/p/<userId>`), etichetta admin. **Admin, su ogni altro membro**: "rendi admin"/"rendi membro" e "rimuovi" (con un secondo clic di conferma dentro un `<details>`, senza parola da digitare).
  - Impostazioni personali (tutti): `muted` (silenzia la Cerchia), `hideWatching` (nascondi "sta guardando").
  - "Togli le mie visioni da questa Cerchia" (tutti): richiede di digitare la parola `PAUSA` (`CONFIRM_WORD`, `src/lib/core/profile.ts:55`).
  - Impostazioni di gruppo (**admin**): `liveWatching` (checkbox), `description` (textarea `maxLength=280`), `cover` (radio: nessuna o una di `popcorn, clapper, moon, sofa, star, ghost, rocket, heart`).
  - Link a liste, insights, importazione, account.
  - "Esci dalla Cerchia" (tutti, conferma con secondo clic). **Admin**: "Elimina la Cerchia" con il nome della Cerchia da ridigitare.
- Dati letti: `circle`, `circle_member`, `user` (membri), `invite` (tutti gli inviti della Cerchia, poi filtrati in memoria).
- **Bug osservato** (riga 61): `const removedCount = ... /^d+$/.test(removed)`. Manca la barra rovesciata (`\d`): l'espressione accetta solo stringhe fatte di lettere "d", quindi `removedCount` è sempre `null` e il messaggio di conferma `removeMineDone` dopo l'azione `PAUSA` non compare mai.

### 1.6 `/[locale]/c/[circleId]/notifications` — casella notifiche
- File: `src/app/[locale]/c/[circleId]/notifications/page.tsx`, `mark-read.tsx`.
- Chi: membro della Cerchia nell'URL.
- Contenuto: le ultime 50 notifiche **dell'utente in tutte le Cerchie** (la query non filtra per `circleId`; `getNotifications`, `src/lib/data.ts:217`), più recenti prima: quadratino se non letta, avatar dell'attore, testo `notifications.<type>` con nome/titolo/Cerchia, tempo relativo. Il link va a `/c/<n.circleId ?? circleId corrente>/l/<logId>` se c'è un log, altrimenti al feed di quella Cerchia.
- Effetto: se c'è almeno una non letta, il componente client `MarkRead` chiama `markNotificationsRead()` al montaggio, che segna lette **tutte** le notifiche dell'utente.
- Niente paginazione, niente filtro, niente cancellazione, niente "segna come non letta".
- Dati letti: `notification`, `user` (attore), `circle`, `log`/`media_entity`/`media_title`.

### 1.7 `/[locale]/account` — account
- File: `src/app/[locale]/account/page.tsx`.
- Chi: utente vero.
- Contenuto: email (sola lettura); conteggio "persone portate" (`peopleBrought`) e badge "Fondatore" da `FOUNDER_AT = 3` (`src/lib/core/circles.ts:195`); link a `/me/edit`; lingua e tema (`Preferences`: lingua = cambio di URL, tema = cookie `pausa-theme`, nessuno dei due salvato sul server); interruttore push di questo dispositivo (`PushToggle`, solo se `pushEnabled()`), altrimenti testo `pushSettings.off`; form "che avvisi vuoi" con una checkbox per ognuno dei 6 tipi (`log, comment, reaction, now_watching, serata_invite, circle_join`) più `emailDigest`; servizi di streaming (altra area); esportazione dati (`/api/account/export`); logout; eliminazione account (email da ridigitare); link privacy/termini.
- Dati letti: `user` (`emailDigest`), `notification_off`, `invite_use`+`invite`, `circle_member`, `user_provider`, cookie.

### 1.8 `/[locale]/admin/metrics` — metriche (operatore)
- File: `src/app/[locale]/admin/metrics/page.tsx`, calcolo in `src/lib/core/metrics.ts`.
- Chi: utente vero la cui email è in `ADMIN_EMAILS`; chiunque altro → `notFound()` (riga 18). Nessun link nell'interfaccia porta a questa pagina (cercato `admin/` in `src`: solo le due pagine e un `revalidatePath`). Testi solo in italiano, non tradotti.
- Contenuto: totali (persone non ospiti, Cerchie, visioni, Serate) e 8 indicatori: Cerchia entro 7 giorni dall'iscrizione; visioni per Cerchia attiva a settimana (ultime 4 settimane); Cerchie con liste di gruppo; tempo mediano della Serata e quota sotto 120 s; Serate con Card / link condivisi; retention Cerchie a 7 e 30 giorni; adozione di "Sto guardando". "n.d." quando il denominatore è zero.
- Dati letti: tabelle intere `user, circle_member, circle, log, serata, list, event, now_watching, notification(type=now_watching)`.

### 1.9 `/[locale]/admin/reports` — segnalazioni (operatore)
- File: `src/app/[locale]/admin/reports/page.tsx`.
- Chi: come 1.8.
- Contenuto: segnalazioni aperte dalla più vecchia (tipo, motivo, nome di chi segnala, nome della Cerchia, estratto, nota) con due pulsanti: "Rimuovi il contenuto" e "Ignora"; sotto, le ultime 20 chiuse (esito + estratto).
- Dati letti: `report`, `user` (segnalatore), `circle`.
- Non mostra: l'autore del contenuto, un link al contenuto, la data, quante persone hanno segnalato la stessa cosa.

### 1.10 `/[locale]/review` — accesso per i revisori degli store
- File: `src/app/[locale]/review/page.tsx`, `actions.ts`.
- Chi: chiunque, ma la pagina esiste solo se `REVIEW_EMAIL` e `REVIEW_PASSWORD` sono impostate; altrimenti `notFound()`.
- Contenuto: una sola casella password (testi in inglese fissi). `?error=1` → "Wrong password."; `?error=slow` → "Too many attempts. Try again in an hour."

### 1.11 `/[locale]/slow-down` — "rallenta"
- File: `src/app/[locale]/slow-down/page.tsx`. Pubblica, statica. È dove porta `enforce()` quando un limite per persona è superato. Un solo pulsante verso `/`.

### 1.12 Cornici e componenti condivisi
- `src/app/[locale]/c/[circleId]/layout.tsx`: `requireUser`, poi `getCircleForMember`; non membro → **404** (non 403: anche l'esistenza della Cerchia è privata). Carica le mie Cerchie e il conteggio non lette e monta `Shell` con `remember` (scrive il cookie `pausa-circle`) e `aside`.
- `src/app/[locale]/me/layout.tsx`: `requireUser`; la Cerchia di contesto è quella del cookie `pausa-circle` o la prima.
- `src/components/shell.tsx`, `space-switch.tsx`, `space-menu.tsx`: barra in alto con il nome della Cerchia corrente (menu con tutte le mie Cerchie + voce "altre Cerchie" → `/me/circles`) e campanella verso `/c/<id>/notifications` con badge non lette (`9+` oltre 9). Il badge conta le non lette di tutte le Cerchie.
- `src/components/circle-memory.tsx`: cookie `pausa-circle=<circleId>; Path=/; Max-Age=31536000; SameSite=Lax` (scritto dal client, non HttpOnly).
- `src/components/report-form.tsx`: form "Segnala" (motivo `abuse|spam|privacy|other`, default `abuse`; nota `maxLength=500`), usata solo in `src/app/[locale]/c/[circleId]/l/[logId]/page.tsx`.
- `src/components/confirm-form.tsx`: dialog modale generico di conferma (nessuna delle azioni di quest'area lo usa: qui le conferme sono `<details>` + secondo pulsante).
- `src/components/logout-button.tsx`: `authClient.signOut()` e poi navigazione completa a `/<locale>`.
- `src/components/push-toggle.tsx`: stati `loading | unsupported | off | on | blocked | needs-install`. Su iPhone/iPad non installato come app → `needs-install` (solo un testo). Registra `/sw.js`.
- Pagina HTML di `/api/native/done` (vedi 3.4): "Accesso riuscito / Apri Pausa" in it/en/es.

---

## 2. Azioni

Regola generale: ogni server action comincia con `requireUser()` (`src/lib/session.ts:10`): senza sessione, o con sessione ospite, redirect a `/<locale>/sign-in`. Gli errori di validazione zod sono eccezioni non gestite (pagina d'errore), non messaggi nel form. La lingua del redirect viene dal campo nascosto `locale` (se non valido: `it`).

### 2.1 Cerchie e inviti — `src/lib/actions.ts`

**`createCircle`** — `src/lib/actions.ts:34`
- Validazione: `name` = stringa, trim, 1..60 caratteri.
- Autorizzazione: utente vero.
- Limite: `createCircle: { max: 5, windowMs: 3_600_000 }` (5 all'ora per persona).
- Scrive: `circle` (`createdBy` = utente), `circle_member` (ruolo `admin`), `invite` (primo invito: scadenza `DEFAULT_INVITE_MS = 14 * 86_400_000`, `maxUses` null). Tre insert separati, non in transazione (`createCircleWithInvite`, `src/lib/core/circles.ts:117`).
- Poi: redirect a `/<locale>/c/<id>`. Nessuna notifica.

**`joinCircle`** — `src/lib/actions.ts:43`
- Normalizzazione del codice (riga 48-49): trim; taglia a `?` o `#`; prende l'ultimo segmento dopo `/` (così va bene anche il link intero); maiuscolo; toglie tutto ciò che non è `A-Z0-9`; tronca a 16. Se resta meno di 4 caratteri → redirect a `/<locale>/join/<code o "-">` (che dirà "non esiste").
- Limite: `joinCircle: { max: 20, windowMs: 3_600_000 }` ("also stops guessing invite codes"). Il colpo è contato prima della validazione.
- Logica `redeemInvite` (`src/lib/core/circles.ts:83`): codice sconosciuto → `not_found`; **già membro → passa senza consumare un uso, anche se l'invito è scaduto/revocato**; stato non `active` → errore con lo stato; altrimenti un solo `UPDATE ... SET uses = uses + 1 WHERE` non revocato, non esaurito, non scaduto `RETURNING` (se zero righe → `exhausted`: due persone non possono spendere l'ultimo uso); poi insert `circle_member` (ruolo `member`, `onConflictDoNothing`) e `invite_use` (`onConflictDoNothing`).
- In caso d'errore: redirect alla pagina `/join/<code>` che spiega il motivo.
- Effetti (solo se non era già membro): notifica `circle_join` a tutti gli altri membri filtrati da `filterRecipients` (non chi ha silenziato la Cerchia, non chi ha spento il tipo), righe in `notification` (`actorId` = chi entra, `circleId`) e push.
- Poi: redirect a `/<locale>/c/<circleId>`.

**`createInviteAction`** — `src/lib/actions.ts:77`
- Validazione: `circleId` non vuoto; `expiry` ∈ chiavi di `EXPIRY_CHOICES = { "1d": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, never: null }`; `maxUses` vuoto → `null`, altrimenti numero in `MAX_USES_CHOICES = [1, 5, 10, 25]`.
- Autorizzazione: `circle_member.role === "admin"` per quella Cerchia; altrimenti redirect a `/members?e=forbidden`.
- Limite: `createInvite: { max: 20, windowMs: 3_600_000 }` (contato prima del controllo admin).
- Scrive: `invite` (codice nuovo, `uses = 0`). Nessun tetto al numero di inviti attivi per Cerchia.

**`revokeInviteAction`** — `src/lib/actions.ts:93`
- Validazione: `circleId`, `inviteId` non vuoti.
- Autorizzazione: admin della Cerchia (`revokeInvite`, `src/lib/core/circles.ts:69`); altrimenti `?e=forbidden`.
- Scrive: `invite.revokedAt = now` dove `id` e `circleId` combaciano e non è già revocato. Un `inviteId` inesistente non dà errore. Nessun limite. Non si può "riattivare" un invito.

**`setMemberRoleAction`** — `src/lib/actions.ts:102`
- Validazione: `targetId` non vuoto; `role` ∈ `admin | member`.
- Autorizzazione (`setMemberRole`, `src/lib/core/circles.ts:132`): l'attore deve essere admin (`forbidden`); il bersaglio deve essere membro (`not_member`); non si può retrocedere l'ultimo admin (`last_admin`). Un admin può retrocedere un altro admin, creatore compreso; un admin può retrocedere sé stesso se ce n'è un altro.
- Scrive: `circle_member.role`. Nessuna notifica al bersaglio. Nessun limite.

**`removeMemberAction`** — `src/lib/actions.ts:112`
- Autorizzazione (`removeMember`, `src/lib/core/circles.ts:145`): se `targetId` = attore si comporta come `leaveCircle`; altrimenti attore admin (`forbidden`), bersaglio membro (`not_member`). **Nessun controllo sul ruolo del bersaglio: un admin può rimuovere un altro admin, creatore compreso.**
- Scrive: cancella la riga `circle_member`. Non tocca `log`, `log_share`, `notification`, `invite` della persona rimossa. Nessuna notifica alla persona rimossa. Nessun limite.
- La persona rimossa può rientrare con qualunque invito ancora attivo (non esiste una lista di esclusi).

**`leaveCircleAction`** — `src/lib/actions.ts:121`
- Logica (`leaveCircle`, `src/lib/core/circles.ts:157`): non membro → `not_member`; se è l'ultimo membro la Cerchia viene **eliminata** (`circle` cancellata, cascata su membri, inviti, liste di gruppo, notifiche, segnalazioni, `log_share`); se è l'unico admin e ci sono altri membri → `last_admin` (deve prima nominare un altro admin); altrimenti cancella la propria riga `circle_member`.
- Poi: redirect a `/<locale>/home`; in errore torna a `/members?e=<errore>`. Nessun limite, nessuna parola di conferma.

**`markNotificationsRead`** — `src/lib/actions.ts:362`
- Nessun parametro. Scrive `notification.readAt = now` su tutte le non lette dell'utente (tutte le Cerchie). Nessun limite.

### 2.2 Gestione — `src/lib/manage-actions.ts`

**`renameCircleAction`** — riga 102
- Validazione: `circleId` 1..64; `name` trim 1..60. Autorizzazione: admin (`renameCircle`, `src/lib/core/content.ts:57`), altrimenti `?e=forbidden`. Scrive `circle.name`. Nessun limite.

**`saveCircleSettingsAction`** — riga 210
- Validazione: `description` stringa max 600 (zod) poi trim e **troncata a 280** in `setCircleProfile` (`src/lib/core/settings.ts:41`); vuota → `null`. `cover` vuoto → `null`, altrimenti deve essere uno degli 8 preset (`COVERS`); un valore non valido dà `invalid`, che l'azione mostra comunque come `?e=forbidden`.
- Autorizzazione: admin (controllata due volte, in `setCircleProfile` e `setLiveWatching`).
- Scrive: `circle.description`, `circle.cover`, `circle.liveWatching` (checkbox `liveWatching === "on"`).
- Poi: `/members?saved=1#settings`.

**`saveMemberPrefsAction`** — riga 226
- Chiunque sia membro. Scrive `circle_member.muted` e `circle_member.hideWatching` per (Cerchia, utente). Se non è membro `setMemberPrefs` restituisce `not_member` ma l'azione ignora il risultato e fa lo stesso redirect "salvato".

**`saveNotificationPrefsAction`** — riga 235
- Per ognuno dei 6 tipi: checkbox `type_<tipo>` spuntata = acceso. Scrive `notification_off`: cancella tutte le righe dell'utente e inserisce quelle dei tipi spenti (`setDisabledTypes`, `src/lib/core/settings.ts:62`).
- `emailDigest`: scrive `user.emailDigest`; **quando viene acceso** scrive anche `user.locale` con la lingua della pagina (`setEmailDigest`, riga 68). È l'unico punto dell'app che scrive `user.locale` (oltre all'account di revisione).
- Poi: `/account?saved=1`.

**`deleteCircleAction`** — riga 191
- Autorizzazione: membro con ruolo admin, altrimenti `?e=forbidden`.
- Conferma: il campo `name` (trim) deve essere **identico** al nome della Cerchia (maiuscole/minuscole comprese), altrimenti `?e=confirm`.
- Scrive: cancella `circle`; per cascata spariscono `circle_member`, `invite`, `invite_use`, `list` di gruppo e `list_item`, `log_share`, `notification` e `report` della Cerchia; `serata.circleId` e `import_batch.circleId` diventano null. I log restano ai loro autori.
- Nessuna notifica ai membri. Nessun limite. Poi `/home`.

**`deleteAccountAction`** — riga 154
- Conferma: il campo `email` (trim, minuscolo) deve essere uguale all'email dell'account, altrimenti `/account?e=confirm`.
- Ordine: prima `auth.api.signOut` (cancella cookie di sessione e cookie cache), poi `deleteAccount` (`src/lib/core/account.ts:52`), poi redirect a `/<locale>?deleted=1`.
- `deleteAccount`: per ogni Cerchia **creata** dall'utente (`circle.createdBy`): l'erede è l'altro membro più vecchio per `joinedAt`; se non c'è, la Cerchia è eliminata; se c'è, diventa `admin`, `circle.createdBy` passa a lui e così gli inviti creati dall'utente in quella Cerchia. Liste di gruppo di proprietà dell'utente → passano all'altro membro più vecchio. Altri inviti creati dall'utente → attribuiti all'altro membro più vecchio della Cerchia, o cancellati se non c'è. `list_item.addedBy` → riattribuito al proprietario della lista, o riga cancellata se la lista è sua. Infine `DELETE user`: per cascata vanno via sessioni, account collegati, membership, log, commenti, reazioni, notifiche (ricevute e causate), push, preferenze, voti e posti di Serata, Serate ospitate, liste personali, preferiti, importazioni.
- Non è in transazione. Nessun limite. Nessuna email di conferma. Nessun periodo di ripensamento.

**`reportAction`** — riga 168
- Validazione: `kind` ∈ `comment | log`; `targetId` 1..64; `reason` ∈ `spam | abuse | privacy | other`; `note` opzionale, trim, max 500.
- Limite: `report: { max: 20, windowMs: 3_600_000 }`.
- Logica (`createReport`, `src/lib/core/moderation.ts:22`): chi segnala deve poter vedere il contenuto (è l'autore del log, oppure condivide almeno una Cerchia con l'autore del log); non può segnalare il proprio contenuto (`own`); contenuto inesistente/non visibile → `not_found`. Scrive `report` con `circleId` = una Cerchia in comune fra segnalatore e autore (la prima trovata), `excerpt` = istantanea del testo tagliata a 280 caratteri (per un log: `"<titolo>: <recensione>"` o solo il titolo), `note` tagliata a 500. Indice unico `(reporterId, kind, targetId)` + `onConflictDoNothing`: segnalare due volte è una segnalazione sola.
- L'azione **ignora il risultato**: anche con `own`/`not_found` reindirizza a `back?reported=1`. `back` è accettato solo se inizia con `/` e non con `//`, altrimenti `/`.
- Nessun effetto automatico: niente viene nascosto, nessuna notifica a operatori, autore o admin della Cerchia.

**`resolveReportAction`** — riga 183
- Autorizzazione: `isOperator(user.email)`; altrimenti `throw new Error("Not found")` (un'eccezione, non un vero 404).
- Validazione: `reportId` 1..64; `action` ∈ `dismiss | remove`.
- Logica (`resolveReport`, `src/lib/core/moderation.ts:64`): `remove` cancella il `comment` o l'intero `log` (con commenti, reazioni, condivisioni per cascata — sparisce da tutte le Cerchie e dal diario dell'autore); poi chiude **tutte** le segnalazioni aperte sullo stesso oggetto con `resolvedAt` e `resolution = removed | dismissed`. Segnalazione già chiusa o inesistente → `not_found` (ignorato dall'azione).
- Nessuna notifica ad autore o segnalatore. Nessuna azione sull'utente.

### 2.3 Push — `src/lib/push-actions.ts`

**`subscribePush`** — riga 16
- Validazione: `endpoint` URL, max 1000, deve iniziare con `https://`; `p256dh` 10..200; `auth` 10..100; `locale` max 5 (valori diversi da `en`/`es` diventano `it`).
- Scrive `push_subscription` con upsert su `endpoint`: un browser che passa a un altro account viene **riassegnato**, mai duplicato (`saveSubscription`, `src/lib/core/push.ts:37`). Nessun limite, nessun tetto di dispositivi.

**`unsubscribePush`** — riga 22
- `endpoint` max 1000. Cancella solo se `endpoint` **e** `userId` combaciano (non si possono spegnere i dispositivi altrui).

**Invio** — `src/lib/push.ts`
- `pushEnabled()` = `VAPID_PRIVATE_KEY` e `NEXT_PUBLIC_VAPID_PUBLIC_KEY` presenti. `pushNotifications(events)` parte dopo la scrittura delle righe `notification`, in `ctx.waitUntil` (non blocca la risposta, un errore non fa fallire l'azione).
- Per ogni evento e per ogni dispositivo del destinatario: testo nella lingua **del dispositivo** (`push_subscription.locale`), titolo = nome della Cerchia o "Pausa", corpo `push.<type>` con nome dell'attore e titolo **originale** del film (non localizzato); `url` = `/<locale>/s/<serataCode>` | `/<locale>/c/<circleId>/l/<logId>` | `/<locale>/c/<circleId>` | `/<locale>`; `tag` = `logId` oppure il tipo (una notifica più nuova sullo stesso log sostituisce la vecchia); `ttl = 60*60*24`, `urgency: "normal"`. Risposta 404/410 dal servizio push → la sottoscrizione viene cancellata.
- Service worker `public/sw.js`: mostra la notifica (icona `/pwa-icon/192`), al tocco porta in primo piano una finestra dell'app e la naviga all'URL, o ne apre una nuova. Mette in cache solo `/offline.html`.

### 2.4 Accesso di revisione — `src/app/[locale]/review/actions.ts`

**`reviewSignIn`** — riga 12
- Se `REVIEW_EMAIL`/`REVIEW_PASSWORD` mancano → redirect `/`.
- Limite **per IP** (`cf-connecting-ip`, poi primo valore di `x-forwarded-for`, poi `"local"`): `reviewLogin: { max: 10, windowMs: 3_600_000 }`; oltre → `/en/review?error=slow`.
- Password confrontata in tempo costante (SHA-256 dei due valori, XOR byte a byte; `passwordMatches`, `src/lib/review.ts:14`). Sbagliata → `/en/review?error=1`.
- Giusta: `ensureReviewAccount` (`src/lib/core/review.ts:30`), poi `wantReviewLink(email)`, `auth.api.signInMagicLink({ email, callbackURL: /en/c/c-review })`, `takeReviewLink()` e redirect al link magico (vedi 3.5).

### 2.5 Azioni sulla stessa pagina ma di file "di confine"

**`removeMyLogsFromCircleAction`** — `src/lib/profile-actions.ts:55` (sta nella pagina membri)
- Autorizzazione: membro (altrimenti `/home`). Conferma: `word` trim + maiuscolo deve essere `PAUSA`, altrimenti `/members?e=word#mine`.
- Logica (`removeMyLogsFromCircle`, `src/lib/core/profile.ts:65`): i miei log con `scope = "circles"` diventano `private` e vengono condivisi uno per uno (`log_share`, con `createdAt` = data originale del log) con **tutte le altre** mie Cerchie; i miei log privati condivisi con questa Cerchia perdono la riga `log_share`. Niente viene cancellato. Scritture a blocchi (40 log / 25 righe / 80 cancellazioni) per i limiti di D1.
- Poi: `/members?removed=<n>#mine` (ma vedi il bug in 1.5).

**`trackEvent(name, serataCode)`** — `src/lib/events.ts:10`
- `name` ∈ `card_shared | invite_shared`; codice 4..16. Serve una sessione qualsiasi (anche ospite) e una Serata esistente. Una riga `event` per (nome, utente, Serata) al massimo. Ogni errore è ingoiato. Alimenta solo le metriche operatore.

**`src/lib/space-actions.ts`** (spazio personale: visibilità dei log; lo riporto perché assegnato, ma è materia del diario)
- `shareLogAction` (riga 32): limite `shareLog: { max: 300, windowMs: 3_600_000 }`; solo l'autore, solo verso una Cerchia di cui è membro; un log già `circles` non fa nulla; scrive `log_share`.
- `unshareLogAction` (riga 43): solo l'autore; cancella la riga `log_share`.
- `setLogScopeAction` (riga 53): `scope` ∈ `circles | private`; aggiorna `log.scope` e cancella **tutte** le `log_share` del log in entrambi i casi.
- `deleteMyLogAction` (riga 64): solo l'autore; cancella il log.
- `getTitleDetail` (riga 74): lettura sinossi/generi.
- Nessuna di queste crea notifiche (condividere un log privato in una Cerchia non avvisa nessuno).

### 2.6 Chiamate client a Better Auth (non sono server action)
- `authClient.signIn.magicLink({ email, callbackURL })` — `sign-in-form.tsx:22` → `POST /api/auth/sign-in/magic-link`.
- `authClient.signIn.social({ provider: "google", callbackURL })` — `google-button.tsx:60`.
- `authClient.signOut()` — `logout-button.tsx:16`. Chiude solo la sessione corrente. Non rimuove la sottoscrizione push del dispositivo.
- Il client registra solo i plugin `magicLinkClient` e `anonymousClient` (`src/lib/auth-client.ts`).

### 2.7 Route API

**`GET|POST /api/auth/[...all]`** — `src/app/api/auth/[...all]/route.ts`
- Handler di Better Auth con una correzione davanti: sugli endpoint che creano una sessione (`/magic-link/verify`, `/sign-in/anonymous`, `/callback/<provider>`), se il browser manda cookie di sessione (`better-auth.session_token | session_data | dont_remember`, anche con prefisso `__Secure-`) che **non** corrispondono a una sessione viva (controllo con `disableCookieCache: true`), quei cookie vengono tolti dalla richiesta prima di passarla a Better Auth. Motivo documentato: con un cookie firmato ma morto il primo accesso falliva in silenzio. Una sessione viva viene lasciata (serve per collegare l'ospite all'account).

**`GET /api/native/start?next=`** — `src/app/api/native/start/route.ts`
- 404 se Google non è configurato. `next` passa da `safeNext` (deve iniziare con `/`, non con `//`, senza `\`; altrimenti `/it`). Se il browser ha già una sessione non ospite → redirect diretto a `/api/native/done?next=`. Altrimenti `auth.api.signInSocial({ provider: "google", callbackURL: done })` e redirect all'URL di Google copiando i `Set-Cookie` (cookie di stato OAuth). 502 se manca l'URL.

**`GET /api/native/done?next=`** — `src/app/api/native/done/route.ts`
- Senza sessione → redirect a `/it/sign-in?next=<next>` (lingua fissa `it`). Con sessione (**anche ospite**: controlla solo `!session`): `auth.api.generateOneTimeToken` e pagina HTML (`cache-control: no-store`, `referrer-policy: no-referrer`, `noindex`) che fa `location.href = "pausa://auth?token=<token>&next=<next>"` e mostra un pulsante di riserva. La lingua della pagina viene dal primo segmento di `next`, default inglese.

**`GET /api/native/exchange?token=&next=`** — `src/app/api/native/exchange/route.ts`
- Senza token, token non valido o eccezione → redirect a `/it/sign-in`. Altrimenti `auth.api.verifyOneTimeToken` e redirect 303 a `next` copiando i `Set-Cookie` della nuova sessione.

**`GET /api/dev/login?email=&next=`** — `src/app/api/dev/login/route.ts`
- 404 se `NODE_ENV !== "development"` o se l'host non è locale (`localhost`, `127.0.0.1`, `192.168.*`, `10.*`, `172.16-31.*`). 400 se l'email non finisce con `@pausa.test` o `next` non inizia con `/`. Chiede un link magico, lo prende da `globalThis.__pausaDevLinks` e ci reindirizza.

**`GET /api/account/export`** — `src/app/api/account/export/route.ts`
- Utente vero, altrimenti 401. Risponde JSON scaricabile (`pausa-data.json`, `no-store`) con: `exportedAt`, `profile` (`id, name, email, locale, bio, favoriteGenres, createdAt`), `circles` (`id, name, role, joinedAt`), `logs` (`id, title, kind, year, watchedOn, rating, review, platform, isRewatch, createdAt`), `comments` scritti dall'utente (`id, logId, body, createdAt`), `lists` di sua proprietà con i titoli, `nowWatching`, `favorites`. Nessun limite.
- Non contiene (confronto con lo schema): reazioni, stagione/episodio/`scope`/`containsSpoilers`/"visto con" dei log, condivisioni, immagine, paese, servizi di streaming, preferenze di notifica e digest, dispositivi push, notifiche, partecipazioni e voti di Serata, segnalazioni fatte, importazioni, sessioni. (Il commento nel codice dice che include i commenti altrui sui propri log: la query in realtà prende solo `comment.userId = utente`.)

**`GET /api/config`** — `src/app/api/config/route.ts`
- Pubblica. `{ google: boolean }`, cache 300 s. Serve alle pagine prerenderizzate per decidere se mostrare il pulsante Google.

### 2.8 Cron (Cloudflare `scheduled`, `worker.ts:24`, `wrangler.jsonc` `triggers.crons`)

**Pulizia — `"17 3 * * *"` (03:17 UTC, ogni giorno)** → `runCleanup` (`src/lib/core/cleanup.ts:21`)
- Cancella gli utenti ospiti (`isAnonymous = true`) creati da più di `GUEST_RETENTION_DAYS = 30` giorni che **non** sono membri di nessuna Cerchia (posti e voti di Serata via cascata; le Serate ospitate da loro vanno via per cascata su `hostId` — il commento dice "the Serata results stay", il test copre solo il caso del posto da partecipante).
- Cancella `session` con `expiresAt < now` e `verification` con `expiresAt < now`.
- `pruneLimits`: cancella i contatori `rate_limit` con `lastRequest` più vecchio di 2 giorni (`olderThanMs = 2 * 86_400_000`) — vale anche per le chiavi di Better Auth, che stanno nella stessa tabella.
- Registra `[pausa] cleanup {guests, sessions, verifications}`.
- Qualunque cron diverso da `0 17 * * *` finisce in questo ramo.

**Digest email — `"0 17 * * *"` (17:00 UTC, ogni giorno)** → `runDigests` (`src/lib/core/mailer.ts:50`)
- Destinatari (`pendingDigests`, `src/lib/core/digest.ts:18`): `user.emailDigest = true`, non ospite, **nessuna** riga in `push_subscription`, e almeno una notifica non letta creata dopo `max(digestSentAt, now − 3 giorni)` (`DIGEST_MAX_LOOKBACK_DAYS = 3`).
- Contenuto: fino a `DIGEST_MAX_ITEMS = 10` voci, più recenti prima, con le stesse frasi delle push nella lingua `user.locale` (default `it`), più "…e altre N novità", un pulsante verso `<BETTER_AUTH_URL>/<locale>` e la riga "Puoi disattivare questa email dalla pagina Account". Oggetto: `email.digest.subject`. Il testo scritto dagli utenti è sottoposto a escape HTML.
- Invio via Resend (`POST https://api.resend.com/emails`), mittente `EMAIL_FROM` o `Pausa <accesso@pausa.gnagno.org>`. `digestSentAt` avanza **solo** per le email andate a buon fine; senza `RESEND_API_KEY` non invia e non segna.
- Il digest non segna le notifiche come lette. Nessun link di disiscrizione a un clic, nessuna intestazione `List-Unsubscribe`.

**Errori** — `src/instrumentation.ts`: ogni errore server non gestito va a Sentry se `SENTRY_DSN` è impostata (`src/lib/core/sentry.ts`, senza SDK; la query string non viene mai inviata).

### 2.9 Fuori dalla mia area (solo nomi)
- `src/lib/actions.ts`: `createLog`, `toggleReaction`, `getEpisodeLimits`, `searchMedia`, `createList`, `addToList`, `addComment`, `setNowWatching`, `advanceWatching`, `clearNowWatching`.
- `src/lib/manage-actions.ts`: `updateLogAction`, `deleteLogAction`, `updateCommentAction`, `deleteCommentAction`, `moveListItemAction`, `removeListItemAction`, `renameListAction`, `deleteListAction`.
- `src/lib/profile-actions.ts`: `saveProfileAction`, `addFavoriteAction`, `removeFavoriteAction`.
- `src/lib/discover-actions.ts` (`saveServicesAction`), `src/lib/serata/actions.ts` (crea le notifiche `serata_invite`, riga 65-72).
- Di queste, quelle che creano notifiche con le regole di questo inventario: `createLog` (`log`), `toggleReaction` (`reaction`), `addComment` (`comment`), `setNowWatching` (`now_watching`), apertura Serata (`serata_invite`).

---

## 3. Regole trasversali

### 3.1 Ruoli
- Nella Cerchia esistono solo due ruoli: `admin` e `member` (`circle_member.role`). **Non esiste un "proprietario"**: `circle.createdBy` serve solo a decidere l'erede quando il creatore elimina l'account.
- `member`: vede tutto della Cerchia, vede e copia gli inviti attivi, cambia le proprie preferenze (`muted`, `hideWatching`), toglie le proprie visioni, esce.
- `admin`: in più rinomina, descrizione/copertina/`liveWatching`, crea e revoca inviti, promuove/retrocede chiunque, rimuove chiunque (anche altri admin), elimina la Cerchia. (In altra area: un admin può eliminare una lista di gruppo altrui, test `content.test.ts:100`.)
- Invarianti: una Cerchia con più di un membro non resta senza admin **tramite retrocessione o uscita** (`last_admin`); l'ultimo membro che esce chiude la Cerchia. L'invariante si rompe con l'eliminazione dell'account (vedi Lacune 5.2).
- Operatore: email in `ADMIN_EMAILS` (separate da virgola, confronto minuscolo); in `development` senza variabile vale `giulia@pausa.test` (`src/lib/operator.ts`). Può solo vedere metriche e chiudere segnalazioni. Non ha poteri dentro le Cerchie.
- Ospite (anonimo): solo Serata. `requireUser` lo manda al sign-in.
- Non membro: ogni lettura passa da `getCircleForMember`; risposta 404.

### 3.2 Inviti
- Codice: 8 caratteri dall'alfabeto di 32 simboli `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (senza `0 O 1 I`), da `crypto.getRandomValues` (`src/lib/core/circles.ts:7-11`) = 40 bit. Colonna `invite.code` unica; una collisione darebbe un errore di insert non gestito.
- Più inviti per Cerchia. Scadenza: `1d | 7d | 30d | never`; il primo invito automatico dura 14 giorni. Usi massimi: `1 | 5 | 10 | 25` o illimitato.
- Stato (`inviteState`, riga 23), in ordine di precedenza: `revoked` > `expired` (`expiresAt <= now`) > `exhausted` (`uses >= maxUses`) > `active`.
- Link: `<origin>/<locale>/join/<CODE>`. Il codice si può anche digitare o incollare (anche il link intero) nelle form.
- Chi entra è sempre `member`. `invite_use` registra chi è entrato con quale invito (base per "persone portate": persone distinte entrate con inviti **creati** da me, me escluso; 3 → badge Fondatore).
- Difese contro l'indovinare i codici: solo il limite `joinCircle` 20/ora per persona sull'azione; la pagina `/join/<code>` risponde senza limite e dice lo stato del codice.

### 3.3 Sessioni, cookie, token (`src/lib/auth.ts`)
- Better Auth con adattatore Drizzle su D1 (tabelle `user, session, account, verification, rate_limit`). Plugin: `anonymous`, `magicLink`, `oneTimeToken`, `nextCookies`.
- Sessione: `expiresIn: 60 * 60 * 24 * 60` (60 giorni), `updateAge: 60 * 60 * 24` (rinnovo al massimo una volta al giorno), `cookieCache: { enabled: true, maxAge: 5 * 60 }` → una sessione revocata può restare valida fino a 5 minuti (scritto nel commento).
- Cookie di sessione: `better-auth.session_token`, `better-auth.session_data`, `better-auth.dont_remember`, con prefisso `__Secure-` in produzione (nomi ricavati dalla regex in `src/app/api/auth/[...all]/route.ts:15`; gli attributi sono quelli predefiniti di Better Auth, non configurati qui).
- Altri cookie (client, non HttpOnly, 1 anno, `SameSite=Lax`): `pausa-circle` (ultima Cerchia), `pausa-theme` (`system | light | dark`, default `dark`).
- Metodi di accesso: link via email (scade in `60 * 15` s = 15 minuti; email da Resend, in sviluppo senza chiave il link è stampato nel log e tenuto in `globalThis.__pausaDevLinks`; in produzione senza `RESEND_API_KEY` lancia errore), Google OAuth (se configurato), anonimo (solo Serata). Niente password, niente 2FA.
- Collegamento account: `accountLinking: { enabled: true, trustedProviders: ["google"], updateUserInfoOnLink: true }` → stessa email da link e da Google = stesso account; nome e immagine di Google vengono copiati al collegamento.
- Nome mai vuoto: alla creazione `name = name.trim() || parte prima della @ || "Pausa"`.
- Ospite → account (`onLinkAccount`, riga 59): copia il nome dell'ospite se il nuovo account non ne ha, copia le membership, sposta i `log`, i posti e i voti di Serata sul nuovo utente.
- IP per i limiti: intestazioni `cf-connecting-ip`, poi `x-forwarded-for`.
- `trustedOrigins`: solo in sviluppo (`http://127.0.0.1:3000` + `DEV_ORIGINS`).
- Limiti di Better Auth (per IP, in D1, **spenti in development**): generale `window: 60, max: 60`; `"/sign-in/magic-link": { window: 600, max: 5 }`; `"/sign-in/anonymous": { window: 3600, max: 10 }`.
- Non chiaro dal codice: se questi limiti si applichino anche alle chiamate lato server `auth.api.signInMagicLink` (usate da `/review` e `/api/dev/login`) o solo alle richieste HTTP verso `/api/auth/*`.
- Redirect sicuri: `next` del sign-in solo se inizia con `/<locale>/`; `safeNext` per la shell nativa; `back` delle segnalazioni solo percorsi relativi.

### 3.4 Accesso dalla shell nativa (`pausa://auth`), passo per passo
Fonti: `src-tauri/src/lib.rs`, `src/lib/native-shell.ts`, `src/app/api/native/*`, `google-button.tsx`, `sign-in-form.tsx`.
1. La shell (Tauri: finestra desktop o WebView Android/iOS) carica il sito ospitato `https://pausa.gnagno.org`. La pagina capisce di essere nella shell da `"__TAURI_INTERNALS__" in window` (`isNativeShell`).
2. **Google**: il pulsante fa `window.location.href = /api/native/start?next=<callbackURL>`. Il plugin `pausa-shell` intercetta ogni navigazione verso l'host `pausa.gnagno.org` con percorso che inizia per `/api/native/start`, la blocca nella WebView e la apre nel **browser di sistema**.
3. Nel browser, `/api/native/start` avvia l'OAuth Google con `callbackURL = /api/native/done?next=...` (o salta Google se quel browser ha già una sessione non ospite).
4. **Email**: dalla shell il link magico è chiesto con `callbackURL = /api/native/done?next=...`; la persona apre il link dalla posta, quindi nel browser di sistema, e finisce nello stesso punto.
5. `/api/native/done` (nel browser, con la sessione del browser) genera un token monouso (`oneTimeToken({ expiresIn: 3, disableClientRequest: true, storeToken: "hashed" })`: 3 minuti secondo il commento, salvato come hash, non richiedibile dal client) e apre `pausa://auth?token=<token>&next=<next>`.
6. Il sistema operativo consegna il link alla shell (plugin deep-link; schema `pausa` registrato in `tauri.conf.json`; su desktop il plugin single-instance porta in primo piano la finestra esistente). `exchange_url` accetta solo schema `pausa` e host `auth`, e copia solo i parametri `token` e `next`.
7. La shell naviga la propria WebView a `https://pausa.gnagno.org/api/native/exchange?token=...&next=...`, che verifica il token e imposta i cookie di una **nuova sessione propria della shell**, poi 303 verso `next`.
- Conseguenza: browser e shell restano con due sessioni distinte. Host e sito sono costanti nel codice Rust (`SITE`, `HOST`).

### 3.5 Account di revisione
- Attivo solo con `REVIEW_EMAIL` e `REVIEW_PASSWORD`. Il revisore digita la password su `/review`.
- `ensureReviewAccount` crea (id fissi, `onConflictDoNothing`, quindi ripetibile a ogni accesso): utenti `u-review` (nome "Reviewer", email = `REVIEW_EMAIL`, `locale: "en"`), `u-review-anna` (`anna@review.invalid`), `u-review-marco` (`marco@review.invalid`); Cerchia `c-review` "Demo circle" con `u-review` admin; 6 film muti `m-review-1..6`; 9 log `l-review-<uid>-<i>` con date relative a oggi.
- Il link magico per `REVIEW_EMAIL` non viene spedito: `wantReviewLink` arma uno slot in memoria (`globalThis.__pausaReview`), il mittente dei link (`keepReviewLink`) lo trattiene, `takeReviewLink` lo consegna all'azione che ci reindirizza. Risultato: una sessione normale, atterraggio su `/en/c/c-review`.
- Lo slot è globale al processo (un solo valore): due revisori contemporanei sullo stesso isolate potrebbero pestarsi i piedi (dedotto).
- L'account di revisione è un utente normale: può creare Cerchie, inviti, eliminare sé stesso.

### 3.6 Chi viene avvisato (`filterRecipients`, `src/lib/core/settings.ts:78`)
Tre strati, tutti accesi di default:
1. Cerchia (`circle.liveWatching`, admin): se spento, nessuna notifica `now_watching` e nessuno vede "sta guardando" (`getNowWatching`, `src/lib/data.ts:250`).
2. Persona-per-Cerchia: `muted` toglie ogni notifica **che porta quel `circleId`**; `hideWatching` toglie `now_watching` e la striscia "sta guardando".
3. Persona-per-tipo (`notification_off`): vale per casella e push insieme.
- Un destinatario che non è membro della Cerchia indicata passa al solo controllo per tipo.
- Le notifiche `reaction` non portano `circleId` (`actions.ts:216`) e quelle `comment` lo portano solo se la form passa un `circleId` valido: **silenziare una Cerchia non ferma le reazioni** (e non sempre i commenti).
- Una riga `notification` viene scritta solo per chi supera il filtro: chi ha silenziato non trova nulla nemmeno in casella. La push parte per le stesse righe.
- Tipi e quando nascono: `log` (nuovo log non privato → tutti gli altri membri della Cerchia da cui si è scritto), `comment` (autore del log + chi ha già commentato, escluso chi scrive), `reaction` (autore del log, solo all'aggiunta), `now_watching` (solo quando cambia il titolo, non a ogni episodio), `serata_invite` (apertura di una Serata), `circle_join` (nuovo ingresso con invito).
- Il digest email richiede in più: opt-in e zero dispositivi push.

### 3.7 Limiti per persona (`src/lib/core/limits.ts:11`, tabella `rate_limit`, chiave `act:<nome>:<chi>`)
Finestra fissa di un'ora per tutti (`windowMs: 3_600_000`):
`createCircle 5` · `joinCircle 20` · `createInvite 20` · `createLog 60` · `comment 60` · `react 300` · `createSerata 20` · `search 300` · `importRows 600` · `report 20` · `reviewLogin 10` (per IP) · `shareLog 300`.
- `hit()`: un solo upsert che apre una nuova finestra se la vecchia è finita, altrimenti incrementa (mai oltre `max + 1`); consentito se `count <= max`. `enforce()` → redirect a `/slow-down`; `allow()` → booleano (usato dalla ricerca).
- **Senza limite** in quest'area: revoca invito, cambio ruolo, rimozione membro, uscita, rinomina, impostazioni, preferenze, sottoscrizione push, esportazione, eliminazione account/Cerchia, lettura notifiche, pagina `/join/<code>`.
- Nessun limite per IP sulle azioni (scritto anche in `docs/SICUREZZA.md`).

### 3.8 Variabili d'ambiente e binding (solo nomi)
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ADMIN_EMAILS`, `REVIEW_EMAIL`, `REVIEW_PASSWORD`, `SENTRY_DSN`, `DEV_ORIGINS`, `NODE_ENV`. Citate altrove ma non di quest'area: `TMDB_API_TOKEN`, `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`, e in `docs/COSA_MANCA.md` `CONTACT_EMAIL`, `LEGAL_ENTITY`.
Binding Cloudflare (`wrangler.jsonc`): `DB` (D1), `ASSETS`, `WORKER_SELF_REFERENCE`; `keep_vars: true`. `REVIEW_EMAIL`/`REVIEW_PASSWORD` non compaiono in `.env.example`.

### 3.9 Conservazione dei dati
- Ospiti senza Cerchia: 30 giorni. Sessioni e link scaduti: cancellati ogni notte. Contatori dei limiti: 2 giorni.
- **Mai cancellati da un job** (cercato `delete(` su queste tabelle: nessun risultato fuori dai test): `notification`, `report` (aperte e chiuse), `event`, `invite` scaduti/revocati, `invite_use`, `push_subscription` (solo su 404/410 del servizio push, su disattivazione dal dispositivo o su eliminazione account).
- Eliminazione account: immediata e completa per cascata (vedi `deleteAccountAction`). Le segnalazioni fatte dall'utente restano con `reporterId` null; gli eventi con `userId` null.
- Eliminazione Cerchia: i log restano agli autori.
- `report.excerpt` conserva un'istantanea del testo anche dopo che l'autore lo ha modificato o cancellato.

### 3.10 Intestazioni di sicurezza (`next.config.ts`)
CSP statica (script con `'unsafe-inline'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`. `docs/SICUREZZA.md` elenca come non fatti: CSP con nonce, penetration test, 2FA e controllo dei dispositivi, limite per IP sulle azioni.

### 3.11 Altri moduli `core` letti (di supporto, poche regole proprie)
- `visibility.ts`: un log si vede in una Cerchia se `scope = 'circles'` oppure esiste `log_share` per quella Cerchia (la membership dell'autore la controlla chi chiama); `arrivedIn` = momento della condivisione o di creazione.
- `sharing.ts`: regole di `shareLog` / `unshareLog` / `setLogScope` (vedi 2.5).
- `retention.ts`: "un anno fa" (log dei membri in ±3 giorni di calendario in anni precedenti, massimo 3) e checklist dei primi passi (ho un log; la Cerchia ha più di un membro; almeno una Serata conclusa).
- `roster.ts`: rosa di titoli per la Serata (altra area).
- `metrics.ts`: vedi 1.8.

---

## 4. Test esistenti

Unitari (Vitest, su SQLite vero via `test-db.ts`):

`src/lib/core/circles.test.ts`
- `inviteState`: attivo di default; scaduto esattamente alla scadenza; esaurito quando gli usi raggiungono il limite; revocato batte tutto.
- Creare una Cerchia rende il creatore admin ed emette un invito di 14 giorni.
- Riscattare: entra come membro e conta l'uso; chi è già membro rientra senza spendere usi anche dopo la scadenza; rifiuta sconosciuto/scaduto/revocato/esaurito; due persone non spendono l'ultimo uso.
- Solo gli admin revocano. `getActiveInvite` dà il più recente funzionante.
- Ruoli: admin promuove, membro no; l'ultimo admin non può essere retrocesso né uscire se restano altri; admin rimuove un membro, un membro non rimuove nessuno; l'ultimo membro che esce chiude Cerchia e inviti.
- `peopleBrought`: conta persone distinte, non sé stessi, non chi era già dentro; il merito va a chi ha creato l'invito.

`src/lib/core/settings.test.ts`
- Tutto acceso all'inizio; solo l'admin cambia `liveWatching` e profilo; gli interruttori personali valgono solo per sé e solo in una Cerchia di cui si è membri.
- `filterRecipients`: tutti di default; toglie chi ha silenziato (ogni tipo); toglie chi ha spento quel tipo (solo quello); `now_watching` spento per Cerchia o nascosto dal singolo.
- L'insieme dei tipi spenti è sostituito in blocco, i nomi sconosciuti ignorati; il digest è opt-in.

`src/lib/core/moderation.test.ts`
- Segnalare un commento registra istantanea e Cerchia in comune; non si segnala il proprio contenuto, ciò che non si vede, ciò che non esiste; due volte = una segnalazione; "ignora" tiene il contenuto, "rimuovi" lo cancella e chiude tutte le segnalazioni sullo stesso oggetto; rimuovere un log porta via i commenti.
- `deleteCircle`: solo admin; i log restano, le Serate tengono il risultato.

`src/lib/core/limits.test.ts`
- `hit`: consente fino al massimo poi rifiuta fino alla nuova finestra; persone e azioni contate a parte; riporta il residuo; righe piccole e potatura.
- `runCleanup`: toglie ospiti vecchi senza Cerchia, tiene membri, ospiti recenti e persone vere; il posto in Serata dell'ospite va via, la Serata resta; sessioni e link scaduti rimossi, quelli vivi no.

`src/lib/core/push.test.ts` — testo nella lingua del dispositivo, titolo = Cerchia o "Pausa", tutti i tipi coperti; `pushUrl` log → Cerchia → ingresso; una riga per browser riassegnata a chi accede; solo il proprio dispositivo si rimuove; endpoint morto rimosso; lingua sconosciuta → `it`.
`src/lib/core/push-payload.test.ts` — costruisce una richiesta cifrata e firmata VAPID.
`src/lib/core/digest.test.ts` — vuoto senza opt-in; niente se non c'è nulla di nuovo o è già letto; non lette più recenti prima nella lingua della persona; chi ha push non riceve email; parte dall'ultimo digest, mai oltre 3 giorni, lista limitata; "inviato" sposta la finestra.
`src/lib/core/mailer.test.ts` — testo e HTML localizzati con escape; invio via Resend e finestra spostata solo per le email riuscite; provider in errore = resta dovuto; senza chiave non invia e non segna.
`src/lib/core/review.test.ts` — crea revisore, Cerchia demo che amministra e voti; ripetibile senza duplicati.
`src/lib/core/sentry.test.ts` — `parseDsn` valido/non valido; busta per un `Error`; mai la query string; stringhe lanciate.
`src/lib/core/sharing.test.ts` — log aperto in tutte le Cerchie dell'autore, privato in nessuna; privato visibile solo dove condiviso; solo l'autore condivide e solo con sue Cerchie; rendere privato toglie da tutte; lo storico importato è privato.
`src/lib/core/metrics.test.ts` — tutto `null` su database vuoto; ciascuno dei 7 indicatori su dati costruiti.
`src/lib/core/retention.test.ts` — ricordi vicino al giorno di calendario, solo persone della Cerchia, cavallo d'anno e 29 febbraio, titolo localizzato; checklist dei primi passi.
`src/lib/core/roster.test.ts` — alternanza consigli/watchlist, tetto, titoli già visti da metà gruppo, filtro per servizi.
`src/lib/core/profile.test.ts` (parte pertinente) — la parola `PAUSA` accettata con qualsiasi maiuscola/spazio e nient'altro; `removeMyLogsFromCircle` toglie solo da quella Cerchia e non fa nulla dove non sono membro.
`src/lib/core/content.test.ts` (parte pertinente) — solo gli admin rinominano la Cerchia; l'esportazione contiene i dati della persona; eliminare il creatore passa la Cerchia al membro successivo e tiene le liste; eliminare l'unico membro elimina la Cerchia, un membro semplice se ne va e basta.
`src/lib/embedded-browser.test.ts` — user-agent reali di browser in-app e normali; vuoto → falso.
`src/lib/native-shell.test.ts` — `safeNext` tiene un percorso interno con query, rifiuta ciò che esce dal sito, usa il fallback; gli indirizzi nativi codificano la destinazione.

End-to-end (Playwright, `e2e/journeys.spec.ts`) pertinenti: accesso/diario/profilo/logout (riga 30); uno sconosciuto riceve 404 su una Cerchia (40); commentare e segnalare un commento altrui (69); pagine operatore chiuse agli altri (132); esportazione dati (140); dalla barra alla pagina delle Cerchie, un link d'invito incollato fa entrare (148); il cambio lingua tiene la pagina (23).

Non coperti da alcun test (cercato per nome nei file di test): le server action in sé (parsing, redirect, `enforce`), `/api/native/*`, la correzione dei cookie in `/api/auth/[...all]`, `reviewSignIn` e `src/lib/review.ts`, `saveNotificationPrefsAction`, l'invio push reale, `onLinkAccount` (ospite → account), l'eliminazione account di un admin non creatore, il cron `scheduled`.

---


# Parte 2 — Diario, liste, profilo, raccomandazioni
# Inventario 2 — Diario, media, commenti, liste, classifica, insights, profilo, raccomandazioni, streaming, episodi, `/me`

Fonte: lettura integrale del codice in `C:\Users\Giuseppe\Desktop\Personal Project\Pausa` (nessuna esecuzione, nessuna modifica). I riferimenti `file:riga` sono relativi a `src/` salvo dove indicato. Dove scrivo "non c'è" l'ho verificato con grep (vedi sezione 5).

Convenzioni usate sotto:
- **Voto**: intero in mezze stelle `1..10` (= 0,5..5 stelle), `null` = non votato (`db/schema.ts:234`).
- **Regola di visibilità** = `visibleIn(circleId)` (`lib/core/visibility.ts:8-9`), descritta in 3.1.
- **Membro** = riga in `circle_member` per (circle, user). Ogni pagina sotto `/c/[circleId]` passa dal layout che risponde **404** (non 403) ai non membri (`app/[locale]/c/[circleId]/layout.tsx:11-13`).
- **`requireUser()`** (`lib/session.ts:10-17`): sessione obbligatoria e **non anonima**; gli ospiti anonimi (solo Serata) vengono mandati a `/sign-in`.

---

## 1. Schermate

### 1.1 `/[locale]/c/[circleId]` — Diario della Cerchia (feed)
File: `app/[locale]/c/[circleId]/page.tsx`, `filter-bar.tsx`, `components/log-card.tsx`.

**Chi**: membri della Cerchia.

**Cosa mostra**
- Testata: nome Cerchia (+ glifo copertina), descrizione, fino a 4 avatar, "N membri, N visioni quest'anno" (`getCircleStats`: conta i log visibili con `watched_on LIKE '<anno>-%'`, `lib/data.ts:74-82`). Su telefono due bottoni: Classifica e Liste (non hanno tab propria, `page.tsx:85-95`).
- Striscia "in onda" (`getNowWatching`, `lib/data.ts:250-261`): una tessera per ogni membro con una riga in `now_watching`. Vuota se la Cerchia ha `live_watching=false` o se chi guarda ha `hide_watching=true`. Sulla propria tessera, se il titolo non è un film: **"Prossimo episodio"**, **"Prossima stagione"**, **"Smetti"**; sugli altri solo un puntino pulsante.
- `FilterBar` (form GET senza JS, `<details>` aperto se c'è almeno un filtro; badge con numero risultati, `+` se c'è un'altra pagina).
- "Extras" (solo senza filtri e senza `before`): primi passi e "memorie" (area di un altro lettore: `core/retention`).
- Elenco log raggruppato **per giorno di arrivo nella Cerchia** (non per data di visione): intestazione con giorno, "oggi/ieri" o nome del giorno, mese e anno.
- Ogni `LogCard`: autore (link al profilo `/p/[userId]`), "ha visto"/"ha rivisto" (`is_rewatch`), tempo relativo **dell'arrivo** (`createdAt` = momento della condivisione o della scrittura), poster e titolo (link a `/m/[mediaId]`), riga fatti (tipo, anno, durata solo per i film, `S3·E4` o "Stagione N", "su <platform>"), fino a 3 generi (da `media_detail` se già in cache), stelle, "visto con" (tag con i nomi), 2 righe di sinossi se non c'è recensione, recensione (dietro `Spoiler` se `contains_spoilers`), reazioni, bottone commenti con conteggio, e **ultimo commento** (troncato a 180 caratteri; se è spoiler mostra solo un'etichetta) + "altri N".
- **La data di visione (`watched_on`) non compare mai nella card**: nel feed e nel thread si vede solo il tempo relativo di arrivo (`log-card.tsx:28-34,53-55`). La data di visione è visibile solo in `/me/diary`.

**Controlli e query param realmente esistenti** (`page.tsx:38-44`, `filter-bar.tsx`)

| Param | Controllo | Regola |
|---|---|---|
| `q` | campo ricerca | max 80 caratteri; `LIKE %q%` case-insensitive sul titolo localizzato **o** originale, con escape di `% _ \` (`lib/data.ts:91,100`) |
| `kind` | select | `movie` / `tv` / `anime` |
| `year` | select | **anno di visione** (`watched_on LIKE 'YYYY-%'`), solo gli ultimi 10 anni in menu; accettato 1901..2199 |
| `min` | select | voto minimo; in menu solo `10`, `8`, `6` (5★, 4★, 3★); accettato 1..10 |
| `by` | radio con avatar | autore del log (un membro o "tutti") |
| `with` | radio con avatar | presente in `log_watched_with` (un membro o "chiunque") |
| `before` | link "Più vecchi" | ms epoch dell'arrivo dell'ultimo log mostrato; keyset `arrivo < before` |

Non esistono filtri per genere, piattaforma, rewatch, spoiler, "solo con recensione", né ordinamenti alternativi: l'ordine è sempre `arrivo DESC`. Pagina = `PAGE = 20` (`page.tsx:19`), ne chiede 21 per sapere se c'è un seguito.

**Stati**: vuoto con filtri ("nessun risultato"), fine feed (`before` senza righe), vuoto assoluto (riquadro con CTA "Registra"). Skeleton: `loading.tsx` (vedi 1.10).

**Dati letti**: `circle`+`circle_member` (contesto), `circle_member`+`user` (membri), `log` ⨝ `circle_member` (autore membro) ⨝ `user` ⨝ `media_entity` con `visibleIn`, poi in un batch: `log_watched_with`, `reaction`, `comment`, `media_detail` (`lib/data.ts:89-169`); `now_watching`.

### 1.2 `/[locale]/c/[circleId]/log` — Registra una visione
File: `log/page.tsx`, `log/log-form.tsx`.

**Chi**: membri. **Query param**: `media=<mediaId>` (titolo già scelto), `with=<userId>` ripetibile (preseleziona "visto con", filtrato sui membri), `private=1` (preseleziona "solo io").

**Flusso**
1. Ricerca mentre scrivi: debounce **350 ms**, minimo 2 caratteri, tiene solo la risposta all'ultimo testo (`log-form.tsx:59-74`). Chiama `searchMedia`. Risultati: poster, titolo, "anno, tipo". Messaggi: "ricerca in corso", "nessun risultato", avviso se TMDB è spento (`tmdb=false`).
2. Titolo scelto: testata compatta con "Cambia"; sinossi a 2 righe espandibile (da `getTitleDetail`); skeleton mentre arriva.
3. Interruttore a due voci: **"Visto"** / **"Sto guardando"**.
   - **Sto guardando** → form `setNowWatching` con `EpisodeFields` (stagione/episodio; disabilitati per i film).
   - **Visto** → form `createLog`:
     - voto: `RatingField` = `<input type="range" min=0 max=10 step=1>` sotto 5 stelle da 44 px; `0` = nessun voto; mezze stelle (`log-form.tsx:295-334`);
     - recensione (`maxLength=4000`);
     - dentro "Aggiungi dettagli" (chiuso, aperto se arriva `with`): data di visione (`type=date`, default oggi, `max=oggi`; "oggi" è calcolato in **UTC** lato server, `page.tsx:28`), piattaforma (testo libero, max 60), stagione/episodio (solo non-film), sinossi scritta a mano (solo se il catalogo non ne ha una, max 1200), checkbox "contiene spoiler", checkbox "rewatch", chip "visto con" (membri della Cerchia tranne me);
     - "Chi lo legge": radio **"Le mie Cerchie"** (default) / **"Solo io"**.
   - Il bottone salva resta appiccicato in fondo e cambia etichetta se privato.
4. In fondo: link a `/me/import`.

**Dati letti**: `getMembers`, `getCircleForMember`, `getMedia` (se `media`).

### 1.3 `/[locale]/c/[circleId]/l/[logId]` — Thread di un log
File: `l/[logId]/page.tsx`.

**Chi**: membri della Cerchia; il log deve essere visibile **in questa Cerchia** (`getLogInCircle` = `getCircleFeed(..., limit 1, logId)`, quindi autore membro + `visibleIn`), altrimenti 404.

**Cosa mostra**: la `LogCard` (senza anteprima commento), poi:
- se **non** sono l'autore: `ReportForm` (motivo + nota);
- se sono l'autore: "Modifica" (→ `/edit`) e "Elimina" (dentro `<details>` con avviso e conferma);
- "Aggiungi a lista": select con le liste di gruppo della Cerchia + le mie personali (`getListTargets`, `lib/data.ts:285-292`);
- commenti in ordine cronologico crescente: avatar, nome, tempo relativo, testo (dietro `Spoiler` se `is_spoiler`); su commenti altrui "Segnala"; sul mio "Modifica" (textarea inline + checkbox spoiler); "Elimina" se sono l'autore del commento **o** l'autore del log;
- form nuovo commento (textarea max 2000, checkbox spoiler).

**Dati letti**: `getComments(logId)` legge **tutti** i commenti del log senza filtro di Cerchia (`lib/data.ts:179-187`) — vedi 3.1 "conseguenze".

Nessuna paginazione dei commenti, nessuna risposta annidata, nessuna menzione.

### 1.4 `/[locale]/c/[circleId]/l/[logId]/edit` — Modifica log
File: `l/[logId]/edit/page.tsx`, `edit-form.tsx`.

**Chi**: solo l'autore, e solo se il log è visibile in quella Cerchia (404 per chiunque altro, `page.tsx:14-16`).

**Campi modificabili**: voto, data di visione, piattaforma, stagione/episodio (se non film), recensione, "contiene spoiler", "visto con".
**Non modificabili da qui**: titolo, `is_rewatch`, `scope` (privato/Cerchie). `is_rewatch` non è modificabile da **nessuna** schermata (grep `isRewatch`: scritto solo in `createLog` e nell'import).

### 1.5 `/[locale]/c/[circleId]/m/[mediaId]` — Pagina del titolo
File: `m/[mediaId]/page.tsx`.

**Chi**: membri della Cerchia. Qualunque `media_entity.id` esistente è apribile (anche titoli mai registrati da nessuno).

**Cosa mostra**: poster grande, titolo localizzato, titolo originale se diverso, "tipo, anno, durata", generi (max 4), **media della Cerchia** con numero di voti, bottone "Registralo" (→ `/log?media=`), sinossi (o "nessuna sinossi"; nota "scritta da un membro" se `source='user'`), cast (max 6, nome + ruolo), "Aggiungi a lista", sezione "Nella Cerchia" con le `LogCard` (max **30**, nessuna paginazione), attribuzione TMDB se `source='tmdb'`.

**Attenzione — media calcolata diversamente dalla Classifica**: qui è la media aritmetica di **tutti i log votati** mostrati (rewatch ed episodi inclusi, max 30), **arrotondata alla mezza stella intera** (`page.tsx:40-41`); in Classifica è la media dell'**ultimo voto per persona**, non arrotondata.

**Non mostra**: dove vederlo in streaming, stagioni/episodi, chi l'ha visto/non visto come elenco, titoli simili, trailer, regista (solo cast), link esterni.

**Dati**: `media_entity` (`getMediaPage`), `ensureMediaDetail` (cache `media_detail`, può chiamare TMDB/AniList), `getCircleFeed({mediaId})`, `getListTargets`.

### 1.6 `/[locale]/c/[circleId]/lists` — Liste di gruppo
File: `lists/page.tsx`, `components/list-card.tsx`, `components/list-add.tsx`.

**Chi**: membri. **Nessun query param, nessuna ricerca/filtro/ordinamento**; le liste sono in ordine di creazione.

**Cosa mostra**: per ogni lista (`ListCard`): nome, "tipo, N titoli, di <owner>", cestino (owner o admin della Cerchia, con dialogo di conferma), descrizione **solo se presente** (vedi lacune: nessuna UI per scriverla), striscia orizzontale dei **primi 8** poster (numerati se `kind='ranking'`), e `<details>` "Gestisci":
- `ListAdd`: campo di ricerca (invio esplicito, niente ricerca mentre scrivi) → griglia di max 8 risultati → tap = aggiunge;
- elenco completo dei titoli con ✕ per togliere; frecce su/giù **solo se `kind='ranking'`**;
- rinomina.

I poster nelle liste **non sono link** alla pagina del titolo. Non esiste una pagina di dettaglio della singola lista.

In fondo: form "Nuova lista" (nome max 80, tipo `list` / `watchlist` / `ranking`), e un rimando a `/me/lists` per le liste personali.

**Dati**: `list` ⨝ `user` con `circle_id = :circleId`; `list_item` ⨝ `media_entity` ordinati per `position, added_at` (`lib/data.ts:266-282`). Nessuna regola di visibilità sui log (le liste non dipendono dai log).

### 1.7 `/[locale]/c/[circleId]/ranking` — Classifica della Cerchia
File: `ranking/page.tsx`, `lib/core/ranking.ts`.

**Chi**: membri.

**Cosa mostra**: per ogni titolo registrato da qualcuno: posizione (numero grande), poster, titolo, "tipo, anno", media (1 decimale, in stelle), barra, "N voti", e un tag per **ogni membro che l'ha visto** col suo voto (il mio col bordo evidenziato; chi ha visto senza votare ha solo il nome). I titoli **non sono link**.

**Controlli** (form GET, `ranking/page.tsx:35-43,79-121`)

| Param | Controllo | Regola |
|---|---|---|
| `q` | ricerca | max 80; contiene, senza accenti e senza maiuscole (`fold`) sul titolo localizzato |
| `kind` | select | `movie` / `tv` / `anime` |
| `by` | select | solo titoli visti da quella persona |
| `from`, `to` | numeri | **anno di uscita** (non di visione), inclusivo, 1870..2200; i titoli senza anno escono quando il filtro è attivo |
| `votes` | select | voti minimi `0..N membri`; default **2 se la Cerchia ha ≥3 persone, altrimenti 1**; `0` = include i non votati |
| `sort` | select | `avg` (default), `votes`, `year`, `recent` (ultima visione), `title` |
| `all=1` | checkbox | solo titoli visti da **tutti** i membri attuali |
| `page` | Precedente / Successiva | `PAGE_SIZE = 40` (`core/ranking.ts:9`) |

**Stati**: vuoto assoluto / vuoto per filtri.

**Dati**: `loadCircleFacts` (tutti i log visibili della Cerchia, in memoria) → `rankTitles`. Tutta la classifica è ricalcolata in memoria a ogni richiesta, paginazione compresa.

### 1.8 `/[locale]/c/[circleId]/insights` — Insights e anno
File: `insights/page.tsx`, `insights/share-year.tsx`.

**Chi**: membri. **Query param**: `year` (valido solo se è un anno con log; default l'anno più recente con log). Il link "indietro" porta a `/members`.

**Sezioni**
1. **Anno in rassegna** (`yearInReview`): visioni, titoli distinti, ore (solo film), voto medio; bottone **"Condividi"** (scarica/condivide il PNG della card dell'anno); titolo dell'anno con stelle e numero di votanti; frasi: più attivo, mese più pieno, piattaforma più usata, coppia che ha visto più cose insieme, conteggio per tipo.
2. **Gusti** (se ≥2 persone): tutte le coppie con % di affinità e barra, o "servono ancora titoli" sotto `MIN_COMMON = 3`.
3. **D'accordo / Divisi**: max 3 titoli ciascuno, coi voti di ognuno.
4. **Per te** (`ForYou`, in streaming con Suspense): raccomandazioni individuali TMDB.
5. **Da vedere insieme**: max 6 raccomandazioni di gruppo (motore Rust/WASM), con "amato da", "non visto da", previsione in stelle.

**Dati**: `loadCircleFacts`, `tastePairsFast`, `recommendFast`, `personalPicks`.

### 1.9 `/[locale]/c/[circleId]/p/[userId]` — Profilo di un membro (dentro una Cerchia)
File: `p/[userId]/page.tsx`.

**Chi**: membri; `userId` deve essere membro della stessa Cerchia (404 altrimenti). Vale anche per sé stessi.

**Cosa mostra**: avatar, nome, "admin, membro da <mese anno>"; bio; generi preferiti; fino a 5 titoli "sullo scaffale" (link alla pagina del titolo; titolo **originale**, non localizzato — `core/profile.ts:25`); "sta guardando X S·E" se presente; tre cifre: **visioni**, **titoli distinti**, **voto medio** (ultimo voto per titolo, 1 decimale); conteggio per tipo; affinità di gusto con me (% su N titoli comuni, o "servono N titoli"); "Amati" = fino a 5 titoli con ultimo voto ≥ 8 (4★), ordinati per voto; ultimi **5** log; bottone "Tutti" → `/c/[id]?by=<userId>`.

**Dati e visibilità**: tutte le cifre vengono da `loadCircleFacts` → solo i log **visibili in questa Cerchia**. Bio/generi/scaffale sono globali (`user`, `favorite`): identici in ogni Cerchia.

**Non esiste un profilo pubblico** né un profilo fuori da una Cerchia condivisa.

### 1.10 `loading.tsx` della Cerchia
File: `app/[locale]/c/[circleId]/loading.tsx`. Skeleton a forma di diario (testata + 3 card). È l'**unico** `loading.tsx` dell'app; vale per tutte le pagine sotto `/c/[circleId]`. Unico `error.tsx`: `app/[locale]/error.tsx` (titolo, testo, "Riprova"); unico `not-found.tsx`: `app/[locale]/not-found.tsx`.

### 1.11 Colonna laterale (`CircleAside`) — solo ≥ 80rem
File: `components/circle-aside.tsx`, `components/shell.tsx`. Sotto `/c/[circleId]` (prop `aside`), carica via `fetch` `/api/circle/[id]/aside?locale=` solo se lo schermo è largo: "Da vedere insieme" (4 titoli, link alla pagina del titolo + link "perché" → insights) e "Top 5" della classifica. Skeleton mentre carica; errori di rete ingoiati in silenzio (resta lo skeleton).

### 1.12 `/[locale]/me` — Il mio profilo
File: `me/page.tsx`, `me/layout.tsx`.

**Chi**: utente autenticato non anonimo. Il layout usa come "contesto" l'ultima Cerchia visitata (cookie `LAST_CIRCLE_COOKIE`) o la prima; **senza Cerchie non c'è la barra dei tab** (`shell.tsx:26`).

**Cosa mostra**: avatar, nome, "N visioni" (tutte, private comprese); bio o segnaposto; generi; "Modifica profilo"; scaffale dei preferiti (poster **non cliccabili**) o invito a riempirlo; quattro "porte": Diario (`/me/diary`, con conteggio totale e privati), Liste (`/me/lists`), Importa (`/me/import`), Impostazioni (`/account`); sezione **"Per te"** (`ForYou`). `?ok=profile` mostra "salvato".

**Nessuna statistica personale** oltre al conteggio (niente ore, generi, anno, media voti): quelle esistono solo per Cerchia.

### 1.13 `/[locale]/me/diary` — Il mio diario
File: `me/diary/page.tsx`.

**Chi**: solo il proprietario (query su `log.user_id = me`, nessuna regola di Cerchia).

**Controlli**: due tab — **Tutti (N)** / **Solo privati (N)** (`?only=private`); "Più vecchi" (`?before=<watchedOn+id>`, keyset `(watched_on || id) < before`, `PAGE = 40`). **Nessuna ricerca, nessun altro filtro, nessun ordinamento** (sempre `watched_on DESC, id DESC`).

**Ogni riga**: poster (link alla pagina del titolo nell'ultima Cerchia, se ne ho una), titolo, "tipo, anno, S·E · data di visione", stelle; cestino con dialogo di conferma (testo diverso se il log è visibile altrove); e lo stato di visibilità con **una** azione:
- `scope='circles'` → "In tutte le tue Cerchie" + bottone **"Rendi privato"**;
- `scope='private'` → "Solo tu" oppure "Condiviso con:" + chip per Cerchia (✕ = `unshareLogAction`); "Aggiungi a <Cerchia>" (bottone diretto se resta una sola Cerchia, select se più); link "Apri a tutte" se ho più di una Cerchia.

**Non mostra la recensione, né spoiler, né piattaforma, né "visto con"; non ha un link "Modifica"** (grep `edit|review` nel file: zero occorrenze). Vedi lacune.

Bottoni in testata: "Aggiungi" (→ `/c/<ultima Cerchia>/log?private=1`, **assente se non ho Cerchie**), "Importa", "Gestisci importazioni". `?ok=` ∈ `shared|unshared|private|open|logged|deleted` mostra un avviso.

**Dati**: `log` ⨝ `media_entity` per `user_id`; `log_share` per le righe mostrate; `getMyDiaryCounts`.

### 1.14 `/[locale]/me/lists` — Le mie liste
File: `me/lists/page.tsx`. Liste con `circle_id IS NULL AND owner_id = me`, watchlist per prime. Stesso `ListCard` (cestino sempre, è mia). Form "Nuova lista" con default `watchlist`. Nessuna ricerca/filtro. Nessuna watchlist creata automaticamente: se non ne creo una, non c'è.

### 1.15 `/[locale]/me/edit` — Modifica profilo
File: `me/edit/page.tsx`, `me/edit/favorites-editor.tsx`.
- Form `saveProfileAction`: nome (max 40), avatar (radio: foto Google attuale se c'è / iniziale / una delle **24 emoji** di `AVATARS`; **nessun upload**), bio (max 280), generi (checkbox, max 5 su 19).
- `FavoritesEditor`: ricerca mentre scrivi (350 ms, ≥2 caratteri, max 8 risultati), tap = aggiunge subito (ottimistico), ✕ = toglie; contatore "N di 5". **Nessun riordino** (posizione = ordine di aggiunta).

### 1.16 Fuori area ma collegati
- `/[locale]/account` (altro lettore): contiene l'unica UI dei **servizi streaming** dell'utente (paese + checkbox dei provider TMDB della regione, `account/page.tsx:120-146`, azione `saveServicesAction`).
- `/[locale]/c/[circleId]/serata`: usa `TogetherPicks` (5 raccomandazioni di gruppo) e `circleServices`.

### 1.17 Route API dell'area

| Route | Chi | Risposta |
|---|---|---|
| `GET /api/circle/[circleId]/aside?locale=` (`app/api/circle/[circleId]/aside/route.ts`) | sessione + membro, altrimenti **404** (non controlla l'anonimo, ma un anonimo non è mai membro) | JSON `{ recs: [{id,title,posterPath,kind,year,score}] (max 4), top: [{id,title,posterPath,avg,votes}] (max 5, `minVotes` 2 se ≥3 persone) }`, `cache-control: private, max-age=60` |
| `GET /api/circle/[circleId]/year/[year]/card?locale=` (`.../year/[year]/card/route.tsx`) | **401** senza sessione o anonimo; **404** se non membro; **400** se anno non intero o fuori 1990..2100; **404** se l'anno non ha log | PNG 1080×1920 (`next/og`): "kicker", nome Cerchia, poster del titolo dell'anno, righe (visioni, titoli, ore, media, mese più pieno), titolo dell'anno, marchio, QR verso `siteUrl()/<locale>?utm_source=year`. Mai voti individuali. `Cache-Control: private, no-store` |
| `GET /api/health/engine` (`app/api/health/engine/route.ts`) | **pubblica, senza auth** | `{ engine: "wasm" \| "typescript", sample: [{id,score}] }` su un caso finto di 2 persone; `no-store` |

---

## 2. Azioni

Limiti: tutti in `lib/core/limits.ts:11-24`, finestra fissa di **1 ora** (`windowMs: 3_600_000`) per utente, chiave `act:<nome>:<userId>`, contati in D1 (`rate_limit`). `enforce()` reindirizza a `/<locale>/slow-down`; `allow()` restituisce `false` (`lib/limit-guard.ts`).

### 2.1 Diario

**`createLog(formData)`** — `lib/actions.ts:149-199` (schema `logInput` 131-147)
- Validazione: `circleId`, `mediaId` non vuoti; `watchedOn` = `z.iso.date()` (**nessun controllo lato server su date future**: il limite è solo `max=oggi` nell'HTML); `rating` intero `0..10`, `0 → null`, passo 1 (= mezza stella); `review` trim, max **4000**, vuota → `null`; `platform` trim, max **60**, vuota → `null`; `season` `1..99` o null; `episode` (campo form `logEpisode`) `1..9999` o null (`toPosition`: valore non valido → `null`, non errore); `containsSpoilers`, `isRewatch`, `isPrivate` = campo `"on"`; `watchedWith` array max 20; `overview` trim max **1200**.
- Autorizzazione: membro di `circleId` (altrimenti `throw`).
- Comportamento: `watchedWith` filtrato ai membri di **quella** Cerchia, escluso me. Stagione/episodio **tagliati** al massimo esistente se i conteggi sono noti (`clampPosition`). `scope = isPrivate ? "private" : "circles"`. `is_rewatch` è solo ciò che spunta l'utente: **non viene dedotto** da log precedenti dello stesso titolo.
- Scritture (un batch atomico): `log`; `log_watched_with`; `notification` tipo `log`; **`DELETE now_watching` per (me, quel titolo)** — vale anche se registro un singolo episodio. Poi, se `overview` c'è: `media_detail` (`saveUserOverview`, non sovrascrive mai una sinossi di catalogo).
- Notifiche: tipo `log` ai membri di `circleId` tranne me, filtrati da `filterRecipients` (muto per Cerchia, tipo disattivato) → riga `notification` + push. **Un log privato non notifica nessuno.** Un log `scope='circles'` appare in tutte le mie Cerchie ma **notifica solo quella da cui l'ho scritto**.
- Limite: `createLog: { max: 60, windowMs: 3_600_000 }`.
- Redirect: privato → `/me/diary?ok=logged#l-<id>`; altrimenti → `/c/<circleId>`.

**`updateLogAction(formData)`** — `lib/manage-actions.ts:35-66` → `updateLog` `lib/core/content.ts:10-26`
- Stessi vincoli di `createLog` per `watchedOn`, `rating`, `review`, `platform`, `season`, `episode`, `containsSpoilers`, `watchedWith`. **Non** aggiorna `is_rewatch`, `scope`, `media_id`. **Non** applica `clampPosition` (in modifica la stagione/episodio non è tagliata).
- Autorizzazione: membro di `circleId` **e** autore del log (`forbidden` altrimenti).
- `watchedWith` è **sostituito in blocco** e limitato ai membri della Cerchia da cui modifico: modificando dalla Cerchia B si perdono le persone della Cerchia A.
- Scritture: `log` (update), `log_watched_with` (delete + insert), non in transazione. Nessuna notifica. **Nessun limite.** Nessun campo "modificato il" (la tabella non ha `updated_at`).
- Redirect al thread.

**`deleteLogAction(formData)`** — `lib/manage-actions.ts:68-76` → `deleteLog` `core/content.ts:29-35`. Solo l'autore. `DELETE log`; a cascata: `log_share`, `log_watched_with`, `reaction`, `comment`, `notification` (FK `ON DELETE CASCADE`). Nessun limite. Redirect al feed.

**`deleteMyLogAction(formData)`** — `lib/space-actions.ts:64-71`. Come sopra, da `/me/diary`; redirect `/me/diary?ok=deleted[&only=private]`.

**`shareLogAction`** — `lib/space-actions.ts:32-41` → `shareLog` `core/sharing.ts:19-28`. Autore del log **e** membro della Cerchia di destinazione (`not_member`). Se il log è già `circles` non fa nulla. Scrive `log_share (log_id, circle_id)` con `ON CONFLICT DO NOTHING`; `created_at` = ora → il log **arriva nel feed in quel momento**. **Nessuna notifica** alla Cerchia. Limite: `shareLog: { max: 300, windowMs: 3_600_000 }`.

**`unshareLogAction`** — `space-actions.ts:43-51` → `core/sharing.ts:30-35`. Solo autore. `DELETE log_share`. Nessun limite. Commenti e reazioni già scritti da quella Cerchia restano sul log.

**`setLogScopeAction`** — `space-actions.ts:53-61` → `core/sharing.ts:38-44`. Solo autore. `scope ∈ {circles, private}`; aggiorna `log.scope` e **cancella sempre tutte le `log_share`** del log (in entrambe le direzioni). Nessun limite, nessuna notifica.

**`removeMyLogsFromCircleAction`** — `lib/profile-actions.ts:55-65` → `removeMyLogsFromCircle` `core/profile.ts:65-88`. Richiede di digitare la parola `PAUSA` (`CONFIRM_WORD`, maiuscole/spazi ignorati). Toglie **tutte** le mie visioni da una Cerchia senza cancellarle: i log `circles` diventano `private` e vengono ri-condivisi uno a uno con le altre mie Cerchie con `created_at` originale; le `log_share` verso quella Cerchia vengono eliminate. Scritture a blocchi (40 / 25 / 80 righe). Redirect `/c/<id>/members?removed=<n>#mine`. (La UI sta nella pagina membri: altro lettore.)

### 2.2 Reazioni, commenti, segnalazioni

**`toggleReaction(logId, emoji)`** — `lib/actions.ts:201-226`
- `emoji` deve essere in `REACTIONS = ["😭","🍿","❤️","😂","🤯"]` (`lib/reactions.ts:2`). L'emoji è la chiave salvata; a schermo sono icone a linea.
- Autorizzazione: `logVisibleTo` (3.1).
- Toggle: se la riga (log, user, emoji) esiste la cancella, altrimenti la inserisce. **Una persona può mettere tutte e 5 le reazioni sullo stesso log** (PK = log+user+emoji).
- Notifica: tipo `reaction` all'autore (se non sono io e non l'ha disattivata) **a ogni inserimento** — togli/rimetti = nuova notifica; nessuna deduplica. La notifica non porta `circleId`.
- Limite: `react: { max: 300, windowMs: 3_600_000 }`.
- UI ottimistica (`useOptimistic`, `components/reactions.tsx`).

**`addComment(formData)`** — `lib/actions.ts:290-314`
- `body` trim, `1..2000`; `isSpoiler`; `circleId` è solo un suggerimento per il link della notifica (accettato solo se ne sono membro).
- Autorizzazione: `logVisibleTo`.
- Scritture (batch): `comment`; `notification` tipo `comment` all'**autore del log + chiunque abbia già commentato**, tranne me, filtrati.
- Limite: `comment: { max: 60, windowMs: 3_600_000 }`.

**`updateCommentAction`** — `manage-actions.ts:80-90` → `core/content.ts:37-43`. Solo l'autore del commento. Aggiorna `body` (1..2000) e `is_spoiler`. Nessun segno di "modificato", nessun limite, nessuna notifica.

**`deleteCommentAction`** — `manage-actions.ts:92-98` → `core/content.ts:46-53`. Autore del commento **o autore del log**. Nessuna conferma lato UI (bottone diretto).

**`reportAction(formData)`** — `manage-actions.ts:168-180` → `createReport` `core/moderation.ts:22-47`
- `kind ∈ {comment, log}`, `targetId`, `reason ∈ {spam, abuse, privacy, other}`, `note` max 500.
- Regole: non si segnala il proprio contenuto (`own`, ma l'azione **ignora l'esito** e reindirizza comunque con `reported=1`); il segnalante deve condividere almeno una Cerchia con l'autore del log.
- Scrive `report` con `excerpt` (istantanea del testo, max 280) e `circle_id` = una Cerchia in comune; unico per (reporter, kind, target) → doppia segnalazione = una riga. **Nessuna notifica agli operatori**: la riga aspetta in `/admin/reports`. Niente viene nascosto in automatico.
- Limite: `report: { max: 20, windowMs: 3_600_000 }`.
- Redirect a `back` (solo percorsi che iniziano con `/` e non `//`) + `reported=1`. **Nessuna pagina legge `reported`** per mostrare una conferma (grep: zero lettori nelle pagine dell'area).

### 2.3 Media

**`searchMedia(query, locale)`** — `lib/actions.ts:236-249`
- Limite: `search: { max: 300, windowMs: 3_600_000 }` (oltre → array vuoto, in silenzio). Query trim `1..100`.
- In parallelo: `searchLocalMedia` (DB, `LIKE %q%` su titolo originale o qualunque titolo localizzato, max 12, **senza escape** di `%`/`_`), `searchTmdb` (`/search/multi`, max 10, solo film/serie, `include_adult=false`, ≥2 caratteri), `searchAnime` (AniList, max 8, `isAdult:false`, ≥2 caratteri).
- Unione: locali, poi TMDB, poi gli anime AniList la cui chiave `titolo minuscolo|anno` non è già presente; deduplica per `id`; **max 14**.
- **Effetto collaterale**: ogni ricerca **inserisce** in `media_entity` (+ `media_title`) tutti i risultati TMDB e AniList, scelti o no.

**`getEpisodeLimits(mediaId)`** — `actions.ts:231-234` → `ensureEpisodeLimits` (3.7). Qualunque utente autenticato. **Nessun limite** (può chiamare TMDB/AniList).

**`getTitleDetail(mediaId, locale)`** — `space-actions.ts:74-78` → `ensureMediaDetail` (3.3). Qualunque utente autenticato. **Nessun limite.** Restituisce `{ overview, genres }`.

### 2.4 Liste

**`createList(formData)`** — `actions.ts:254-269`. `name` trim `1..80`; `kind ∈ {watchlist, list, ranking}` (valore sconosciuto → `list`); `scope=personal` → `circle_id NULL`; altrimenti serve `circleId` e l'appartenenza. Scrive `list`. **Nessun limite**, nessuna notifica. `description` non è mai impostabile da qui.

**`addToList(formData)`** — `actions.ts:272-286`. Lista di gruppo: qualunque membro; personale: solo il proprietario. Posizione = `max(position)+1`; `ON CONFLICT DO NOTHING` (un titolo una volta sola per lista). Scrive `list_item (added_by = me)`; `note` mai scritta. Nessun limite, nessuna notifica. `mediaId` non verificato (FK).

**`moveListItemAction`** — `manage-actions.ts:118-128` → `core/content.ts:86-95`. `direction ∈ {up, down}`; un passo alla volta; riscrive tutte le posizioni `0..n-1` (un `UPDATE` per titolo, non in transazione). Stessa autorizzazione di `addToList`. Il server lo consente per ogni tipo di lista; **la UI mostra le frecce solo per `ranking`**.

**`removeListItemAction`** — `manage-actions.ts:130-135` → `content.ts:78-83`. Toglie e ricompatta le posizioni. Qualunque membro per le liste di gruppo.

**`renameListAction`** — `manage-actions.ts:137-142` → `content.ts:126-130`. Nome `1..80`. Qualunque membro per le liste di gruppo.

**`deleteListAction`** — `manage-actions.ts:144-149` → `content.ts:113-124`. Proprietario, o **admin della Cerchia** per una lista di gruppo.

Nessuna delle azioni sulle liste ha limite o notifica.

### 2.5 "Sto guardando"

**`setNowWatching(formData)`** — `actions.ts:318-342`. Membro di `circleId`. `season` `1..99`, `episode` `1..9999`, tagliati ai conteggi noti. `setWatching` (`core/progress.ts:33-38`): upsert dell'**unica riga per utente** in `now_watching` (azzera la vecchia etichetta `progress`). Notifica tipo `now_watching` agli altri membri di **quella** Cerchia **solo se cambia titolo** (non a ogni episodio), rispettando `live_watching`, `muted`, `hide_watching`. Nessun limite. Redirect al feed.

**`advanceWatching(formData)`** — `actions.ts:345-351`. `what=season` → `nextSeason` (stagione+1, episodio 1, max 99; **non** controlla che la stagione esista); altrimenti `nextEpisode` (`core/progress.ts:41-49` + `advance` `core/episodes.ts:76-89`): +1; a fine stagione passa alla successiva (episodio 1) se i conteggi sono noti; all'ultimissimo episodio resta fermo; senza conteggi aggiunge 1 (max 9999). Nessuna notifica, nessun log creato, nessun limite.

**`clearNowWatching()`** — `actions.ts:353-358`. Cancella la mia riga.

### 2.6 Profilo e servizi

**`saveProfileAction`** — `profile-actions.ts:28-39` → `saveProfile` `core/profile.ts:32-38`. `name` trim `1..40`; `bio` accettata fino a 560 caratteri poi **tagliata a `MAX_BIO = 280`**, vuota → `null`; `genres`: solo chiavi note (`GENRES`, 19 voci), senza doppioni, **max 5**; `avatar`: `""` = tieni, `"none"` = iniziale (`image=null`), glifo valido → `image = "emoji:<glifo>"`. Scrive `user`. Rivalida tutto il layout. Redirect `/me?ok=profile`.

**`addFavoriteAction`** — `profile-actions.ts:41-46` → `core/profile.ts:41-48`. Già presente → ok; scaffale pieno (`MAX_FAVORITES = 5`) → `{ error: "full" }`; altrimenti in coda. Scrive `favorite`.

**`removeFavoriteAction`** — `profile-actions.ts:48-52`. Cancella la riga (le posizioni non vengono ricompattate).

**`saveServicesAction`** — `lib/discover-actions.ts:17-26`. `country` deve essere in `COUNTRIES` (15 paesi). Gli id provider del form vengono **riconfrontati col catalogo TMDB** della regione (nomi e loghi mai presi dal form); max 40. Scrive `user.country` e sostituisce `user_provider`. Se TMDB è spento il catalogo è vuoto → **salvare cancella tutti i servizi**.

**`suggestRosterAction(circleId, locale)`** — `discover-actions.ts:29-33`. Membro. Restituisce la rosa suggerita per la Serata (3.6, parte "rosa").

---

## 3. Regole trasversali

### 3.1 Visibilità di un log

Un log appartiene al suo autore e ha `scope`:
- **`circles`** (default): visibile in **ogni Cerchia di cui l'autore è membro**, comprese quelle a cui si unirà in futuro;
- **`private`**: visibile solo all'autore in `/me/diary`, più le Cerchie elencate una a una in `log_share`. I log importati nascono `private`.

Regola SQL unica (`core/visibility.ts:8-9`):
`(log.scope = 'circles' OR EXISTS (SELECT 1 FROM log_share WHERE log_id = log.id AND circle_id = :circleId))` — sempre accompagnata dal vincolo "l'autore è membro della Cerchia" (join su `circle_member` nel feed, `inArray(log.userId, memberIds)` in `loadCircleFacts`).

Momento di arrivo (`arrivedIn`, `visibility.ts:12-13`): `coalesce(log_share.created_at per quella Cerchia, log.created_at)`. Il feed è ordinato e paginato su questo.

Regola per reagire/commentare (`logVisibleTo`, `lib/data.ts:190-203`): sono l'autore, **oppure** esiste una Cerchia in cui siamo entrambi membri e (se il log è privato) quella Cerchia è tra le sue `log_share`.

**Conseguenze osservate (da decidere nella riscrittura)**
1. **Commenti, reazioni e "visto con" sono del log, non della Cerchia.** Un log `circles` mostra lo stesso thread in tutte le Cerchie dell'autore: chi sta nella Cerchia A legge nomi, avatar e testo dei commenti scritti dai membri della Cerchia B, e i nomi in "visto con", anche senza condividere alcuna Cerchia con loro (`getComments` e la lettura `log_watched_with` non filtrano per Cerchia).
2. **Chi esce da una Cerchia sparisce da feed, classifica e insights di quella Cerchia** (tutto è calcolato sui membri attuali); se rientra, ricompare tutto.
3. **Togliere la condivisione non rimuove** commenti/reazioni lasciati da quella Cerchia.
4. **Granularità al secondo**: i default `created_at` sono `unixepoch()*1000` (`schema.ts:4`), e il feed pagina con `arrivo < before` stretto: se più log arrivano nello stesso secondo a cavallo di una pagina (es. condivisioni in blocco da import), quelli oltre il taglio vengono **saltati**. Rischio letto dal codice, non verificato in esecuzione.
5. Non esiste un test dedicato a `visibility.ts`; la regola è coperta indirettamente da `sharing.test.ts` e `insights.test.ts`.

### 3.2 Creazione e deduplica dei titoli (`media_entity`)

- Id interno: UUID. Tipi: `movie` | `tv` | `anime`.
- Chiavi uniche (`schema.ts:138-143`): `(kind, tmdb_id)`, `anilist_id`, `mal_id`, `letterboxd_uri`. `imdb_id` esiste ma non è unico.
- **Da TMDB** (`lib/tmdb.ts:39-69`): `kind = movie` se `media_type=movie`; `anime` se è una serie con genere 16 (Animation) **e** `original_language = "ja"`; altrimenti `tv`. I film d'animazione giapponesi sono `movie`. Insert `ON CONFLICT DO NOTHING` a blocchi di 12; `media_title` upsert a blocchi di 25 per la lingua della richiesta. Anno = primi 4 caratteri di `release_date`/`first_air_date`. `poster_path` = percorso TMDB.
- **Da AniList** (`lib/anilist.ts:36-64`): sempre `kind='anime'`, con `anilist_id`, `mal_id`, `episodes_total`; titolo originale = romaji → english → native; titolo "localizzato" = english → romaji → native (uguale per ogni lingua); poster solo se l'URL inizia con `https://s4.anilist.co/` (URL completo in `poster_path`).
- **Nessuna fusione tra TMDB e AniList**: lo stesso anime può esistere due volte (una riga con `tmdb_id`, una con `anilist_id`). L'unica difesa è nella lista risultati di `searchMedia` (scarta l'AniList se `titolo|anno` coincide con un TMDB/locale); i voti sulle due righe restano separati.
- **Le righe nascono a ogni ricerca**, non quando un titolo viene scelto: fino a 10 (TMDB) + 8 (AniList) per ricerca, più fino a 12 per ogni seme di `similarTitles`. Nessuna pulizia delle righe mai usate.
- Titolo mostrato: `media_title` nella lingua, altrimenti `original_title` (`lib/data.ts:9-10`). Le notifiche push e lo scaffale dei preferiti usano sempre il titolo originale.

### 3.3 Cosa è in cache, dove, per quanto

| Dato | Dove | Durata | Fonte |
|---|---|---|---|
| Risposte TMDB | cache `fetch` di Next (`next: { revalidate: 86_400 }`) | **1 giorno** | `lib/tmdb.ts:35` |
| Risposte AniList | cache `fetch` di Next | **1 ora** (`revalidate: 3600`) | `lib/anilist.ts:19` |
| Sinossi, generi (max 4), cast (max 6) | `media_detail` per (media, lingua) | **per sempre** se `source` è `tmdb` o `anilist`; se `none` o `user` si riprova dopo **7 giorni** (`RETRY_EMPTY_MS`) | `lib/media-detail.ts:9,21` |
| Durata | `media_entity.runtime_min` | scritta una volta, solo se era `NULL` | `media-detail.ts:54-56` |
| Stagioni/episodi | `media_season`, `media_entity.episodes_total`, `details_checked_at` | **30 giorni** (`DETAILS_TTL_MS`) | `core/episodes.ts:13` |
| Disponibilità streaming | `media_provider` + `media_availability_check` per (media, paese) | **7 giorni** (`AVAILABILITY_TTL_MS`), ricorda anche "da nessuna parte" | `core/streaming.ts:10` |
| Colonna laterale | header HTTP | `private, max-age=60` | `api/circle/.../aside/route.ts:32` |
| Query per richiesta | `React.cache` su `getCircleContext`, `getMembers` | una richiesta | `lib/data.ts:38-72` |

Dettagli:
- La sinossi AniList è **in inglese** qualunque sia la lingua, ma viene salvata sotto la lingua richiesta.
- Sinossi scritta da un membro (`source='user'`, max 1200, tagliata a fine frase): non sostituisce mai quella di catalogo e resiste a una risposta vuota del catalogo; viene sostituita se il catalogo ne trova una.
- `ensureMediaDetail` non lancia mai: catalogo giù = "niente per ora".
- Nessuna cache per classifica, insights, raccomandazioni: ricalcolo completo a ogni richiesta da `loadCircleFacts` (4 query in un batch D1, **tutti** i log visibili della Cerchia).

### 3.4 Classifica (`core/ranking.ts`)

- Ingresso: tutti i `LogFact` visibili della Cerchia (ordine `watched_on ASC, created_at ASC`) + membri attuali.
- Per titolo: `watchedBy` = chi ha almeno un log; `ratings` = **ultimo voto non nullo** di ogni persona (`latestRatings`); `votes` = numero di persone con un voto; **`avg` = media aritmetica semplice** di quei voti, scala 1..10, `null` se nessuno ha votato; `lastWatched` = `watched_on` più recente.
- Nessun peso bayesiano, nessuna soglia oltre `minVotes`.
- Filtro: `votes >= (minVotes ?? 1)` → senza parametri i titoli non votati sono esclusi; la pagina passa `2` di default con ≥3 persone.
- Ordinamenti: `avg` (media ↓, poi voti ↓, poi titolo), `votes` (voti ↓, media ↓, titolo), `year` (anno uscita ↓, titolo), `recent` (ultima visione ↓, titolo), `title`.
- **Un voto dato a un log di stagione o di singolo episodio conta come voto del titolo** e sostituisce quello precedente: `latestRatings` indicizza solo per `media_id` e ignora `season`/`episode` (`core/insights.ts:42-51`). Vale ovunque: classifica, affinità, raccomandazioni, "amati" del profilo.

### 3.5 Insights calcolati (`core/insights.ts`)

- **Affinità tra due persone** (`tasteSimilarity`): sui titoli votati da entrambi, `1 − media(|a−b|) / 9`; `null` sotto `MIN_COMMON = 3` titoli comuni. Mostrata in percentuale.
- **Coppie** (`tastePairs`): tutte le coppie, prima quelle con punteggio (dal migliore), poi le altre per titoli comuni.
- **D'accordo**: titoli votati da ≥2 membri con media ≥ 8 e scarto (max−min) ≤ 2; **Divisi**: scarto ≥ 4; 3 per lista.
- **Anno in rassegna** (`yearInReview`, per anno di **visione**): `logs` (righe, episodi compresi), `titles` distinti, `byKind`, `movieHours` (**solo film**, somma dei `runtime_min` noti, arrotondata; i rewatch contano due volte), `avgRating` (media dei log votati, in stelle), `mostActive`, `busiestMonth`, `topPlatform` (testo libero: "Netflix" e "netflix" sono voci diverse), `titleOfTheYear` (miglior media tra i titoli con ≥2 votanti; se non ce ne sono, il voto singolo più alto), `togetherMost` (coppia con più visioni insieme, ogni (titolo, giorno, coppia) contato una volta).
- `yearsWithLogs`: anni con almeno un log, dal più recente.
- **Profilo di un membro**: vedi 1.9 (calcoli fatti nella pagina, non in `core`).
- **Non calcolati**: ore per persona, ore di serie/anime, distribuzione dei voti, generi più visti, registi/attori, serie di giorni consecutivi, confronto anno su anno, statistiche personali fuori da una Cerchia.

### 3.6 Motore di raccomandazione

Ci sono **due sistemi distinti**.

**A. "Da vedere insieme" (di gruppo) — motore Rust/WASM**

*Ingressi* (`lib/engine/index.ts:60-68`): `facts` ridotti a `{ userId, mediaId, rating, title, kind, year, posterPath }` in ordine cronologico; `people` `{id, name}` nell'ordine di ingresso nella Cerchia; `watching` `{userId, mediaId}`. Nessun dato esterno: solo i log della Cerchia.

*Uscite*: `Recommendation { mediaId, title, posterPath, kind, year, score (previsione 1..10), unseenBy: Person[], lovedBy: [{person, rating}] }`.

*Algoritmo* (`core/insights.ts:212-258`, portato in `engine/src/lib.rs:122-221`):
1. Servono ≥2 persone.
2. Ultimo voto per persona e titolo.
3. Per ogni titolo: `unseenBy` = membri senza alcun log del titolo **e** che non lo stanno guardando ora. Se vuoto → scartato.
4. Serve almeno un voto ≥ `RECOMMEND_MIN = 7` (3,5★).
5. Per ogni persona che non l'ha visto, previsione = media pesata dei voti di chi l'ha votato: con affinità `s`, `signed = 2s − 1` (−1..1); peso `|signed|`; se `signed < 0` il voto è **specchiato** (`MIRROR − voto`, `MIRROR = 11`); se l'affinità non è calcolabile (<3 titoli comuni) il voto vale così com'è con peso `NEUTRAL_WEIGHT = 0.5`. Se tutti i pesi sono 0 → media semplice.
6. `score` = media delle previsioni; scartato se `< 7`.
7. `lovedBy` = chi ha votato ≥ 7, dal voto più alto.
8. Ordine finale (fatto in TypeScript perché dipende dalla lingua): `score ↓`, numero di `unseenBy ↓`, titolo; poi taglio a `limit`.

`tastePairs` è la seconda operazione del motore (op 2).

*Come si chiama il WASM* (`lib/engine/index.ts`, `worker.ts:9-16`):
- crate `pausa-engine` (solo `serde` + `serde_json`, niente `wasm-bindgen`), `opt-level="s"`, LTO, `panic="abort"`; binario committato `src/lib/engine/engine.wasm` = **155.775 byte**;
- su Workers `worker.ts` importa il `.wasm` e lo mette in `globalThis.__PAUSA_ENGINE__`; in Node lo legge da disco; istanziato una volta (promise condivisa);
- interfaccia C: `alloc(len)`, `dealloc(ptr,len)`, `run(op, ptr, len)`; richiesta = JSON UTF-8 scritto nella memoria; risposta = `[u32 little-endian lunghezza][JSON]`; `op 1 = recommend`, `op 2 = tastePairs`; input non valido → `{"error": ...}` (diventa eccezione);
- **ripiego automatico** sull'implementazione TypeScript se il modulo non si carica o la chiamata fallisce.

*Dove è usato*: `/insights` (6), pagina Serata via `TogetherPicks` (5), colonna laterale (4), rosa suggerita della Serata (12).

*Tempi misurati*: **nel repository non c'è alcun numero registrato.** `scripts/engine-bench.test.ts` è saltato salvo `BENCH=1`, stampa i tempi a console e non li salva; confronta TS e WASM su tre Cerchie sintetiche (4 persone × 40 titoli, 12 × 300, 30 × 1500, densità 35%; 30/30/5 ripetizioni) e il commento dice solo che l'intero bench dura "~40 s". Non l'ho eseguito (consegna in sola lettura). L'unica affermazione scritta è in `docs/PIANO_CONSEGNA.md:28`: coi volumi attuali il TypeScript risponde "in pochi millisecondi" e Rust "non cambia ciò che vede l'utente". Differenza strutturale: il TS ricalcola l'affinità per ogni coppia (non-visto, votante) di ogni titolo; il Rust la memorizza per coppia.

*Nota per la riscrittura*: la parità esatta TS/Rust regge perché i voti sono interi (le somme di differenze sono esatte in qualunque ordine); `taste_similarity` in Rust itera una `HashMap` in ordine non deterministico.

**B. "Per te" (individuale) — TMDB, nessun WASM** (`lib/discover.ts:26-39`, `core/discovery.ts`)
1. Semi: i titoli dell'utente con **ultimo voto ≥ `SEED_MIN_RATING = 8`** e con `tmdb_id`, ordinati per voto, **max 5** (tutti i suoi log, privati compresi).
2. Per ogni seme: `/movie|tv/{id}/recommendations` di TMDB, solo con poster e `vote_count ≥ MIN_VOTES = 500`, max 12; salvati come `media_entity`.
3. Punteggio: per ogni candidato somma di `(voto_seme − 5)/5 ÷ (1 + posizione × 0.08)`; esclusi i titoli già registrati; ordine: punteggio, numero di semi che lo indicano, titolo; **max 8**.
4. Se l'utente ha impostato i suoi servizi: `ensureAvailability` e riga "Su: <servizi suoi che lo hanno>".
- Mostra il motivo ("perché ti è piaciuto X e Y") e un link "Registra".
- Limiti: gli anime solo-AniList non possono essere semi; senza `TMDB_API_TOKEN` la sezione dice che è spenta; nessun "non mi interessa", nessun "aggiungi alla watchlist" dal suggerimento.

**Rosa suggerita per la Serata** (`lib/discover.ts:54-93`, `core/roster.ts`): alterna raccomandazioni di gruppo e titoli delle liste di gruppo (watchlist prima), max 8; scarta ciò che **metà o più** del gruppo ha già visto e ciò che i servizi comuni noti non hanno; se restano meno di 6 titoli e TMDB è attivo, integra coi "simili" dei 3 titoli con media di gruppo ≥ 8.

### 3.7 Streaming / dove guardarlo

*Modello dati*: `user.country`; `user_provider (user, provider_id, name, logo_path)`; `media_provider (media, country, provider_id, name, logo_path)`; `media_availability_check (media, country, fetched_at)`.

*Fonte*: TMDB watch providers (dati JustWatch), **solo `flatrate`** (incluso in abbonamento; niente noleggio/acquisto/gratis con pubblicità). Per gli anime solo-AniList: nomi dei link `STREAMING` di AniList confrontati "a orecchio" col catalogo TMDB della regione (`matchProviders` + alias).

*È davvero popolato?* Solo **su richiesta e solo in due percorsi**:
1. `personalPicks`, e solo se l'utente ha impostato almeno un servizio (per gli ≤8 suggerimenti);
2. `suggestedRoster`, e solo se la Cerchia ha servizi in comune (≤30 candidati).
In entrambi `ensureAvailability` aggiorna **al massimo 10 titoli per chiamata** (`lib/tmdb.ts:92`). Nessun job in background, nessun popolamento alla creazione del log.

*È davvero mostrato?*
- in `/account`: scelta di paese e servizi;
- in "Per te": riga "Su: Netflix, …" (solo i servizi dell'utente);
- nella Serata: servizi comuni della Cerchia e, per la rosa, i nomi dei servizi per titolo.
- **Non** è mostrato sulla pagina del titolo, nelle card del diario, nelle liste, in classifica. `logo_path` è salvato ma **mai disegnato** (grep: nessun uso in componenti).

*`log.platform`* è un testo libero (max 60) scollegato dai provider: "piattaforma più usata" dell'anno conta stringhe.

### 3.8 Episodi e avanzamento

*Modello*:
- `media_season (media, season, episodes)` — da TMDB `/tv/{id}`, senza stagione 0 e senza stagioni vuote;
- `media_entity.episodes_total` — totale AniList (o episodi andati in onda se la serie è in corso);
- `log.season`, `log.episode` — un log può riguardare il titolo intero, una stagione o un singolo episodio;
- `now_watching` — **una sola riga per utente** (PK = `user_id`): un titolo alla volta, con `season`/`episode` (+ etichetta libera storica `progress`, ancora letta).

*Cosa può fare davvero l'utente con una serie*:
1. Registrarla intera, oppure una stagione (menu "tutta la serie / Stagione N (M episodi)" quando i conteggi sono noti, altrimenti numero 1..99), oppure **un episodio** (numero, limitato all'ultimo della stagione quando noto). Ogni registrazione è un log completo con voto e recensione.
2. Dichiarare "sto guardando" con stagione/episodio; dal feed: **+1 episodio**, **prossima stagione**, **smetti**.
3. Vedere negli altri "X sta guardando Y S3·E4".

*Cosa non c'è*: elenco degli episodi (titoli, date, trame); spunta "visto" per episodio; storico degli episodi visti (il +1 **non crea log**: resta solo l'ultima posizione); percentuale o "3 di 10"; "continua a guardare" con più serie; "prossimo episodio in uscita"; stato "finita/abbandonata/in pausa"; registrare più episodi in un colpo. Inoltre registrare un singolo episodio **cancella** lo stato "sto guardando" di quella serie (`actions.ts:192`).

### 3.9 Altre regole

- **Spoiler**: `log.contains_spoilers` copre la recensione, `comment.is_spoiler` il commento. Il testo è **comunque inviato al client** e solo sfocato via CSS finché si tocca (`components/spoiler.tsx`); la scelta di rivelare non è ricordata. Nell'anteprima del feed un commento spoiler è sostituito da un'etichetta.
- **Poster**: TMDB `w185`/`w342`/`w500` o URL AniList completo; senza poster, riquadro colorato col titolo.
- **Avatar**: `user.image` = URL (foto Google) oppure `"emoji:<glifo>"` oppure `null` (iniziale su tinta).
- **Lingua nelle azioni**: i form la mandano nel campo `locale`.
- **Notifiche**: tipi dell'area `log`, `comment`, `reaction`, `now_watching`; riga `notification` + push "best effort" (`lib/push.ts`), filtrate da `filterRecipients` (`core/settings.ts:78-100`).

---

## 4. Test esistenti

Unit (Vitest, SQLite vero via `sql.js` con le migrazioni reali).

**`core/content.test.ts`** (parte dell'area)
- solo l'autore modifica un log; "visto con" tiene solo i membri
- eliminare un log porta via commenti e reazioni; gli altri non possono
- commenti: l'autore modifica; elimina l'autore o il padrone del thread
- liste: su/giù con arresto ai bordi
- liste: posizioni doppie si riparano allo spostamento, si compattano alla rimozione
- estranei non toccano una lista di gruppo; quelle personali sono del proprietario
- eliminare una lista di gruppo: proprietario o admin, non un membro semplice

**`core/sharing.test.ts`**
- log aperto: visibile in ogni Cerchia dell'autore; privato: in nessuna
- log privato visibile solo dove è condiviso, finché non viene ritirato
- condivide solo l'autore, e solo con una Cerchia di cui fa parte
- renderlo privato lo toglie da tutte; riaprirlo cancella le condivisioni singole
- lo storico importato è privato

**`core/profile.test.ts`**
- salva nome, bio e solo generi noti, massimo cinque
- bio vuota = nessuna; la foto resta se non indicata
- preferiti in ordine, senza doppioni, fino al limite
- la parola `PAUSA` accettata con qualunque maiuscola/spazio, nient'altro
- `removeMyLogsFromCircle`: toglie solo da quella Cerchia, restano nel mio spazio e nelle altre
- non fa nulla in una Cerchia di cui non sono membro

**`core/ranking.test.ts`**
- media dei voti per persona, ordine per media poi per voti
- un rewatch conta una volta, con l'ultimo voto
- filtri per voti, anno di uscita, tipo e nome
- solo ciò che hanno visto tutti / ciò che ha visto una persona
- i non votati in fondo con `minVotes 0`
- ordinamento per anno e per titolo

**`core/insights.test.ts`**
- affinità: 100% con voti identici; 0 con voti opposti (1 contro 10); nessun punteggio sotto `MIN_COMMON`; conta solo i titoli comuni; gestisce persone mancanti
- `latestRatings`: il rewatch sostituisce, i log senza voto non contano
- `tastePairs`: prima le coppie note (migliore in alto), poi le altre
- `agreements`: separa "piaciuto a tutti" da "ha diviso"
- `yearInReview`: solo l'anno scelto; media sui soli log votati; ore solo per i film; più attivo, mese, piattaforma; titolo dell'anno preferisce due votanti; coppia insieme contata una volta; regge il vuoto; anni con log dal più recente
- `recommend`: suggerisce l'amato non visto con chi l'ha amato; salta i visti da tutti e i non votati bene; si fida di chi ha gusti simili; non raccomanda ciò che ama solo chi ha gusti opposti; raccomanda ciò che quello odia; senza confronto prende il voto così com'è; non suggerisce a chi lo sta guardando; servono due persone
- `loadCircleFacts`: solo log dei membri, in ordine, titolo localizzato e "visto con"; chi sta guardando cosa (solo membri); ripiego sul titolo originale; pipeline completa

**`core/discovery.test.ts`**
- punteggio per quanto hai amato il seme, premio se più semi indicano lo stesso titolo
- mai gli esclusi, rispetta il limite
- vuoto senza semi
- `topSeeds`: i più amati noti a TMDB, ultimo voto per titolo
- numero di semi limitato, migliori prima

**`core/details.test.ts`**
- sinossi, generi, cast, durata da un film TMDB
- durata episodio di una serie; regge risposta vuota o rotta
- taglia una sinossi lunga a fine frase
- descrizione AniList in testo semplice

**`core/episodes.test.ts`**
- TMDB: scarta speciali e stagioni vuote, ordina
- AniList: totale se noto, andati in onda se in corso
- episodio massimo di una stagione, o di un anime senza stagioni
- taglio a ciò che esiste; titoli sconosciuti lasciati stare
- `advance`: +1 dentro la stagione; passa alla stagione dopo; resta fermo alla fine; senza conteggi aggiunge uno; salta un numero di stagione mancante
- salva/sostituisce stagioni, registra l'ora, scade dopo un mese
- anime con solo il totale

**`core/progress.test.ts`**
- `toPosition`: interi nell'intervallo, rifiuta il resto
- `formatProgress`: stagione/episodio, ripiego sull'etichetta storica
- `setWatching`: dice se è cambiato il titolo; la nuova posizione sostituisce l'etichetta
- `nextEpisode`: +1 mantenendo la stagione; niente in visione = `null`
- prosegue da un'etichetta storica, o parte dall'episodio 1
- `parseLegacy` legge le etichette comuni
- `nextSeason`: episodio 1 della stagione successiva

**`core/streaming.test.ts`**
- solo i servizi flat-rate del paese, nell'ordine di TMDB
- catalogo di regione ordinato per priorità locale e limitato
- servizi comuni = intersezione di chi li ha impostati
- ignora chi non ne ha impostati; vuoto se nessuno
- `onServices`: quali servizi voluti hanno il titolo
- salva i servizi di una persona e li sostituisce
- ricorda la disponibilità, anche "da nessuna parte", fino alla scadenza
- paesi separati, aggiornamento sul posto
- anime: confronto largo tra grafie e accenti; niente per servizi non in regione

**`core/limits.test.ts`** (parte dell'area)
- consente fino al massimo, poi rifiuta fino al rinnovo della finestra
- conta persone e azioni separatamente
- riporta quanto resta
- righe piccole e pulizia delle finestre vecchie

**`core/roster.test.ts`**: alterna raccomandazioni e watchlist senza doppioni; limite massimo; scarta i visti da metà gruppo; scarta ciò che i servizi comuni non hanno, tiene gli ignoti; nessun filtro senza servizi; rosa vuota se non c'è nulla.

**`core/moderation.test.ts`** (segnalazioni): segnalazione di un commento con istantanea e Cerchia comune; non il proprio contenuto, non ciò che non si vede, non l'inesistente; doppia segnalazione = una; archiviare tiene, rimuovere cancella e chiude tutte; rimuovere un log porta via i commenti.

**`engine/engine.parity.test.ts`**: il motore è caricato da `engine.wasm` (non il ripiego); `recommend` identico su 3000 Cerchie casuali; identico con limite grande (ordinamento completo) su 300; `tastePairs` identico su 3000; casi limite (nessuno, una persona, nessun fatto, unicode).

**`engine/src/lib.rs` (test Rust)**: servono due persone; suggerisce un titolo amato a chi non l'ha visto (punteggio 10); salta ciò che qualcuno sta guardando; specchia i gusti opposti; l'affinità richiede tre titoli comuni; input errato → risposta d'errore, non crash.

**`scripts/engine-bench.test.ts`**: tre scenari di tempo, **saltati** senza `BENCH=1`; verificano anche l'uguaglianza dei risultati.

**End-to-end (`e2e/journeys.spec.ts`) dell'area**: la classifica elenca ogni titolo col voto di ciascuno e la media; uno sconosciuto non legge una Cerchia (404); registra un film, poi modifica ed elimina; commenta un log e segnala il commento di un altro; registra un film in privato e poi lo elimina dal proprio spazio.

**Senza test**: `visibility.ts` (solo indiretto), `searchMedia` e la deduplica TMDB/AniList, `ensureMediaDetail`/`ensureAvailability`/`ensureEpisodeLimits` (la parte di rete e cache), `getCircleFeed` coi filtri e la paginazione, `getMyDiary`, `logVisibleTo`, le notifiche di `createLog`/`addComment`/`toggleReaction`, `createList`/`addToList`, la card dell'anno, le route API.

---


# Parte 3 — Serata e importazione
# Inventario comportamentale 3 — Serata e Importazione

Repo: `C:\Users\Giuseppe\Desktop\Personal Project\Pausa` (Next.js 16.4.6, OpenNext su Cloudflare Workers, D1 via drizzle-orm 0.45, better-auth 1.7). Tutti i percorsi sotto sono relativi alla radice del repo. Analisi solo statica: niente è stato eseguito. Dove un dato è una stima o non è verificabile dal codice è scritto esplicitamente.

Legenda priorità lacune: `blocca l'uso` / `fastidioso` / `rifinitura`.

---

# AREA A — SERATA

## A.1 Schermate

| URL | Cosa mostra | Chi può aprirla | Dati letti | File |
|---|---|---|---|---|
| `/[locale]/c/[circleId]/serata` | Titolo + form "nuova Serata" (`NewSerata`): scelta modalità (`bracket` = "Torneo lampo", `table` = "Tavolo"), griglia candidati, bottone "Scegli tu per noi", ricerca titoli, servizi streaming comuni; sezione consigli `TogetherPicks` (limit 5, in `Suspense`); elenco "Serate recenti" (ultime 10). | Solo account reale membro della Cerchia: `requireUser()` nella pagina + `getCircleForMember` nel layout (`notFound()` per i non membri, `src/app/[locale]/c/[circleId]/layout.tsx:10-13`). Gli ospiti anonimi vengono mandati a `/sign-in`. | `getCircleLists` (2 query), `getRecentSerate` (1), `circleServices` (2+), più le 3 del layout (`getCircleForMember`, `getMyCircles`, `getUnreadCount`). Almeno 8 query D1 senza contare `TogetherPicks`. | `src/app/[locale]/c/[circleId]/serata/page.tsx`, `new-serata.tsx` |
| `/[locale]/s/[code]` (non partecipante, Serata aperta) | `JoinGate`: titolo, per l'ospite campo nome (max 24) + 8 avatar emoji, bottone "Entra in sala". Per un membro loggato: un solo bottone. | Chiunque abbia il link, anche senza sessione. Nessun controllo di appartenenza alla Cerchia. | `getSerataByCode` ×2 (metadata + pagina, non deduplicato), `getSession`, `isParticipant`. | `src/app/[locale]/s/[code]/page.tsx:28-42`, `join-gate.tsx` |
| `/[locale]/s/[code]` (partecipante) | `SerataRoom`: header con modalità; in `voting` contatore "n/tot", nome del turno, timer circolare; `Lobby` (codice a 6 caratteri in grande, bottone condividi link, "rosa" dei candidati, bottone "Si comincia" solo per l'host, altrimenti "Aspettiamo che {host} cominci"); `BracketVote` (due locandine, tocca per votare); `TableVote` (+/− voti, veto, conferma); `Result`; lista "In sala" con avatar, etichetta "ospite", stato "votato / sta scegliendo…"; bottone "Avanti" solo host in `voting`. | Solo chi ha una riga in `serata_participant` per quella Serata (membro o ospite). | `getRoomView` (vedi A.6 per il conteggio). | `src/app/[locale]/s/[code]/room.tsx` |
| `/[locale]/s/[code]` (non partecipante, Serata `done`) | Redirect a `/[locale]/s/[code]/card`. | Chiunque. | — | `page.tsx:39` |
| `/[locale]/s/[code]/card` | Pagina pubblica del risultato: componente `SerataCard` (CSS, 9:16), testo CTA, bottone "Prova Pausa" → `/sign-in`, QR (SVG data-URI, 112 px) verso `${siteUrl()}/${locale}?utm_source=card`, attribuzione TMDB. `notFound()` se la Serata non è `done`. | Pubblica, nessuna sessione. `robots: noindex`. | `getCardData` ×2 (metadata + pagina): 4 query ciascuna (3 se `circle_id` è null). | `src/app/[locale]/s/[code]/card/page.tsx` |
| `GET /api/serata/[code]?v=&locale=` | Endpoint di polling: JSON `RoomView` oppure 204. | Sessione qualsiasi + partecipante (401 / 404 / 403 altrimenti). | Vedi A.6. | `src/app/api/serata/[code]/route.ts` |
| `GET /api/serata/[code]/card?format=story\|og&locale=` | PNG della Card (1080×1920 default, 1200×630 con `format=og`). 404 se non `done`. | Pubblico. | `getCardData` (3-4 query) + 4 fetch Google Fonts + 1 fetch locandina. | `src/app/api/serata/[code]/card/route.tsx` |
| `GET /api/serata/[code]/invite?locale=` | PNG 1200×630 di invito (anteprima link mentre la Serata è aperta). 404 se `done` o inesistente. | Pubblico. | `getInviteData` (3 query) + 6 fetch Google Fonts + fino a 4 fetch locandine. | `src/app/api/serata/[code]/invite/route.tsx` |
| Landing (`TrySerata`) | Demo solo client: 4 film → 2 sfide → finale → `SerataCard`; 520 ms di attesa dopo ogni scelta; "riprova". Nessuna chiamata server, nessuna riga DB. | Pubblica. | Nessuno (film passati come props). | `src/components/landing/try-serata.tsx` |

Metadata OpenGraph di `/s/[code]`: immagine = `/api/serata/{code}/card?format=og` se `done`, altrimenti `/api/serata/{code}/invite` (`page.tsx:13-15`).

## A.2 Azioni

Tutte server action in `src/lib/serata/actions.ts` salvo dove indicato. Gli argomenti di `joinSerata`, `voteBracket`, `submitBallot`, `forceAdvance`, `tick`, `startSerata` NON passano da zod (solo `guestName` sì): sono validati "a mano" o dal motore.

| Azione | Comportamento e validazione | Autorizzazione | Tabelle scritte | Rate limit | Effetti collaterali | Riga |
|---|---|---|---|---|---|---|
| `createSerata(formData)` | `locale` (fallback default), `circleId` stringa non vuota, `mode ∈ {bracket,table}`, `mediaId[]` deduplicati con `Set`, min `MIN_CANDIDATES=2` max `MAX_CANDIDATES=8`. Ordine di selezione = `seed` (il primo scelto è la testa di serie 0). Non verifica che i media esistano o appartengano alle liste (solo FK). Codice generato una volta, nessun retry su collisione dell'indice unico. Redirect a `/{locale}/s/{code}`. | `requireUser()` (no ospiti) + `getCircleForMember`. | `serata`, `serata_candidate`, `serata_participant` (host, `is_guest=false`), `notification` (tipo `serata_invite`, una per ogni altro membro filtrato da `filterRecipients`: muted / `notification_off`), `rate_limit`. Tutto in un `db.batch` (`atomically`). | `createSerata`: 20 / 3 600 000 ms per utente (`src/lib/core/limits.ts:18`); oltre → redirect `/slow-down`. | Web Push `serata_invite` in `waitUntil` con URL `/{locale}/s/{code}` (`src/lib/core/push.ts:29-30`). | `actions.ts:50-74` |
| `joinSerata(code, guestName?, guestAvatar?)` | Serata deve esistere e `status !== "done"` (quindi si entra anche a votazione in corso). Ospite (`user.isAnonymous`): `guestName` trim, 1..24 caratteri (zod); avatar accettato solo se è uno degli 8 `GUEST_AVATARS`. Membro: usa `user.name`. `onConflictDoNothing` sul posto. | `requireAnySession()` (anche anonima). Nessun controllo Cerchia. | `user` (solo ospiti: `name` e, se avatar valido, `image = "emoji:<glifo>"`), `serata_participant`, `serata.version + 1`. Un batch. | Nessuno. | Tutti i client rifanno il fetch al prossimo poll. | `actions.ts:77-90` |
| `startSerata(code)` | No-op silenzioso se non host o `status !== "lobby"`. Legge i candidati per `seed`, crea lo stato (`initBracket(seeds, now)` o `initTable(now)`), `status="voting"`, compare-and-set su `version`. Nessun minimo di partecipanti. | Sessione qualsiasi, ma `hostId === user.id`. | `serata` (`status`, `state`, `version`). | Nessuno. | — | `actions.ts:92-104` |
| `voteBracket(code, mediaId)` | Richiede `status="voting"` e stato `bracket`; `mediaId` deve essere `a` o `b` della sfida corrente. Cancella il proprio `pick` della sfida e lo reinserisce (si può cambiare idea finché è aperta). NON controlla la scadenza: un voto arrivato dopo il `deadline` viene scritto e poi contato da `tryClose`. Poi `tryClose`. | Partecipante (`requireParticipant`). | `serata_vote` (`kind="pick"`, `round`, `match`), `serata.version + 1`; eventuale chiusura → `serata.state/version/status/winner_media_id/finished_at`. | Nessuno. | — | `actions.ts:108-124` |
| `submitBallot(code, dots, veto)` | `status="voting"` e stato `table`. `validBallot`: ogni chiave di `dots` deve essere un candidato, valori interi ≥ 0, somma esattamente `DOTS=3`; `veto` null o candidato (si può mettere il veto anche su un titolo a cui si sono dati voti). Errore `throw` se non valido. Sostituisce l'intera scheda in un batch (delete `dot`+`veto`, insert, bump). Poi `tryClose`. Nessun controllo scadenza, come sopra. | Partecipante. | `serata_vote` (`kind="dot"` con `weight`, al più un `veto`), `serata.version`, eventuale chiusura. | Nessuno. | — | `actions.ts:126-147` |
| `forceAdvance(code)` | `tryClose(id, {force:true})`: chiude la sfida corrente / il tavolo con i voti presenti (anche zero). No-op se non host o non in `voting`. | `hostId === user.id`. | `serata`. | Nessuno. | — | `actions.ts:150-155` |
| `tick(code)` | Chiamata dal telefono di qualunque partecipante quando il countdown arriva a zero; il server ricontrolla `now >= deadline`. | Partecipante. | `serata` (se chiude). | Nessuno. | — | `actions.ts:158-161` |
| `trackEvent(name, code)` (`src/lib/events.ts`) | `name ∈ {card_shared, invite_shared}`, `code` 4..16 caratteri. Una riga per persona per Serata per tipo (select + insert). Errori ingoiati. | Sessione qualsiasi (ospiti inclusi); non richiede di essere partecipante. | `event`. | Nessuno (dedup applicativo). | Alimenta `/admin/metrics`. | `events.ts:10-23` |
| `suggestRosterAction(circleId, locale)` (`src/lib/discover-actions.ts:29`) | Restituisce fino a 8 titoli + servizi su cui sono disponibili. | `requireUser` + membro. | Possibili scritture cache disponibilità (`ensureAvailability`). | Nessuno. | Chiamate TMDB (provider, similar). | `src/lib/discover.ts:54-93` |
| `searchMedia(query, locale)` (`src/lib/actions.ts:236`) | Query 1..100 caratteri; unisce DB locale + TMDB + AniList, max 14 risultati. Client: debounce 350 ms, minimo 2 lettere. | `requireUser`. | `media_entity`/`media_title` (upsert risultati TMDB). | `search`: 300 / h. | — | `actions.ts:236-249` |
| `authClient.signIn.anonymous()` (client, Better Auth) | Crea utente `is_anonymous=true` + sessione. | Nessuna. | `user`, `session`. | `/sign-in/anonymous`: max 10 per 3600 s per IP (`src/lib/auth.ts:39`), contato in D1; disattivato in development. Regola globale auth: 60 richieste / 60 s. | Cookie di sessione. | `join-gate.tsx:28` |

`tryClose(serataId, {force})` — `src/lib/serata/server.ts:81-113`: legge la riga, i partecipanti, i voti della sfida (o tutte le schede); chiude se `force` oppure `now >= deadline` oppure `voti.length >= partecipanti.length`; calcola il nuovo stato con `Math.random()`; UPDATE con `where version = <letta>` (compare-and-set). Se l'UPDATE non trova la riga (un altro bump nel frattempo) NON ritenta: la chiusura avverrà al prossimo voto/`tick`.

## A.3 Regole trasversali

### Macchina a stati

```
lobby ──startSerata (solo host)──▶ voting ──tryClose con winner──▶ done
                                     │  ▲
                                     └──┘ bracket: tryClose senza winner = sfida successiva (nuovo deadline)
```

- `lobby`: creata da `createSerata`. Si entra con `joinSerata`. Nessun timeout, nessun annullamento, candidati non modificabili. Solo l'host può avviare.
- `voting` (bracket): una sfida alla volta. `deadline = now + MATCH_MS (30 000 ms)` fissato quando la sfida diventa corrente (`engine.ts:62`). Chiude quando: tutti i partecipanti hanno un `pick`, oppure scadenza, oppure host forza. Alla chiusura si passa alla sfida successiva con un nuovo deadline di 30 s. I bye vengono risolti automaticamente senza voto (`settle`, `engine.ts:58-71`).
- `voting` (table): un solo turno. `deadline = now + TABLE_MS (60 000 ms)`. Chiude quando tutti hanno una scheda, alla scadenza, o se l'host forza.
- `done`: `status="done"`, `winner_media_id`, `finished_at`. Stato terminale. Il polling del client si ferma.
- Non esiste un timer lato server: la scadenza viene applicata SOLO quando un client chiama `tick` (countdown locale a zero, `room.tsx:80`) o quando arriva un voto. Se nessun partecipante ha la pagina aperta e visibile, la Serata resta in `voting` per sempre.
- Durata massima teorica: bracket con 8 titoli = 7 sfide × 30 s = 210 s; tavolo = 60 s. (Il testo UI promette "meno di due minuti".)

### Codice stanza
- 6 caratteri dall'alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 simboli, senza I, O, 0, 1), da `crypto.getRandomValues` (`actions.ts:23-24`). 32^6 ≈ 1,07 miliardi. Indice unico `serata_code_unique`; nessun retry su collisione.
- Lookup con `code.toUpperCase()` (`server.ts:16`).
- Il codice è l'unica "chiave" per entrare: non c'è scadenza del link né legame con l'appartenenza alla Cerchia.

### Ospiti senza account
- Flusso (`join-gate.tsx:22-37`): nessuna sessione → `authClient.signIn.anonymous()` → `joinSerata(code, name, avatar)` → `router.refresh()`.
- Identità: riga `user` con `is_anonymous=true` (nome di default del plugin "Anonymous", trattato come vuoto dal form; email fittizia generata dal plugin — non configurata nel repo). Cookie di sessione Better Auth: durata 60 giorni, rinnovo ogni 24 h, `cookieCache` firmato di 5 minuti (`auth.ts:55`) così i poll non leggono `session` da D1.
- Nome: 1..24 caratteri, scritto sia in `user.name` (globale per quell'ospite) sia in `serata_participant.name` (istantanea). Avatar: uno di 8 emoji (`src/lib/avatars.ts:5`), salvato in `user.image` come `emoji:<glifo>`.
- Cosa PUÒ fare: entrare, votare (`voteBracket`, `submitBallot`), `tick`, condividere link/Card, vedere il risultato, vedere il link "Entra in {Cerchia}" se la Cerchia ha un invito attivo (`server.ts:166-181`), salvare l'account (Google o magic link con `callbackURL=/{locale}/s/{code}`).
- Cosa NON può fare: creare una Serata, avviarla o forzarla (non è mai host), qualunque pagina/azione con `requireUser` (redirect a `/sign-in`, `src/lib/session.ts:10-17`), registrare nel diario (al posto di "Registra nel diario" vede "Apri la Card", `room.tsx:394-403`), entrare in una Cerchia senza account reale, esportare dati.
- Promozione ad account (`auth.ts:58-78`, `onLinkAccount`): copia nome se il nuovo account non ne ha, copia `circle_member`, sposta `log.user_id`, ricrea i posti `serata_participant` con `is_guest=false` (`onConflictDoNothing`), sposta `serata_vote.user_id` (UPDATE secco: se l'account di arrivo avesse già votato nella stessa sfida violerebbe la PK — non gestito).
- Un membro reale che apre il link in un browser dove non è loggato viene trattato come ospite: `JoinGate` non offre "accedi".
- Qualsiasi account reale, anche estraneo alla Cerchia, può entrare e votare con il solo codice.

### Origine dei candidati (`new-serata.tsx:52-55`)
Pool mostrato, in ordine e deduplicato: risultati di ricerca (`searchMedia`), già scelti, suggeriti (`suggestRosterAction`), `quickPicks` (titoli delle liste del gruppo, watchlist per prime, `page.tsx:32-35`). `suggestedRoster` (`src/lib/discover.ts:54`): watchlist del gruppo + raccomandazioni del motore WASM (`recommendFast`, 12), alternati; scartati i titoli visti da metà o più del gruppo e quelli non disponibili sui servizi comuni; se restano meno di 6 e TMDB è attivo, rabbocco con `similarTitles` dei 3 titoli meglio votati (media ≥ 8); massimo 8 (`src/lib/core/roster.ts:32-51`). "Scegli tu per noi" sostituisce la selezione corrente con i primi 8.

### Algoritmo di voto (esatto, `src/lib/serata/engine.ts`)
- Bracket: eliminazione diretta. Dimensione tabellone = 2 / 4 / 8 (potenza di due successiva). Accoppiamenti `ORDER = {2:[0,1], 4:[0,3,1,2], 8:[0,7,3,4,1,6,2,5]}`: i bye vanno alle teste di serie più alte (con 5 titoli: s1, s2, s3 passano; si vota solo s4 vs s5). Sfide reali = n − 1. Vince chi ha più `pick`; pareggio (anche 0-0 a tempo scaduto) → `rand < 0.5 ? a : b` con `Math.random()` server. Il conteggio `{a,b}` resta in `state.rounds[r][k].votes` ma non viene mai mandato al client.
- Tavolo: ogni persona ha esattamente 3 voti ("crediti" `DOTS=3`, tutti da piazzare, anche tutti sullo stesso titolo) e al più 1 veto. Vince il titolo con più voti tra i NON vetati; se tutti i titoli sono vetati i veti vengono ignorati; pareggio → estrazione uniforme tra i pari merito (`tied[min(len-1, floor(rand*len))]`, `engine.ts:151`). `scores` ordinati per voti decrescenti e mostrati nel risultato con l'etichetta "veto" (non chi l'ha messo).
- Quorum: "tutti hanno votato" = numero di votanti ≥ numero di righe in `serata_participant` in quel momento. Chi entra a votazione in corso alza il quorum; chi se ne va (non esiste "esci") lo blocca fino a scadenza o `forceAdvance`.
- Nessun seme/registro dell'estrazione: non riproducibile, e la UI non dice che c'è stato un pareggio.

### "Tempo reale" oggi
- Polling HTTP: `POLL_MS = 1500` (`room.tsx:17`), `GET /api/serata/{code}?v={version}&locale=`, `cache: "no-store"`. Sospeso con `document.hidden`; un fetch immediato su `visibilitychange`; si ferma a `done`.
- `serata.version` incrementa a ogni join, voto, scheda, start, chiusura. Se `version` è invariata: risposta 204 senza corpo dopo UNA query (`getPollHead`, `server.ts:38-48`).
- Dopo ogni propria azione il client chiama subito `refresh()` (`room.tsx:79`).
- Orologio: ogni payload porta `serverNow`; il client calcola `offset = serverNow − Date.now()` e fa il countdown ogni 250 ms sul tempo server.
- Payload (`RoomView`, `server.ts:185-199`): `code, mode, status, version, circleId, isHost, joined, candidates[≤8]{id,kind,title,year,posterPath,seed}, participants[]{id,name,isGuest,image,voted}, bracket{round,progress,a,b,myPick,deadline} | table{deadline,myBallot}, result, serverNow`. Lo stato grezzo del tabellone NON è incluso. Dimensione: stima a mano ≈ 1,5–3 KB JSON non compresso con 8 candidati e 4–6 persone (non misurata).
- Risposte non-200 (401/403/404/errore di rete) vengono ignorate in silenzio dal client: nessun messaggio, la UI resta ferma.

### Risultato e immagini
- `Result` (`room.tsx:338-453`): locandina, titolo, due righe (Cerchia + data; modalità, turni, persone), bottone "Condividi", secondo bottone (diario o Card), per il tavolo la classifica, per gli ospiti il riquadro "Tieni questa Serata".
- Condivisione: il PNG story viene scaricato in anticipo; `navigator.share({files})` → fallback `navigator.share({url})` → fallback copia negli appunti dell'URL `/{locale}/s/{code}/card`. `trackEvent("card_shared")`.
- PNG Card (`api/serata/[code]/card/route.tsx`): `ImageResponse` di `next/og` (Satori + resvg). Formati: story 1080×1920 (locandina a tutta larghezza alta `round(1920×0,58)=1114`, QR 140×140 con colori invertiti verso la landing) e og 1200×630 (locandina 420×630 a sinistra, niente QR). Corpo titolo: og 150 / 112 (>12 caratteri) / 84 (>30); story 200 / 140 (>13) / 104 (>34). Titolo in maiuscolo con `toLocaleUpperCase(locale)`. `Cache-Control: public, max-age=3600`.
- PNG invito (`invite/route.tsx`): 1200×630, colonna testo 780 px (logo "PAUSA", titolo "{host} ti invita a una Serata" a 96 o 76 px se >34 caratteri, sottotitolo modalità + numero titoli, CTA), colonna 420 px con fino a 4 locandine TMDB `w342` (1 → 420×630; 2 → 210×630; 3-4 → 210×315). `max-age=300`.
- Font (`src/lib/og-font.ts`): scaricati da Google Fonts A OGNI richiesta, come TTF sottoinsieme dei soli glifi usati (`&text=`): "Sofia Sans Extra Condensed" peso 200 (titolo) e 400 (solo "PAUSA" nell'invito), "Barlow" 400 (resto). 2 fetch per font (CSS + file). Se falliscono → font di default di Satori. Colori fissi sRGB in `src/lib/card-theme.ts` (tema scuro).
- Contenuto pubblico: titolo vincente, nome della Cerchia, data, modalità, numero di turni, numero di persone. Mai chi ha votato cosa. "Persone" = `count(*)` su `serata_participant` calcolato al momento della richiesta (`server.ts:224`): include chi è entrato senza votare e cala quando la pulizia cancella gli ospiti.
- QR: `qrcode-generator`, livello M, SVG a un solo path con quiet zone di 2 moduli (`src/lib/qr.ts`).

### Collegamento al diario
- Solo un link precompilato: `/c/{circleId}/log?media={winner.id}&with={id}…` con i partecipanti non ospiti diversi da me (`room.tsx:394-398`); la pagina log filtra `with` sui membri della Cerchia (`src/app/[locale]/c/[circleId]/log/page.tsx:27`).
- Nessuna colonna collega `log` a `serata`: non si sa se il titolo scelto è stato poi visto.
- Il bottone compare per ogni non-ospite con `circleId`, anche se non è membro di quella Cerchia (finirebbe su un 404 del layout).

### Storico
- `getRecentSerate(circleId, locale, limit=10)` (`server.ts:202-213`): ultime 10 per `created_at desc`, con modalità, stato e titolo vincente; link a `/s/{code}`. Nessuna paginazione, nessun dettaglio voti. Le Serate rimaste in `lobby`/`voting` restano in elenco per sempre. Chi non aveva partecipato, aprendo una Serata finita, vede solo la Card pubblica.
- Per gli ospiti nessuno storico.

### Rate limit (costanti esatte)
- `createSerata`: 20 / ora per utente. `search`: 300 / ora. Sign-in anonimo: 10 / ora per IP. Auth in generale: 60 / 60 s per IP.
- Nessun limite su: `joinSerata`, voti, `tick`, `forceAdvance`, endpoint di poll, endpoint PNG card/invite (pubblici e costosi, protetti solo dalla cache HTTP).

### Pulizia (`src/lib/core/cleanup.ts`, cron `17 3 * * *` in `wrangler.jsonc`)
- Cancella gli utenti anonimi più vecchi di `GUEST_RETENTION_DAYS = 30` che non appartengono a nessuna Cerchia; posti e voti vanno via in cascata, la Serata e la Card restano.
- Sessioni e `verification` scaduti; contatori `rate_limit` fermi da più di 2 giorni.
- Le righe `serata` non vengono mai cancellate né chiuse (spariscono solo in cascata se l'host cancella l'account; se la Cerchia viene cancellata `circle_id` diventa null).

## A.4 Test esistenti

`src/lib/serata/engine.test.ts` (11 test, solo funzioni pure):
- 8 teste di serie: 7 sfide, si parte dai quarti, s1 vs s8, deadline = T0+30 000, vince s1 se vince sempre A.
- 5 teste di serie: bye alle prime 3, mai bye contro bye, 4 sfide reali.
- 3 teste di serie: s1 ha il bye, s2 vs s3, poi finale; `deadline` null a fine torneo.
- 2 teste di serie: una sola finale.
- Pareggio: `rand 0.2 → a`, `rand 0.8 → b`.
- `closeMatch` non muta lo stato precedente.
- `initBracket` rifiuta 1 o 9 candidati.
- Tavolo: vince chi ha più voti; `scores[0]` ordinato.
- Tavolo: un titolo con veto non può vincere nemmeno con più voti.
- Tavolo: se tutto è vetato i veti si ignorano.
- `validBallot`: accetta 2+1 con veto valido; rifiuta 4 voti, 1 solo voto, id sconosciuto, negativi, veto sconosciuto.

Altri test che toccano la Serata:
- `src/lib/core/limits.test.ts`: la pulizia cancella l'ospite vecchio e il suo posto ma tiene la Serata.
- `src/lib/core/moderation.test.ts`: cancellare la Cerchia mette `serata.circle_id` a null.
- `src/lib/core/retention.test.ts`: l'onboarding conta solo Serate `done`.
- `src/lib/core/metrics.test.ts`: tempo mediano al risultato e quota di Card/inviti condivisi (un evento doppio conta una volta).
- `src/lib/core/push.test.ts`: `pushUrl` con `serataCode` → `/it/s/ABC123`.
- `e2e/journeys.spec.ts:80` e `:119`: membro apre un Tavolo, ospite entra con nome, votano entrambi, vedono il risultato; l'endpoint `invite` risponde per una Serata aperta.

Nessun test copre `actions.ts` / `server.ts` (quorum, `tryClose`, compare-and-set, join a metà, scadenze).

## B.1 Schermate

| URL | Cosa mostra | Chi | Dati letti | File |
|---|---|---|---|---|
| `/[locale]/me/import` | 6 tab sorgente (`letterboxd, imdb, trakt, cinemaniac, anilist, mal`); istruzioni a passi; selettore file o campo username; dopo il parsing: riepilogo trovati/esclusi, scelta destinazione (spazio privato di default, oppure una delle proprie Cerchie, con avviso), opzioni (liste, recensioni, righe senza data), bottone "Importa N visioni", barra di avanzamento, riepilogo finale con link. | `requireUser()` (no ospiti). | `getMyCircles` (1 query), `tmdbEnabled()`. | `src/app/[locale]/me/import/page.tsx`, `import-client.tsx` |
| `/[locale]/me/imports` | "Gestisci importazioni": elenco delle esecuzioni (`import_batch`) con sorgente, data/ora, visioni aggiunte, dove sono finite, bottoni "Togli da «Cerchia»" e "Elimina N visioni" (con conferma); sezione "Importazioni precedenti" = giorni con tante aggiunte non tracciate, con "Togli dalle Cerchie" ed "Elimina". Banner esito da query string `?removed=&lists=` / `?deleted=`. | `requireUser()`. | `listImportBatches` (1 query, limit 50) + `listBulkDays` (1 query). | `src/app/[locale]/me/imports/page.tsx` |
| `/[locale]/c/[circleId]/import` | Solo redirect a `/{locale}/me/import`. | Membro (passa dal layout). | — | `src/app/[locale]/c/[circleId]/import/page.tsx` |

Punti d'ingresso verso `/me/import`: `/me` , `/me/diary`, pagina log della Cerchia, pagina membri.

## B.2 Azioni

Server action in `src/lib/import/actions.ts`; logica in `src/lib/core/import.ts` e `import-batches.ts`.

| Azione | Comportamento e validazione | Autorizzazione | Tabelle scritte | Rate limit | Riga |
|---|---|---|---|---|---|
| `startImport({source, circleId})` | `source` enum dei 6; `circleId` stringa 1..64 o null. Crea la riga `import_batch`. Risposte: `{ok, batchId}` o errore `invalid` / `limit` / `failed`. | `requireUser`; se `circleId` è valorizzato deve essere membro (`createImportBatch`, altrimenti `invalid`). | `import_batch`, `rate_limit`. | `importRows`: 600 / 3 600 000 ms per utente (un colpo). | `actions.ts:70-82` |
| `importChunk({batchId, rows, includeReviews, includeUndated, locale})` | zod: `rows` 1..`CHUNK_LIMIT=30`; ogni riga: `source`, `kind ∈ {movie,tv,anime}`, `title` 1..300, `year` 1870..2200 o null, `rating` intero 1..10 o null, `watchedOn` `YYYY-MM-DD` o null, `rewatch` bool, `review` ≤ 20 000 o null, `letterboxdUri` `^https://boxd.it/[A-Za-z0-9]+$` ≤ 60, `anilistId`/`malId`/`tmdbId` interi positivi, `imdbId` `^tt\d{1,10}$`. Campi non in schema (copertina, titoli localizzati, `originalTitle`, `runtimeMin`) vengono scartati: li ricalcola il server. UNA riga non valida rende `invalid` tutto il chunk. Il batch deve essere dell'utente e l'utente deve essere ancora nella Cerchia di destinazione (`left` → `invalid`). `today` = data UTC del server. | `requireUser` + proprietario del batch. | `media_entity`, `media_title`, `log`, `log_share` (se destinazione Cerchia), `rate_limit`. | `importRows` 600/h: un colpo per chunk (anche per i retry). | `actions.ts:87-114` |
| `importListChunk({name, description, kind, batchId, offset, rows, locale})` | `name` 1..80, `description` ≤ 500, `kind ∈ {watchlist,list}`, `offset` 0..5000, `rows` 1..30. La lista è cercata per proprietario + nome + tipo + Cerchia, altrimenti creata con `import_batch_id`. Elementi aggiunti con `position = offset + i`, saltando quelli già presenti. `anilistId`/`malId` forzati a null (liste solo film/serie). | Come sopra. | `list`, `list_item`, `media_entity`, `media_title`, `rate_limit`. | `importRows` 600/h. | `actions.ts:119-139` |
| `removeImportFromCircleAction(formData)` | `batchId` 1..64. Cancella le `log_share` con quell'`import_batch_id` e rende personali (`circle_id = null`) le liste di gruppo create da quel batch. Idempotente. Le visioni restano private. 4 query non in transazione. Redirect a `/me/imports?removed=N&lists=M`. | `requireUser` + proprietario del batch (altrimenti `throw not_found`). Non richiede di essere ancora nella Cerchia. | `log_share` (delete), `list` (update). | `shareLog`: 300 / h (oltre → `/slow-down`). | `actions.ts:155-161`, `import-batches.ts:74-86` |
| `deleteImportAction(formData)` | Cancella per sempre i `log` con quell'`import_batch_id` e `user_id` (commenti, reazioni, share in cascata). Le visioni che c'erano già prima, le liste e i titoli creati restano. Redirect `?deleted=N`. | Proprietario. | `log` (delete). | `shareLog` 300/h. | `actions.ts:164-170`, `import-batches.ts:92-100` |
| `hideBulkDayAction(formData)` | `day` `YYYY-MM-DD`. Vale solo se quel giorno ha ≥ `BULK_MIN` log non tracciati. Cancella le `log_share` di quei log e mette `scope="private"` a tutti. | Proprietario dei log. | `log_share` (delete), `log` (update). | `shareLog` 300/h. | `actions.ts:173-179`, `import-batches.ts:134-141` |
| `deleteBulkDayAction(formData)` | Cancella per sempre tutti i log non tracciati di quel giorno (stessa soglia). | Proprietario. | `log` (delete). | `shareLog` 300/h. | `actions.ts:182-188`, `import-batches.ts:144-149` |

Le quattro azioni di gestione fanno `revalidatePath` dei layout `/[locale]/me` e `/[locale]/c/[circleId]`.

Chiamate fatte dal BROWSER verso terzi (non server action): `fetchAniList` → `POST https://graphql.anilist.co` (`import-client.tsx:121-136`); `fetchJikan` → `GET https://api.jikan.moe/v4/users/{u}/animelist?status=completed&page=N` (`:101-118`).

## B.3 Regole trasversali

### Dove avviene il parsing
Tutto nel browser, con funzioni pure di `src/lib/core/import-parsers.ts`. ZIP e gzip decompressi in memoria con `fflate` (`unzipSync` / `gunzipSync`, import dinamico). Il file non viene mai caricato sul server: partono solo righe normalizzate `ImportRow`, a pezzi.

### Per sorgente

**Letterboxd** — input `.zip` / `.csv`, selezione multipla.
- ZIP riconosciuto dai byte `PK`. Si leggono: i `.csv` al livello radice classificati per nome (`diary.csv`, `ratings.csv`, `reviews.csv`, `watched.csv`) o, se rinominati, dall'intestazione (deve contenere `Letterboxd URI`; `Review` → reviews; `Watched Date` → diary; `Rating` → ratings; altrimenti watched); `watchlist.csv` alla radice; `lists/*.csv`. Ignorate le altre cartelle (`deleted/`, `likes/`, `orphaned/`).
- Colonne lette: `Name`, `Year`, `Letterboxd URI`, `Rating`, `Rewatch` (`"yes"`), `Watched Date` (fallback `Date`), `Review`. `Tags` ignorata. `kind` sempre `movie`.
- Fusione (`letterboxdRows`, `:100-159`): una riga per visione, chiave `URI|data`. `diary` è l'ossatura; `reviews` attacca il testo alla visione con stessa chiave o ne crea una; i voti di `ratings.csv` riempiono le visioni senza voto; i film presenti solo in `ratings`/`watched` diventano una visione datata con la colonna `Date` (data del voto / della spunta).
- Voto: 0,5..5 → `Math.round(n × 2)` = mezze stelle 1..10.
- Liste: `watchlist.csv` → lista `kind="watchlist"` di nome "Watchlist"; export di lista (riga banner "Letterboxd list export v7", intestazione lista, riga vuota, poi `Position,Name,Year,URL,Description`) → `kind="list"` con nome ≤ 80 e descrizione ≤ 500; solo gli URL `boxd.it` sono tenuti come identità.
- Fragilità osservate: `r["Rewatch"].toLowerCase()` (`:117`, `:130`) lancia se la colonna manca (→ errore generico "read"); un `watchlist.csv` sciolto e rinominato verrebbe classificato come `watched` (stessa intestazione) e importato come visioni; il parser non taglia i titoli a 300 né valida l'URI, quindi una riga anomala fa fallire l'intero chunk lato server.

**IMDb** — un solo `.csv` (uno ZIP dà l'errore `imdbZip`).
- Riconosciuto se l'intestazione ha `Const` e (`Title` o `Original Title`); altrimenti `imdbFormat` (es. CSV risalvato con `;`).
- Colonne: `Const` (`tt…`, dedup), `Title`/`Original Title`, `Title Type`, `Your Rating`, `Date Rated` (primi 10 caratteri), `Year` (≥ 1870).
- Tipo (solo lettere, minuscole): `movie, tvmovie, video, tvspecial, short, tvshort` → film; `tvseries, tvminiseries` → serie; colonna assente → film; episodi contati in `skipped.episodes`, il resto (videogiochi, podcast) in `skipped.other`.
- Voto 1..10 → mezze stelle 1..10 identiche (10 IMDb = 5 stelle).
- Data = quando hai VOTATO (IMDb non ha la data di visione).
- Gli export di watchlist o lista sono accettati (le istruzioni lo dicono) ma diventano VISIONI senza data, non una watchlist: restano fuori di default, oppure entrano come viste "oggi" se si spunta l'opzione.

**Trakt** — `.zip` / `.json`, selezione multipla.
- Dallo ZIP si prendono tutti i `.json` in qualunque cartella (esclusi i file che iniziano con `.`). Ogni voce è classificata per contenuto (`traktJsonRows`, `:351-416`): ha `movie` o `show`; se contiene `rating` è un voto (scartato se riguarda episodio/stagione o fuori 1..10; `Math.round`); se ha `last_watched_at` / `watched_at` / `plays` è una visione (un episodio conta per la sua serie); tutto il resto (watchlist, collection, commenti, liste) è ignorato.
- Una riga per titolo (alias per `tmdb`, `imdb`, titolo+anno), datata con l'ULTIMA visione; `rewatch` solo per i film con `plays > 1` o due voci di cronologia; un titolo votato ma mai visto è datato con `rated_at`.
- Identità inviate: `tmdbId`, `imdbId`. Voto 1..10 diretto.
- Niente watchlist, niente log per episodio/stagione.
- Errori: `traktFormat` (niente di Trakt nei file) o `traktJson` (file non JSON).

**Cinemaniac** — un file `.bak` / `.json` (JSON).
- Riconosciuto se `movies` è un array e, quando `app` è una stringa, vale "cinemaniac".
- Film: `id_movie` (id TMDB), `title` (≤ 300), `year`, `date` (ms epoch), `seen`, `note`. Serie: `id_tv`, `title`, `first_air_date` (→ anno), `date`, `episodes_seen`, `note`. Voti: `ratings[] {id, r}`.
- `seen = 1` → visione; altrimenti watchlist. Serie con `episodes_seen > 0` → visione; altrimenti watchlist. La watchlist esce come lista `kind="watchlist"` "Watchlist" (film e serie insieme).
- Voto: `r` tra 0,5 e 10 → `Math.round(r)` limitato a 1..10 (6,5 → 7). Solo per i film; le serie arrivano senza voto.
- Data: `date` = quando il titolo è stato aggiunto all'app; valida solo se ≥ 2010-01-01 e ≤ adesso, altrimenti senza data.
- `note` → recensione (≤ 20 000 nel parser, 4 000 salvati).

**AniList** — nessun file: nome utente.
- Il browser interroga `graphql.anilist.co` con `ANILIST_LIST_QUERY`: solo anime `COMPLETED`, `perChunk: 500`, al massimo 12 chunk (6 000 voci).
- Campi: `score(format: POINT_10)` (1..10 diretto, 0 = senza voto), `completedAt` → altrimenti `startedAt` (solo date complete), `media { id idMal title{romaji english} coverImage seasonYear startDate duration }`. `repeat` è richiesto ma NON usato: `rewatch` sempre false.
- Dedup per `media.id`. In corso / pianificati / abbandonati non importati e non contati.
- Errori: 404 → `anilistNotFound`; altro → `anilistDown`.

**MyAnimeList** — due modalità.
- Username via Jikan dal browser: fino a 40 pagine, 400 ms tra le pagine, su 429 fino a 4 tentativi con attesa 1 500 ms × tentativo; 404/400 → `malNotFound`. Campi: `anime.mal_id`, `anime.title`, `anime.year`, `score`, `finish_date` / `start_date`, `watching_status` (2 o testo "complet…").
- File `.xml` o `.xml.gz` (gzip dai byte `1f 8b`): parsing con regex dei blocchi `<anime>`; `my_status` solo `completed` (gli altri contati in `skipped {watching, planned, onHold, dropped}`); `series_animedb_id`, `series_title` (CDATA o entità), `my_score` 1..10 (0 = senza voto), `my_finish_date` → `my_start_date` (`0000-00-00` = sconosciuta). `my_times_watched` ignorato. Anno null (lo riempie AniList).
- Voto 1..10 diretto.

### Conversione voti (riassunto)
Scala interna: mezze stelle intere 1..10 (10 = 5 stelle), null = non votato. Letterboxd ×2; IMDb, Trakt, MAL, AniList 1..10 presi tali e quali; Cinemaniac arrotondato all'intero.

### Visione / watchlist / lista

| Sorgente | Visione (`log`) | Watchlist | Lista |
|---|---|---|---|
| Letterboxd | diary, reviews, ratings, watched | `watchlist.csv` | `lists/*.csv` o CSV di lista |
| IMDb | ogni riga film/serie (anche da export watchlist/lista) | — | — |
| Trakt | watched + history + titoli solo votati | — (ignorata) | — |
| Cinemaniac | film `seen=1`, serie con episodi visti | il resto | — |
| AniList | solo completati | — | — |
| MAL | solo completati | — | — |

### Chiavi di deduplica
- Visione: (`user_id`, `media_id`, `watched_on`) — controllo applicativo, nessun indice unico (`import.ts:221-242`). Conta QUALSIASI log esistente dell'utente su quel titolo e giorno (anche scritto a mano o di episodio).
- Titolo (`findExisting`, `import.ts:67-118`), in ordine: `letterboxd_uri`, `anilist_id`, `mal_id`, (`kind`, `tmdb_id`), `imdb_id`; poi titolo: `lower(original_title)` o `lower(media_title.title)` tra i nomi della riga, confronto normalizzato (NFKD, senza diacritici, non alfanumerici → spazio), stesso `kind`, anno entro ±1 o mancante da una parte.
- Titolo nuovo nello stesso chunk: `identity()` (`:59-60`) = primo id disponibile, altrimenti `kind|titolo normalizzato|anno`.
- Elemento di lista: PK (`list_id`, `media_id`). Lista: proprietario + nome + tipo + Cerchia.
- Lato parser: IMDb per `Const`, AniList per `media.id`, Jikan per `mal_id`, Trakt una riga per titolo, Letterboxd chiave `URI|data`.
- Sui titoli già noti si riempiono solo i buchi (id sorgente, copertina, anno, durata), mai sovrascrivendo.

### Chunk e batch
- Server: `CHUNK_LIMIT = 30` righe per chiamata (`import.ts:23`).
- Client: `size = min(30, prima riga anime ? 30 : 20)`; liste a pezzi da 20. Chiamate sequenziali, una alla volta.
- Dentro il server, per restare sotto i ~100 parametri per statement di D1: `media_entity` a gruppi di 7, `log` di 8, `log_share` di 20, `list_item` di 15, `media_title` di 30, titoli cercati a gruppi di 40, `IN` di id a gruppi di 90.

### Abbinamento e arricchimento (`src/lib/import/enrich.ts`)
- Chiamato SOLO per le righe il cui titolo non è già nel DB; dopo l'arricchimento si ripete `findExisting` (un id scoperto può corrispondere a un titolo già noto).
- Film e serie → TMDB, 5 richieste in parallelo, timeout 6 s ciascuna: con `tmdbId` 1 chiamata `/movie|tv/{id}`; con `imdbId` 1 chiamata `/find/{id}` e, se vuota, 1 ricerca; altrimenti 1 ricerca `/search/movie|tv` (con anno), accettando il primo risultato con anno entro ±1. Quindi 1–2 chiamate esterne per titolo nuovo: 20–40 per un chunk di 20 film nuovi. Si salvano id TMDB, titolo originale, anno, locandina (solo se `^/[\w-]+\.(jpg|png)$`) e il titolo localizzato nella SOLA lingua corrente dell'utente. Errore o timeout → la riga passa senza copertina. Senza `TMDB_API_TOKEN` le righe passano invariate.
- Anime → AniList: al più 2 chiamate GraphQL per chunk (per id AniList, per id MAL), `Page(perPage: 50)`, timeout 8 s. Copertina accettata solo se inizia con `https://s4.anilist.co/`; titolo "inglese" copiato in `it`, `en`, `es`. AniList irraggiungibile → import senza copertine.
- Nessuna cache delle risposte esterne oltre al fatto che il titolo, una volta creato, è "noto".

### Destinazione
- Fissata una volta in `startImport` e riletta a ogni chunk dal batch: `null` = spazio personale; un id Cerchia = anche lì.
- I `log` importati sono SEMPRE `scope="private"`, con `created_at = watched_on` alle 12:00 UTC (così non salgono in cima al feed) e `import_batch_id`. Nessuna notifica.
- Con una Cerchia: per ogni log una riga `log_share` (`log_id`, `circle_id`, `import_batch_id`, stessa `created_at`). Anche le visioni private che c'erano già vengono condivise con quella Cerchia (se non lo sono già) e contate in `addedToCircle`. I log già `scope="circles"` non vengono toccati.
- Liste: di gruppo se la destinazione è una Cerchia, personali altrimenti.
- Se l'utente esce dalla Cerchia a import in corso il chunk risponde `invalid`.

### Ciclo di vita di `import_batch`
- Colonne: `id, user_id, source, circle_id, created_at`. Nessuno stato, nessun totale, nessun "finito".
- Creato a ogni click su "Importa" (anche se poi non arriva nulla). I batch vuoti non sono mostrati e non vengono mai puliti.
- Rilanciare dopo un errore crea un NUOVO batch: un'importazione logica può risultare spezzata su più righe.
- Cancellazione utente → cascata; cancellazione Cerchia → `circle_id = null` (FK `on delete set null` anche da `log`, `log_share`, `list` verso il batch).

### Euristica "importazioni precedenti" (`import-batches.ts:102-149`)
- Giorno UTC (`date(created_at/1000,'unixepoch')`) in cui l'utente ha ≥ `BULK_MIN = 10` log con `import_batch_id IS NULL`.
- Per ciascun giorno: quanti log e quanti sono ancora visibili a una Cerchia (`scope='circles'` o con una `log_share`).
- Funziona solo per import fatti quando `created_at` era il momento dell'import: con il codice attuale `created_at` è la data di visione, quindi un import non tracciato non si raggrupperebbe in un giorno. Falso positivo dichiarato in UI: 10+ log scritti a mano lo stesso giorno.

### Annulla / togli / elimina
Vedi B.2. In sintesi: "togli dalla Cerchia" è reversibile solo ricondividendo a mano; "elimina" è definitivo e non rimuove i titoli (`media_entity`) creati dall'import né le liste.

### Limiti
- Nessun limite esplicito di dimensione file né di righe totali (tutto in memoria nel browser).
- 600 chunk/ora per utente ≈ 12 000 titoli (20 per chunk) o 18 000 anime.
- AniList 6 000 voci; Jikan 40 pagine.
- `offset` di lista ≤ 5 000: i pezzi oltre vengono rifiutati.
- Recensione ≤ 20 000 in ingresso, 4 000 salvati; titolo ≤ 300; nome lista ≤ 80; descrizione ≤ 500.
- `listImportBatches` mostra al massimo 50 esecuzioni.

### Errori e avanzamento (`import-client.tsx:207-270`)
- Ogni chunk: un retry immediato (non su `limit`). Chunk fallito → tutte le sue righe contate in `failed`. Tre chunk falliti di fila → stop con errore `chunk`. `limit` → stop immediato con messaggio "mi fermo per un'ora".
- Avanzamento: numero grande `done`, testo "{done} di {total}", barra (`role="progressbar"`).
- Riepilogo finale: importate, aggiunte alla Cerchia, liste, titoli nuovi, già presenti, senza data escluse, non importate (solo conteggi).
- Nessun bottone "ferma": `stop.current` viene solo azzerato (`:209`) e letto, mai messo a `true`.
- Errori di lettura file nominati: `empty`, `read`, `imdbFormat`, `imdbZip`, `traktFormat`, `traktJson`, `letterboxdFormat`, `cinemaniacFormat`, `anilistNotFound/Down`, `malNotFound/Down`.

## B.4 Test esistenti

`import-parsers.test.ts` (22):
- `parseCsv`: virgolette, virgole, doppie virgolette e a capo nel campo; BOM, CRLF e righe vuote; file vuoto.
- `letterboxdRows`: una riga per visione da tutti e 4 i file (6 righe, 5 film); data di visione e voto ×2; recensione attaccata alla sua visione; visione creata da una recensione senza diario; voto mancante preso da ratings.csv; film senza diario datati col voto/spunta; un solo file o nessuno; righe senza titolo/URI scartate.
- `malRows`: solo completati con conteggio esclusi; CDATA ed entità; voto 1..10 e 0 = non votato; data fine → inizio → nulla; manga ignorati, input vuoto.
- `anilistRows`: dedup; voto 0..10; date parziali non valgono; titolo, copertina, anno, id MAL; più chunk e risposta vuota; `aniMediaFields` su lookup.

`import-sources.test.ts` (9): IMDb film/serie, episodi e giochi esclusi, duplicati, buchi; righe senza id/titolo; Trakt una riga per titolo con ultimo watch e voti; file mancanti o JSON rotto; Jikan solo completati, dedup, date; Jikan vuoto; film e serie con lo stesso numero TMDB restano due titoli; stesso id IMDb si unisce al titolo esistente; reimport identico non aggiunge nulla.

`import-formats.test.ts` (11): IMDb vecchie e nuove grafie del tipo, BOM e CRLF; export lista/watchlist IMDb senza voto né data; anno/data che il server rifiuterebbe diventano null; file non IMDb riconosciuto come tale; Trakt distingue visioni e voti da watchlist/collection/commenti; cronologia Trakt con rewatch e voto episodio ignorato; file non Trakt o non JSON; i `steps` delle 4 sorgenti con file sono liste di stringhe in it/en/es; Cinemaniac visti/watchlist/voti/date rotte; nota come recensione ed entrate senza id; file non Cinemaniac.

`import-lists.test.ts` (5): export lista Letterboxd (nome, descrizione, ordine, solo URL boxd.it); watchlist; file che non sono liste; `importList` crea lista personale in ordine ed è idempotente; riempie la stessa lista su più chunk continuando le posizioni.

`import.test.ts` (21): visioni datate alla data di visione (`created_at` 12:00Z); idempotenza; storie separate ma titoli condivisi; rewatch in date diverse sì, stesso giorno no; nessuna notifica; senza data escluse o datate oggi; recensioni escluse su richiesta; righe senza titolo scartate; abbinamento per titolo+anno con memorizzazione dell'URI; titolo localizzato; stesso titolo con anno lontano o tipo diverso NON abbinato; anno ±1; anime per id AniList/MAL; riempimento buchi senza sovrascrivere; titoli localizzati salvati; arricchimento chiesto solo per gli sconosciuti; riuso per id scoperto; abbinamento per titoli scoperti (MAL romaji); due righe dello stesso titolo nuovo lo creano una volta; limiti D1 (chunk peggiore di 30: ≤ 100 parametri per statement e ≤ 45 query); chunk pieno da 30 ritrovato al secondo giro.

`import-batches.test.ts` (16): destinazione privata di default; Cerchia come destinazione con share datate; visioni già private entrano una volta; Cerchia altrui rifiutata; batch solo del proprietario e senza destinazione dopo l'uscita; rimozione dalla Cerchia tiene tutto in privato ed è idempotente; non tocca share a mano / log a mano / altri batch; rifiutata ad altri; liste di gruppo tornano personali; elenco batch con conteggi, senza i vuoti; eliminazione solo dei log del batch; giorni bulk elencati con visibilità; nascondere un giorno senza cancellare; le share del giorno nascosto cadono; cancellare un giorno solo per quell'utente; rifiuto di un giorno sotto soglia o stringa non-data.

Nessun test su `actions.ts` (zod, rate limit), su `enrich.ts` (TMDB/AniList) né sul client (`import-client.tsx`: chunking, retry, lettura ZIP).


# Parte 4 — Pubblico, PWA, guscio nativo, design, i18n, test, CI
# Inventario 4: superficie pubblica/SEO, PWA, guscio nativo, design system, i18n, test, CI e deploy

Repo letto: `C:\Users\Giuseppe\Desktop\Personal Project\Pausa` (sola lettura, niente eseguito dell'app, `.env.local` non aperto).
Ultimo commit visto: `513519f` ("Prompt for rebuilding Pausa in Rust + React Native, free plans only").

**Come leggere le affermazioni.** Tutto ciò che segue viene dal codice sorgente e dai documenti. Nel repo **non c'è una build di produzione** (`.next/` contiene solo `cache/`, `dev/`, `types/`; `.open-next/` non esiste), quindi i tag `<head>` effettivamente emessi e lo stato "statico/dinamico" di ogni rotta sono **dedotti dal codice** e dal README, non osservati su HTML reso. Dove la deduzione dipende dal comportamento di Next/OpenNext/Cloudflare e non da una riga del repo, è marcato **[da verificare]**.

---

## 1. Pagine pubbliche

### 1.1 Origine e regole comuni

- Origine: `siteUrl()` in `src/lib/site.ts` = `NEXT_PUBLIC_SITE_URL` ?? `BETTER_AUTH_URL` ?? `https://pausa.gnagno.org`, senza slash finale. Nel workflow di deploy è fissata a `https://pausa.gnagno.org` in fase di build.
- `metadataBase` = `siteUrl()` (in `src/app/[locale]/layout.tsx`): canonical, hreflang e immagini OG scritti come percorsi relativi diventano assoluti.
- Titolo: `title: { default: "Pausa", template: "%s · Pausa" }`. La landing usa `title.absolute` (niente suffisso).
- Descrizione di default (ereditata da chi non ne dichiara una): `landing.meta.siteDescription`.
  - it: "Il diario privato di film, serie e anime per il tuo gruppo di amici."
  - en: "The private diary of films, series and anime for your group of friends."
  - es: "El diario privado de películas, series y anime para tu grupo de amigos."
- `<html lang="{locale}" data-theme="dark">` renderizzato dal server; uno script inline in `<head>` legge il cookie `pausa-theme` e imposta `data-theme` prima del primo paint.
- Viewport (`export const viewport`): `themeColor: "#001113"` (fisso, anche in tema chiaro), `colorScheme: "dark light"`, `viewportFit: "cover"`, `interactiveWidget: "resizes-content"`.
- `appleWebApp: { capable: true, title: "Pausa", statusBarStyle: "default", startupImage: splashLinks }` (10 link `apple-touch-startup-image`, vedi §3).
- File-convention di Next nella radice di `src/app`: `manifest.ts` (→ `/manifest.webmanifest`), `icon.tsx` (PNG 32×32), `apple-icon.tsx` (PNG 180×180), `robots.ts`, `sitemap.ts`. `public/favicon.ico` esiste (6369 byte) ed è servito a `/favicon.ico`.
- Immagine OG di default per **tutto** ciò che sta sotto `/[locale]`: `src/app/[locale]/opengraph-image.tsx`, 1200×630 PNG, `alt = "Pausa"`. Disegna: le due barre della pausa + "PAUSA", lo slogan `landing.og.tagline` in maiuscolo (144px, 120px se > 40 caratteri), `pausa.gnagno.org` in basso. Slogan: it "Il diario privato del vostro gruppo.", en "The private diary for your friend group.", es "El diario privado de tu grupo de amigos."
- Link di salto: `<a href="#main" class="skip-link">` con testo cablato nel layout (it "Vai al contenuto", en "Skip to content", es "Saltar al contenido"), non in `messages/`.
- Analytics: script `https://static.cloudflareinsights.com/beacon.min.js` solo se `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` esiste **al momento della build**.
- Header di sicurezza su ogni risposta (`next.config.ts`, `source: "/:path*"`):
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://image.tmdb.org https://*.googleusercontent.com https://s4.anilist.co; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (in dev si aggiungono `'unsafe-eval'` e `ws: wss:`).
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
  - `poweredByHeader: false`.
- Cache: l'unica regola esplicita nel repo per i file statici è `public/_headers`: `/_next/static/*` → `Cache-Control: public, max-age=31536000, immutable`. **Nessun header di cache esplicito per l'HTML delle pagine pubbliche**: vale il default di Next/OpenNext per pagine prerenderizzate senza `revalidate` **[da verificare sul sito]**.
- Rendering: `open-next.config.ts` usa `staticAssetsIncrementalCache`. Le pagine pubbliche sono prerenderizzate in build (grazie a `generateStaticParams` nel layout per le 3 lingue e nella pagina guida per 3×8) e lette dagli asset statici, senza revalidation ("they change with a deploy"). Nessun `export const dynamic/revalidate/runtime` in tutto `src/`. Non c'è middleware/proxy.

### 1.2 Tabella delle URL pubbliche (per ogni `l` ∈ {`it`,`en`,`es`})

| URL | `<title>` | description | canonical | hreflang | Open Graph / Twitter | JSON-LD (`@graph`) | Rendering oggi |
|---|---|---|---|---|---|---|---|
| `/` | n/a | n/a | n/a | n/a | n/a | n/a | **Dinamica**: legge `Accept-Language` e `?app`, risponde con redirect (`redirect()` di Next) a `/{l}` oppure `/{l}/home` se `?app=1` |
| `/{l}` (landing) | `landing.meta.title`, assoluto | `landing.meta.description` | `/{l}` | `it`→`/it`, `en`→`/en`, `es`→`/es`, `x-default`→`/it` | `og:type=website`, `og:title`, `og:description`, `og:site_name=Pausa`, `og:locale` = `it_IT` / `en_US` / `es_ES`; immagine = `opengraph-image` di default. `twitter:card=summary_large_image`, `twitter:title`, `twitter:description` (nessuna immagine Twitter dichiarata) | `Organization`, `WebSite`, `WebApplication`, `FAQPage` | Prerenderizzata (3 pagine) |
| `/{l}/guide` | `{guideStrings[l].indexTitle} · Pausa` | `guideStrings[l].indexLede` | `/{l}/guide` | come sopra con `/guide` | `og:type=website`, `og:title`, `og:description`, `og:site_name` (**niente `og:locale`**); immagine di default; nessun blocco `twitter` | `Organization`, `WebSite`, `CollectionPage` (con `ItemList`), `BreadcrumbList` (2 voci) | Prerenderizzata (3) |
| `/{l}/guide/{slug}` (8 slug) | `{guide.title} · Pausa` | `guide.description` | `/{l}/guide/{slug}` | `it`/`en`/`es`/`x-default`(→`/it/guide/{slug}`) | `og:type=article`, `og:title`, `og:description`, `og:site_name`, `article:published_time=2026-11-17`, `og:image=/api/og/guide/{slug}?locale={l}` (1200×630, `alt` = titolo). `twitter:card=summary_large_image`, titolo, descrizione, stessa immagine | `Organization`, `WebSite`, `Article`, `BreadcrumbList` (3 voci) | Prerenderizzata (24) |
| `/{l}/privacy` | `{legalDoc.title} · Pausa` | `LEGAL_DESCRIPTION.privacy[l]` | `/{l}/privacy` | it/en/es/x-default | Nessun `openGraph` proprio (resta solo l'immagine di default) | **Nessuno** | Prerenderizzata (3) |
| `/{l}/terms` | `{legalDoc.title} · Pausa` | `LEGAL_DESCRIPTION.terms[l]` | `/{l}/terms` | it/en/es/x-default | idem privacy | **Nessuno** | Prerenderizzata (3) |
| `/{l}/sign-in` | `Pausa` (nessun metadata proprio) | descrizione di default | nessuno | nessuno | solo immagine di default | nessuno | **Dinamica** (legge la sessione, `searchParams.next`, `googleEnabled()`); vietata in `robots.txt`, ma **senza** meta `noindex` |
| `/{l}/join/{code}` | `Pausa` (nessun metadata proprio) | default | nessuno | nessuno | solo immagine di default | nessuno | **Dinamica** (D1: `peekInvite`; poi sessione); vietata in `robots.txt`, senza meta `noindex` |
| `/{l}/s/{code}` (Serata) | `serata.invite.title` o `invite.titleDone` + ` · Pausa` | `serata.invite.description` | nessuno | nessuno | `og:title`, `og:description`, `og:site_name`, `og:image` = `/api/serata/{code}/invite?locale={l}` (aperta) oppure `/api/serata/{code}/card?format=og&locale={l}` (finita), 1200×630; `twitter:card=summary_large_image` | nessuno | **Dinamica** (D1 anche in `generateMetadata`); `robots: { index: false }` |
| `/{l}/s/{code}/card` | `{serata.result.kicker}: {titolo vincitore} · Pausa` | default | nessuno | nessuno | `og:title`, `og:site_name`, `og:image=/api/serata/{code}/card?locale={l}&format=og`; twitter large | nessuno | **Dinamica**; `robots: { index: false }`; contiene un QR (data URI) verso `{origin}/{l}?utm_source=card` |
| `/{l}/review` | `App review sign-in · Pausa` | default | — | — | — | — | Dinamica; `robots: { index: false, follow: false }`; 404 se `REVIEW_EMAIL`/`REVIEW_PASSWORD` mancano; testo solo in inglese |
| `/{l}/slow-down` | `Pausa` | default | — | — | — | — | `robots: { index: false }` |
| `/{l}/home` | `Pausa` | — | — | — | — | — | Dinamica, `robots: { index: false }`; reindirizza a `/{l}` (non loggato o ospite) o all'ultima Cerchia (cookie `pausa-circle`) |

Titoli esatti (per i test):

| Pagina | it | en | es |
|---|---|---|---|
| Landing `<title>` | `Pausa · Diario dei film con gli amici e cosa guardare stasera` | `Pausa · A film diary with friends, and what to watch tonight` | `Pausa · Diario de películas con amigos y qué ver esta noche` |
| Landing description | "App gratuita per tenere un diario privato di film, serie e anime con gli amici. E quando non sapete cosa guardare stasera, votate e decidete in 2 minuti." | "A free app to keep a private diary of films, series and anime with your friends. And when nobody knows what to watch tonight, vote and decide in 2 minutes." | "App gratuita para llevar un diario privado de películas, series y anime con tus amigos. Y cuando no sabéis qué ver esta noche, votad y decidid en 2 minutos." |
| Indice guide (h1 e titolo) | "Guide per scegliere cosa guardare insieme" | "Guides to picking what to watch together" | "Guías para elegir qué ver juntos" |
| Indice guide (description) | "Metodi pratici per decidere in gruppo, senza litigare e senza perdere la serata." | "Practical ways to decide as a group, without arguing and without losing the evening." | "Métodos prácticos para decidir en grupo, sin discutir y sin perder la noche." |
| Privacy | "Informativa sulla privacy" | "Privacy notice" | "Política de privacidad" |
| Termini | "Termini di servizio" | "Terms of service" | "Términos del servicio" |
| Privacy description | "Quali dati tratta Pausa, chi vede i tuoi contenuti, quali cookie usa e come scaricare o cancellare i tuoi dati." | "What data Pausa handles, who sees what you post, which cookies it uses, and how to download or delete your data." | "Qué datos trata Pausa, quién ve tus contenidos, qué cookies usa y cómo descargar o borrar tus datos." |
| Termini description | "Le regole per usare Pausa: account, contenuti, uso corretto e chiusura dell'account." | "The rules for using Pausa: your account, your content, fair use and closing your account." | "Las normas para usar Pausa: cuenta, contenidos, uso correcto y cierre de la cuenta." |

### 1.3 JSON-LD, campo per campo

Nodi condivisi (`src/lib/jsonld.ts`), ripetuti per intero su ogni pagina che ha JSON-LD:

- `Organization`: `@id = {origin}/#organization`, `name: "Pausa"`, `url: {origin}`, `logo: { @type: ImageObject, url: {origin}/pwa-icon/512, width: 512, height: 512 }`.
- `WebSite`: `@id = {origin}/#website`, `name: "Pausa"`, `url: {origin}/` (con slash), `inLanguage: ["it","en","es"]`, `publisher: { @id: organization }`.
- `<` è sempre scritto `\u003c` dentro lo script.

Landing (`src/components/landing/landing.tsx`):
- `WebApplication`: `@id = {origin}/#app`, `name`, `url = {origin}/{l}`, `description = landing.meta.description`, `applicationCategory: "EntertainmentApplication"`, `operatingSystem: "Any"`, `inLanguage: ["it","en","es"]`, `isAccessibleForFree: true`, `offers: { @type: Offer, price: "0", priceCurrency: "EUR" }`, `publisher: { @id }`.
- `FAQPage`: `mainEntity` = le voci di `landing.faq.items` (7 per lingua) come `Question { name, acceptedAnswer: Answer { text } }`.

Indice guide: `CollectionPage` (`@id` = `url` = `{origin}/{l}/guide`, `name`, `description`, `inLanguage: l`, `isPartOf: { @id: website }`, `mainEntity: ItemList` con 8 `ListItem { position, url, name }`) e `BreadcrumbList` (1 "Pausa" → `{origin}/{l}`, 2 `guideStrings.index` → `{origin}/{l}/guide`).

Guida: `Article` con `headline`, `description`, `inLanguage: l`, `datePublished` = `dateModified` = `2026-11-17T09:00:00+01:00` (`isoDateTime(GUIDES_UPDATED)`, offset fisso `+01:00`), `image: ImageObject { url: {origin}/api/og/guide/{slug}?locale={l}, width: 1200, height: 630 }`, `mainEntityOfPage: WebPage { @id: url, isPartOf: { @id: website } }`, `author` e `publisher` = `{ @id: organization }`. `BreadcrumbList` a 3 voci (Pausa, Guide, titolo).

### 1.4 `robots.txt` (da `src/app/robots.ts`)

```
User-Agent: GPTBot
User-Agent: ClaudeBot
User-Agent: CCBot
Disallow: /

User-Agent: *
Allow: /
Allow: /api/og/
Disallow: /api/
Disallow: /*/c/
Disallow: /*/s/
Disallow: /*/join/
Disallow: /*/sign-in
Disallow: /*/home
Disallow: /*/me
Disallow: /*/account
Disallow: /*/review

Sitemap: https://pausa.gnagno.org/sitemap.xml
```

(La forma è quella che Next genera dall'oggetto; i valori sono esatti.) Commento nel codice: `/api/og/` resta aperto perché le immagini social delle guide stanno lì e il crawler di X segue `robots.txt`. Non sono in elenco: `/*/admin` e `/*/slow-down` (hanno solo il meta `noindex`).

### 1.5 `sitemap.xml` (da `src/app/sitemap.ts`)

36 URL = 3 lingue × (landing + indice guide + 8 guide + privacy + termini). Per ognuna: `loc = {origin}/{l}{path}`, `lastmod` = `2026-11-17` (sia `GUIDES_UPDATED` sia `LEGAL_UPDATED` valgono `2026-11-17`), `alternates.languages` con `it`, `en`, `es` e `x-default` (= versione italiana). Niente `changefreq`, niente `priority`. Ordine: landing, `/guide`, le 8 guide, `/privacy`, `/terms`, ciascuna nelle tre lingue.

### 1.6 `llms.txt`

`public/llms.txt`, statico: descrizione in inglese, le tre home, le 8 guide **solo in inglese**, privacy e termini in inglese, nota che `/c/`, `/s/` e sign-in sono private, attribuzione TMDB/AniList/JustWatch.

### 1.7 Checklist SEO da trasformare in test

Per ogni `l` ∈ {it,en,es} e `origin = https://pausa.gnagno.org`:

Globali
1. `GET /robots.txt` → 200, contiene le 9 righe `Disallow` e le 2 `Allow` di §1.4 nel gruppo `*`, il gruppo `GPTBot`/`ClaudeBot`/`CCBot` con `Disallow: /`, e `Sitemap: {origin}/sitemap.xml`.
2. `GET /sitemap.xml` → 200, esattamente 36 `<url>`, ognuno con 4 alternates (`it`,`en`,`es`,`x-default`); `x-default` punta sempre a `/it…`; ogni `loc` risponde 200 senza redirect.
3. `GET /llms.txt` → 200, `text/plain`, contiene le 8 URL `/en/guide/{slug}`.
4. `GET /manifest.webmanifest` → 200 con i campi di §3.1.
5. `GET /` con `Accept-Language: es-ES,es;q=0.9` → redirect a `/es`; con `fr-FR` → `/it`; con `?app=1` → `/{l}/home`.
6. Ogni risposta HTML ha gli header di sicurezza di §1.1 (CSP compresa, `frame-ancestors 'none'`).
7. `/_next/static/*` (o l'equivalente dei file con hash) ha `Cache-Control: public, max-age=31536000, immutable`.
8. Le pagine pubbliche non impostano cookie e sono identiche per chi è loggato e chi no (nessun `Set-Cookie`, nessuna lettura di sessione lato server).

Ogni pagina indicizzabile (`/{l}`, `/{l}/guide`, `/{l}/guide/{slug}`, `/{l}/privacy`, `/{l}/terms`)
9. `<html lang="{l}">`.
10. Un solo `<h1>`.
11. `<link rel="canonical" href="{origin}/{l}{path}">`, assoluto, senza slash finale, autoreferenziale.
12. Quattro `<link rel="alternate" hreflang>`: `it`, `en`, `es`, `x-default` (= `/it{path}`), reciproci fra le tre lingue.
13. `<meta name="description">` non vuota e uguale alla stringa della tabella di §1.2.
14. `<title>` secondo il modello: landing = titolo assoluto; le altre = `{titolo} · Pausa`.
15. `og:image` assoluta, 1200×630, risponde 200 con `content-type: image/png`.
16. Nessun meta `robots` con `noindex`.
17. `<meta name="theme-color" content="#001113">`, viewport con `viewport-fit=cover`.
18. `<link rel="manifest">`, `<link rel="icon">`, `<link rel="apple-touch-icon">` presenti.
19. Il contenuto (h1, testo, link) è nell'HTML iniziale, senza JavaScript.

Landing `/{l}`
20. `<title>` e description esatti (tabella §1.2); `og:type=website`, `og:site_name=Pausa`, `og:locale` corretto, `twitter:card=summary_large_image`.
21. Un solo `<script type="application/ld+json">` con `@graph` di 4 nodi: `Organization` (con `logo.url` che risponde 200), `WebSite`, `WebApplication` (`offers.price = "0"`, `priceCurrency = "EUR"`, `applicationCategory = "EntertainmentApplication"`, `isAccessibleForFree = true`), `FAQPage` con 7 `Question`, ognuna con `acceptedAnswer.text` uguale al testo visibile nella sezione FAQ.
22. Àncore `#how`, `#try`, `#privacy`, `#faq` esistono; link nel footer a `/{l}/guide`, `/{l}/privacy`, `/{l}/terms`; selettore lingua con 3 link a `/it`, `/en`, `/es`; attribuzione TMDB visibile.
23. h1 italiano contiene "Cosa guardiamo stasera" (è l'asserzione dell'e2e esistente); pulsante "Scarica l'app" e link "Guide" visibili.

Indice guide `/{l}/guide`
24. JSON-LD con `CollectionPage` il cui `mainEntity.itemListElement` ha 8 `ListItem` con `position` 1..8 e `url = {origin}/{l}/guide/{slug}`; `BreadcrumbList` a 2 voci.
25. 8 link interni, uno per slug, nell'ordine di `GUIDE_SLUGS`.

Guida `/{l}/guide/{slug}` (24 pagine)
26. `og:type=article`, `article:published_time` presente, `og:image = {origin}/api/og/guide/{slug}?locale={l}` che risponde 200 PNG 1200×630; `twitter:image` uguale.
27. JSON-LD `Article` con `headline` = h1, `description` = meta description, `inLanguage = l`, `datePublished` e `dateModified` in ISO 8601 con fuso, `image.url` assoluta (200), `mainEntityOfPage.@id` = canonical, `author.@id` e `publisher.@id` = `{origin}/#organization`.
28. `BreadcrumbList` a 3 voci, l'ultima con `item` = canonical.
29. Slug sconosciuto (`/{l}/guide/xyz`) → 404.
30. Presenti: data "Aggiornato: 2026-11-17", blocco di invito con link a `/{l}/#try`, tre "altre guide", link "Tutte le guide".

Legali
31. `/{l}/privacy` e `/{l}/terms`: titolo e description della tabella; data `2026-11-17`; **titolare e contatto visibili in fondo** (vedi mancanza M1 in §8).

Pagine private/di servizio
32. `/{l}/s/{code}` e `/{l}/s/{code}/card`: `noindex`; `og:image` valida (invito o card) e mai un'informazione su chi ha votato cosa.
33. `/{l}/c/…`, `/{l}/me…`, `/{l}/account`, `/{l}/home`, `/{l}/admin/…`, `/{l}/review`, `/{l}/slow-down`: `noindex` e non in sitemap.
34. `/{l}/c/{id}` senza sessione → redirect a `/{l}/sign-in`; con sessione ma non membro → 404 (mai 403).

---

## 2. Guide

- 8 slug, **identici nelle tre lingue** (lo slug è inglese ovunque; l'hreflang li collega). Ordine di `GUIDE_SLUGS`:
  1. `choose-a-movie-with-friends`
  2. `bracket-vs-dot-voting`
  3. `letterboxd-alternative-for-friends`
  4. `movie-night-guide`
  5. `movie-for-two`
  6. `anime-night-with-friends`
  7. `nobody-knows-what-to-watch`
  8. `keep-a-film-diary`
- Totale pagine: 24 (8 × 3) + 3 indici.
- Titoli:

| slug | it | en | es |
|---|---|---|---|
| choose-a-movie-with-friends | Come scegliere un film con gli amici senza litigare | How to choose a movie with friends without arguing | Cómo elegir una película con amigos sin discutir |
| bracket-vs-dot-voting | Torneo a eliminazione o voto a punti: quale metodo usare per scegliere cosa guardare | Knockout bracket or dot voting: which method to pick what to watch | Torneo de eliminación o voto por puntos: qué método usar para elegir qué ver |
| letterboxd-alternative-for-friends | Un'alternativa a Letterboxd per tenere il diario film solo con gli amici | A Letterboxd alternative for keeping a film diary with just your friends | Una alternativa a Letterboxd para llevar el diario de cine solo con tus amigos |
| movie-night-guide | Come organizzare una serata film con gli amici, passo per passo | How to organise a movie night with friends, step by step | Cómo organizar una noche de cine con amigos, paso a paso |
| movie-for-two | Cosa guardare in coppia: come scegliere senza litigare | What to watch as a couple: how to choose without arguing | Qué ver en pareja: cómo elegir sin discutir |
| anime-night-with-friends | Serata anime con gli amici: come scegliere cosa guardare | Anime night with friends: how to choose what to watch | Noche de anime con amigos: cómo elegir qué ver |
| nobody-knows-what-to-watch | Cosa guardare stasera quando nessuno sa cosa vuole | What to watch tonight when nobody knows what they want | Qué ver esta noche cuando nadie sabe lo que quiere |
| keep-a-film-diary | Come tenere un diario dei film e delle serie che guardi | How to keep a diary of the films and series you watch | Cómo llevar un diario de las películas y series que ves |

- **Dove sta il contenuto**: in codice TypeScript, non in `messages/` né in Markdown. `src/lib/guides.ts` (le prime 4, 25,9 KB) e `src/lib/guides-more.ts` (le altre 4, 21 KB). Tipi:
  - `Guide = { title, description, intro, blocks: Block[], cta }`
  - `Block = { h: string; p?: string[]; list?: string[] }` (sottotitolo, paragrafi, elenco puntato facoltativo)
  - In totale 105 blocchi (57 + 48) e 12 blocchi con `list`.
  - `GUIDES_UPDATED = "2026-11-17"` è una sola data per tutte.
  - `guideStrings[locale]` tiene le 8 stringhe di interfaccia delle guide (`index`, `indexTitle`, `indexLede`, `read`, `try`, `updated`, `back`, `more`), anche queste fuori da `messages/`.
  - `guideFor(locale, slug)` e `isGuideSlug(v)` sono gli accessi.
- Struttura della pagina: breadcrumb (Pausa / Guide), `h1`, "Aggiornato: data", `intro`, un `section.plate` per blocco (`h2` a sinistra da 64rem, testo a 65ch), un riquadro `well grained` con `cta` e pulsante "Prova una Serata" → `/{l}/#try`, "Altre guide" (3 link scelti con `slice(idx % 3, idx % 3 + 3)` sugli altri 7), link "Tutte le guide".
- Testi legali: stesso schema, in `src/lib/legal.ts` (`LegalDoc = { title, updated, intro, sections: { h, p[] }[] }`, 42 sezioni in tutto fra privacy e termini nelle 3 lingue, `LEGAL_UPDATED = "2026-11-17"`). Il file dichiara in testa che è una **bozza non rivista da un legale**.

---

## 3. PWA

### 3.1 Manifest (`src/app/manifest.ts` → `/manifest.webmanifest`)

| Campo | Valore |
|---|---|
| `name`, `short_name` | `Pausa` |
| `description` | "Il diario privato della tua Cerchia: film, serie, anime." (solo italiano, non localizzato) |
| `start_url` | `/?app=1` (la radice reindirizza a `/{l}/home`) |
| `scope` | `/` |
| `display` | `standalone` |
| `orientation` | `portrait` |
| `background_color`, `theme_color` | `#001113` (`CARD.paper`) |
| `related_applications` | `[{ platform: "webapp", url: "{origin}/manifest.webmanifest" }]` (serve a `navigator.getInstalledRelatedApps`) |
| `icons` | `/pwa-icon/192` (192×192, `any`), `/pwa-icon/512` (512×512, `any`), `/pwa-icon/maskable` (512×512, `maskable`) |

Assenti: `id`, `lang`, `dir`, `screenshots`, `shortcuts`, `categories`, `prefer_related_applications`.

### 3.2 Icone e splash (tutte disegnate in codice con `ImageResponse`, nessun PNG nel repo per il web)

- Disegno unico: `pauseMark(size, { inset, rounded })` in `src/lib/pause-mark.tsx`. Un quadrato color segnale (`#fd7e49`) su fondo `#001113`, griglia a 28 unità, 4 fori di pellicola per lato (x = 2.5 e 22.5; y = 3, 9.25, 15.5, 21.5; 3×3.5) e le due barre della pausa ritagliate (x = 9.5 e 15; y = 7; 3.5×14). `rounded` → `borderRadius = size × 0.22`. La stessa forma è l'SVG `PauseMark` in `src/components/brand.tsx` (`viewBox 0 0 28 28`, `fill-rule: evenodd`, `fill: var(--color-accent)`).
- `/icon` (favicon PNG): 32×32, `inset 0.22`, arrotondata.
- `/apple-icon`: 180×180, `rounded: false` (iOS applica la sua maschera).
- `/pwa-icon/192`, `/pwa-icon/512`: `inset 0.21`, arrotondate. `/pwa-icon/maskable`: 512, `inset 0.34`, quadrata. Altro valore → 404. Nessun header di cache esplicito (resta quello di default di `ImageResponse` **[da verificare]**).
- `/apple-splash/{W}x{H}` (`src/app/apple-splash/[size]/route.tsx`): fondo `#001113`, al centro le **due barre semplici** (non il fotogramma) alte il 22% del lato corto. Solo le 10 misure di `SPLASH_SCREENS` esistono, le altre → 404. Header: `Cache-Control: public, max-age=604800, immutable`. Solo verticale.

| CSS px | DPR | PNG | Commento nel codice |
|---|---|---|---|
| 430×932 | 3 | 1290×2796 | iPhone 14/15/16 Pro Max, 15/16 Plus |
| 393×852 | 3 | 1179×2556 | iPhone 14/15/16 Pro, 15/16 |
| 428×926 | 3 | 1284×2778 | iPhone 12/13/14 Pro Max, 14 Plus |
| 390×844 | 3 | 1170×2532 | iPhone 12/13/14, 12/13 Pro |
| 375×812 | 3 | 1125×2436 | iPhone X, XS, 11 Pro, 12/13 mini |
| 414×896 | 2 | 828×1792 | iPhone XR, 11 |
| 375×667 | 2 | 750×1334 | iPhone 8, SE |
| 1024×1366 | 2 | 2048×2732 | iPad Pro 12.9" |
| 834×1194 | 2 | 1668×2388 | iPad Pro 11" |
| 820×1180 | 2 | 1640×2360 | iPad Air |

Media query di ogni link: `(device-width: Wpx) and (device-height: Hpx) and (-webkit-device-pixel-ratio: R) and (orientation: portrait)`.

- Icone del guscio nativo: file PNG/ICO/ICNS veri in `src-tauri/icons/` (desktop, Android mipmap, iOS), "generate dall'icona PWA" secondo il README.

### 3.3 Service worker (`public/sw.js`, registrato da `RegisterSw` su ogni pagina sotto `/[locale]`)

- Cache: una sola, `pausa-offline-v1`, che contiene **solo** `/offline.html`. Commento in testa: non mette in cache altro, così non può mai servire una pagina privata vecchia.
- `install`: `cache.add("/offline.html")` poi `skipWaiting()`.
- `activate`: cancella ogni cache con nome diverso, poi `clients.claim()`.
- `fetch`: interviene **solo** sulle navigazioni (`request.mode === "navigate"`): rete, e se la rete fallisce risponde con `/offline.html`. Tutto il resto (script, immagini, API) non passa dal SW.
- `push`: legge JSON `{ title, body, tag, url }`; mostra la notifica con `icon` e `badge` = `/pwa-icon/192`, `tag` (una notifica più nuova sullo stesso log sostituisce la vecchia), `data.url` (default `/`); titolo di ripiego "Pausa".
- `notificationclick`: chiude, cerca una finestra della stessa origine, la mette a fuoco e la porta a `url`; altrimenti `openWindow(url)`.
- **Comportamento offline**: niente funziona offline tranne la pagina di cortesia. Nessun precache del guscio, nessuna coda di scritture.
- `public/offline.html`: pagina autonoma (CSS e JS inline, `noindex`), sceglie la lingua da `navigator.language` (it/en/es, ripiego it), titolo "Pausa · Sei offline" / "You are offline" / "Estás sin conexión", un pulsante "Riprova" (`location.reload()`), si ricarica da sola all'evento `online`. Segue `prefers-color-scheme` del sistema, **non** il cookie `pausa-theme`.

### 3.4 Installazione (`src/components/landing/install-app.tsx`)

Il pulsante "Scarica l'app" (`landing.install.button`) compare due volte nella landing: nell'hero (`btn btn-quiet btn-lg`) e nel footer (link). Logica:

1. Piattaforma dal browser: `ios` se UA contiene iphone/ipad/ipod **oppure** è "Macintosh" con `maxTouchPoints > 1` (iPadOS); `android` se UA contiene android; altrimenti `desktop`.
2. Il pulsante **non viene mostrato** se l'app è già "installata": `display-mode` `standalone`/`fullscreen`/`minimal-ui`, oppure `navigator.standalone === true` (iOS), oppure guscio nativo (`window.__TAURI_INTERNALS__`), oppure UA con `; wv)` (qualsiasi WebView Android), oppure `navigator.getInstalledRelatedApps()` restituisce almeno un'app, oppure dopo l'evento `appinstalled`.
3. Ascolta `beforeinstallprompt`, fa `preventDefault()` e conserva l'evento.
4. Al click: se c'è l'evento, chiama `prompt()`; se l'esito è `accepted` finisce lì. In ogni altro caso (nessun evento, o rifiuto) apre un `<dialog>` modale con le istruzioni.
5. Il dialogo elenca le tre piattaforme, **prima quella del dispositivo in mano** (bordo sinistro arancio e la parola "il tuo"):
   - iPhone e iPad (Safari): "Tocca Condividi, poi «Aggiungi alla schermata Home»."
   - Android (Chrome): "Tocca il menu ⋮, poi «Installa app» o «Aggiungi a schermata Home»."
   - Computer (Chrome, Edge): "Clicca l'icona di installazione nella barra dell'indirizzo, oppure il menu → «Installa Pausa»."
   - Titolo "Porta Pausa sul telefono", introduzione "Si installa dal browser, senza store: ha la sua icona e si apre a schermo intero.", pulsante "Chiudi".
6. L'`id` del titolo del dialogo viene da `useId()` perché il componente è in pagina due volte.

Push e iOS (`src/components/push-toggle.tsx`): su iPhone/iPad non installato lo stato è `needs-install` (spiega che serve l'app dalla schermata Home); altri stati `unsupported`, `blocked`, `off`, `on`. Chiave pubblica VAPID = variabile di build `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

L'app installata parte da `/?app=1` → `/{l}/home` → ultima Cerchia (cookie `pausa-circle`) o landing.

---

## 4. Guscio nativo (Tauri v2, `src-tauri/`)

### 4.1 Cosa fa

- È un guscio sottile che apre il **sito ospitato**: finestra `main` con `url: "https://pausa.gnagno.org/it"` (sempre italiano, sempre la landing), 430×860, minimo 360×600, ridimensionabile; in sviluppo `devUrl: "http://localhost:3000/it"`.
- `frontendDist: "./shell"`: contiene solo `src-tauri/shell/index.html`, una pagina di cortesia ("Serve una connessione per aprire Pausa", pulsante "Riprova" → `https://pausa.gnagno.org/it`). Dal codice letto non risulta caricata da nessuna parte (la finestra punta all'URL remoto).
- `app.security.csp: null`.
- Plugin (`Cargo.toml`): `tauri-plugin-deep-link` 2, `tauri-plugin-opener` 2, `tauri-plugin-single-instance` 2 (solo desktop, feature `deep-link`), più un plugin interno `pausa-shell`.
- Il sito riconosce il guscio da `"__TAURI_INTERNALS__" in window` (`isNativeShell()` in `src/lib/native-shell.ts`).

### 4.2 Identità e versione

| | Valore | Dove |
|---|---|---|
| `productName` | `Pausa` | `tauri.conf.json` |
| `identifier` / `applicationId` / `namespace` | `org.gnagno.pausa` | `tauri.conf.json`, `gen/android/app/build.gradle.kts` |
| Versione app | `0.1.3` | `tauri.conf.json` |
| `versionName` / `versionCode` Android | `0.1.3` / `1003` | `gen/android/app/tauri.properties` (file autogenerato) |
| Versione crate | `0.1.0` | `src-tauri/Cargo.toml` (non allineata) |
| `minSdk` / `targetSdk` / `compileSdk` | 24 / 37 / 37 | `build.gradle.kts` |
| Permessi Android | solo `INTERNET` | `AndroidManifest.xml` |
| Activity | `.MainActivity`, `launchMode="singleTask"`, `exported="true"` | manifest |
| Tema | `Theme.pausa` (parent `Theme.Material3.DayNight.NoActionBar`) | `themes.xml` |
| Sfondo icona adattiva | `#FFFFFF` | `src-tauri/icons/android/values/ic_launcher_background.xml` |

### 4.3 Accesso: Google e link email attraverso il browser di sistema

Google rifiuta OAuth dentro una WebView. Flusso (da `src-tauri/src/lib.rs` e `src/app/api/native/*`):

1. Nel guscio, il pulsante Google fa `window.location.href = /api/native/start?next=…` (`GoogleButton`). Il plugin `pausa-shell` intercetta in `on_navigation` ogni URL con host `pausa.gnagno.org` e percorso che inizia per `/api/native/start`, lo apre nel **browser di sistema** (`opener().open_url`) e blocca la navigazione nella WebView.
2. `GET /api/native/start`: 404 se Google non è configurato; se il browser ha già una sessione vera va dritto a `done`; altrimenti avvia `signInSocial` Google con `callbackURL = /api/native/done?next=…` e copia i cookie di Better Auth sul redirect.
3. `GET /api/native/done`: senza sessione → `/it/sign-in?next=…`. Con sessione genera un **token monouso** (plugin Better Auth `oneTimeToken`, `expiresIn: 3` minuti, `storeToken: "hashed"`, `disableClientRequest: true`) e risponde con una paginetta HTML (`no-store`, `noindex`, `referrer-policy: no-referrer`) che apre `pausa://auth?token=…&next=…` via `location.href` e mostra un pulsante "Apri Pausa" di riserva. Testi in it/en/es scelti dal prefisso di `next`.
4. Il guscio riceve il deep link (`on_open_url`), accetta solo `scheme == "pausa"` e `host == "auth"`, copia solo i parametri `token` e `next`, e naviga la WebView a `https://pausa.gnagno.org/api/native/exchange?token=…&next=…`, portando la finestra in primo piano.
5. `GET /api/native/exchange`: `verifyOneTimeToken`; se va bene risponde 303 verso `next` con i cookie di sessione nella WebView; altrimenti `/it/sign-in`.
6. Il link via email segue la stessa strada: nel guscio `magicLink` è chiesto con `callbackURL = /api/native/done?next=…`, quindi il link aperto nel browser finisce su `done` e riporta nel guscio.
7. `next` è sempre filtrato da `safeNext()`: solo percorsi che iniziano con `/`, mai `//`, mai `\` (test in `native-shell.test.ts`).

Deep link: `plugins.deep-link.mobile = [{ scheme: ["pausa"], host: "auth" }]`, `desktop.schemes = ["pausa"]`. Nel manifest Android c'è l'`intent-filter` `VIEW` + `DEFAULT` + `BROWSABLE` con `scheme="pausa"`, `host="auth"`. Su Windows/Linux `register_all()` all'avvio; su desktop il plugin single-instance porta il secondo avvio (il link) alla finestra già aperta. **È l'unico deep link**: non ci sono link `https` verificati (App Links) né link che aprono una Serata nell'app.

### 4.4 Barra di stato e barra dei gesti (`src-tauri/android-overrides/MainActivity.kt`)

- Va copiato a mano sopra `src-tauri/gen/android/app/src/main/java/org/gnagno/pausa/MainActivity.kt` dopo ogni `tauri android init`. Oggi i due file sono identici (verificato con `diff`).
- `enableEdgeToEdge()`, sfondo `#001113` su `decorView` e sul contenitore, icone chiare nella barra di stato (`isAppearanceLightStatusBars = false`).
- `padForSystemBars(host)`: listener sugli inset che applica come **padding** `systemBars | displayCutout | ime` (quindi anche la tastiera) e restituisce `WindowInsetsCompat.CONSUMED`. Applicato in `onCreate` e di nuovo in `onWebViewCreate` sul genitore della WebView.
- Conseguenza dichiarata nel commento: la pagina legge `env(safe-area-inset-*)` come 0 e non raddoppia il padding; il sito si auto-imbottisce solo dove nessuno l'ha fatto (PWA installata su iOS).

### 4.5 Firma e build (solo nomi e percorsi)

- README: bundle firmato con `npx tauri android build --aab`; serve la chiave di upload in `~/.pausa-signing/keystore.properties`, **fuori dal repo**; la legge un blocco di firma in `src-tauri/gen/android/app/build.gradle.kts`, da riaggiungere se si rilancia `tauri android init`. `docs/REBUILD-PROMPT.md` indica la cartella `C:\Users\triof\.pausa-signing` e dice di non toccarla.
- **Stato reale della copia letta**: `build.gradle.kts` **non contiene alcun `signingConfigs`** (il build type `release` ha solo ottimizzazione e ProGuard). `src-tauri/gen/` è in `.gitignore`.
- Artefatti presenti: solo `gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk`. Nessun AAB, nessun APK di release.
- README: `versionCode` va aumentato a ogni caricamento in `tauri.properties`.
- Desktop: installer Windows MSI e NSIS costruiti, non firmati.
- Dichiarato non fatto: notifiche push native, firma del codice, release firmata, pubblicazione sugli store, iOS.

### 4.6 Play Store (cosa dicono i documenti)

- `docs/REBUILD-PROMPT.md`: Android si pubblica su Google Play, quota d'iscrizione **già pagata**; la build attesa è un "AAB per il **test chiuso** di Google Play"; iOS non si pubblica (su iPhone si usa la PWA).
- `docs/COSA_MANCA.md` (17 nov) elenca ancora "account Google Play (25 $ una tantum)" fra le cose da fare, e mancano schede store (screenshot, descrizione, informativa), link profondi per le Serate, aggiornamenti automatici, notifiche native.
- **Account di revisione** (`docs/DEPLOY.md`, `src/lib/review.ts`, `src/lib/core/review.ts`, `src/app/[locale]/review/`): con `REVIEW_EMAIL` (variabile) e `REVIEW_PASSWORD` (segreto) impostati, `/{l}/review` (documentata come `/en/review`, senza link dal sito, `noindex, nofollow`, testo in inglese) chiede solo la password e apre una sessione normale nella Cerchia **"Demo circle"** (`c-review`): 3 persone, 6 film d'epoca con voti (Nosferatu 1922, Metropolis 1927, The Cabinet of Dr. Caligari 1920, A Trip to the Moon 1902, The General 1926, Battleship Potemkin 1925), revisore amministratore. Senza le due variabili la pagina è 404. Dopo 10 password sbagliate in un'ora dallo stesso IP rifiuta. Confronto della password in tempo costante (SHA-256 di entrambe). Per spegnere: cancellare il segreto `REVIEW_PASSWORD`.
- Testo per la Play Console (Contenuti dell'app → Accesso all'app): *Open https://pausa.gnagno.org/en/review, enter the password, tap "Open the demo".*

---

## 5. Design system

Fonte di verità: `src/app/tokens.css` (Tailwind v4, `@theme static`), `src/app/base.css` (reset), `src/app/globals.css` (classi). Regole in `DESIGN.md` (tema "Darkroom", colorway "film": petrolio e arancio corallo).
Attenzione: il blocco "Tokens" dentro `DESIGN.md` riporta ancora i **vecchi** valori ambra (`oklch(12.5% 0.008 55)`, `oklch(73% 0.15 58)`); i valori veri sono quelli qui sotto, presi da `tokens.css`.

### 5.1 Colori

| Token | Scuro (default) | Chiaro (`data-theme="light"`, o `system` + `prefers-color-scheme: light`) |
|---|---|---|
| `--color-paper` | `oklch(16% 0.03 205)` | `oklch(97.5% 0.022 92)` |
| `--color-paper-2` | `oklch(20% 0.033 205)` | `oklch(94.5% 0.026 90)` |
| `--color-paper-3` | `oklch(24.5% 0.036 205)` | `oklch(91% 0.03 88)` |
| `--color-ink` | `oklch(93% 0.014 85)` | `oklch(21% 0.035 205)` |
| `--color-ink-2` | `oklch(83% 0.014 205)` | `oklch(34% 0.04 205)` |
| `--color-muted` | `oklch(69% 0.022 205)` | `oklch(46% 0.04 205)` |
| `--color-rule` | `oklch(33% 0.036 205)` | `oklch(83% 0.03 185)` |
| `--color-accent` | `oklch(73% 0.17 42)` | `oklch(54% 0.165 40)` |
| `--color-accent-hover` | `oklch(78% 0.15 45)` | `oklch(48% 0.15 40)` |
| `--color-accent-deep` | `oklch(52% 0.13 40)` | `oklch(44% 0.135 40)` |
| `--color-accent-ink` | `oklch(16% 0.03 205)` | `oklch(98% 0.02 92)` |
| `--color-focus` | `oklch(73% 0.17 42)` | `oklch(54% 0.165 40)` |
| `--color-error` | `oklch(70% 0.18 2)` | `oklch(47% 0.19 2)` |
| `--color-success` | `oklch(76% 0.13 150)` | `oklch(42% 0.11 150)` |
| `--color-scrim` | `oklch(16% 0.03 205 / 0.62)` | `oklch(97.5% 0.022 92 / 0.7)` |
| `--grain` | `0.07` (telefono ≤ 40rem: `0.12`) | `0.12` |
| `--grain-ink` | `1` | `0` |
| `--safelight` | `14%` (telefono: `18%`) | `7%` |
| `--curtain` | `30%` (telefono: `46%`) | `5%` |

Uguali nei due temi:
- Card condivisibile (sempre la stampa scura): `--color-card-paper oklch(16% 0.03 205)`, `--color-card-ink oklch(93% 0.014 85)`, `--color-card-muted oklch(69% 0.022 205)`, `--color-card-accent oklch(73% 0.17 42)`, `--color-card-rule oklch(33% 0.036 205)`.
- Tinte per chi non ha immagine (8, luminosità 36%): `--color-tint-1 oklch(36% 0.06 200)`, `-2 oklch(36% 0.075 155)`, `-3 oklch(36% 0.075 250)`, `-4 oklch(36% 0.075 20)`, `-5 oklch(36% 0.075 120)`, `-6 oklch(36% 0.07 225)`, `-7 oklch(36% 0.06 175)`, `-8 oklch(36% 0.075 345)`; `--color-on-tint oklch(94% 0.012 78)`. La tinta si sceglie con un hash dell'id (`h = h*31 + charCode`, `% 8`), sia per gli avatar sia per le locandine mancanti.
- Marchio Google: `#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`.
- Alias vecchi (ancora usati da utility): `--color-on-accent`, `--color-second` (= paper-3), `--color-second-deep` (= paper-2), `--color-on-second`, `--color-on-second-muted`, `--color-second-text`.

Copie sRGB per ciò che non legge `oklch` o variabili CSS (`src/lib/card-theme.ts`, `src/lib/theme.ts`; "change them together"):
`paper #001113`, `paper2 #011a1d`, `paper3 #062529`, `ink #ece7de`, `ink2 #bdcacc`, `muted #8ca0a2`, `rule #1d3b3e`, `accent #fd7e49`, `accentInk #001113`; `THEME_COLOR = { dark: "#001113", light: "#fbf5e6" }`.

Tema: valori ammessi `system`, `light`, `dark`; cookie `pausa-theme` (`Path=/; Max-Age=31536000; SameSite=Lax`), default scuro senza cookie. Si cambia in Account (`Preferences`, due select: lingua e tema, applicati subito) e con `ThemeToggle` (icona `SunMoon`) solo nella nav della landing.

### 5.2 Tipografia

- Famiglie: display **Sofia Sans Extra Condensed** (pesi 200 e 400), testo **Barlow** (300, 400, 600), entrambe `next/font/google`, subset `latin`, variabili `--font-sofia` e `--font-barlow`.
  - `--font-display: var(--font-sofia), "Sofia Sans Extra Condensed", ui-sans-serif, sans-serif`
  - `--font-body: var(--font-barlow), "Barlow", ui-sans-serif, sans-serif`; `--font-sans` e `--font-outlier` = body.
- Scala generica: `--text-xs 0.75rem`, `sm 0.875rem`, `md 1rem`, `lg 1.2rem`, `xl 1.44rem`, `2xl 1.728rem`, `3xl 2.074rem`.
- Ruoli app: `--text-display clamp(3.75rem, 3.3rem + 1.9vw, 4.5rem)`, `--text-display-s 2.074rem`, `--text-section 2rem`, `--text-title 2rem`, `--text-chapter 2.5rem`, `--text-lead 1.2rem`.
- Ruoli pagine pubbliche (fluidi): `--text-hero clamp(4rem, 13vw, 11rem)`, `--text-poster clamp(2.75rem, 6.5vw, 5.5rem)`, `--text-figure clamp(6rem, 16vw, 13rem)`.
- `--tracking-display: -0.005em`; `--display-weight: 200`.
- Regole: `h1`,`h2`,`h3` maiuscoli, display; `h1` max 20ch, `h2` max 30ch, `h3` max 40ch e peso 400; `line-height` 1.05 (corpo 1.55); `text-wrap: balance` sui titoli, `pretty` sui paragrafi; `p` senza classe max 65ch; `strong` = 600; `font-synthesis: none` sul display.
- Da `DESIGN.md`: display 200 su teste e cifre, 400 su titoli di voce e controlli, **mai sopra 400**; Barlow 300 solo a misura "lead" (`.subtitle`, una recensione); etichette in Barlow `text-sm`, minuscolo normale, senza tracking; niente mono; niente maiuscole spaziate sotto i 16px.

### 5.3 Spaziatura, raggi, misure

- Spazi: `--space-3xs 2px`, `2xs 4px`, `xs 8px`, `sm 12px`, `md 16px`, `lg 24px`, `xl 40px`, `2xl 64px`, `3xl 96px`, `4xl 144px`.
- Layout: `--container 1440px`; `--gutter` 64px (≤ 60rem: 24px; ≤ 40rem: 16px); `--gap-columns` 32px (≤ 40rem: 16px); `--section-gap-s / -gap / -l` = 120 / 144 / 176px (≤ 60rem: 80 / 96 / 120; ≤ 40rem: 56 / 72 / 96).
- Raggi: `--radius-card`, `--radius-pill`, `--radius-sm`, `--radius-md` tutti `0`. L'unica cosa tonda è un avatar (`rounded-full`) e il radio button.
- `--shadow-card: none`; `--rule-hair: 1px`; `--control: 44px`.
- Z-index: `base 1`, `raised 10`, `dropdown 100`, `sticky 200`, `sticky-nav 300`, `modal 400`, `toast 500`, `tooltip 600`.
- Breakpoint usati (Tailwind di default): `sm` 40rem, `md` 48rem, `lg` 64rem (dove la barra diventa binario laterale), `xl` 80rem (seconda colonna).
- Larghezze: guscio app `max-w-md` sul telefono, `62rem` da `lg`, `82rem` da `xl`, colonna di contenuto `40rem`; pagine pubbliche di testo `72rem`; pagine d'errore `40rem`.

### 5.4 Classi condivise (`globals.css`)

| Classe | Cosa fa |
|---|---|
| `.font-display` | display maiuscolo, `line-height 1.02` |
| `.display` | testa di pagina: display 200, `--text-display`, `line-height 1` |
| `.title` | titolo di voce: display 400, `--text-title` |
| `.figure` | cifre display 200, numeri proporzionali |
| `.label` | `text-sm`, `muted` |
| `.tabular`, `.num` | cifre tabulari |
| `.subtitle` | testo "lead" 300 (una recensione) |
| `.lead` | 1.2rem, max 52ch |
| `.btn` | 44px, bordo 1px `ink`, display 400 maiuscolo, `letter-spacing 0.02em`; hover `paper-3`; `:active` `scale(0.97)`; disabilitato opacità 0.5 |
| `.btn-primary` | fondo e bordo `accent`, testo `accent-ink`; disabilitato: trasparente, bordo `rule`, testo `muted` |
| `.btn-quiet` | bordo `rule`, testo `ink-2` |
| `.btn-sm` | 36px (44px con `pointer: coarse`) |
| `.btn-lg` | 52px, padding 40px, `--text-xl` |
| `.link` | sottolineatura `muted` che diventa `accent` all'hover |
| `.field` | input/select/textarea: 44px, bordo 1px `muted`, quadrato; `aria-invalid` → bordo `error`; focus sul bordo stesso |
| `.field-label` | etichetta sopra il campo, `text-sm`, `ink-2` |
| `.row-link` | riga che porta altrove, con chevron disegnato da due filetti |
| `.well` | fondo `paper-2` |
| `.plate` | filetto superiore 1px `rule` |
| `.rows` | lista: filetto sopra ogni figlio e sotto l'ultimo |
| `.grained` | grana SVG (`feTurbulence`) a opacità `--grain`, invertita nel tema chiaro |
| `.day`, `.day-figure`, `.day-label`, `.day-name`, `.day-today` | intestazione di un giorno del diario: cifra da 4.5rem su filetto `ink` |
| `.chapter` | capitolo di pagina: display 200, 2.5rem, sotto filetto `ink` |
| `.empty` | stato vuoto: le due barre della pausa (20×28px, gradiente a blocchi) sopra il testo |
| `.tag` | cella con bordo 1px `rule`, 24px, `text-sm` |
| `.projector` | la luce di sicurezza e il sipario (vedi §5.7) |
| `.reel` | due file di fori di pellicola |
| `.ticket` | filetto superiore |
| `.meter > span` | barra 2px, riempimento `accent` con `scaleX` |
| `.skeleton` | `paper-3` che pulsa |
| `.rise`, `.stagger`, `.pop` | animazioni (§5.5) |
| `.poster` | contenitore locandina 2:3 |
| `.skip-link` | link di salto, visibile solo a fuoco |
| `.container`, `.visually-hidden` | utilità in `base.css` |

Checkbox e radio ridisegnati: 20×20, bordo `muted`, selezionati = fondo `accent` con segno `accent-ink`.

### 5.5 Movimento e movimento ridotto

- Token: `--ease-out cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in cubic-bezier(0.7, 0, 0.84, 0)`, `--ease-in-out cubic-bezier(0.65, 0, 0.35, 1)`; `--dur-micro 120ms`, `--dur-short 220ms`, `--dur-long 420ms`.
- Regole (`DESIGN.md`): solo `transform` e `opacity`; niente si muove perché la pagina ha scrollato (nelle schermate dell'app); mai `transition-all`; mai animare larghezza, altezza, `top`, `left`.
- Keyframe: `rise` (opacità 0.4 → 1, `translateY 12px`), `arrive` (opacità da 0.4), `draw` (`scaleX` da 0), `stand` (`scaleY 0.5`), `unfold` (`translateY -6px`, opacità 0), `mark-x` / `mark-y` (tratto della scheda attiva), `pop` (`scale 0.9`), `pulse` (opacità 0.55 a metà).
- Uso nell'app:
  - la pagina arriva con una dissolvenza di 220ms (`arrive` su `.projector > main` e `main.projector`);
  - le prime **8** righe di una lista salgono una dopo l'altra a 45ms (`.stagger`), dalla nona niente;
  - il filetto `ink` di `.day` e `.chapter` si disegna da sinistra (420ms, ritardo 120ms); `.meter` uguale (ritardo 160ms);
  - il tratto arancio della scheda attiva cresce (220ms);
  - un `<details>` che si apre dentro `.projector` scende di 6px (`unfold`);
  - le barre di `.empty` si alzano una volta (`stand`);
  - pressione: `.btn` a 0.97, il quadrato del + a 0.94;
  - hover solo con puntatore fine: `a:hover .poster > img` a `scale(1.03)`.
- Landing: Lenis (`lerp 0.1`, `wheelMultiplier 0.9`, `autoRaf`) con `data-speed` (parallasse verticale), `data-speed-x` (orizzontale, wordmark del footer), `data-progress` (linea 2px sotto la nav), `data-scrub="leave"` (il testo dell'hero sfuma e sale), `data-scrub="arrive"` (titolo finale da 94% a 100%), `data-reveal` (sezioni che salgono una volta, via `IntersectionObserver`, classi `.js .reveal-ready` / `.is-in`); àncore `#…` con scroll morbido e offset -72px; "Come funziona" con pannello sticky che incrocia le immagini; barra CTA fissa su telefono (`StickyCta`) tra la fine dell'hero e la sezione finale.
- **Movimento ridotto**:
  - regola globale in `base.css`: per tutto tranne `.keep-motion`, `animation-duration: 0.01ms`, `animation-iteration-count: 1`, `transition-duration: 0.01ms`, `scroll-behavior: auto` (tutti `!important`);
  - in `globals.css`: `.rise`, `.pop`, `.skeleton` senza animazione; `[data-reveal]` sempre visibile;
  - `SmoothScroll` e `RevealOnScroll` escono subito se `prefers-reduced-motion: reduce` (scroll nativo, livelli fermi);
  - `motion-reduce:transition-none` sui pezzi animati con utility.

### 5.6 Barra del telefono, binario e aree sicure

`src/components/tab-bar.tsx` (`<nav aria-label="Pausa" data-tabbar>`), dentro `Shell`.

Telefono (< 64rem): barra fissa in basso, griglia `minmax(0,1fr) auto minmax(0,1fr)`, bordo superiore `rule`, fondo `paper` pieno. Ordine da sinistra:

1. **Diario** (`BookOpen`) → `/c/{id}`
2. **Serata** (`Popcorn`) → `/c/{id}/serata`
3. **Registra** al centro: quadrato 40×40 `accent` con `Plus` (22px, `strokeWidth 2`) e sotto la parola `tabs.logShort` ("Registra"), → `/c/{id}/log`; `aria-label` = `tabs.log` ("Registra una visione")
4. **Cerchia** (`Users`) → `/c/{id}/members`
5. **Profilo**: il mio avatar tondo 24px (anello `accent` quando attivo) → `/me`

Due schede per lato, mai di più. Classifica e Liste **non** sono nella barra del telefono: sono due pulsanti in cima al diario.
Scheda attiva: testo `ink`, icona `accent`, e un tratto arancio di 2px sul filetto superiore della barra. Le pagine sotto il diario (`/m/`, `/l/`, `/p/`, `/notifications`, `/insights`, `/import`) tengono accesa Diario. Profilo è attivo su `/me`, `/me/*`, `/account`. `aria-current="page"` sulla scheda attiva. Altezza minima di ogni scheda 48px.

Da 64rem: binario a sinistra largo `w-56` (14rem), alto `100dvh`, trasparente (per non tagliare la luce). Ordine: wordmark, pulsante pieno "Registra una visione" (48px, `accent`), Diario, Serata, **Classifica** (`Trophy`), **Liste** (`List`), Cerchia, Profilo, e in fondo "Esci". Il tratto attivo passa sul bordo destro. Da 80rem si aggiunge la seconda colonna (`CircleAside`, dati da `/api/circle/{id}/aside` chiesti solo a quella larghezza).

Barra superiore (`SpaceSwitch`): una sola barra sticky di 56px, `z-index 250`, con il marchio (telefono), la Cerchia corrente come pulsante con chevron (apre `SpaceMenu`), la campanella.

Aree sicure (`viewport-fit=cover`):
- `body { padding-top: env(safe-area-inset-top, 0px) }` e `body::before` fisso alto quanto l'inset, colore `paper`, `z-index 400`, a coprire la fascia dell'orologio mentre la pagina scorre sotto;
- `body:not(:has([data-tabbar])) { padding-bottom: env(safe-area-inset-bottom, 0px) }` (le pagine con la barra imbottiscono dentro la barra);
- barra in basso: `pb-[max(env(safe-area-inset-bottom),8px)]`;
- barra in alto: `top: env(safe-area-inset-top)`, `pl-[max(0.5rem,env(safe-area-inset-left))]`, `pr-[max(0.25rem,env(safe-area-inset-right))]`;
- header della landing: `top: env(safe-area-inset-top)`; CTA fissa della landing: `pb-[max(env(safe-area-inset-bottom),12px)]`;
- barre d'azione dei form (registra, nuova Serata): `sticky bottom-[calc(76px+env(safe-area-inset-bottom))]`, cioè subito sopra la barra delle schede (76px è un numero fisso nel codice).

Altre regole "da telefono" in `base.css`: `touch-action: manipulation` su controlli, niente selezione/callout su pulsanti, `-webkit-tap-highlight-color: transparent`, `text-size-adjust: 100%`, `input, textarea, select { font-size: max(16px, 1em) }` (evita lo zoom di iOS), `overflow-x: clip`, `interactiveWidget: resizes-content` (la tastiera Android restringe il layout).

### 5.7 Elementi firma

- **Luce di sicurezza e sipario** (`.projector::before`): un solo pseudo-elemento, in cima a ogni schermata, largo `min(100vw, 72rem)` e alto 30rem, dietro a tutto (`z-index -1`). Due strati: un gradiente radiale dell'accento a `--safelight` (ellisse 62% × 100% dall'alto) e pieghe verticali (`repeating-linear-gradient` 0 / 14px / 30px / 46px di nero a `--curtain`); una maschera lo fa sfumare (pieno fino al 35%, trasparente al 92%). È **l'unico gradiente del sistema**.
- **Bobina** (`.reel`): due file di fori (`repeating-linear-gradient`, 8px di altezza, a 7px dai bordi), solo sulla striscia "sto guardando" del diario.
- **Marchio della pausa** (`PauseMark`, `Wordmark`): fotogramma arancio con 4 fori per lato e il segno di pausa ritagliato. Con il nome fa il wordmark (binario, testata, account, sign-in, home senza Cerchia). Da solo (le due barre semplici) segna gli stati vuoti. Mai come punto elenco, divisore o loader.
- **Il diario tagliato in giorni** (`.day`): filetto `ink`, giorno del mese a 4.5rem, giorno della settimana e mese accanto; è un `h2`. Oggi ha la cifra arancio.
- **Capitolo** (`.chapter`). Il filetto `ink` appartiene solo a `.day` e `.chapter`; ogni altro filetto è `rule`.
- **Classifica**: la posizione è una cifra da 4.5rem, la prima arancio.
- **Grana** (`.grained`): solo su un riquadro senza immagine, al massimo due per schermata.
- **Locandine come stampe**: angoli vivi, niente cornice né ombra, mai miniature dove guidano (104px o più in una riga del diario). Dimensioni TMDB: `w185` (sm), `w342` (md), `w500` (lg/hero), caricate direttamente da `image.tmdb.org` con `<img loading="lazy">` (nessun ottimizzatore).
- **Card 9:16** della Serata e dell'anno: sempre nella stampa scura.

### 5.8 Icone

`lucide-react` (^1.74.0), `strokeWidth={1.6}`, 16–24px, `aria-hidden`. 32 icone importate in `src/`: ArrowDown, ArrowUp, Bell, BellOff, Bomb, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Ellipsis, Frown, Heart, Laugh, List, ListChecks, Lock, MessageCircle, Minus, Pencil, Plus, Popcorn, Search, Settings, Sparkles, Star, SunMoon, Trash2, Trophy, Users, X. Eccezioni disegnate a mano: marchio Google, marchio della pausa, anello del conto alla rovescia.

### 5.9 Cosa vieta `DESIGN.md`

- Ombre, sfocature, vetro, gradienti (unica eccezione la luce di sicurezza).
- Raggi diversi da 0 (tranne l'avatar).
- Peso del display sopra 400; font mono; maiuscole spaziate sotto 16px.
- Scatole dentro scatole; liste fatte di box impilati invece che di righe su filetti.
- L'arancio oltre il 5% circa di una schermata; mai come banda, velatura, intestazione o testo corrente. È riservato a: l'unico controllo primario, la selezione corrente, un voto, la mia reazione, un contatore.
- Un colore d'errore vicino all'arancio (l'errore è un rosa freddo).
- Una checkbox nuda con un nome per scegliere persone (si usa `PersonChip`).
- Una seconda riga di barra in alto, strumenti nelle intestazioni di pagina.
- Più di due schede per lato nella barra del telefono.
- `transition-all`; animare larghezza/altezza/`top`/`left`; movimento legato allo scroll nelle schermate dell'app.
- Icone SVG disegnate a mano (salvo le tre eccezioni); emoji come icona (un'emoji scelta da una persona come reazione o avatar è contenuto e resta).
- Nei testi: catene con punto mediano (`A · B · C`), frecce attaccate all'etichetta di un link, trattini lunghi o medi, "eyebrow" sopra un titolo.
- Il marchio della pausa come punto elenco, divisore o loader; `.reel` fuori dalla striscia "sto guardando"; più di due `.grained` per schermata.

Altro in `design/`: `DESIGN_PLAN.md` (8,5 KB, superato da `DESIGN.md` per il §8), `directions.html`, `directions-v2.html`, `directions-v3.html` (prototipi delle direzioni; la v3 è quella scelta il 17 nov 2026), `tokens.css` (solo `@import "../src/app/tokens.css"`). Esiste anche `.hallmark/` con brief e screenshot prima/dopo di 20 schermate (telefono e desktop).

---

## 6. i18n

- Libreria: `next-intl` ^4.15.1. Lingue: `it`, `en`, `es`; default `it`; `localePrefix: "always"` (`src/i18n/routing.ts`).
- **Niente middleware**: la lingua vive solo nell'URL. Nessun cookie di lingua (la sezione Cookie della privacy cita "la lingua", ma nel codice esistono solo `pausa-theme` e `pausa-circle` oltre a quelli di sessione).
- Redirect della radice (`src/app/page.tsx`): prende `Accept-Language`, lo divide per virgole, tiene le **prime due lettere** di ogni voce in minuscolo, sceglie **la prima nell'ordine dell'header** che sia fra le tre lingue (i pesi `q=` sono ignorati), altrimenti `it`. Poi: `?app` presente → `/{l}/home`, altrimenti `/{l}`.
- Lingua non valida nel percorso (`/fr/...`) → `notFound()` nel layout.
- `src/i18n/request.ts`: carica `messages/{locale}.json` con import dinamico; `timeZone: "Europe/Rome"` fisso per tutti.
- Navigazione: `createNavigation(routing)` → `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname`. Cambio lingua: `router.replace(pathname, { locale })` (Account) oppure `<Link href="/" locale={l}>` (landing: porta sempre alla home di quella lingua).
- Le azioni server ricevono la lingua da un campo nascosto del form. La tabella `user` ha una colonna `locale` (nel seed: Giulia e Marco `it`, Sofi `es`, Luca `en`), usata per email e push.

### 6.1 Messaggi (`messages/it.json`, 54,9 KB)

36 namespace di primo livello, **932 stringhe foglia** per lingua. `en.json` ed `es.json` hanno esattamente le stesse 932 chiavi (0 mancanti, 0 in più, verificato).

| Namespace | Chiavi | Sotto-gruppi (chiavi) |
|---|---|---|
| `common` | 8 | themes (3) |
| `tabs` | 8 | |
| `kind` | 3 | |
| `auth` | 10 | |
| `home` | 7 | |
| `feed` | 47 | filter (14), reactionName (5) |
| `log` | 45 | |
| `lists` | 21 | kind (3) |
| `circle` | 44 | invites (19), actions (6), leave (3), errors (4) |
| `serata` | 88 | mode (2), modeHint (2), status (2), round (3), lobby (7), table (8), result (22), join (7), invite (6) |
| `join` | 11 | invalid (8) |
| `tmdb` | 1 | |
| `comments` | 5 | |
| `notifications` | 8 | |
| `email` | 8 | digest (5) |
| `insights` | 40 | stats (4), facts (4), taste (5), agree (1), split (1), recs (6), yearCard (11) |
| `landing` | 120 | meta (3), og (1), nav (8), hero (5), mock (18), problem (2), how (7), features (13), try (16), guest (5), privacy (9), faq (15), final (2), footer (5), install (11) |
| `import` | 97 | tabs (6), letterboxd (7), anilist (4), mal (10), found (5), options (3), done (15), errors (14), imdb (5), trakt (5), cinemaniac (6), lists (5), dest (6) |
| `manage` | 38 | report (9) |
| `account` | 25 | |
| `errors` | 8 | |
| `retention` | 8 | |
| `services` | 7 | |
| `discover` | 9 | |
| `push` | 6 | |
| `pushSettings` | 10 | |
| `settings` | 29 | covers (8) |
| `notifPrefs` | 11 | types (6) |
| `person` | 15 | |
| `ranking` | 35 | filters (15), sort (5) |
| `space` | 43 | notice (6) |
| `media` | 10 | |
| `imports` | 35 | |
| `circles` | 11 | |
| `profile` | 56 | genres (19) |
| `aside` | 5 | |

### 6.2 Funzioni che un porting deve sostenere

- **Plurali ICU**: 59 stringhe con `{count, plural, …}`. Categorie usate nelle tre lingue: solo `one` e `other`, più la forma esatta `=0` (15 occorrenze in `it.json`) e il segnaposto `#`. Nessun `=1`, nessun `few`/`many`/`zero`. Esempio: `{count, plural, =0 {Nessun commento} one {# commento} other {# commenti}}`.
- **`select` / `selectordinal`**: non usati (0).
- **Argomenti semplici** `{name}`: 110 stringhe.
- **Formati ICU `number`/`date`/`time` dentro le stringhe**: non usati (0). Date e numeri passano dal formatter: `format.dateTime` (12 usi), `format.relativeTime` (4), `format.number` (3), `format.list` (3).
- **Testo ricco (tag)**: 7 stringhe, due soli tag:
  - `<b>…</b>` nelle 6 notifiche (`notifications.log`, `comment`, `reaction`, `now_watching`, `circle_join`, `serata_invite`), es. `<b>{name}</b> ha visto {title}`;
  - `<link>…</link>` in `import.done.undo`.
  - Resi con `t.rich(...)` (2 punti nel codice).
- **Liste e oggetti nei messaggi**, letti con `t.raw(...)` (7 chiamate): 10 chiavi-array: `landing.how.steps`, `landing.features.items`, `landing.guest.steps`, `landing.privacy.items`, `landing.faq.items` (oggetti `{title, body}` o `{q, a}`), `import.letterboxd.steps`, `import.mal.steps`, `import.imdb.steps`, `import.trakt.steps`, `import.cinemaniac.steps`.
- **Sostituzione manuale**: `landing.try.progress` = "Sfida {n} di 3" è letta con `t.raw` e sostituita con `String.replace("{n}", …)` nel client.
- **Chiavi dinamiche**: `t(\`invalid.${reason}.title\`)`, `t(\`${p}.name\`)`, `t(n.type, …)`, `ts(\`films.${key}\`)`, `t(\`themes.${th}\`)`.
- **Maiuscole per lingua**: `toLocaleUpperCase(locale)` nelle immagini OG.

### 6.3 Testi localizzati che **non** stanno in `messages/`

- Guide e loro stringhe d'interfaccia: `src/lib/guides.ts`, `guides-more.ts`.
- Privacy, termini e relative description: `src/lib/legal.ts`.
- Link di salto: `src/app/[locale]/layout.tsx`.
- Pagina di ritorno al guscio: `COPY` in `src/app/api/native/done/route.ts`.
- Pagina offline: `public/offline.html`.
- Nomi delle lingue ("Italiano", "English", "Español"): `preferences.tsx` e `landing.tsx`.
- Pagina di revisione: solo inglese, cablata.
- Descrizione del manifest: solo italiano.
- Etichette di sviluppo ("Solo sviluppo: …"): italiano cablato.

---

## 7. Test e CI

### 7.1 End-to-end (Playwright, `e2e/`)

Configurazione (`playwright.config.ts`): `testDir: e2e`, un solo worker, non parallelo (database condiviso), `retries` 1 in CI, timeout 60s, `baseURL http://localhost:3000`, `locale: it-IT`, trace solo ai fallimenti. Avvia `npm run dev` (attende `/it`, 180s). Due progetti: `desktop` (Desktop Chrome, tutti i test) e `phone` (Pixel 7, solo i test con `@phone` nel titolo).

Accesso: `signInAs(page, who, next)` → `GET /api/dev/login?email={who}@pausa.test&next=…` (esiste solo con `NODE_ENV=development` e host locale; accetta solo email `@pausa.test`). Cerchia di riferimento: `c-divano`. Richiede il database seminato (`npm run db:reset:local`).

**Conteggio: 57 test nel progetto `desktop`** = 13 percorsi + 44 controlli axe. Nel progetto `phone`: 1.

`e2e/journeys.spec.ts` (13):

| # | Nome del test | Cosa copre | Login e dati di seed |
|---|---|---|---|
| 1 | the landing explains the product and offers the app | `/it`: h1 contiene "Cosa guardiamo stasera", pulsante "Scarica l'app", link "Guide" | nessuno |
| 2 | the group ranking lists every title with each person's rating and the average | Classifica: h1, prima voce con h2 e "vot"; `?from=2099` → "Nessun titolo con questi filtri." e "Azzera i filtri" | giulia; i 40 log |
| 3 | the language switch keeps you on the page | `/it/guide` poi `/en/guide`: h1 inglese, `html[lang=en]` (due `goto`, non clicca un selettore) | nessuno |
| 4 | sign in, see the diary, open the profile and log out | diario "Divano Club", `/it/account` "Il tuo account", "Esci" → `/it`, link "Inizia" | giulia |
| 5 | a stranger cannot read a Cerchia (404, not 403) | senza sessione `/it/c/c-divano` finisce su `/sign-in` (il 404 da non membro è nei test unitari) | nessuno |
| 6 | log a film, then edit and delete it | cerca "Inception", registra con recensione, apre il log, "Modifica", "Salva le modifiche", "Elimina" + "Sì, elimina" | sofi; `m-inception` già nel DB (la ricerca funziona senza token TMDB) |
| 7 | comment on a log and report someone else's comment | commenta `l-01`, segnala il commento seminato, URL con `reported=1` | luca; log `l-01`, commento `k-1` di Marco |
| 8 | Serata for two: a member opens it, a guest joins by link, both vote, both see the result | modalità Tavolo, 3 titoli, `/s/{CODE}`; secondo contesto browser come ospite ("Ospite E2E", avatar), "Entra in sala", "Si comincia", voti e "Conferma", "La Serata ha scelto" su entrambi | giulia + ospite anonimo; le liste della Cerchia (`li-watch` ha 3 titoli) |
| 9 | the invite link of an open Serata previews as an invitation (no vote is revealed) | apre una Serata con 2 titoli, `GET /api/serata/{code}/invite?locale=it` → 200 `image/png` | giulia |
| 10 | operator pages are closed to everyone else | marco → `/it/admin/metrics` 404; giulia vede "Metriche" | marco, giulia (operatore di default in dev) |
| 11 | the data export downloads the person's own data @phone | `GET /api/account/export` → JSON con `profile.email = marco@pausa.test` | marco |
| 12 | the space bar leads to the page of my Cerchie, where a pasted invite link gets me in | "Cambia spazio" → "Unisciti o crea una Cerchia" → "Le tue Cerchie"; incolla `https://pausa.example/it/join/DIVANO24?from=chat` → `/it/c/c-divano`; codice `ZZZZ9999` → "Questo invito non esiste." | giulia; invito `DIVANO24` |
| 13 | log a film in private, then delete it from my space | `/log?private=1` preseleziona "Solo io", "Salva nel mio spazio", `/it/me/diary?ok=logged`, riga "Chi lo vede: solo tu"; dialogo di conferma: "Annulla" non elimina, "Elimina" sì, "Visione eliminata." | luca; `m-inception` |

`e2e/accessibility.spec.ts` (44 = 2 temi × 22 percorsi). Due `describe`: `axe, light theme` e `axe, dark theme`, con `colorScheme` del tema, `reducedMotion: "reduce"` e cookie `pausa-theme`. Regole axe: tag `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Rilievi `serious` o `critical` fanno fallire; i minori sono solo stampati.

- `public {path}` (8 per tema, senza login): `/it`, `/en`, `/es`, `/it/sign-in`, `/it/guide`, `/it/guide/movie-night-guide`, `/it/privacy`, `/it/terms`.
- `signed in {path}` (14 per tema, come giulia): `/it/c/c-divano`, `…/serata`, `…/lists`, `…/members`, `…/insights`, `…/ranking`, `…/ranking?from=2000&to=2010&votes=1&sort=year`, `…/log`, `…/notifications`, `/it/account`, `/it/me`, `/it/me/import`, `/it/me/imports`, `/it/me/circles`.

Non coperti da axe: la stanza della Serata, la card pubblica, la pagina di un log, di un titolo, di una persona, la modifica del profilo, le pagine admin, e qualunque viewport da telefono.

### 7.2 Test unitari (Vitest)

- `vitest.config.mts`: esclude `e2e/**`, `engine/**`, `.open-next/**`, `src-tauri/**`, `test-results/**`, `pausa/**`.
- **36 file `*.test.ts`**: 35 in `src/lib/` e 1 in `scripts/` (`engine-bench.test.ts`, saltato salvo `BENCH=1`).
- **286 dichiarazioni `it(`/`it.each(`** (grep a inizio riga). Due sono `it.each` con 5 e 6 casi, quindi i casi eseguiti nei 35 file di `src/` sono circa **294**; il benchmark aggiunge 3 casi saltati. Conteggio da grep, non da un'esecuzione.
- Per file: `core/insights` 28, `core/import-parsers` 22, `core/import` 21, `core/circles` 17, `core/import-batches` 16, `core/content` 11, `core/episodes` 11, `core/import-formats` 11, `serata/engine` 11, `core/streaming` 10, `core/import-sources` 9, `core/settings` 9, `core/limits` 7, `core/progress` 7, `core/push` 7, `core/digest` 6, `core/metrics` 6, `core/moderation` 6, `core/profile` 6, `core/ranking` 6, `core/roster` 6, `core/discovery` 5, `core/import-lists` 5, `core/retention` 5, `core/sentry` 5, `core/sharing` 5, `engine/engine.parity` 5, `core/details` 4, `core/mailer` 4, `native-shell` 4, `embedded-browser` 3 (di cui 2 `it.each`), `qr` 3, `core/review` 2, `core/migrations` 1, `core/push-payload` 1.
- Come girano: SQLite vero in WebAssembly (`sql.js`) con le migrazioni reali di `drizzle/` e le chiavi esterne attive; i moduli di `src/lib/core` prendono il database come parametro.
- Rust: 6 `#[test]` in `engine/src/lib.rs`.
- Nessun test unitario su componenti React, pagine, metadata, sitemap, robots, manifest o service worker.

### 7.3 CI (`.github/workflows/ci.yml`)

Su push a `main` e su ogni pull request, tre job su `ubuntu-latest`, Node 22:

1. **checks**: `npm ci`, `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, `npm test`.
2. **engine**: toolchain Rust stabile con target `wasm32-unknown-unknown`, `cargo test --manifest-path engine/Cargo.toml`, `npm run engine:build` (ricompila `engine.wasm`), `npx vitest run src/lib/engine` (parità con il TypeScript).
3. **e2e**: `npx playwright install --with-deps chromium`, `cp .env.example .env.local`, aggiunge un `BETTER_AUTH_SECRET` solo per la CI, `npm run db:reset:local`, `npx playwright test --project=desktop` con `CI=true`; in caso di fallimento carica `test-results/` e `playwright-report/`.

Il progetto `phone` non gira in CI.

### 7.4 Deploy (`.github/workflows/deploy.yml`)

- Si avvia **a ogni push su `main`** e a mano (`workflow_dispatch`). `concurrency: pausa-production`, senza annullare quello in corso. Il job non dichiara `environment:`.
- Passi:
  1. `npm ci`
  2. `npx next typegen && npx tsc --noEmit && npm test` (niente lint, niente e2e)
  3. `npm run db:migrate:remote` (= `wrangler d1 migrations apply pausa --remote`): **le migrazioni si applicano da sole al database vero, prima che il codice nuovo vada online**
  4. `npm run deploy` (= `opennextjs-cloudflare build && opennextjs-cloudflare deploy`)
- Nomi usati: secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; variabile `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; `NEXT_PUBLIC_SITE_URL` scritto in chiaro nel file (`https://pausa.gnagno.org`).
- Non è un workflow dipendente dalla CI: un push su `main` fa partire CI e deploy in parallelo.
- Segreti e variabili del Worker (solo nomi, da `docs/DEPLOY.md`, vivono in Cloudflare): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TMDB_API_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ADMIN_EMAILS`, `CONTACT_EMAIL`, `LEGAL_ENTITY`, `REVIEW_EMAIL`, `REVIEW_PASSWORD`, `SENTRY_DSN`; di build: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`, `NEXT_PUBLIC_SITE_URL`.
- `wrangler.jsonc`: nome `pausa`, `main: worker.ts`, `compatibility_date 2026-11-01`, flag `nodejs_compat` e `global_fetch_strictly_public`, `keep_vars: true`, rotta `pausa.gnagno.org` come dominio personalizzato, cron `17 3 * * *` (pulizia) e `0 17 * * *` (riepilogo email), asset in `.open-next/assets` (binding `ASSETS`), servizio `WORKER_SELF_REFERENCE`, D1 con binding `DB` e `migrations_dir: drizzle` (15 migrazioni, `0000`–`0014`), variabili in chiaro `BETTER_AUTH_URL`, `EMAIL_FROM`, `VAPID_SUBJECT`.
- `worker.ts`: importa `engine.wasm` e lo mette in `globalThis.__PAUSA_ENGINE__`, inoltra `fetch` a OpenNext, gestisce `scheduled` (digest o pulizia a seconda del cron).

### 7.5 Dati di seed (`seed/seed.sql`, solo sviluppo)

| Tabella | Contenuto |
|---|---|
| `user` | 4: Giulia `giulia@pausa.test` (it), Marco `marco@pausa.test` (it), Sofi `sofi@pausa.test` (es), Luca `luca@pausa.test` (en); id `u-giulia`, `u-marco`, `u-sofi`, `u-luca` |
| `circle` | 1: `c-divano` "Divano Club", creata da Giulia |
| `circle_member` | 4: Giulia `admin`, gli altri `member` (entrati 300, 299, 240, 120 giorni fa) |
| `invite` | 3: `DIVANO24` (aperto, 3 usi), `AMICI5` (scade fra 7 giorni, max 5, 1 uso), `VECCHIO99` (revocato) |
| `media_entity` | 15: 9 film, 3 serie, 3 anime, con id e locandine TMDB veri; `m-deathnote` volutamente senza locandina |
| `media_title` | 45 (15 × 3 lingue) |
| `log` | 40 (`l-01`…`l-40`): 38 nell'ultimo anno, 2 dell'anno prima; voti in mezze stelle 1–10; recensioni in it/es/en; alcune con spoiler e rewatch |
| `log_watched_with` | 12 |
| `reaction` | 8 |
| `comment` | 2 (`k-1` di Marco su `l-01`; `k-2` di Giulia su `l-02`, spoiler) |
| `now_watching` | 2 (Sofi: Breaking Bad "S2·E4"; Luca: I Soprano "S1·E9") |
| `list` | 3: `li-watch` watchlist di gruppo, `li-top` classifica di gruppo, `li-mine` lista personale di Giulia |
| `list_item` | 9 (3 + 5 + 1) |

I voti sono costruiti apposta: Giulia e Marco gusti simili, Sofi e Luca diversi, alcuni titoli dividono. Seed di carico facoltativo (`scripts/gen-load-seed.cjs`, `npm run db:seed:load`): Cerchia `c-load` "Gruppone" con Giulia admin + 10 utenti `@load.test`, 700 titoli, 300 log a testa, generatore deterministico.

---

