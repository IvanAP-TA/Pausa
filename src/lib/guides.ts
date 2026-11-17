import type { Locale } from "@/i18n/routing";
import { MORE_GUIDES, MORE_SLUGS, type MoreSlug } from "./guides-more";

/**
 * Public guides: the searches people actually make when they cannot agree on what to watch. Each one answers the question
 * on its own and only then points at Pausa. Slugs are shared across languages (hreflang links them).
 */
export type Block = { h: string; p?: string[]; list?: string[] };
export type Guide = { title: string; description: string; intro: string; blocks: Block[]; cta: string };

const CORE_SLUGS = ["choose-a-movie-with-friends", "bracket-vs-dot-voting", "letterboxd-alternative-for-friends", "movie-night-guide"] as const;
type CoreSlug = (typeof CORE_SLUGS)[number];
export const GUIDE_SLUGS = [...CORE_SLUGS, ...MORE_SLUGS] as const;
export type GuideSlug = CoreSlug | MoreSlug;
export const isGuideSlug = (v: string): v is GuideSlug => (GUIDE_SLUGS as readonly string[]).includes(v);
export const GUIDES_UPDATED = "2026-11-17";

const it: Record<CoreSlug, Guide> = {
  "choose-a-movie-with-friends": {
    title: "Come scegliere un film con gli amici senza litigare",
    description: "Cinque metodi che funzionano davvero per decidere cosa guardare in gruppo, dal più semplice al più rapido, e quando usare ciascuno.",
    intro: "Passare mezz'ora a scorrere il catalogo e poi guardare niente è il problema più comune delle serate film. Non dipende dai gusti: dipende dal metodo. Ecco cinque modi per uscirne, in ordine di rapidità.",
    blocks: [
      { h: "1. Limitate la scelta prima di votare", p: ["Il guaio non sono i gusti diversi, è la scelta infinita. Con duecento titoli sullo schermo nessuno si impegna. Prima di votare, ognuno propone un titolo e arrivate a una lista di sei o otto. Sotto i quattro non c'è vera scelta, sopra gli otto si torna a litigare."] },
      { h: "2. Un solo turno di voto, con un voto di veto", p: ["Ognuno ha tre punti da distribuire e un veto da usare una volta sola. Il veto toglie un titolo dalla corsa senza dover spiegare niente, e protegge chi altrimenti starebbe due ore davanti a un film che odia. Vince chi ha più punti."] },
      { h: "3. Un torneo a eliminazione per i gruppi indecisi", p: ["Si mettono i titoli in sfide a due: a ogni scontro ognuno sceglie uno dei due, passa il più votato. Tre turni bastano per otto titoli. Funziona perché confrontare due cose è facile, mentre ordinarne otto è faticoso."] },
      { h: "4. Chi ha scelto l'ultima volta, oggi non sceglie", p: ["Una regola di turno evita il lamento tipico: «scegli sempre tu». Se avete un diario condiviso dei film visti, si vede subito di chi era l'ultima scelta."] },
      { h: "5. Togliete quello che hanno già visto in troppi", p: ["Un film che metà del gruppo ha già visto non è una scelta neutra: o lo rivede qualcuno controvoglia, o lo spoilera. Escludetelo prima di cominciare."] },
      { h: "Quanto deve durare", p: ["Se la decisione richiede più di due minuti, il metodo è troppo complicato. Il punto non è trovare il film perfetto ma smettere di cercarlo."] },
    ],
    cta: "Pausa fa tutto questo in due minuti: rosa di otto titoli, torneo lampo o tavolo con veto, e un invito che si apre senza account.",
  },
  "bracket-vs-dot-voting": {
    title: "Torneo a eliminazione o voto a punti: quale metodo usare per scegliere cosa guardare",
    description: "Il torneo lampo e il voto a punti con veto risolvono lo stesso problema in modi diversi. Come funzionano, pro e contro, e quando conviene ciascuno.",
    intro: "Decidere in gruppo significa mettere d'accordo gusti diversi in pochi minuti. Due metodi lo fanno bene e sono facili da spiegare: il torneo a eliminazione e il voto a punti con veto. Ecco la differenza.",
    blocks: [
      { h: "Il torneo a eliminazione", p: ["I titoli si affrontano a coppie, uno scontro alla volta. A ogni scontro ognuno sceglie un titolo; chi perde esce. Con otto titoli servono quattro scontri, poi due, poi la finale: sette voti a testa al massimo.", "È il metodo più semplice da capire e il più divertente. Il suo limite è che l'ordine degli scontri conta: un titolo che piace a tutti come seconda scelta può uscire contro un altro che non è un favorito di nessuno."] },
      { h: "Il voto a punti con veto", p: ["Ognuno ha tre punti da distribuire come vuole, anche tutti su un titolo solo, e un veto per escluderne uno. Vince il titolo con più punti tra quelli non vetati.", "Premia il titolo che piace a molti rispetto a quello che entusiasma uno solo, e il veto protegge chi non sopporta un genere. Il limite: richiede un attimo di riflessione in più, e chi mette tutti i punti su un titolo conta quanto gli altri."] },
      { h: "Quale scegliere", list: ["Gruppo grande o serata allegra: torneo, perché è uno spettacolo e dura poco.", "Gruppo piccolo con gusti molto diversi: voto a punti, perché il veto evita il peggior risultato per qualcuno.", "Più di otto titoli: prima riducete la lista con un voto a punti, poi fate il torneo sui primi quattro."] },
      { h: "Un trucco comune", p: ["Qualunque sia il metodo, vincono i titoli di cui nessuno ha già visto troppo. Togliete in anticipo quelli visti da metà del gruppo e il risultato sarà quasi sempre accettato da tutti."] },
    ],
    cta: "In Pausa si sceglie tra «Torneo lampo» e «Tavolo» (punti più un veto d'emergenza) con un tocco, e il risultato diventa una card da condividere.",
  },
  "letterboxd-alternative-for-friends": {
    title: "Un'alternativa a Letterboxd per tenere il diario film solo con gli amici",
    description: "Letterboxd è pubblico e fatto per il mondo. Se vuoi un diario privato, solo per il tuo gruppo, con serie e anime, ecco cosa cercare e come portare i tuoi dati.",
    intro: "Letterboxd è ottimo per scoprire cosa guarda il mondo. Ma molte persone vogliono l'opposto: un diario piccolo e privato, dove parlare solo con i propri amici. Ecco cosa cambia e cosa cercare.",
    blocks: [
      { h: "Pubblico contro privato", p: ["Su una rete pubblica ogni voto e ogni recensione sono visibili a tutti, e si scrive pensando al pubblico. In uno spazio chiuso si scrive come si parla sul divano: più sincero, più breve, con più battute da gruppo."] },
      { h: "Cosa dovrebbe avere", list: ["Un diario condiviso di film, serie e anime, non solo film.", "Voti a mezze stelle e commenti con controllo degli spoiler.", "«Visto con»: segnare chi c'era alla visione.", "Liste di gruppo e classifiche.", "Un modo per decidere insieme cosa guardare, che è dove si perde più tempo."] },
      { h: "Portare i propri dati", p: ["Chi ha già anni di visioni su Letterboxd può esportarle in un file CSV dal proprio account e importarle altrove; lo stesso vale per le liste di AniList e MyAnimeList per gli anime. Pausa legge questi file direttamente nel browser: l'esportazione non viene inviata come file ma solo come elenco di titoli e voti."] },
      { h: "Cosa non sostituisce", p: ["Un diario privato non sostituisce la scoperta pubblica: le recensioni di sconosciuti e le liste dei critici restano un'altra cosa. Molti usano entrambi: uno per il mondo, l'altro per gli amici."] },
    ],
    cta: "Pausa è questo: un diario privato per il tuo gruppo, con serie e anime, import da Letterboxd, AniList e MyAnimeList, e la Serata per decidere cosa guardare.",
  },
  "movie-night-guide": {
    title: "Come organizzare una serata film con gli amici, passo per passo",
    description: "Dalla scelta del film all'orario, ecco come organizzare una serata film che parte puntuale e non finisce in una discussione.",
    intro: "Una serata film riuscita si decide prima che parta il film. Questa è la sequenza che funziona, in cinque passi.",
    blocks: [
      { h: "1. Scegliete il giorno e chi viene", p: ["Fissate giorno e ora almeno tre giorni prima, e dite subito quanti siete: con più di sei persone la scelta si complica, sotto i tre non serve un metodo."] },
      { h: "2. Chiedete a tutti un titolo", p: ["Ognuno propone un film o una serie. Tenete fuori quello che qualcuno ha già visto da poco. Otto proposte sono il massimo gestibile."] },
      { h: "3. Decidete prima di sedervi", p: ["Fate la scelta in anticipo, con un voto rapido, oppure all'inizio della serata ma con un limite di due minuti. Decidere sul divano a luci spente è la causa numero uno delle serate sprecate."] },
      { h: "4. Controllate dove si guarda", p: ["Prima di decidere, verificate che il titolo sia disponibile su un servizio che avete tutti. Scoprire a metà serata che serve un altro abbonamento è l'errore più comune."] },
      { h: "5. Dopo, segnatelo", p: ["Appena finito, ognuno dà un voto e scrive due righe. Dopo un anno sarà il diario del gruppo: «un anno fa, di questi giorni, abbiamo visto…»."] },
    ],
    cta: "Con Pausa il gruppo si invita con un link, si sceglie in due minuti e il film scelto si segna nel diario con un tocco.",
  },
};

const en: Record<CoreSlug, Guide> = {
  "choose-a-movie-with-friends": {
    title: "How to choose a movie with friends without arguing",
    description: "Five methods that actually work for deciding what to watch as a group, from simplest to fastest, and when to use each one.",
    intro: "Half an hour of scrolling and then watching nothing is the most common movie-night problem. It is not about taste, it is about method. Here are five ways out, fastest first.",
    blocks: [
      { h: "1. Narrow the options before voting", p: ["The trouble is not different tastes, it is endless choice. With two hundred titles on screen nobody commits. Before voting, everyone proposes one title and you end up with six to eight. Under four there is no real choice, over eight the arguing starts again."] },
      { h: "2. One round of voting, with a veto", p: ["Everyone gets three points to spread and one veto to use once. The veto removes a title with no explanation, and protects the person who would otherwise sit through two hours of a film they hate. Most points wins."] },
      { h: "3. A knockout bracket for indecisive groups", p: ["Put titles in head-to-head matches: in each one everyone picks one of the two, the most voted goes through. Three rounds are enough for eight titles. It works because comparing two things is easy while ranking eight is tiring."] },
      { h: "4. Whoever chose last time does not choose today", p: ["A turn rule removes the usual complaint, \"you always pick\". With a shared diary of what you have watched, it is obvious whose pick was last."] },
      { h: "5. Drop what too many have already seen", p: ["A film half the group has seen is not a neutral choice: someone rewatches it reluctantly, or spoils it. Remove it before you start."] },
      { h: "How long it should take", p: ["If deciding takes more than two minutes, the method is too complicated. The point is not to find the perfect film but to stop searching for it."] },
    ],
    cta: "Pausa does all of this in two minutes: a roster of eight titles, a quick bracket or a dot-voting table with a veto, and an invite that opens without an account.",
  },
  "bracket-vs-dot-voting": {
    title: "Knockout bracket or dot voting: which method to pick what to watch",
    description: "A quick bracket and dot voting with a veto solve the same problem in different ways. How they work, pros and cons, and when each fits.",
    intro: "Deciding as a group means reconciling different tastes in a few minutes. Two methods do it well and are easy to explain: the knockout bracket and dot voting with a veto. Here is the difference.",
    blocks: [
      { h: "The knockout bracket", p: ["Titles face off in pairs, one match at a time. In each match everyone picks one title; the loser is out. With eight titles that is four matches, then two, then the final: seven votes each at most.", "It is the simplest to understand and the most fun. Its limit is that the order of matches matters: a title everyone likes as a second choice can lose to one nobody really favours."] },
      { h: "Dot voting with a veto", p: ["Everyone has three points to spread as they like, even all on one title, and a veto to knock one out. The title with the most points among the non-vetoed wins.", "It rewards the title that many like over the one that thrills a single person, and the veto protects anyone who cannot stand a genre. The limit: it takes a moment more thought, and someone who puts everything on one title counts as much as the rest."] },
      { h: "Which to pick", list: ["Big group or playful night: bracket, because it is a show and it is short.", "Small group with very different tastes: dot voting, because the veto avoids the worst outcome for someone.", "More than eight titles: first cut the list with dot voting, then run a bracket on the top four."] },
      { h: "A common trick", p: ["Whatever the method, the winners are titles nobody has already seen too much of. Remove in advance those half the group has seen and the result will almost always be accepted by everyone."] },
    ],
    cta: "In Pausa you choose between a quick bracket and a table (points plus an emergency veto) in one tap, and the result becomes a card you can share.",
  },
  "letterboxd-alternative-for-friends": {
    title: "A Letterboxd alternative for keeping a film diary with just your friends",
    description: "Letterboxd is public and built for the world. If you want a private diary for your group, with series and anime, here is what to look for and how to bring your data.",
    intro: "Letterboxd is great for seeing what the world watches. But plenty of people want the opposite: a small private diary, to talk only with their friends. Here is what changes and what to look for.",
    blocks: [
      { h: "Public versus private", p: ["On a public network every rating and review is visible to everyone, and you write with an audience in mind. In a closed space you write the way you talk on the sofa: more honest, shorter, with more in-jokes."] },
      { h: "What it should have", list: ["A shared diary of films, series and anime, not just films.", "Half-star ratings and comments with spoiler control.", "\"Watched with\": who was there for the viewing.", "Group lists and rankings.", "A way to decide together what to watch, which is where most time is lost."] },
      { h: "Bringing your data", p: ["If you already have years of viewings on Letterboxd, you can export them as a CSV from your account and import them elsewhere; the same goes for AniList and MyAnimeList lists for anime. Pausa reads those files in your browser: the export is not uploaded as a file, only the list of titles and ratings is sent."] },
      { h: "What it does not replace", p: ["A private diary does not replace public discovery: reviews from strangers and critics' lists are another thing. Many people use both: one for the world, one for friends."] },
    ],
    cta: "Pausa is that: a private diary for your group, with series and anime, imports from Letterboxd, AniList and MyAnimeList, and the Serata to decide what to watch.",
  },
  "movie-night-guide": {
    title: "How to organise a movie night with friends, step by step",
    description: "From choosing the film to the time, here is how to run a movie night that starts on time and does not end in an argument.",
    intro: "A successful movie night is decided before the film starts. This is the sequence that works, in five steps.",
    blocks: [
      { h: "1. Pick the day and who comes", p: ["Set the day and time at least three days ahead, and say how many you are: with more than six people choosing gets harder, with fewer than three you do not need a method."] },
      { h: "2. Ask everyone for one title", p: ["Everyone proposes a film or series. Leave out anything someone has seen recently. Eight proposals is the most you can handle."] },
      { h: "3. Decide before you sit down", p: ["Make the choice ahead with a quick vote, or at the start of the night with a two-minute limit. Deciding on the sofa with the lights off is the number one cause of wasted evenings."] },
      { h: "4. Check where to watch", p: ["Before deciding, check the title is on a service you all have. Finding out halfway through that you need another subscription is the most common mistake."] },
      { h: "5. Log it afterwards", p: ["As soon as it ends, everyone gives a rating and writes two lines. A year on it becomes the group's diary: \"a year ago this week, we watched…\"."] },
    ],
    cta: "With Pausa the group is invited with a link, picks in two minutes, and the chosen film goes into the diary with one tap.",
  },
};

const es: Record<CoreSlug, Guide> = {
  "choose-a-movie-with-friends": {
    title: "Cómo elegir una película con amigos sin discutir",
    description: "Cinco métodos que funcionan de verdad para decidir qué ver en grupo, del más sencillo al más rápido, y cuándo usar cada uno.",
    intro: "Media hora desplazándose por el catálogo y luego no ver nada es el problema más común de las noches de cine. No depende de los gustos, depende del método. Aquí tienes cinco salidas, de la más rápida a la menos.",
    blocks: [
      { h: "1. Limitad las opciones antes de votar", p: ["El problema no son los gustos distintos, es la elección infinita. Con doscientos títulos en pantalla nadie se compromete. Antes de votar, cada uno propone un título y os quedáis con seis u ocho. Con menos de cuatro no hay elección real, con más de ocho vuelve la discusión."] },
      { h: "2. Una sola ronda de votos, con veto", p: ["Cada uno tiene tres puntos para repartir y un veto para usar una vez. El veto quita un título sin dar explicaciones, y protege a quien de otro modo aguantaría dos horas de una película que odia. Gana quien tenga más puntos."] },
      { h: "3. Un torneo de eliminación para grupos indecisos", p: ["Se enfrentan los títulos de dos en dos: en cada duelo todos eligen uno y pasa el más votado. Tres rondas bastan para ocho títulos. Funciona porque comparar dos cosas es fácil, mientras que ordenar ocho cansa."] },
      { h: "4. Quien eligió la última vez no elige hoy", p: ["Una regla de turnos elimina la queja habitual, «siempre eliges tú». Con un diario compartido de lo que habéis visto se ve enseguida de quién fue la última elección."] },
      { h: "5. Quitad lo que demasiados ya han visto", p: ["Una película que la mitad del grupo ya vio no es una opción neutra: alguien la ve de mala gana o la destripa. Descartadla antes de empezar."] },
      { h: "Cuánto debe durar", p: ["Si decidir lleva más de dos minutos, el método es demasiado complicado. El objetivo no es encontrar la película perfecta, sino dejar de buscarla."] },
    ],
    cta: "Pausa hace todo esto en dos minutos: una lista de ocho títulos, torneo rápido o mesa con veto, y una invitación que se abre sin cuenta.",
  },
  "bracket-vs-dot-voting": {
    title: "Torneo de eliminación o voto por puntos: qué método usar para elegir qué ver",
    description: "El torneo rápido y el voto por puntos con veto resuelven el mismo problema de forma distinta. Cómo funcionan, pros y contras, y cuándo conviene cada uno.",
    intro: "Decidir en grupo es conciliar gustos distintos en pocos minutos. Dos métodos lo consiguen y son fáciles de explicar: el torneo de eliminación y el voto por puntos con veto. Esta es la diferencia.",
    blocks: [
      { h: "El torneo de eliminación", p: ["Los títulos se enfrentan por parejas, un duelo cada vez. En cada duelo todos eligen un título; el perdedor queda fuera. Con ocho títulos son cuatro duelos, luego dos, luego la final: siete votos cada uno como máximo.", "Es el más fácil de entender y el más divertido. Su límite es que el orden de los duelos importa: un título que a todos les gusta como segunda opción puede caer ante otro que no es favorito de nadie."] },
      { h: "El voto por puntos con veto", p: ["Cada uno tiene tres puntos para repartir como quiera, incluso todos en un título, y un veto para eliminar uno. Gana el título con más puntos entre los no vetados.", "Premia el título que gusta a muchos frente al que entusiasma a uno solo, y el veto protege a quien no soporta un género. El límite: exige pensar un momento más, y quien pone todo en un título cuenta igual que los demás."] },
      { h: "Cuál elegir", list: ["Grupo grande o noche divertida: torneo, porque es un espectáculo y dura poco.", "Grupo pequeño con gustos muy distintos: voto por puntos, porque el veto evita el peor resultado para alguien.", "Más de ocho títulos: primero reducid la lista con puntos, luego haced el torneo con los cuatro primeros."] },
      { h: "Un truco común", p: ["Sea cual sea el método, ganan los títulos que casi nadie ha visto. Quitad de antemano los que ya vio la mitad del grupo y el resultado será casi siempre aceptado por todos."] },
    ],
    cta: "En Pausa eliges entre «Torneo rápido» y «Mesa» (puntos más un veto de emergencia) con un toque, y el resultado se convierte en una card para compartir.",
  },
  "letterboxd-alternative-for-friends": {
    title: "Una alternativa a Letterboxd para llevar el diario de cine solo con tus amigos",
    description: "Letterboxd es público y está pensado para el mundo. Si quieres un diario privado para tu grupo, con series y anime, esto es lo que conviene buscar y cómo llevar tus datos.",
    intro: "Letterboxd es genial para ver qué mira el mundo. Pero mucha gente quiere lo contrario: un diario pequeño y privado, para hablar solo con sus amigos. Esto es lo que cambia y qué buscar.",
    blocks: [
      { h: "Público frente a privado", p: ["En una red pública cada valoración y reseña la ve todo el mundo, y se escribe pensando en el público. En un espacio cerrado se escribe como se habla en el sofá: más sincero, más corto, con más bromas del grupo."] },
      { h: "Qué debería tener", list: ["Un diario compartido de películas, series y anime, no solo películas.", "Valoraciones con medias estrellas y comentarios con control de spoilers.", "«Visto con»: quién estaba en el visionado.", "Listas de grupo y clasificaciones.", "Una forma de decidir juntos qué ver, que es donde más tiempo se pierde."] },
      { h: "Llevar tus datos", p: ["Si ya tienes años de visionados en Letterboxd, puedes exportarlos como CSV desde tu cuenta e importarlos en otro sitio; lo mismo vale para las listas de AniList y MyAnimeList en el caso del anime. Pausa lee esos archivos en tu navegador: la exportación no se sube como archivo, solo se envía la lista de títulos y valoraciones."] },
      { h: "Lo que no sustituye", p: ["Un diario privado no sustituye el descubrimiento público: las reseñas de desconocidos y las listas de críticos son otra cosa. Mucha gente usa ambos: uno para el mundo, otro para los amigos."] },
    ],
    cta: "Pausa es eso: un diario privado para tu grupo, con series y anime, importación desde Letterboxd, AniList y MyAnimeList, y la Serata para decidir qué ver.",
  },
  "movie-night-guide": {
    title: "Cómo organizar una noche de cine con amigos, paso a paso",
    description: "De elegir la película a la hora, así se organiza una noche de cine que empieza puntual y no acaba en discusión.",
    intro: "Una noche de cine que sale bien se decide antes de que empiece la película. Esta es la secuencia que funciona, en cinco pasos.",
    blocks: [
      { h: "1. Elegid el día y quién viene", p: ["Fijad día y hora con al menos tres días de antelación, y decid cuántos sois: con más de seis personas elegir se complica, con menos de tres no hace falta método."] },
      { h: "2. Pedid un título a cada uno", p: ["Cada uno propone una película o serie. Dejad fuera lo que alguien haya visto hace poco. Ocho propuestas es lo máximo manejable."] },
      { h: "3. Decidid antes de sentaros", p: ["Haced la elección antes con una votación rápida, o al empezar la noche con un límite de dos minutos. Decidir en el sofá con las luces apagadas es la causa número uno de las noches perdidas."] },
      { h: "4. Comprobad dónde se ve", p: ["Antes de decidir, comprobad que el título esté en un servicio que tengáis todos. Descubrir a mitad de noche que hace falta otra suscripción es el error más común."] },
      { h: "5. Anotadlo después", p: ["En cuanto termine, cada uno pone una nota y escribe dos líneas. Dentro de un año será el diario del grupo: «hace un año, por estas fechas, vimos…»."] },
    ],
    cta: "Con Pausa el grupo se invita con un enlace, elige en dos minutos y la película elegida entra en el diario con un toque.",
  },
};

const ALL: Record<Locale, Record<CoreSlug, Guide>> = { it, en, es };
export const guideFor = (locale: Locale, slug: GuideSlug): Guide => (slug in ALL[locale] ? ALL[locale][slug as CoreSlug] : MORE_GUIDES[locale][slug as MoreSlug]);

export const guideStrings: Record<Locale, { index: string; indexTitle: string; indexLede: string; read: string; try: string; updated: string; back: string; more: string }> = {
  it: { index: "Guide", indexTitle: "Guide per scegliere cosa guardare insieme", indexLede: "Metodi pratici per decidere in gruppo, senza litigare e senza perdere la serata.", read: "Leggi la guida", try: "Prova una Serata", updated: "Aggiornato", back: "Tutte le guide", more: "Altre guide" },
  en: { index: "Guides", indexTitle: "Guides to picking what to watch together", indexLede: "Practical ways to decide as a group, without arguing and without losing the evening.", read: "Read the guide", try: "Try a Serata", updated: "Updated", back: "All guides", more: "More guides" },
  es: { index: "Guías", indexTitle: "Guías para elegir qué ver juntos", indexLede: "Métodos prácticos para decidir en grupo, sin discutir y sin perder la noche.", read: "Leer la guía", try: "Probar una Serata", updated: "Actualizado", back: "Todas las guías", more: "Más guías" },
};
