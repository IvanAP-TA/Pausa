"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { forceAdvance, startSerata, submitBallot, tick, voteBracket } from "@/lib/serata/actions";
import { trackEvent } from "@/lib/events";
import { GoogleButton } from "@/components/google-button";
import { DOTS, MATCH_MS, TABLE_MS } from "@/lib/serata/engine";
import type { RoomView } from "@/lib/serata/server";
import type { MediaSummary } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { Poster } from "@/components/poster";
import { Minus, Plus } from "lucide-react";

const POLL_MS = 1500;

/* ───────────── live state: poll + clock offset ───────────── */

function useRoom(initial: RoomView, locale: string) {
  const [view, setView] = useState(initial);
  const version = useRef(initial.version);
  // Server clock minus local clock, so countdowns agree across phones. Set after mount (render must stay pure).
  const offset = useRef(0);
  useEffect(() => { offset.current = initial.serverNow - Date.now(); }, [initial.serverNow]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/serata/${initial.code}?v=${version.current}&locale=${locale}`, { cache: "no-store" });
    if (res.status !== 200) return;
    const next = (await res.json()) as RoomView;
    offset.current = next.serverNow - Date.now();
    version.current = next.version;
    setView(next);
  }, [initial.code, locale]);

  useEffect(() => {
    if (view.status === "done") return;
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh, view.status]);

  // Stable identity: the countdown effect depends on it.
  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { view, refresh, serverNow };
}

/** Seconds left until `deadline` (server clock); calls `onExpire` once per deadline. */
function useCountdown(deadline: number | null, initialNow: number, serverNow: () => number, onExpire: () => void) {
  // First value comes from the server snapshot, so server HTML and first client render match.
  const [left, setLeft] = useState(() => (deadline ? Math.max(0, deadline - initialNow) : 0));
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!deadline) return;
    const step = () => {
      const ms = Math.max(0, deadline - serverNow());
      setLeft(ms);
      if (ms === 0 && fired.current !== deadline) {
        fired.current = deadline;
        onExpire();
      }
    };
    step();
    const id = setInterval(step, 250);
    return () => clearInterval(id);
  }, [deadline, serverNow, onExpire]);
  return left;
}

/* ───────────── room ───────────── */

export function SerataRoom({ initial, meId, isGuest, google }: { initial: RoomView; meId: string; isGuest: boolean; google: boolean }) {
  const locale = useLocale();
  const t = useTranslations("serata");
  const { view, refresh, serverNow } = useRoom(initial, locale);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); await refresh(); });
  const onExpire = useCallback(() => { void tick(view.code).then(refresh); }, [view.code, refresh]);

  const deadline = view.bracket?.deadline ?? view.table?.deadline ?? null;
  const left = useCountdown(view.status === "voting" ? deadline : null, initial.serverNow, serverNow, onExpire);
  const total = view.mode === "bracket" ? MATCH_MS : TABLE_MS;

  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-start gap-6 px-4 pb-10 pt-6">
      <header className="grid gap-4">
        <div className="min-w-0">
          {/* Once the winner is out its title takes the display voice, and the head steps down. */}
          <h1 className={view.status === "done" ? "title" : "display"}>{t("title")}</h1>
          <p className="mt-2 text-sm text-muted">Pausa, {t(`mode.${view.mode}`)}</p>
        </div>
        {view.status === "voting" && (view.bracket || deadline) && (
          <div className="plate flex items-end justify-between gap-4 pt-4">
            {view.status === "voting" && view.bracket && (
              <p className="flex min-w-0 items-end gap-3">
                <span aria-hidden="true" className="figure tabular text-display">
                  {Math.min(view.bracket.progress.done + 1, view.bracket.progress.total)}<span className="text-muted">/{view.bracket.progress.total}</span>
                </span>
                <span className="grid min-w-0 pb-1 text-sm">
                  <span>{t(`round.${view.bracket.round}`)}</span>
                  <span className="tabular text-muted">
                    {t("match", { n: Math.min(view.bracket.progress.done + 1, view.bracket.progress.total), total: view.bracket.progress.total })}
                  </span>
                </span>
              </p>
            )}
            {view.status === "voting" && deadline && <Timer left={left} total={total} />}
          </div>
        )}
      </header>

      {view.status === "voting" && view.bracket && <BracketBar done={view.bracket.progress.done} total={view.bracket.progress.total} />}

      {view.status === "lobby" && <Lobby view={view} pending={pending} onStart={() => run(() => startSerata(view.code))} />}
      {view.status === "voting" && view.bracket && (
        <BracketVote bracket={view.bracket} pending={pending} onPick={(id) => run(() => voteBracket(view.code, id))} />
      )}
      {view.status === "voting" && view.table && (
        <TableVote candidates={view.candidates} mine={view.table.myBallot} pending={pending}
          onSubmit={(dots, veto) => run(() => submitBallot(view.code, dots, veto))} />
      )}
      {view.status === "done" && view.result && <Result view={view} meId={meId} isGuest={isGuest} google={google} />}

      {view.status !== "done" && (
        <section className="plate grid gap-4 pt-5" aria-live="polite">
          <h2 className="title text-xl">{t("inRoom", { count: view.participants.length })}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-2 gap-y-4">
            {view.participants.map((p) => (
              <li key={p.id} className="grid min-w-0 content-start justify-items-center gap-1 text-center text-sm">
                <span className="relative">
                  <Avatar user={p} size={40} />
                  {/* Voted: one small amber square on the avatar. */}
                  {view.status === "voting" && p.voted && <span aria-hidden="true" className="absolute -right-1 -top-1 size-2.5 bg-accent" />}
                </span>
                <span className="max-w-full truncate">{p.name}</span>
                {p.isGuest && <span className="text-muted">{t("guest")}</span>}
                {view.status === "voting" && (
                  <span className={p.voted ? "text-ink-2" : "text-muted"}>
                    {p.voted ? t("voted") : t("choosing")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {view.status === "voting" && view.isHost && (
            <button type="button" disabled={pending} onClick={() => run(() => forceAdvance(view.code))}
              className="btn btn-quiet justify-self-end">
              {t("advance")}
            </button>
          )}
        </section>
      )}
    </main>
  );
}

/* ───────────── pieces ───────────── */

function Timer({ left, total }: { left: number; total: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const s = Math.ceil(left / 1000);
  return (
    <span className="relative grid size-16 shrink-0 place-items-center" role="timer" aria-label={`${s}s`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-rule" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="butt"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, left / total))} className="text-accent transition-[stroke-dashoffset] duration-200 ease-linear motion-reduce:transition-none" />
      </svg>
      <span className="figure tabular text-2xl">{`0:${String(s).padStart(2, "0")}`}</span>
    </span>
  );
}

function BracketBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={`h-0.5 flex-1 ${i < done ? "bg-muted" : i === done ? "bg-accent" : "bg-rule"}`} />
      ))}
    </div>
  );
}

function Lobby({ view, pending, onStart }: { view: RoomView; pending: boolean; onStart: () => void }) {
  const t = useTranslations("serata.lobby");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const host = view.participants[0]?.name ?? "";

  async function share() {
    const url = `${location.origin}/${locale}/s/${view.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Pausa", text: t("shareText"), url }); void trackEvent("invite_shared", view.code); return; } catch { return; }
    }
    void trackEvent("invite_shared", view.code);
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt(t("share"), url); }
  }

  return (
    <>
      <section className="well grained grid gap-4 p-5">
        <p className="text-ink-2">{t("invite")}</p>
        <p className="figure tabular text-display uppercase tracking-[0.03em]">{view.code}</p>
        {/* The host's one amber control is the start; for a guest it is the link to pass on. */}
        <button type="button" onClick={share} className={`btn w-full sm:w-fit ${view.isHost ? "" : "btn-primary"}`}>
          {copied ? t("copied") : t("share")}
        </button>
      </section>

      <section className="grid gap-3">
        <h2 className="title text-xl">{t("rosa", { count: view.candidates.length })}</h2>
        <ul className="grid grid-cols-4 gap-x-2 gap-y-4">
          {view.candidates.map((m) => (
            <li key={m.id} className="grid min-w-0 content-start gap-1.5">
              <Poster media={m} size="sm" />
              <span className="line-clamp-2 text-sm leading-tight [overflow-wrap:anywhere]">{m.title}</span>
            </li>
          ))}
        </ul>
      </section>

      {view.isHost ? (
        <button type="button" disabled={pending} onClick={onStart} className="btn btn-primary min-h-12 w-full">
          {t("start")}
        </button>
      ) : (
        <p className="text-center text-ink-2">{t("wait", { name: host })}</p>
      )}
    </>
  );
}

function BracketVote({ bracket, pending, onPick }: {
  bracket: NonNullable<RoomView["bracket"]>; pending: boolean; onPick: (id: string) => void;
}) {
  const t = useTranslations("serata");
  const tk = useTranslations("kind");
  const side = (m: MediaSummary | null) => m && (
    <button type="button" onClick={() => onPick(m.id)} disabled={pending} aria-pressed={bracket.myPick === m.id}
      className="grid min-w-0 content-start gap-3 text-left transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-px disabled:cursor-wait motion-reduce:transition-none">
      <span className="relative block">
        <Poster media={m} size="lg" priority />
        {/* My choice: a 2px amber edge on the print. */}
        {bracket.myPick === m.id && <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-accent" />}
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="title text-2xl">{m.title}</span>
        <span className="text-sm text-muted">{tk(m.kind)}{m.year ? `, ${m.year}` : ""}</span>
      </span>
    </button>
  );
  return (
    <section className="grid gap-4">
      <p className="text-ink-2">{bracket.myPick ? t("pickedWait") : t("pick")}</p>
      {/* The matchup: two prints as wide as the phone allows. The "vs" sits on the seam, at half the height of a poster. */}
      <div className="relative grid grid-cols-2 items-start gap-3 [container-type:inline-size]">
        {side(bracket.a)}
        <span className="pointer-events-none absolute left-1/2 top-[calc(37.5cqw-4.5px)] z-10 -translate-x-1/2 -translate-y-1/2 bg-paper px-2 py-1 font-display text-xl">{t("vs")}</span>
        {side(bracket.b)}
      </div>
    </section>
  );
}

function TableVote({ candidates, mine, pending, onSubmit }: {
  candidates: MediaSummary[]; mine: { dots: Record<string, number>; veto: string | null } | null; pending: boolean;
  onSubmit: (dots: Record<string, number>, veto: string | null) => void;
}) {
  const t = useTranslations("serata.table");
  const [dots, setDots] = useState<Record<string, number>>(mine?.dots ?? {});
  const [veto, setVeto] = useState<string | null>(mine?.veto ?? null);
  const [editing, setEditing] = useState(!mine);
  const spent = Object.values(dots).reduce((a, b) => a + b, 0);
  const left = DOTS - spent;
  const bump = (id: string, d: number) => setDots((cur) => ({ ...cur, [id]: Math.max(0, (cur[id] ?? 0) + d) }));

  if (!editing && mine) {
    return (
      <section className="well grained grid gap-3 p-5">
        <p className="title text-2xl">{t("done")}</p>
        <button type="button" onClick={() => setEditing(true)} className="link min-h-11 w-fit text-sm">{t("change")}</button>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <p className="text-ink-2">{t("hint", { dots: DOTS })}</p>
      <p className="title tabular text-2xl" aria-live="polite">{t("left", { count: left })}</p>
      <ul className="rows grid">
        {candidates.map((m) => {
          const n = dots[m.id] ?? 0;
          const vetoed = veto === m.id;
          return (
            <li key={m.id} className={`grid grid-cols-[56px_minmax(0,1fr)] gap-3 py-3 ${vetoed ? "opacity-60" : ""}`}>
              <Poster media={m} size="sm" />
              <div className="grid min-w-0 content-between gap-2">
                <p className={`title truncate text-xl ${vetoed ? "line-through" : ""}`}>{m.title}</p>
                <div className="flex items-center justify-between gap-2">
                  {/* Votes placed on this title: amber squares, the empty ones in the rule colour. */}
                  <p aria-hidden="true" className="flex gap-1">
                    {Array.from({ length: Math.max(DOTS, n) }, (_, i) => (
                      <i key={i} className={`block size-2.5 ${i < n ? "bg-accent" : "bg-rule"}`} />
                    ))}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => bump(m.id, -1)} disabled={n === 0} aria-label={t("remove", { title: m.title })}
                      className="btn btn-quiet w-11 px-0">
                      <Minus size={18} strokeWidth={1.6} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => bump(m.id, 1)} disabled={left === 0} aria-label={t("add", { title: m.title })}
                      className="btn btn-quiet w-11 px-0">
                      <Plus size={18} strokeWidth={1.6} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setVeto(vetoed ? null : m.id)} aria-pressed={vetoed}
                      className={`btn btn-quiet ml-1 px-3 ${vetoed ? "border-accent text-accent" : ""}`}>
                      {t("veto")}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" disabled={left !== 0 || pending} onClick={() => { onSubmit(dots, veto); setEditing(false); }}
        className="btn btn-primary min-h-12 w-full">
        {t("submit")}
      </button>
    </section>
  );
}

function Result({ view, meId, isGuest, google }: { view: RoomView; meId: string; isGuest: boolean; google: boolean }) {
  const t = useTranslations("serata");
  const tr = useTranslations("serata.result");
  const locale = useLocale();
  const format = useFormatter();
  const result = view.result!;
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  // Fetch the story PNG ahead of the tap: Safari only allows share() straight from a user gesture.
  useEffect(() => {
    fetch(`/api/serata/${view.code}/card?locale=${locale}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => b && setFile(new File([b], `pausa-${view.code}.png`, { type: "image/png" })))
      .catch(() => {});
  }, [view.code, locale]);

  const cardUrl = typeof window === "undefined" ? "" : `${location.origin}/${locale}/s/${view.code}/card`;
  async function share() {
    const text = tr("shareText", { title: result.winner.title });
    try {
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); void trackEvent("card_shared", view.code); return; }
      if (navigator.share) { await navigator.share({ title: "Pausa", text, url: cardUrl }); void trackEvent("card_shared", view.code); return; }
    } catch { return; }
    void trackEvent("card_shared", view.code);
    await navigator.clipboard.writeText(cardUrl).catch(() => {});
    setCopied(true);
  }

  const withIds = view.participants.filter((p) => !p.isGuest && p.id !== meId).map((p) => p.id);
  const lines = [
    [result.circle?.name, format.dateTime(new Date(result.finishedAt), { day: "numeric", month: "short" })].filter(Boolean).join(", "),
    [t(`mode.${view.mode}`), view.mode === "bracket" ? tr("rounds", { count: result.rounds }) : null, tr("people", { count: result.voters })].filter(Boolean).join(", "),
  ];

  return (
    <section className="grid gap-6">
      {/* The winner: the print as tall as the phone allows while its title stays in view. */}
      <div className="grid gap-4">
        <p className="text-sm text-muted">{tr("kicker")}</p>
        <Poster media={result.winner} size="hero" priority className="mx-auto w-[min(100%,38dvh)]" />
        <div className="grid min-w-0 gap-2">
          <h2 className="display">{result.winner.title}</h2>
          <p className="subtitle">{tr("subtitle")}</p>
        </div>
        <ul className="rows grid text-sm text-ink-2">
          {lines.map((l) => <li key={l} className="tabular py-2.5">{l}</li>)}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={share} className="btn btn-primary min-h-12 whitespace-normal px-3 text-center">
          {copied ? tr("copied") : tr("share")}
        </button>
        {!isGuest && view.circleId ? (
          <Link href={`/c/${view.circleId}/log?media=${result.winner.id}${withIds.map((id) => `&with=${id}`).join("")}`}
            className="btn min-h-12 whitespace-normal px-3 text-center">
            {tr("log")}
          </Link>
        ) : (
          <a href={cardUrl} className="btn min-h-12 whitespace-normal px-3 text-center">
            {tr("open")}
          </a>
        )}
      </div>

      {result.scores && (
        <section className="grid gap-3">
          <h2 className="title text-xl">{tr("scores")}</h2>
          <ol className="rows grid">
            {result.scores.map((s) => (
              <li key={s.media.id} className="flex min-h-11 items-center gap-3">
                <span className={`min-w-0 flex-1 truncate ${s.vetoed ? "text-muted line-through" : ""}`}>{s.media.title}</span>
                {s.vetoed && <span className="tag shrink-0">{tr("vetoed")}</span>}
                <span className="tabular shrink-0 text-sm text-muted">{tr("dots", { count: s.dots })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {isGuest && (
        <section className="well grained grid gap-4 p-5">
          <h2 className="title">{tr("saveTitle")}</h2>
          <p className="text-ink-2">{tr("saveBody")}</p>
          <GoogleButton callbackURL={`/${locale}/s/${view.code}`} enabled={google} />
          {sent ? (
            <p role="status" className="text-ink">{tr("saveSent")}</p>
          ) : (
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await authClient.signIn.magicLink({ email, callbackURL: `/${locale}/s/${view.code}` });
              if (!error) setSent(true);
            }}>
              <label htmlFor="save-email" className="sr-only">Email</label>
              <input id="save-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="Email"
                className="field flex-1" />
              <button className="btn shrink-0">{tr("saveCta")}</button>
            </form>
          )}
          {result.circle && (
            <Link href={`/join/${result.circle.inviteCode}`} className="link inline-flex min-h-11 w-fit items-center text-sm">
              {tr("joinCircle", { name: result.circle.name })}
            </Link>
          )}
        </section>
      )}

      {!isGuest && view.circleId && (
        <Link href={`/c/${view.circleId}`} className="link inline-flex min-h-11 items-center justify-self-center text-sm">{tr("backToCircle")}</Link>
      )}
    </section>
  );
}
