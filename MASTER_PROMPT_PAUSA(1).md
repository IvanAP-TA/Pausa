# MASTER PROMPT — PAUSA v2.3
**Private Social Diary for Friend Groups + Instant Decision Engine**  
(Movies • TV Series • Anime)

Versione: 2.3 (anti-AI-slop + skill Emil Kowalski & Impeccable)  
Data: 15 Novembre 2026  
Dominio: pausa.gnagno.org

---

## 1. Vision

**Pausa** è un Letterboxd a circuito chiuso.

È lo spazio privato dove i gruppi di amici:
- tengono il proprio diario collettivo di film, serie TV e anime
- votano, commentano e reagiscono a quello che vedono
- tengono liste condivise
- decidono insieme cosa guardare senza litigare

Non è un social network pubblico.  
Non è solo un tool di poll.  
È il diario sociale intimo del gruppo + un motore di decisione estremamente efficace.

Il nome “Pausa” evoca il momento in cui ci si ferma insieme: si sceglie, si guarda, si commenta, si ricorda.

---

## 2. Principi di Prodotto

### 2.1 Core: Diario Sociale Privato di Gruppo
- Creazione di **Cerchie** (gruppi privati) via link/codice invito
- Feed di attività del gruppo (log, rating, commenti, reazioni, “visto con”, liste)
- Diario unificato film + episodi di serie + anime
- Rating a mezze stelle
- Commenti privati al gruppo con **controllo spoiler**
- Reazioni rapide (oltre ai commenti lunghi)
- Tag “Visto con [membri del gruppo]”
- Stato **“Sto guardando…”** (Now Watching)
- Liste condivise (watchlist di gruppo, liste tematiche, ranking)
- Confronto gusti all’interno della Cerchia
- Statistiche di gruppo + Year in Review collettivo
- Notifiche intelligenti

### 2.2 Feature Killer: Motore di Decisione (Serata)
- Guest-first / zero-friction: chi riceve il link entra solo con nome + avatar
- Rosa pre-filtrata di massimo 8 titoli
- Due modalità:
  - **Bracket** (Torneo Lampo a eliminazione)
  - **Tavolo** (Dot Voting + 1 Veto d’Emergenza)
- Card risultato 9:16 condivisibile
- Solo dopo il match si propone di salvare l’account o entrare nella Cerchia
- Possibilità di loggare immediatamente il titolo scelto nella Cerchia

### 2.3 Private Inside, Viral Outside
- Tutto ciò che riguarda gusti, commenti, liste e diario resta privato alla Cerchia
- La Card della Serata è l’unico elemento pensato per essere condiviso all’esterno

### 2.4 Motore di Raccomandazioni (Individuale + Gruppo)
- Raccomandazioni individuali basate su log e rating personali
- Raccomandazioni di gruppo basate sui film effettivamente loggati e votati dentro la Cerchia
- Analisi di overlap di gusti tra i membri
- Preferenza per raccomandazioni “vere” (non generiche)

---

## 3. Direzione Artistica

### Mood
**Midnight Screening Room**  
Cinema lobby notturna, intima, premium, leggermente calda e “fisica”.  
Deve sentirsi uno spazio reale e curato, non un template AI.

### Palette (anti-AI-slop)
- **Base**: off-black caldo → `#0F1115` / `#14181C` (MAI pure black `#000000`)
- **Superfici elevate** (creare profondità con livelli):
  - Surface 1: `#1C2228`
  - Surface 2: `#242C34`
- **Testo primario**: off-white caldo → `#F3F0EB` o `#F5F5F7` (non bianco puro)
- **Testo secondario**: grigio medio caldo (`#9CA3AF` / `#A1A1AA`)
- **Accento principale**: Mandarin / Coral Orange → `#FF6B35`  
  → Usare **solo** su CTA primarie, match e azioni critiche (un accento forte per viewport)
- **Accento secondario**: Forest Green → `#2D6A4F`  
  → Stati positivi, rating, appartenenza al gruppo
- Bordi: sottili e desaturati, niente glow
- Contrasto sempre alto (WCAG AA minimo)

### Principi UI (obbligatori)
- Poster-driven architecture (grid 2:3). I poster sono il contenuto principale.
- Tipografia editoriale con carattere (vietato Inter di default)
- Superfici multiple per profondità (non ombre luminose o glow)
- Glassmorphism solo se molto leggero e controllato
- Micro-interazioni cinematografiche e discrete
- **Zero AI slop**:
  - Vietato gradient arancione sullo sfondo
  - Vietato pure black + accento neon
  - Vietato overuse di glassmorphism e glow
  - Vietato card identiche ripetute senza gerarchia
  - Un solo accento forte per schermata

Prima di generare qualsiasi schermata, produrre sempre un **Design Plan** che verifichi: palette, contrasto, gerarchia, mood e assenza di pattern AI generici.

---

## 4. Funzionalità Dettagliate

### A. Cerchie e Social Privato
- Creazione e gestione Cerchie
- Inviti via link/codice
- Feed di attività
- Profilo della Cerchia
- Ruoli semplici (Admin / Member)

### B. Diario e Logging
- Log di film, episodi, anime
- Rating a mezze stelle
- Review / commenti lunghi
- Reazioni rapide
- Tag “Visto con”
- Stato “Sto guardando…”
- Controllo spoiler sui commenti
- Data di visione e piattaforma

### C. Liste
- Watchlist personale e di gruppo
- Liste tematiche condivise
- Liste ordinate / ranking di gruppo
- Aggiunta rapida da qualsiasi titolo

### D. Decisione di Gruppo (Serata)
- Creazione Serata (Bracket o Tavolo)
- Join Guest (nome + avatar)
- Realtime
- Card risultato 9:16
- Log automatico/opzionale del titolo scelto

### E. Scoperta e Raccomandazioni
- Raccomandazioni individuali
- Raccomandazioni di gruppo (basate sui log reali della Cerchia)
- Confronto di similarità di gusto tra membri
- Filtri per servizi streaming in comune

### F. Notifiche e Ritenzione
- Notifiche: nuovo log, nuovo commento, reazione, invito a Serata, “sta guardando…”
- Year in Review di gruppo
- Memorie (“Un anno fa…”)
- Onboarding post-prima-Serata / post-primo-log

---

## 5. Roadmap di Esecuzione

### Fase 1 — Foundation + Cerchie + Diario (Settimane 1–5)
- Auth (Google + Email, con supporto anonymous/guest + upgrade)
- Cerchie + inviti
- Diario (film) + rating + commenti + reazioni
- Tag “Visto con”
- Feed di attività
- Liste base (personali + di gruppo)
- Design system (Mandarin + Forest)
- Notifiche base

### Fase 2 — Motore di Decisione + Now Watching (Settimane 6–8)
- Serata (Bracket + Tavolo)
- Guest join
- Card 9:16
- Stato “Sto guardando…”
- Controllo spoiler
- Log diretto dalla Serata alla Cerchia

### Fase 3 — Media Unificato + Intelligenza (Settimane 9–12)
- Serie TV (episodi/stagioni) + Anime
- Import Letterboxd / Anilist
- Raccomandazioni individuali e di gruppo
- Confronto gusti
- Filtri streaming in comune
- Year in Review + memorie
- PWA completa + polish

---

## 6. Note Tecniche Critiche

- **Guest-first**: nessun login obbligatorio all’ingresso delle Serate (solo nome + avatar). Google / Email servono per salvare l’account e entrare nelle Cerchie. Evitare OAuth obbligatorio nei WebView di WhatsApp/Instagram.
- **TMDB**: API gratuita = non commerciale. Attribuzione obbligatoria.
- **Realtime**: attenzione ai limiti. Valutare Partykit / Liveblocks se necessario.
- **Motore raccomandazioni**: preferibile servizio dedicato in **Rust** per prestazioni su similarità e calcoli di gruppo.
- Tabella canonica `media_entities` (TMDB + Anilist + IMDb → UUID interno).
- iOS PWA: Home Screen e Web Push ok, niente beforeinstallprompt aggressivo.

---

## 7. Tech Stack Consigliato

- Frontend / BFF: Next.js 15/16 + TypeScript + Tailwind + shadcn/ui
- Auth: Google OAuth + Email (magic link / OTP). Supporto anonymous/guest per le Serate, con upgrade successivo.
- Database: Cloudflare (D1 + Workers / Durable Objects dove serve)
- Realtime: Partykit / Liveblocks / Cloudflare Durable Objects (valutare in base al carico)
- Recommendation Engine: Rust (servizio separato)
- Media: TMDB + AniList + cache disponibilità
- Deploy: Cloudflare Pages / Workers (+ servizio Rust su Fly.io / Railway / equivalente se necessario)
- PWA completa

---

## 8. Master Prompt per Claude / Agent

```
Sei Principal Product Designer e Full-Stack Architect di Pausa (pausa.gnagno.org).

Pausa è un Letterboxd a circuito chiuso: diario sociale privato per gruppi di amici (film, serie TV, anime) con motore di decisione di gruppo e raccomandazioni basate sui gusti reali della Cerchia.

Principi non negoziabili:
1. Il core è la Cerchia privata + diario collettivo + rating + commenti + reazioni + liste + “visto con” + “sto guardando”.
2. La Serata (Bracket o Dot Voting + Veto) è la feature killer per la decision paralysis + Card 9:16 virale.
3. Guest-first sulle Serate.
4. Raccomandazioni vere (individuali e di gruppo) basate sui log reali, non generiche.
5. Direzione artistica: Midnight Screening Room (caldo, fisico, anti-AI-slop).
6. Palette: off-black caldo (#0F1115/#14181C) + superfici elevate + Mandarin/Coral solo su CTA + Forest Green. Vietato pure black e gradient arancione di sfondo.

Quando generi UI:
- Parti sempre da un Design Plan (palette, contrasto, hierarchy, mood).
- Poster reali ogni volta che possibile.
- Verifica contrasto su sfondo scuro.

Quando generi codice:
- Componenti accessibili e riutilizzabili.
- Gestione esplicita in-app browser.
- Seed realistici pronti.
```

---

## 9. Skill e Tool Consigliati (Claude)

Per mantenere alta la qualità visiva e eliminare lo “AI slop”, usare prioritariamente queste skill:

### Stack principale obbligatorio
1. **frontend-design** (Anthropic – ufficiale)  
   Base. Forza un Design Plan prima di generare codice e riduce il look generico.

2. **Impeccable** → https://github.com/pbakaus/impeccable  
   Critique, polish, audit e anti-slop. Essenziale.

3. **Emil Kowalski skills** → https://github.com/emilkowalski/skills  
   Motion, transitions e micro-interazioni di qualità (molto superiori ai default AI).

4. **Hallmark** *oppure* **taste-skill / design-taste-frontend**  
   Direzione artistica più forte e brand-first.

### Extra (on-demand)
- **Mobbin MCP**: pattern reali da app esistenti quando si è a corto di ispirazione.
- **UI/UX Pro Max**: knowledge base di stili e palette.

### Come usarli
- Partire sempre con `frontend-design` + Design Plan.
- Applicare Impeccable per il polish e il controllo qualità.
- Usare le skill di Emil Kowalski per animazioni e transizioni.
- Hallmark / taste-skill quando si vuole spingere il mood Midnight Screening Room.
- Mobbin solo on-demand.

Questa combinazione è progettata specificamente per evitare il classico look “nero + gradient arancione” generato dall’AI.

---

## 10. Metriche di Successo Early

- % di utenti che creano o si uniscono a una Cerchia entro 7 giorni
- Numero medio di log per Cerchia attiva / settimana
- % di Cerchie che usano Liste
- Tempo medio da apertura link Serata a risultato < 120 secondi
- % di Serate che generano una Card condivisa
- Retention delle Cerchie a 7 e 30 giorni
- % di utenti che attivano “Sto guardando…”

---

## 11. Regola d’Oro

Ogni feature deve rispondere a queste domande:

1. Rafforza il senso di “questo è il nostro spazio privato”?
2. Migliora il diario collettivo, le liste, o la capacità di decidere insieme?
3. Rispetta il mood Midnight Screening Room e la palette (Mandarin + Forest)?

Se la risposta è debole, non entra nel prodotto.

---

Questo documento è il **single source of truth** di Pausa v2.3.  
Contiene tutte le funzionalità prioritizzate, direzione artistica anti-AI-slop e skill consigliate. Aggiornarlo solo in caso di pivot significativi.
