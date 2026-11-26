# Prompt per correggere rebuild-v2

Da incollare in una sessione nuova di Claude Code nella cartella del progetto, sul branch `rebuild-v2`.

---

Il lavoro che hai consegnato **non è accettabile**. Dopo circa otto ore di lavoro, Pausa è peggio di prima: testi sovrapposti, funzioni sparite, pulsanti messi a caso, animazioni tolte, indirizzi che danno 404, una landing ridotta a una colonna di testo. E la versione è già online. I test automatici verdi non dicono che il prodotto è fatto: **non hai guardato quello che stavi costruendo**. Questa volta pretendo molta più attenzione.

## Prima di tutto: la produzione

`pausa.gnagno.org` sta servendo la build nuova. Prima di scrivere codice, dimmi: quando è stata pubblicata, se i dati veri sono stati migrati (con i conteggi), e come si torna alla vecchia versione. **Non fare deploy, rollback o migrazioni senza il mio ok esplicito.**

## Il risultato che voglio

**L'app deve essere praticamente come era prima.** Il rifacimento cambia il motore (Rust ed Expo), non il prodotto: stesse pagine, stessa navigazione, stessa grafica, stessi testi, stesse animazioni, stessi gesti, stesse funzioni. Chi usava Pausa deve aprirla e ritrovarsi a casa. Non ridisegnare, non semplificare e non "migliorare" a gusto tuo: ogni differenza rispetto alla vecchia app è un difetto, salvo che me la proponga prima e io dica sì.

## Controllo di tutte le funzionalità

Oltre alle pagine, controlla **ogni singola funzionalità** per vedere se manca qualcosa. Parti dal codice della vecchia app (`git show origin/legacy:…`: azioni, route, `src/lib/core`, test unitari ed end-to-end, cataloghi dei messaggi), non dalla memoria e non solo dai documenti del rifacimento, che possono dire "fatto" per cose che non si vedono. Scrivi `docs/rebuild/FUNZIONI.md`, una riga per funzione: c'era / c'è / provata da te nell'interfaccia (come) / cosa manca. Una funzione che il server ha ma che nessuna schermata permette di usare conta come **mancante**.

## Cosa non è stato controllato finora

Chi ha scritto `DIFETTI.md` **non** ha controllato queste cose, quindi controllale tu per intero, senza dare per scontato che funzionino:
- una **Serata dal vivo** (quella di prova era scaduta): creazione, invito, ospite senza account, sala d'attesa, torneo, tavolo, veto, risultato, Card, con almeno due partecipanti insieme;
- la **pagina di accesso** (link via email, errori, link scaduto, ritorno alla pagina di partenza, Google);
- le **guide** (indice e singoli articoli, nelle tre lingue);
- un **telefono vero**.

L'elenco dei difetti non è completo: fai il tuo inventario e non fidarti di quello.

## Cosa devi fare

1. Leggi per intero `docs/rebuild/DIFETTI.md`: è il punto di partenza, **non l'elenco completo**. È stato fatto guardando solo una parte delle schermate.
2. La vecchia app (branch `legacy`) è **il riferimento**. Avviala accanto alla nuova (usa un `git worktree`).
3. Fai l'inventario di **ogni pagina e ogni stato** di entrambe: landing, guide, privacy, termini, 404, accesso, invito, elenco Cerchie, diario di gruppo, feed, classifica, insight, persone, scheda persona, liste e dettaglio lista, impostazioni Cerchia, notifiche, registra e modifica, scheda titolo, commenti, diario personale, profilo, modifica profilo, account, importazioni e loro gestione, Serata (creazione, sala d'attesa, torneo, tavolo, risultato, ospite senza account), metriche. Scrivilo in `docs/rebuild/CONFRONTO.md`, una riga per pagina: cosa c'era, cosa c'è, cosa manca.
4. Correggi **una pagina alla volta**, in questo ordine: ciò che blocca l'uso, landing, diario di gruppo, registra, Serata, profilo, il resto.
5. Solo dopo che l'app è tornata come prima, aggiungi le funzionalità nuove elencate sotto.

## Funzionalità da aggiungere

- Pagina pubblica del profilo (solo se la persona la sceglie) e **traguardi**.
- Statistiche personali complete (ore viste, generi): oggi esistono l'anno in rassegna e gli insight di Cerchia.
- Anime solo-AniList: disponibilità "dove guardarlo" e possibilità di usarli come "semi" per "Per te".
- Cronologia "un anno fa" e checklist di avvio (c'erano nella v1).
- Sentry e metriche di prodotto della v1 (solo piano gratuito).
- Immagine Open Graph dinamica per la Serata (oggi è statica, una per lingua).
- QR dell'invito alla Cerchia (oggi esiste solo quello della carta della Serata).
- Rilevamento del browser in-app per l'accesso Google.
- Guide SEO aggiuntive: i contenuti li scrivo io, chiedimeli.
- **Achievement con classifica globale.** Si entra in classifica solo per scelta, con un nome pubblico, e si può uscire; le importazioni non contano nei traguardi competitivi e c'è un tetto giornaliero; la classifica si calcola a intervalli; vanno aggiornate privacy e landing.

## Regole per ogni pagina (senza eccezioni)

- Guarda la pagina **con i tuoi occhi**: screenshot a 375×812, 412×915 e 1280×800, tema scuro e chiaro, in italiano, inglese e spagnolo (i testi lunghi rompono i layout). Apri le immagini e criticale. Se dal terminale non hai un browser, collegalo (`claude --chrome` o Playwright MCP) oppure fai screenshot con Playwright e **leggili**. Se non riesci a vedere, fermati e dillo: non dichiarare fatto.
- Controlla: testi sovrapposti o tagliati, cose fuori schermo, contenuti nascosti sotto le barre, gerarchia dei pulsanti (una sola azione principale), icone, spaziature, stati vuoti, errori, caricamenti.
- **Prova ogni pulsante e ogni modulo**, non solo il rendering. Prova anche tastiera, tasto indietro, ricaricamento della pagina, rete lenta e assente.
- Metti gli screenshot vecchio/nuovo affiancati in `docs/rebuild/screens/` e fammeli vedere. Passa alla pagina successiva solo dopo il mio ok.
- Prova su **Android** (emulatore o telefono) e come **web app installata**. Quello che non puoi provare, elencalo come "non provato".

## Cosa deve tornare

- Identità visiva di prima: marchio, icone, avatar, sipario e luce di proiettore, grana, `DESIGN.md` e i token.
- **Tutte le animazioni** della vecchia app, fluide e con "riduci movimento" rispettato.
- La navigazione di prima: Diario, Serata, **Registra al centro**, Cerchia, Profilo (con avatar); Classifica e Liste a un tocco; seconda colonna su desktop.
- La landing completa: demo della Serata, finte schermate, "Come funziona", comparsa allo scorrimento, menu, tema, "Scarica l'app". Quando aggiungi la classifica globale, aggiorna i testi della landing e la privacy, che oggi dicono che non esiste.
- Accesso con Google (conferma con me se era davvero da escludere).
- Redirect 301 per tutti i vecchi indirizzi.
- SEO delle pagine pubbliche non peggiore di prima.

## Vincoli

Solo piani gratuiti. Testi in it/en/es dal catalogo, niente stringhe nel codice. WCAG 2.2 AA. Niente `push --force`, niente segreti stampati. Commit piccoli, uno per pagina.

## Come mi riferisci

Per ogni pagina: cosa era rotto, cosa hai cambiato, screenshot, cosa hai provato, cosa **non** hai provato. Vietato scrivere "fatto" o "funziona" per ciò che non hai visto. Il lavoro è finito quando ogni riga di `CONFRONTO.md` è approvata da me, su telefono e su computer.
