// T4c end-to-end checks: ranking, insights (agree / split / taste pairs / year in review) and group recommendations.
// The scenario is small enough to compute by hand; expected values are written next to the checks.
import { call, check, finish, mail, run, sql, signIn } from "./smoke-lib.mjs";

let r;
sql("DELETE FROM rate_limit");
const P = [];
for (const n of ["p1", "p2", "p3", "p4", "out"]) P.push(await signIn(mail(n)));
const [p1, p2, p3, p4, out] = P;

const K = (await call("POST", "/api/circles", { cookie: p1.cookie, body: { name: "Gruppo" } })).json;
for (const u of [p2, p3, p4]) await call("POST", "/api/circles/join", { cookie: u.cookie, body: { code: K.inviteCode } });
const Other = (await call("POST", "/api/circles", { cookie: p1.cookie, body: { name: "Altro" } })).json;

const T = {};
for (let i = 1; i <= 8; i++) {
  T[i] = `st${i}-${run}`;
  sql(`INSERT INTO media_entity(id,kind,original_title,year,runtime_min,poster_path) VALUES ('${T[i]}','movie','Titolo ${i}',${1990 + i},${i === 1 ? 120 : i === 2 ? 60 : "NULL"},'/s${i}.jpg')`);
}
sql(`UPDATE media_entity SET kind='anime' WHERE id='${T[5]}'`);
sql(`UPDATE media_entity SET kind='tv' WHERE id='${T[6]}'`);

const log = async (who, t, rating, extra = {}) => {
  const res = await call("POST", "/api/logs", { cookie: who.cookie, body: { mediaKey: `local:${T[t]}`, watchedOn: "2026-03-15", rating, circles: [K.id], ...extra } });
  if (res.status !== 201) throw new Error(`log failed ${res.status} ${res.text}`);
  return res.json.id;
};

// p1: T1 9, T2 8, T3 3, T4 9   p2: T1 9, T2 7, T3 3, T5 9   p3: T1 10, T2 8, T6 4, T7 10   p4: T7 2   (T8: seen by p4, unrated)
await log(p1, 1, 9, { platform: "Netflix" });
await log(p1, 2, 8, { watchedOn: "2026-03-20", platform: "Netflix" });
await log(p1, 3, 3, { watchedOn: "2026-05-01" });
await log(p1, 4, 9, { watchedOn: "2026-05-02" });
await log(p2, 1, 9);
await log(p2, 2, 7);
await log(p2, 3, 3);
await log(p2, 5, 9);
await log(p3, 1, 10);
await log(p3, 2, 8);
await log(p3, 6, 4);
await log(p3, 7, 10);
await log(p4, 7, 2);
await log(p4, 8, undefined);
// A viewing shared only in another Cerchia must not appear in K's numbers.
await call("POST", "/api/logs", { cookie: p1.cookie, body: { mediaKey: `local:${T[8]}`, watchedOn: "2026-03-15", rating: 10, circles: [Other.id] } });

const names = (items) => items.map((i) => i.media.title.replace("Titolo ", "T")).join(",");

// ═════════ ranking ═════════
r = await call("GET", `/api/circles/${K.id}/ranking`, { cookie: out.cookie });
check("ranking: outsiders get 404", r.status === 404);
r = await call("GET", `/api/circles/${K.id}/ranking`);
check("ranking needs a session", r.status === 401);
r = await call("GET", `/api/circles/${K.id}/ranking`, { cookie: p1.cookie });
const R0 = r.json;
const q = async (qs) => (await call("GET", `/api/circles/${K.id}/ranking?${qs}`, { cookie: p1.cookie })).json;
check("default order: average, then votes, then name; unrated and other-Cerchia titles left out", names(R0.items) === "T1,T4,T5,T2,T7,T6,T3", names(R0.items));
check("T1: three votes, average (9+9+10)/3, three watchers, last viewing", R0.items[0].votes === 3 && Math.abs(R0.items[0].avg - 28 / 3) < 1e-9 && R0.items[0].watchers === 3 && R0.items[0].lastWatched === "2026-03-15", JSON.stringify(R0.items[0]));
check("T7: two voters, 10 and 2, average 6", Math.abs(R0.items.find((i) => i.media.title === "Titolo 7").avg - 6) < 1e-9);
check("year span of the titles shown to the menus", R0.yearMin === 1991 && R0.yearMax === 1998, JSON.stringify([R0.yearMin, R0.yearMax]));
check("p1's 10 for T8 was given in another Cerchia: it does not count here (T8 is unrated in this ranking)", !R0.items.some((i) => i.media.title === "Titolo 8") && R0.total === 7 && (await q("minVotes=0")).items.find((i) => i.media.title === "Titolo 8").votes === 0);
check("minVotes=2 keeps titles two people rated, best average first", names((await q("minVotes=2")).items) === "T1,T2,T7,T3", names((await q("minVotes=2")).items));
check("kind=anime", names((await q("kind=anime")).items) === "T5");
check("kind=tv", names((await q("kind=tv")).items) === "T6");
check("by=p3 (titles one person watched)", names((await q(`by=${p3.id}`)).items).split(",").sort().join() === "T1,T2,T6,T7");
check("everyone=1 (titles all four watched): none", (await q("everyone=1&minVotes=0")).total === 0);
check("year range", names((await q("yearFrom=1992&yearTo=1993&minVotes=0")).items).split(",").sort().join() === "T2,T3");
check("search ignores case and accents", names((await q("q=TITOLO%204")).items) === "T4");
check("sort=year (newest release first)", names((await q("sort=year&minVotes=0")).items) === "T8,T7,T6,T5,T4,T3,T2,T1", names((await q("sort=year&minVotes=0")).items));
check("sort=title", names((await q("sort=title")).items) === "T1,T2,T3,T4,T5,T6,T7");
{
  const asc = (await q("dir=asc")).items.map((i) => i.avg);
  const desc = R0.items.map((i) => i.avg);
  const sorted = (a, cmp) => a.every((v, i) => i === 0 || cmp(a[i - 1], v));
  check("ranking: dir=asc orders by average ascending (worst first), default stays descending", asc.length === desc.length && sorted(asc, (x, y) => x <= y) && sorted(desc, (x, y) => x >= y) && asc[0] < asc.at(-1) && asc[0] === desc.at(-1) && asc.at(-1) === desc[0], JSON.stringify(asc));
  const t = (await q("sort=title")).items.map((i) => i.media.title);
  check("ranking: sort=title without dir stays A to Z, dir=desc gives Z to A", t[0] < t.at(-1) && (await q("sort=title&dir=desc")).items[0].media.title === t.at(-1));
}

sql(`INSERT INTO media_genre VALUES ('${T[1]}','drama'),('${T[2]}','drama'),('${T[3]}','comedy')`);
{
  const gd = await q("genre=drama");
  check("ranking: genre filter", gd.items.every((i) => [T[1], T[2]].includes(i.media.id)) && gd.total === 2, JSON.stringify(gd.items.map((i) => i.media.title)));
  check("ranking: genres present for the menu", JSON.stringify((await q("kind=movie")).genres) === JSON.stringify(["comedy", "drama"]));
  check("ranking: unknown genre ignored", (await q("genre=nope")).total === (await q("")).total);
}

// pagination: 50 more titles rated by p1
const bulk = Array.from({ length: 50 }, (_, i) => `bulk${i}-${run}`);
sql(`INSERT INTO media_entity(id,kind,original_title,year) VALUES ${bulk.map((id, i) => `('${id}','movie','Zeta ${String(i).padStart(2, "0")}',2000)`).join(",")}`);
sql(`INSERT INTO log(id,user_id,media_id,watched_on,rating,created_at) VALUES ${bulk.map((id, i) => `('bl-${id}','${p1.id}','${id}','2026-06-01',5,${1700000000000 + i})`).join(",")}`);
sql(`INSERT INTO log_share(log_id,circle_id,created_at) VALUES ${bulk.map((id) => `('bl-${id}','${K.id}',1800000000000)`).join(",")}`);
sql(`INSERT INTO rating_current(circle_id,user_id,media_id,rating,rated_at) VALUES ${bulk.map((id) => `('${K.id}','${p1.id}','${id}',5,1)`).join(",")}`);
const pg0 = await q("page=0");
const pg1 = await q("page=1");
check("the ranking pages by 40", pg0.items.length === 40 && pg1.items.length === 17 && pg0.total === 57 && pg1.page === 1 && pg0.pageSize === 40, JSON.stringify([pg0.items.length, pg1.items.length, pg0.total]));
check("pages do not overlap", new Set([...pg0.items, ...pg1.items].map((i) => i.media.id)).size === 57);
sql(`DELETE FROM rating_current WHERE media_id LIKE 'bulk%-${run}'`);
sql(`DELETE FROM log_share WHERE log_id LIKE 'bl-bulk%-${run}'`);

// ═════════ insights ═════════
r = await call("GET", `/api/circles/${K.id}/insights?year=2026`, { cookie: p2.cookie });
const I = r.json;
check("insights: outsiders get 404", (await call("GET", `/api/circles/${K.id}/insights`, { cookie: out.cookie })).status === 404);
check("agree: titles with two or more votes, average >= 8, spread <= 2", I.agree.length === 1 && I.agree[0].media.title === "Titolo 1", JSON.stringify(I.agree.map((a) => a.media.title)));
check("split: spread >= 4 (T7: 10 vs 2)", I.split.length === 1 && I.split[0].media.title === "Titolo 7", JSON.stringify(I.split.map((a) => a.media.title)));
const pair = (a, b) => I.pairs.find((p) => [p.a.id, p.b.id].sort().join() === [a.id, b.id].sort().join());
check("taste pair p1/p2: three shared titles, 1 - (0+1+0)/3/9", pair(p1, p2).common === 3 && Math.abs(pair(p1, p2).score - (1 - 1 / 3 / 9)) < 1e-9, JSON.stringify(pair(p1, p2)));
check("a pair under three shared titles has no score yet", pair(p1, p3).score === null && pair(p1, p3).common === 2 && pair(p3, p4).score === null);
check("pairs with a score come first", I.pairs[0].score !== null && I.pairs.length === 6);
const Y = I.year;
check("year in review: viewings, distinct titles, kinds", Y.year === 2026 && Y.logs === 14 && Y.titles === 8 && Y.movies === 12 && Y.series === 1 && Y.anime === 1 && Y.logs === Y.movies + Y.series + Y.anime, JSON.stringify(Y));
check("movie hours count films only: T1 120 min x3 viewings + T2 60 min x3 = 9 h", Math.abs(Y.movieHours - 9) < 1e-9, String(Y.movieHours));
check("most active: three people logged 4; ties go to the lower id", Y.mostActive.count === 4, JSON.stringify(Y.mostActive));
check("busiest month: March (most viewings)", Y.busiestMonth.key === "2026-03" && Y.busiestMonth.count === 12, JSON.stringify(Y.busiestMonth));
check("top platform", Y.topPlatform.key === "Netflix" && Y.topPlatform.count === 2);
check("title of the year: best average among titles two or more people rated", Y.titleOfTheYear.media.title === "Titolo 1" && Math.abs(Y.titleOfTheYear.avg - 28 / 3) < 1e-9);
check("average stars is the average rating halved", Math.abs(Y.avgStars - (9 + 8 + 3 + 9 + 9 + 7 + 3 + 9 + 10 + 8 + 4 + 10 + 2) / 13 / 2) < 1e-9, String(Y.avgStars));
check("years with viewings", JSON.stringify(I.yearsWithLogs) === "[2026]");
check("year in review: nobody logged 'with' yet, so no together-most pair", Y.togetherMost === null);
{
  const idOf = (u, t, on) => sql(`SELECT id FROM log WHERE user_id='${u.id}' AND media_id='${T[t]}' AND watched_on='${on}'`)[0].id;
  // p1 watched T1 with p2 (p2 logged it the same day too: counted once) and T2 on another day with p2: two times together.
  sql(`INSERT INTO log_watched_with(log_id,user_id) VALUES ('${idOf(p1, 1, "2026-03-15")}','${p2.id}'),('${idOf(p1, 2, "2026-03-20")}','${p2.id}'),('${idOf(p2, 1, "2026-03-15")}','${p1.id}'),('${idOf(p1, 3, "2026-05-01")}','${out.id}')`);
  const T2 = (await call("GET", `/api/circles/${K.id}/insights?year=2026`, { cookie: p2.cookie })).json.year.togetherMost;
  check("together most: the pair p1/p2, each (title, day) once, a non-member never counts", T2 && [T2.a.id, T2.b.id].sort().join() === [p1.id, p2.id].sort().join() && T2.times === 2, JSON.stringify(T2));
}
const t8 = (await q("minVotes=0")).items.find((i) => i.media.title === "Titolo 8");
check("ranking: watchedBy lists who saw a title, rated or not (T8: p4 saw it, nobody rated it here)", t8.ratings.length === 0 && t8.watchedBy.length === 1 && t8.watchedBy[0] === p4.id, JSON.stringify(t8));
r = await call("GET", `/api/circles/${K.id}/insights?year=2019`, { cookie: p1.cookie });
check("a year with nothing is empty, not an error", r.status === 200 && r.json.year.logs === 0 && r.json.year.titleOfTheYear === null && r.json.year.mostActive === null && r.json.year.movieHours === 0);

// ═════════ group recommendations ═════════
r = await call("GET", `/api/circles/${K.id}/recommendations`, { cookie: p4.cookie });
const recs = r.json;
const rec = (t) => recs.find((x) => x.media.title === `Titolo ${t}`);
check("recommendations: only what somebody loved (7+) and somebody has not seen", r.status === 200 && recs.length > 0 && recs.every((x) => x.score >= 7), JSON.stringify(recs.map((x) => [x.media.title, x.score])));
check("T5 (loved by p2) goes to the three who have not seen it, at face value for those not comparable yet", rec(5).unseenBy.map((p) => p.id).sort().join() === [p1.id, p3.id, p4.id].sort().join() && rec(5).lovedBy.length === 1 && rec(5).lovedBy[0].person.id === p2.id && rec(5).lovedBy[0].rating === 9 && Math.abs(rec(5).score - 9) < 1e-9, JSON.stringify(rec(5)));
check("T1 is only for p4, scored from the three who rated it (nobody is comparable to p4 yet)", rec(1).unseenBy.length === 1 && rec(1).unseenBy[0].id === p4.id && Math.abs(rec(1).score - 28 / 3) < 1e-9, JSON.stringify(rec(1)));
check("T3 (rated 3), T6 (rated 4) and T7 (predicted 6 for the two who have not seen it) are not recommended; T2 is, to p4 at 7.67", !rec(3) && !rec(6) && !rec(7) && rec(2).unseenBy.length === 1 && rec(2).unseenBy[0].id === p4.id && Math.abs(rec(2).score - 23 / 3) < 1e-9, JSON.stringify(recs.map((x) => [x.media.title, x.score])));
check("order: score, then people who would watch it, then title", JSON.stringify(recs.map((x) => x.media.title)) === JSON.stringify(["Titolo 1", "Titolo 4", "Titolo 5", "Titolo 2"]), JSON.stringify(recs.map((x) => x.media.title)));
check("the title shared only in another Cerchia is never suggested here", !rec(8));
sql(`INSERT INTO watch_progress(user_id,media_id,status) VALUES ('${p4.id}','${T[1]}','watching')`);
r = await call("GET", `/api/circles/${K.id}/recommendations`, { cookie: p1.cookie });
check("somebody already watching a title: it is not suggested to them (T1 had only p4 left)", !r.json.some((x) => x.media.title === "Titolo 1"));
r = await call("GET", `/api/circles/${K.id}/recommendations?limit=1`, { cookie: p1.cookie });
check("limit", r.json.length === 1);
r = await call("GET", `/api/circles/${K.id}/recommendations`, { cookie: out.cookie });
check("outsiders get 404", r.status === 404);
const solo = (await call("POST", "/api/circles", { cookie: out.cookie, body: { name: "Solo" } })).json;
r = await call("GET", `/api/circles/${solo.id}/recommendations`, { cookie: out.cookie });
check("a Cerchia of one person has nothing to compare: empty list", r.status === 200 && r.json.length === 0);
r = await call("GET", `/api/circles/${solo.id}/ranking`, { cookie: out.cookie });
check("and an empty ranking", r.json.total === 0 && r.json.yearMin === null);

finish();
