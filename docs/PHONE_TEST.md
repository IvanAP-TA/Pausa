# Test su telefono vero

Due livelli. Il primo si fa subito, il secondo dopo il deploy (servono HTTPS e un dominio).

## 1. Sulla rete di casa (funzioni e layout)

```bash
npm run dev:lan
```

Stampa un indirizzo tipo `http://192.168.1.20:3000/it/sign-in`. Aprilo dal telefono collegato allo stesso Wi-Fi. Nella pagina di accesso ci sono i quattro utenti di prova (nessuna email). Se non si carica, consenti Node.js nel firewall di Windows per le reti private.

Da provare, nell'ordine:

- [ ] **Accesso** come Giulia, poi esci dal profilo (avatar in alto nel Diario) e rientra.
- [ ] **Registra una visione** con il tasto `+`: cerca un titolo, dai un voto con il cursore, salva. Il cursore a mezze stelle si usa bene col pollice?
- [ ] **Serata con due persone**: Giulia apre una Serata; sul computer (o in una finestra in incognito) apri il link come ospite, scegli un nome e un'immagine. Votate in contemporanea e controlla il risultato su entrambi.
- [ ] **Condividi la Card**: dal risultato tocca Condividi. Si apre il foglio di condivisione con l'immagine?
- [ ] **Tastiera**: i campi di testo non vengono coperti dalla tastiera, il tasto `+` e la barra in basso restano raggiungibili.
- [ ] **Rotazione** orizzontale e testo ingrandito dalle impostazioni del telefono: niente testo tagliato.
- [ ] **Tema chiaro/scuro** del telefono: contrasto leggibile al sole (luminosità alta).

## 2. Dopo il deploy (HTTPS)

Queste cose non funzionano su `http://` e vanno provate sul sito vero:

- [ ] **Browser dentro WhatsApp e Instagram**: manda il link di una Serata in una chat e aprilo da lì. L'anteprima mostra l'invito con le locandine? L'ingresso da ospite (solo nome) funziona senza account?
- [ ] **Notifiche push** (pagina Account → "Attiva le notifiche"). Su **Android/Chrome** funzionano subito. Su **iPhone** solo dopo *Condividi → Aggiungi alla schermata Home*, riaprendo Pausa da lì.
  Prova: con due utenti nella stessa Cerchia, uno registra una visione e l'altro deve ricevere l'avviso; toccandolo si apre quel log.
- [ ] **Installazione** come app dalla schermata Home: icona, schermo intero, ritorno dal link di accesso via email.
- [ ] **Velocità** con rete mobile: la landing e il Diario si caricano in pochi secondi?

Annota qui sotto cosa non va (dispositivo, browser, cosa hai fatto) e dimmelo: lo sistemo.
