// A tiny stand-in for TMDB and AniList used by the API smoke tests (no network, no keys, deterministic).
// Usage: node tools/mock-catalog.mjs 9911   (the API is started with TMDB_BASE_URL=http://127.0.0.1:9911, ANILIST_URL=.../anilist)
// GET /__stats returns how many requests each path got, so tests can prove that caching works.
import http from "node:http";

const port = Number(process.argv[2] ?? 9911);
const stats = {};
const pushed = [];
const webpushed = [];

const movie = (lang) => ({
  id: 603,
  title: lang.startsWith("en") ? "The Matrix (en)" : "Matrix",
  original_title: "The Matrix",
  release_date: "1999-03-30",
  runtime: 136,
  poster_path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
  overview: lang.startsWith("en") ? "A hacker learns the truth." : "Un hacker scopre la verità.",
  imdb_id: "tt0133093",
  original_language: "en",
  genres: [{ id: 28, name: "Azione" }, { id: 878, name: "Fantascienza" }],
  credits: { cast: [{ name: "Keanu Reeves", character: "Neo" }, { name: "Laurence Fishburne", character: "Morpheus" }], crew: [{ id: 9339, name: "Lana Wachowski", job: "Director", profile_path: "/lana.jpg" }, { id: 9340, name: "Lilly Wachowski", job: "Director" }] },
});

// More films, for the import tests: id -> [title it, original title, release date, runtime]
const FILMS = {
  194: ["Amélie", "Le Fabuleux Destin d'Amélie Poulain", "2001-04-25", 122],
  604: ["Matrix Reloaded", "The Matrix Reloaded", "2003-05-15", 138], // on the director page (person 9339), resolved on click
  807: ["Se7en", "Se7en", "1995-09-22", 127],
  27205: ["Inception", "Inception", "2010-07-15", 148],
};
const filmById = (id, lang) => {
  const f = FILMS[id];
  return { id, title: f[0], original_title: f[1], release_date: f[2], runtime: f[3], poster_path: `/film${id}.jpg`, overview: `Trama ${id}`, imdb_id: `tt${String(id).padStart(7, "0")}`, original_language: "en", genres: [{ id: 18, name: "Drammatico" }], credits: { cast: [] } };
};
const IMDB = { tt0133093: ["movie", 603], tt0903747: ["tv", 1396], tt0000807: ["movie", 807] };
const BY_TITLE = { matrix: ["movie", 603], amelie: ["movie", 194], "amélie": ["movie", 194], se7en: ["movie", 807], inception: ["movie", 27205], "breaking bad": ["tv", 1396] };

const series = (id, lang) =>
  id === 1396
    ? {
        id: 1396, name: lang.startsWith("en") ? "Breaking Bad (en)" : "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20",
        episode_run_time: [47], poster_path: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", overview: "Un professore di chimica.", original_language: "en",
        genres: [{ id: 18, name: "Drammatico" }], external_ids: { imdb_id: "tt0903747" },
        created_by: [{ id: 66633, name: "Vince Gilligan", profile_path: "/vg.jpg" }],
        seasons: [{ season_number: 0, episode_count: 9 }, { season_number: 1, episode_count: 7 }, { season_number: 2, episode_count: 13 }],
        credits: { cast: [{ name: "Bryan Cranston", character: "Walter White" }] },
      }
    : {
        id: 37854, name: "One Piece", original_name: "ONE PIECE", first_air_date: "1999-10-20", episode_run_time: [24], poster_path: "/op.jpg",
        overview: "Pirati.", original_language: "ja", genres: [{ id: 16, name: "Animazione" }],
        seasons: [{ season_number: 1, episode_count: 61 }, { season_number: 2, episode_count: 8 }],
      };

const search = (q) => {
  q = q.toLowerCase();
  const results = [];
  if (q.includes("matrix")) results.push({ id: 603, media_type: "movie", title: "Matrix", original_title: "The Matrix", release_date: "1999-03-30", poster_path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", genre_ids: [28], original_language: "en" });
  if (q.includes("breaking")) results.push({ id: 1396, media_type: "tv", name: "Breaking Bad", first_air_date: "2008-01-20", genre_ids: [18], original_language: "en", poster_path: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg" });
  if (q.includes("one piece")) results.push({ id: 37854, media_type: "tv", name: "One Piece", first_air_date: "1999-10-20", genre_ids: [16], original_language: "ja", poster_path: "/op.jpg" });
  if (q.includes("adult")) results.push({ id: 9, media_type: "movie", title: "Adult", adult: true });
  if (q.includes("person")) results.push({ id: 5, media_type: "person", name: "Someone" });
  return { page: 1, results };
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const key = req.method + " " + url.pathname;
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/__stats") return send(200, stats);
  if (url.pathname === "/__reset") {
    for (const k of Object.keys(stats)) delete stats[k];
    return send(200, { ok: true });
  }
  stats[key] = (stats[key] ?? 0) + 1;

  // Stand-in for Expo's push service: keeps what was sent (GET /__push) and answers one ticket per message.
  if (url.pathname === "/expo/send" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const msgs = JSON.parse(raw || "[]");
      pushed.push(...msgs);
      send(200, { data: msgs.map((m) => (String(m.to).includes("gone") ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "t" })) });
    });
    return;
  }
  if (url.pathname === "/__push") return send(200, pushed);
  // Stand-in for a Web Push service: keeps the request headers (GET /__webpush); 410 for a path containing "gone".
  if (url.pathname.startsWith("/webpush/") && req.method === "POST") {
    webpushed.push({ path: url.pathname, authorization: req.headers.authorization ?? null, ttl: req.headers.ttl ?? null, length: req.headers["content-length"] ?? "0" });
    return send(url.pathname.includes("gone") ? 410 : 201, {});
  }
  if (url.pathname === "/__webpush") return send(200, webpushed);

  if (url.pathname.startsWith("/anilist")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const { query, variables } = JSON.parse(raw || "{}");
      if (query.includes("staff(search")) {
        const q = String(variables?.q ?? "").toLowerCase();
        const staff = [];
        if (q.includes("oda")) staff.push({ id: 96881, name: { full: "Eiichiro Oda" }, primaryOccupations: ["Mangaka"], image: { large: "https://s4.anilist.co/oda.jpg" } });
        return send(200, { data: { Page: { staff } } });
      }
      if (query.includes("Staff(id")) {
        if (variables?.id !== 96881) return send(200, { errors: [{ message: "Not Found." }], data: { Staff: null } });
        return send(200, { data: { Staff: { id: 96881, name: { full: "Eiichiro Oda" }, image: { large: "https://s4.anilist.co/oda.jpg" }, description: "Mangaka.", dateOfBirth: { year: 1975, month: 1, day: 1 }, dateOfDeath: {}, homeTown: "Kumamoto", staffMedia: { edges: [{ staffRole: "Original Creator", node: { id: 21, type: "ANIME", title: { romaji: "ONE PIECE", english: "One Piece" }, seasonYear: 1999, startDate: { year: 1999 }, coverImage: { large: "https://s4.anilist.co/file/op.jpg" } } }] } } } });
      }
      // where an AniList-only anime streams, and AniList's own recommendations ("Per te" seeds)
      if (query.includes("externalLinks")) {
        const links = [21, 1535].includes(Number(variables?.id)) ? [{ site: "Crunchyroll", url: "https://www.crunchyroll.com/series/one-piece", type: "STREAMING" }, { site: "Official Site", url: "https://one-piece.com", type: "INFO" }, { site: "Netflix", url: "https://www.netflix.com/title/80107103", type: "STREAMING" }] : [];
        return send(200, { data: { Media: { externalLinks: links } } });
      }
      if (query.includes("recommendations")) {
        const nodes = Number(variables?.id) === 1535 ? [{ mediaRecommendation: { id: 21, title: { romaji: "ONE PIECE", english: "One Piece" }, seasonYear: 1999, isAdult: false, coverImage: { large: "https://s4.anilist.co/file/op.jpg" } } }, { mediaRecommendation: { id: 20, title: { romaji: "NARUTO", english: "Naruto" }, seasonYear: 2002, isAdult: false, coverImage: { large: "https://s4.anilist.co/file/naruto.jpg" } } }] : Number(variables?.id) === 21 ? [{ mediaRecommendation: { id: 1535, title: { romaji: "DEATH NOTE", english: "Death Note" }, seasonYear: 2006, isAdult: false, coverImage: { large: "https://s4.anilist.co/file/dn.jpg" } } }, { mediaRecommendation: { id: 20, title: { romaji: "NARUTO", english: "Naruto" }, seasonYear: 2002, isAdult: false, coverImage: { large: "https://s4.anilist.co/file/naruto.jpg" } } }] : [];
        return send(200, { data: { Media: { recommendations: { nodes } } } });
      }
      if (query.includes("Page(")) {
        const q = String(variables?.q ?? "").toLowerCase();
        const media = [];
        if (q.includes("one piece")) media.push({ id: 21, idMal: 21, title: { romaji: "ONE PIECE", english: "One Piece" }, seasonYear: 1999, isAdult: false, coverImage: { large: "https://s4.anilist.co/file/op.jpg" } });
        if (q.includes("death note")) media.push({ id: 1535, idMal: 1535, title: { romaji: "DEATH NOTE", english: "Death Note" }, seasonYear: 2006, isAdult: false, coverImage: { large: "https://s4.anilist.co/file/dn.jpg" } });
        return send(200, { data: { Page: { media } } });
      }
      const id = variables?.id;
      if (id === 21) return send(200, { data: { Media: { id: 21, idMal: 21, title: { romaji: "ONE PIECE", english: "One Piece" }, seasonYear: 1999, episodes: 1100, duration: 24, description: "Pirati.", genres: ["Action"], isAdult: false, staff: { edges: [{ role: "Original Creator", node: { id: 96881, name: { full: "Eiichiro Oda" }, image: { large: "https://s4.anilist.co/oda.jpg" } } }, { role: "Director", node: { id: 1, name: { full: "Konosuke Uda" } } }] },  coverImage: { large: "https://s4.anilist.co/file/op.jpg" } } } });
      if (id === 1535) return send(200, { data: { Media: { id: 1535, idMal: 1535, title: { romaji: "DEATH NOTE", english: "Death Note" }, seasonYear: 2006, episodes: 37, duration: 23, description: "Un quaderno.<br>Un dio della morte.", genres: ["Mystery", "Thriller"], isAdult: false, coverImage: { large: "https://s4.anilist.co/file/dn.jpg" } } } });
      return send(200, { errors: [{ message: "Not Found." }], data: { Media: null } });
    });
    return;
  }

  if (req.headers.authorization !== "Bearer test-token") return send(401, { status_message: "Invalid API key" });
  const lang = url.searchParams.get("language") ?? "en-US";
  if (url.pathname === "/search/multi") return send(200, search(url.searchParams.get("query") ?? ""));
  if (url.pathname === "/search/person") {
    const q = (url.searchParams.get("query") ?? "").toLowerCase();
    const results = [];
    if (q.includes("simon")) results.push({ id: 1223786, name: "David Simon", known_for_department: "Writing", known_for: [{ media_type: "tv", name: "The Wire" }], profile_path: "/ds.jpg" }, { id: 2, name: "Simon Actor", known_for_department: "Acting" });
    if (q.includes("wachowski")) results.push({ id: 9339, name: "Lana Wachowski", known_for_department: "Directing", known_for: [{ media_type: "movie", title: "Matrix" }], profile_path: "/lana.jpg" });
    return send(200, { page: 1, results });
  }
  if (url.pathname === "/person/9339") {
    return send(200, { id: 9339, name: "Lana Wachowski", profile_path: "/lana.jpg", birthday: "1965-06-21", place_of_birth: "Chicago, Illinois, USA", biography: "Regista e sceneggiatrice.", combined_credits: { crew: [
      { id: 603, media_type: "movie", title: "Matrix", release_date: "1999-03-30", poster_path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", job: "Director", genre_ids: [28, 878], original_language: "en" },
      { id: 604, media_type: "movie", title: "Matrix Reloaded", release_date: "2003-05-15", poster_path: "/mr.jpg", job: "Director", genre_ids: [28, 878], original_language: "en" },
      { id: 603, media_type: "movie", title: "Matrix", job: "Producer" },
    ] } });
  }
  if (url.pathname === "/movie/603") return send(200, movie(lang));
  // Watch providers: Matrix (603) streams on Netflix and Prime in Italy, nowhere in France; the IT catalogue has four services.
  if (url.pathname === "/movie/603/watch/providers") {
    return send(200, { id: 603, results: { IT: { flatrate: [{ provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/prime.jpg", display_priority: 2 }, { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 1 }], rent: [{ provider_id: 2, provider_name: "Apple TV", display_priority: 0 }] }, FR: {} } });
  }
  if (url.pathname === "/watch/providers/movie") {
    return send(200, { results: [{ provider_id: 337, provider_name: "Disney Plus", logo_path: "/d.jpg", display_priorities: { IT: 3 } }, { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priorities: { IT: 1 } }, { provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/prime.jpg", display_priorities: { IT: 2 } }, { provider_id: 350, provider_name: "Apple TV Plus", display_priorities: { IT: 4 } }] });
  }
  // Recommendations for Matrix (603): one obscure (few votes), one without poster, three good ones (two of them logged in tests).
  if (url.pathname === "/movie/603/recommendations") {
    return send(200, { results: [
      { id: 27205, title: "Inception", release_date: "2010-07-15", poster_path: "/film27205.jpg", vote_count: 30000, genre_ids: [28] },
      { id: 807, title: "Se7en", release_date: "1995-09-22", poster_path: "/film807.jpg", vote_count: 20000, genre_ids: [80] },
      { id: 1001, title: "Obscuro", release_date: "2003-01-01", poster_path: "/o.jpg", vote_count: 12, genre_ids: [] },
      { id: 1002, title: "Senza locandina", release_date: "2004-01-01", poster_path: null, vote_count: 9000, genre_ids: [] },
      { id: 1003, title: "Il Terzo", release_date: "2005-01-01", poster_path: "/t.jpg", vote_count: 700, genre_ids: [35] },
    ] });
  }
  const mv = /^\/movie\/(\d+)$/.exec(url.pathname);
  if (mv && FILMS[Number(mv[1])]) return send(200, filmById(Number(mv[1]), lang));
  const find = /^\/find\/(tt\d+)$/.exec(url.pathname);
  if (find) {
    const hit = IMDB[find[1]];
    return send(200, { movie_results: hit?.[0] === "movie" ? [{ id: hit[1] }] : [], tv_results: hit?.[0] === "tv" ? [{ id: hit[1] }] : [] });
  }
  const srch = /^\/search\/(movie|tv)$/.exec(url.pathname);
  if (srch) {
    const hit = BY_TITLE[(url.searchParams.get("query") ?? "").toLowerCase()];
    if (!hit || hit[0] !== srch[1]) return send(200, { results: [] });
    const year = hit[0] === "movie" ? (hit[1] === 603 ? "1999-03-30" : FILMS[hit[1]][2]) : "2008-01-20";
    return send(200, { results: [{ id: hit[1], [hit[0] === "movie" ? "release_date" : "first_air_date"]: year }] });
  }
  const tv = /^\/tv\/(\d+)$/.exec(url.pathname);
  if (tv && [1396, 37854].includes(Number(tv[1]))) return send(200, series(Number(tv[1]), lang));
  return send(404, { status_message: "The resource you requested could not be found." });
});

server.listen(port, "127.0.0.1", () => console.log(`mock catalog on ${port}`));
