import type { Locale } from "@/i18n/routing";
import type { Guide } from "./guides";

/** More public guides, one per search intent (see guides.ts for the first four). */
export const MORE_SLUGS = ["movie-for-two", "anime-night-with-friends", "nobody-knows-what-to-watch", "keep-a-film-diary"] as const;
export type MoreSlug = (typeof MORE_SLUGS)[number];

const it: Record<MoreSlug, Guide> = {
  "movie-for-two": {
    title: "Cosa guardare in coppia: come scegliere senza litigare",
    description: "Quando siete in due non c'è maggioranza che decida. Tre modi semplici per scegliere un film da vedere in coppia, e come evitare il «scegli tu».",
    intro: "In due il voto di gruppo non funziona: finisce sempre 1 a 1. Serve un metodo diverso, che non lasci a uno dei due la fatica di decidere e all'altro il ruolo di chi si adatta.",
    blocks: [
      { h: "1. Ognuno propone tre titoli, l'altro ne toglie uno per lista", p: ["Ognuno scrive tre film che gli andrebbe di vedere senza dirli prima. Poi, a turno, ognuno elimina un titolo dalla lista dell'altro. Restano quattro film che piacciono a chi li ha proposti e che l'altro ha almeno accettato."] },
      { h: "2. Il torneo da due contro due", p: ["Mettete in sfida a coppie i quattro rimasti: a ogni scontro votate entrambi. Se siete d'accordo passa quello; se no, il film resta in sospeso e lo giocate alla fine con una moneta. Il caso decide solo quando i gusti sono davvero pari, e nessuno si sente sconfitto."] },
      { h: "3. Alternare, ma dichiarando il turno", p: ["Chi sceglie stasera ha un solo obbligo: scegliere qualcosa che l'altro non ha già visto. Chi non sceglie ha un solo diritto: un veto, una volta a settimana. Dirlo ad alta voce evita il rancore silenzioso."] },
      { h: "Cosa evitare", list: ["Il «non so, scegli tu» ripetuto: sposta il peso su una persona sola.", "Cominciare un film «per provare» e abbandonarlo dopo dieci minuti: perdete la serata.", "Scorrere il catalogo insieme senza una lista: è lì che passano i quaranta minuti."] },
    ],
    cta: "Con Pausa una Serata in due funziona lo stesso: lista corta, scelta a sfide, e il risultato finisce nel diario di coppia.",
  },
  "anime-night-with-friends": {
    title: "Serata anime con gli amici: come scegliere cosa guardare",
    description: "Dal primo episodio alle serie lunghe: come scegliere un anime da vedere in gruppo senza finire a metà stagione con metà del gruppo che molla.",
    intro: "Con gli anime il rischio è diverso dai film: non è scegliere male, è scegliere qualcosa che nessuno finirà. Una serie da 24 episodi è un impegno, non una serata.",
    blocks: [
      { h: "Scegliete per durata, non solo per genere", p: ["Prima di votare, dividete la lista in tre: film (un'unica serata), serie brevi (12-13 episodi) e serie lunghe. Per la prima volta insieme, meglio un film o una serie breve: l'impegno è chiaro e si finisce."] },
      { h: "Il patto dei tre episodi", p: ["Per le serie, accordatevi su tre episodi. Dopo il terzo ognuno dice se continua. Se la maggioranza vuole continuare si va avanti, altrimenti si cambia senza drammi: nessuno ha perso la serata, avete solo scelto con più informazioni."] },
      { h: "Doppiato o sottotitolato: decidetelo prima", p: ["È la prima causa di discussione a serata cominciata. Mettete ai voti anche questo, e se il gruppo è diviso alternate: una serata una modalità, una serata l'altra."] },
      { h: "Tenete il segno", p: ["A che episodio siete arrivati, chi lo ha visto già, chi lo sta seguendo da solo: tutto questo si perde in una chat. Un diario condiviso con «sto guardando» e stagione/episodio evita di rivedere lo stesso episodio due volte."] },
    ],
    cta: "In Pausa gli anime stanno accanto a film e serie: import da AniList e MyAnimeList, «sto guardando» con episodio, e la Serata per scegliere insieme.",
  },
  "nobody-knows-what-to-watch": {
    title: "Cosa guardare stasera quando nessuno sa cosa vuole",
    description: "Perché scegliere è così faticoso e quattro mosse concrete per uscire dallo stallo in cinque minuti, da soli o in gruppo.",
    intro: "Più opzioni ci sono, più è difficile sceglierne una: si chiama sovraccarico di scelta. Non è pigrizia, è come funziona la testa davanti a un catalogo infinito. La soluzione è togliere opzioni, non cercarne di migliori.",
    blocks: [
      { h: "1. Fissate un tetto: cinque minuti", p: ["Mettete un timer. Allo scadere, si guarda il primo titolo della lista corta, qualunque sia. Sapere che c'è un limite rende più facile scegliere, perché nessuno deve trovare il film perfetto."] },
      { h: "2. Partite da quello che avete già salvato", p: ["Una watchlist condivisa è la risposta a «non so cosa». Tutti i titoli che vi siete detti «prima o poi» sono già lì: la scelta di stasera è un sottoinsieme, non una ricerca da zero."] },
      { h: "3. Eliminate prima di scegliere", p: ["È più facile dire «questo no» che «questo sì». Fate una prima passata solo di scarti: ognuno toglie due titoli. Quello che resta è già una selezione condivisa."] },
      { h: "4. Quando proprio non si decide, tirate a sorte tra i finalisti", p: ["Se dopo gli scarti ne restano tre che piacciono a tutti, il sorteggio non è una resa: è una conferma che qualunque va bene. Si guarda, e se dopo venti minuti non convince, si cambia."] },
    ],
    cta: "Pausa fa le quattro mosse in due minuti: rosa precompilata dalla watchlist, scelta a sfide o a punti con veto, e un risultato che chiude la discussione.",
  },
  "keep-a-film-diary": {
    title: "Come tenere un diario dei film e delle serie che guardi",
    description: "Cosa annotare, quanto scrivere e come farlo diventare un'abitudine: un diario di visioni utile anche dopo anni, da solo o con gli amici.",
    intro: "Un diario dei film serve a ricordare cosa hai visto, ma il vero valore arriva dopo: «cosa ne pensavo», «con chi l'ho visto», «cosa avevo in testa quel mese». Per funzionare deve costare meno di trenta secondi.",
    blocks: [
      { h: "Cosa annotare davvero", list: ["Il titolo e la data in cui lo hai visto (non quella di uscita).", "Un voto, anche a mezze stelle: serve a confrontarti con te stesso fra anni.", "Una riga a caldo: una frase, non una recensione. La prima impressione è quella che dopo non ritrovi.", "Con chi l'hai visto e dove: sono i ricordi che fanno tornare il film."] },
      { h: "Quanto scrivere", p: ["Poco. Chi parte con recensioni lunghe smette in tre settimane. Una riga a caldo basta, e nei giorni in cui hai voglia scrivi di più."] },
      { h: "Rendilo un gesto automatico", p: ["Segna il film subito dopo i titoli di coda, mentre sei ancora sul divano. Se rimandi al giorno dopo, rimandi per sempre. Una app aperta sul telefono, o una nota sempre pronta, riducono l'attrito."] },
      { h: "Perché farlo con gli amici", p: ["Un diario privato condiviso con il tuo gruppo aggiunge due cose: puoi confrontare i voti (e scoprire chi ha gusti simili ai tuoi) e ogni anno ricevi «un anno fa, di questi giorni, abbiamo visto…»: un archivio di serate."] },
    ],
    cta: "Pausa è un diario privato per il tuo gruppo: voti a mezze stelle, una riga a caldo, «visto con», e a fine anno il riepilogo di tutti.",
  },
};

const en: Record<MoreSlug, Guide> = {
  "movie-for-two": {
    title: "What to watch as a couple: how to choose without arguing",
    description: "With two people there is no majority to decide. Three simple ways to pick a film for two, and how to avoid the endless \"you choose\".",
    intro: "With two people a group vote does not work: it always ends 1 to 1. You need a different method, one that does not leave one person with the burden of deciding and the other as the one who goes along.",
    blocks: [
      { h: "1. Each proposes three titles, the other removes one per list", p: ["Each of you writes three films you would like to watch, without saying them first. Then, in turn, each removes one title from the other's list. You are left with four films the proposer wanted and the other at least accepted."] },
      { h: "2. A two-against-two bracket", p: ["Play the remaining four in pairs: in each match you both vote. If you agree, that one goes through; if not, the film is parked and decided at the end with a coin. Chance only decides when tastes are truly equal, and nobody feels beaten."] },
      { h: "3. Take turns, but say whose turn it is", p: ["Whoever chooses tonight has one duty: pick something the other has not seen. Whoever does not choose has one right: a veto, once a week. Saying it out loud avoids silent resentment."] },
      { h: "What to avoid", list: ["A repeated \"I do not know, you choose\": it moves the weight onto one person.", "Starting a film \"just to try\" and quitting after ten minutes: you lose the evening.", "Scrolling the catalogue together without a list: that is where the forty minutes go."] },
    ],
    cta: "With Pausa a Serata for two works too: a short list, a bracket of matches, and the result goes into your shared diary.",
  },
  "anime-night-with-friends": {
    title: "Anime night with friends: how to choose what to watch",
    description: "From first episodes to long series: how to pick an anime to watch as a group without ending mid-season with half the group dropping out.",
    intro: "With anime the risk is different from films: it is not choosing badly, it is choosing something nobody will finish. A 24-episode series is a commitment, not an evening.",
    blocks: [
      { h: "Choose by length, not just by genre", p: ["Before voting, split the list into three: films (a single evening), short series (12-13 episodes) and long series. The first time together, a film or a short series is better: the commitment is clear and you finish."] },
      { h: "The three-episode pact", p: ["For series, agree on three episodes. After the third, each says whether to continue. If most want to go on, you go on; otherwise you switch without drama: nobody lost an evening, you just chose with more information."] },
      { h: "Dubbed or subtitled: decide beforehand", p: ["It is the top cause of arguments once the evening has begun. Put it to a vote too, and if the group is split, alternate: one evening one way, the next the other."] },
      { h: "Keep your place", p: ["Which episode you reached, who has seen it already, who follows it alone: all of that gets lost in a chat. A shared diary with \"now watching\" and season/episode avoids watching the same episode twice."] },
    ],
    cta: "In Pausa anime sit next to films and series: AniList and MyAnimeList import, \"now watching\" with episode, and the Serata to choose together.",
  },
  "nobody-knows-what-to-watch": {
    title: "What to watch tonight when nobody knows what they want",
    description: "Why choosing is so tiring, and four concrete moves to break the deadlock in five minutes, alone or as a group.",
    intro: "The more options there are, the harder it is to pick one: it is called choice overload. It is not laziness, it is how the mind reacts to an endless catalogue. The fix is removing options, not finding better ones.",
    blocks: [
      { h: "1. Set a cap: five minutes", p: ["Start a timer. When it ends, you watch the first title on the short list, whatever it is. Knowing there is a limit makes choosing easier, because nobody has to find the perfect film."] },
      { h: "2. Start from what you already saved", p: ["A shared watchlist is the answer to \"I do not know\". Every title you ever said \"one day\" about is already there: tonight's choice is a subset, not a search from scratch."] },
      { h: "3. Eliminate before you choose", p: ["It is easier to say \"not this\" than \"this one\". Do a first pass of rejections only: each person removes two titles. What is left is already a shared selection."] },
      { h: "4. When you really cannot decide, draw lots among the finalists", p: ["If after the rejections three remain that everyone likes, drawing is not giving up: it confirms that any of them is fine. You watch, and if it does not work after twenty minutes, you switch."] },
    ],
    cta: "Pausa does the four moves in two minutes: a roster pre-filled from the watchlist, a bracket or dot vote with a veto, and a result that ends the discussion.",
  },
  "keep-a-film-diary": {
    title: "How to keep a diary of the films and series you watch",
    description: "What to note, how much to write and how to make it a habit: a viewing diary that stays useful for years, alone or with friends.",
    intro: "A film diary helps you remember what you watched, but the real value comes later: \"what did I think\", \"who did I see it with\", \"what was on my mind that month\". To work, it must cost less than thirty seconds.",
    blocks: [
      { h: "What to actually note", list: ["The title and the date you watched it (not the release date).", "A rating, even in half stars: it lets you compare with your future self.", "One line while it is fresh: a sentence, not a review. The first impression is the one you cannot recover.", "Who you watched with and where: those are the memories that bring a film back."] },
      { h: "How much to write", p: ["Little. People who start with long reviews quit within three weeks. One line is enough, and on the days you feel like it, write more."] },
      { h: "Make it automatic", p: ["Log the film right after the credits, while you are still on the sofa. If you postpone to the next day, you postpone forever. An app already open on the phone, or an always-ready note, cuts the friction."] },
      { h: "Why do it with friends", p: ["A private diary shared with your group adds two things: you can compare ratings (and find who has tastes like yours) and every year you get \"a year ago this week, we watched…\": an archive of evenings."] },
    ],
    cta: "Pausa is a private diary for your group: half-star ratings, one line while it is fresh, \"watched with\", and everyone's year in review.",
  },
};

const es: Record<MoreSlug, Guide> = {
  "movie-for-two": {
    title: "Qué ver en pareja: cómo elegir sin discutir",
    description: "Entre dos no hay mayoría que decida. Tres formas sencillas de elegir una película para dos y cómo evitar el eterno «elige tú».",
    intro: "Entre dos la votación de grupo no funciona: siempre acaba 1 a 1. Hace falta otro método, que no deje a uno cargando con la decisión y al otro como el que se adapta.",
    blocks: [
      { h: "1. Cada uno propone tres títulos y el otro quita uno por lista", p: ["Cada uno escribe tres películas que le apetecería ver, sin decirlas antes. Luego, por turnos, cada uno elimina un título de la lista del otro. Quedan cuatro películas que quería quien las propuso y que el otro al menos aceptó."] },
      { h: "2. Un torneo de dos contra dos", p: ["Enfrentad las cuatro restantes por parejas: en cada duelo votáis los dos. Si coincidís, pasa esa; si no, la película queda en suspenso y se decide al final con una moneda. El azar solo decide cuando los gustos están de verdad igualados, y nadie se siente derrotado."] },
      { h: "3. Alternar, pero diciendo de quién es el turno", p: ["Quien elige esta noche tiene una sola obligación: elegir algo que el otro no haya visto. Quien no elige tiene un solo derecho: un veto, una vez por semana. Decirlo en voz alta evita el rencor silencioso."] },
      { h: "Qué evitar", list: ["El «no sé, elige tú» repetido: pone todo el peso en una persona.", "Empezar una película «a ver qué tal» y dejarla a los diez minutos: pierdes la noche.", "Recorrer el catálogo juntos sin una lista: ahí se van los cuarenta minutos."] },
    ],
    cta: "Con Pausa una Serata de dos funciona igual: lista corta, elección por duelos, y el resultado va al diario de la pareja.",
  },
  "anime-night-with-friends": {
    title: "Noche de anime con amigos: cómo elegir qué ver",
    description: "De los primeros episodios a las series largas: cómo elegir un anime en grupo sin acabar a mitad de temporada con la mitad abandonando.",
    intro: "Con el anime el riesgo es distinto al de las películas: no es elegir mal, es elegir algo que nadie terminará. Una serie de 24 episodios es un compromiso, no una noche.",
    blocks: [
      { h: "Elegid por duración, no solo por género", p: ["Antes de votar, dividid la lista en tres: películas (una sola noche), series cortas (12-13 episodios) y series largas. La primera vez juntos, mejor una película o una serie corta: el compromiso es claro y se termina."] },
      { h: "El pacto de los tres episodios", p: ["Para las series, acordad tres episodios. Tras el tercero, cada uno dice si sigue. Si la mayoría quiere continuar, se continúa; si no, se cambia sin dramas: nadie perdió la noche, solo elegisteis con más información."] },
      { h: "Doblado o subtitulado: decidirlo antes", p: ["Es la primera causa de discusión con la noche ya empezada. Ponedlo también a votación y, si el grupo está dividido, alternad: una noche de una forma, la siguiente de la otra."] },
      { h: "Llevad la cuenta", p: ["En qué episodio vais, quién ya lo vio, quién lo sigue solo: todo eso se pierde en un chat. Un diario compartido con «estoy viendo» y temporada/episodio evita ver el mismo episodio dos veces."] },
    ],
    cta: "En Pausa el anime está junto a películas y series: importación de AniList y MyAnimeList, «estoy viendo» con episodio, y la Serata para elegir juntos.",
  },
  "nobody-knows-what-to-watch": {
    title: "Qué ver esta noche cuando nadie sabe lo que quiere",
    description: "Por qué elegir cansa tanto y cuatro movimientos concretos para salir del bloqueo en cinco minutos, solo o en grupo.",
    intro: "Cuantas más opciones hay, más difícil es elegir una: se llama sobrecarga de elección. No es pereza, es cómo reacciona la mente ante un catálogo infinito. La solución es quitar opciones, no buscar mejores.",
    blocks: [
      { h: "1. Poned un tope: cinco minutos", p: ["Poned un temporizador. Cuando acabe, se ve el primer título de la lista corta, sea el que sea. Saber que hay un límite facilita elegir, porque nadie tiene que encontrar la película perfecta."] },
      { h: "2. Partid de lo que ya habéis guardado", p: ["Una watchlist compartida es la respuesta a «no sé». Todos los títulos de los que alguna vez dijisteis «algún día» ya están ahí: la elección de esta noche es un subconjunto, no una búsqueda desde cero."] },
      { h: "3. Eliminad antes de elegir", p: ["Es más fácil decir «esta no» que «esta sí». Haced una primera pasada solo de descartes: cada uno quita dos títulos. Lo que queda ya es una selección compartida."] },
      { h: "4. Si de verdad no se decide, sorteo entre los finalistas", p: ["Si tras los descartes quedan tres que gustan a todos, el sorteo no es rendirse: confirma que cualquiera sirve. Se ve, y si a los veinte minutos no convence, se cambia."] },
    ],
    cta: "Pausa hace los cuatro movimientos en dos minutos: lista precargada desde la watchlist, torneo o puntos con veto, y un resultado que cierra la discusión.",
  },
  "keep-a-film-diary": {
    title: "Cómo llevar un diario de las películas y series que ves",
    description: "Qué anotar, cuánto escribir y cómo convertirlo en hábito: un diario de visionados útil durante años, solo o con amigos.",
    intro: "Un diario de cine sirve para recordar lo que has visto, pero el verdadero valor llega después: «qué pensaba», «con quién la vi», «qué tenía en la cabeza ese mes». Para funcionar debe costar menos de treinta segundos.",
    blocks: [
      { h: "Qué anotar de verdad", list: ["El título y la fecha en que la viste (no la de estreno).", "Una nota, incluso con medias estrellas: te permite compararte contigo dentro de unos años.", "Una línea en caliente: una frase, no una reseña. La primera impresión es la que luego no recuperas.", "Con quién la viste y dónde: son los recuerdos que hacen volver la película."] },
      { h: "Cuánto escribir", p: ["Poco. Quien empieza con reseñas largas lo deja en tres semanas. Una línea basta, y los días que te apetezca escribe más."] },
      { h: "Que sea un gesto automático", p: ["Apunta la película justo después de los créditos, aún en el sofá. Si lo dejas para el día siguiente, lo dejas para siempre. Una app ya abierta en el móvil, o una nota siempre a mano, reduce la fricción."] },
      { h: "Por qué hacerlo con amigos", p: ["Un diario privado compartido con tu grupo añade dos cosas: puedes comparar notas (y descubrir quién tiene gustos como los tuyos) y cada año recibes «hace un año, por estas fechas, vimos…»: un archivo de noches."] },
    ],
    cta: "Pausa es un diario privado para tu grupo: notas con medias estrellas, una línea en caliente, «visto con», y al final del año el resumen de todos.",
  },
};

export const MORE_GUIDES: Record<Locale, Record<MoreSlug, Guide>> = { it, en, es };
