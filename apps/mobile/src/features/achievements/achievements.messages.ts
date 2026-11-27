import { registerArea } from "@/i18n/messages";

// The Traguardi screen and the global board (opt-in). Milestone cards: milestone.messages.ts.

const it = {
  achievements: {
    title: "Traguardi",
    lede: "Traguardi tuoi, contano tutte le visioni (anche quelle importate). Li vedi solo tu, a meno che tu non accenda la pagina pubblica.",
    board: {
      title: "Classifica di Pausa",
      off: "Non sei in classifica. È una scelta: si entra solo se vuoi, con un nome pubblico che scegli adesso (non quello delle Cerchie), e si esce quando vuoi.",
      rules: "Conta le visioni che registri a mano, al massimo {cap} al giorno. Le importazioni non contano. Il punteggio si aggiorna ogni ora.",
      name: "Nome pubblico",
      nameHint: "Da 2 a 32 caratteri. Niente email o link: lo leggono persone che non conosci.",
      nameInvalid: "Scegli un nome da 2 a 32 caratteri, senza email o link.",
      publicPage: "Pagina pubblica",
      publicPageHint: "Una pagina con il nome pubblico, i traguardi raggiunti e il punteggio. Niente Cerchie, niente visioni.",
      join: "Entra in classifica",
      save: "Salva",
      leave: "Esci dalla classifica",
      leaveConfirm: "Esci e cancella nome e punteggio",
      left: "Sei uscito dalla classifica: nome e punteggio sono cancellati.",
      joined: "Sei in classifica come {name}.",
      you: "tu",
      all: "Sempre",
      month: "Questo mese",
      rank: "{rank}º posto",
      points: "{count, plural, one {# punto} other {# punti}}",
      notYet: "Il tuo punteggio arriva al prossimo calcolo (ogni ora).",
      empty: "Nessun punteggio ancora: la classifica si calcola ogni ora.",
      members: "{count, plural, one {# persona in classifica} other {# persone in classifica}}",
      computed: "Aggiornata {when}",
      guest: "Per entrare in classifica serve un account.",
      openPage: "Apri la tua pagina pubblica"
    }
  }
};

const en: typeof it = {
  achievements: {
    title: "Milestones",
    lede: "Your own milestones: every viewing counts (imported ones too). Only you see them, unless you turn on the public page.",
    board: {
      title: "Pausa leaderboard",
      off: "You are not on the leaderboard. It is your choice: you join only if you want, with a public name you choose now (not your Circle name), and you leave whenever you want.",
      rules: "It counts the viewings you log by hand, at most {cap} a day. Imports do not count. Scores update every hour.",
      name: "Public name",
      nameHint: "2 to 32 characters. No email or links: strangers read it.",
      nameInvalid: "Choose a name of 2 to 32 characters, with no email or links.",
      publicPage: "Public page",
      publicPageHint: "A page with your public name, the milestones you reached and your score. No Circles, no viewings.",
      join: "Join the leaderboard",
      save: "Save",
      leave: "Leave the leaderboard",
      leaveConfirm: "Leave and delete name and score",
      left: "You left the leaderboard: your name and score are deleted.",
      joined: "You are on the leaderboard as {name}.",
      you: "you",
      all: "All time",
      month: "This month",
      rank: "#{rank}",
      points: "{count, plural, one {# point} other {# points}}",
      notYet: "Your score arrives with the next computation (every hour).",
      empty: "No scores yet: the leaderboard is computed every hour.",
      members: "{count, plural, one {# person on the leaderboard} other {# people on the leaderboard}}",
      computed: "Updated {when}",
      guest: "You need an account to join the leaderboard.",
      openPage: "Open your public page"
    }
  }
};

const es: typeof it = {
  achievements: {
    title: "Logros",
    lede: "Logros tuyos: cuentan todas las visiones (también las importadas). Solo los ves tú, salvo que actives la página pública.",
    board: {
      title: "Clasificación de Pausa",
      off: "No estás en la clasificación. Es una elección: se entra solo si quieres, con un nombre público que eliges ahora (no el de tus Círculos), y se sale cuando quieras.",
      rules: "Cuentan las visiones que registras a mano, como máximo {cap} al día. Las importaciones no cuentan. La puntuación se actualiza cada hora.",
      name: "Nombre público",
      nameHint: "De 2 a 32 caracteres. Sin email ni enlaces: lo leen personas que no conoces.",
      nameInvalid: "Elige un nombre de 2 a 32 caracteres, sin email ni enlaces.",
      publicPage: "Página pública",
      publicPageHint: "Una página con tu nombre público, los logros alcanzados y la puntuación. Sin Círculos, sin visiones.",
      join: "Entrar en la clasificación",
      save: "Guardar",
      leave: "Salir de la clasificación",
      leaveConfirm: "Salir y borrar nombre y puntuación",
      left: "Has salido de la clasificación: nombre y puntuación borrados.",
      joined: "Estás en la clasificación como {name}.",
      you: "tú",
      all: "Siempre",
      month: "Este mes",
      rank: "{rank}.º puesto",
      points: "{count, plural, one {# punto} other {# puntos}}",
      notYet: "Tu puntuación llega con el próximo cálculo (cada hora).",
      empty: "Aún no hay puntuaciones: la clasificación se calcula cada hora.",
      members: "{count, plural, one {# persona en la clasificación} other {# personas en la clasificación}}",
      computed: "Actualizada {when}",
      guest: "Para entrar en la clasificación necesitas una cuenta.",
      openPage: "Abre tu página pública"
    }
  }
};

registerArea("achievements", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    achievements: typeof it;
  }
}
