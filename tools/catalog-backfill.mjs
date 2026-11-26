// Fills genres and authors for titles stored before migration 0003. Usage:
//   PAUSA_URL=https://pausa.gnagno.org PAUSA_COOKIE='<operator session cookie>' node tools/catalog-backfill.mjs
const base = process.env.PAUSA_URL ?? "http://127.0.0.1:8798";
const cookie = process.env.PAUSA_COOKIE;
if (!cookie) throw new Error("PAUSA_COOKIE missing (operator session)");
let prevLeft = Infinity;
for (;;) {
  const r = await fetch(`${base}/api/admin/catalog-backfill?limit=5`, { method: "POST", headers: { cookie } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const { done, failed = 0, left } = await r.json();
  console.log(`done ${done}, failed ${failed}, left ${left}`);
  if (left === 0) break;
  if (done === 0) {
    console.error("Stopping: no progress (catalogue down, rate limited or repeated failures). See `failed` above.");
    process.exit(1);
  }
  if (left >= prevLeft) {
    console.error(`Stopping: left did not decrease (${prevLeft} -> ${left}). Some titles keep failing; check the Worker logs.`);
    process.exit(1);
  }
  prevLeft = left;
  await new Promise((ok) => setTimeout(ok, 1500)); // TMDB ~40 req/10 s; AniList 90/min
}
