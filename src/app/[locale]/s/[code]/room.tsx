"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { forceAdvance, startSerata, submitBallot, tick, voteBracket } from "@/lib/serata/actions";
import { trackEvent } from "@/lib/events";
import { DOTS, MATCH_MS, TABLE_MS } from "@/lib/serata/engine";
import type { RoomView } from "@/lib/serata/server";
import type { MediaSummary } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { Poster } from "@/components/poster";
import { SerataCard } from "@/components/serata-card";

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

export function SerataRoom({ initial, meId, isGuest }: { initial: RoomView; meId: string; isGuest: boolean }) {
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
    <main className="projector mx-auto grid min-h-dvh max-w-md content-start gap-5 px-4 pb-10 pt-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-accent">Pausa · {t(`mode.${view.mode}`)}</p>
          <h1 className="mt-1 font-display text-[1.75rem] font-semibold leading-tight">{t("title")}</h1>
          {view.status === "voting" && view.bracket && (
            <p className="tabular mt-1 text-[13px] text-muted">
              {t(`round.${view.bracket.round}`)} · {t("match", { n: Math.min(view.bracket.progress.done + 1, view.bracket.progress.total), total: view.bracket.progress.total })}
            </p>
          )}
        </div>
        {view.status === "voting" && deadline && <Timer left={left} total={total} />}
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
      {view.status === "done" && view.result && <Result view={view} meId={meId} isGuest={isGuest} />}

      {view.status !== "done" && (
        <section className="grid gap-2 rounded-md bg-paper-2 p-3" aria-live="polite">
          <h2 className="text-xs text-muted">{t("inRoom", { count: view.participants.length })}</h2>
          <ul className="grid gap-1.5">
            {view.participants.map((p) => (
              <li key={p.id} className="flex min-h-7 items-center gap-2 text-[13px]">
                <Avatar user={p} size={24} />
                <span className="truncate">{p.name}</span>
                {p.isGuest && <span className="rounded-full border border-rule px-1.5 text-[10px] text-muted">{t("guest")}</span>}
                {view.status === "voting" && (
                  <span className={`ml-auto shrink-0 text-xs ${p.voted ? "text-second-text" : "text-muted"}`}>
                    {p.voted ? `✓ ${t("voted")}` : t("choosing")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {view.status === "voting" && view.isHost && (
            <button type="button" disabled={pending} onClick={() => run(() => forceAdvance(view.code))}
              className="mt-1 min-h-10 justify-self-end rounded-full border border-rule px-4 text-sm text-muted hover:text-ink disabled:opacity-50">
              {t("advance")} →
            </button>
          )}
        </section>
      )}
    </main>
  );
}

/* ───────────── pieces ───────────── */

function Timer({ left, total }: { left: number; total: number }) {
  const r = 19;
  const c = 2 * Math.PI * r;
  const s = Math.ceil(left / 1000);
  return (
    <span className="relative grid size-12 shrink-0 place-items-center" role="timer" aria-label={`${s}s`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-rule)" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, left / total))} className="transition-[stroke-dashoffset] duration-200 ease-linear" />
      </svg>
      <span className="tabular text-xs font-semibold">{`0:${String(s).padStart(2, "0")}`}</span>
    </span>
  );
}

function BracketBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={`h-1 flex-1 rounded-full ${i < done ? "bg-second" : i === done ? "bg-accent" : "bg-rule"}`} />
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
      <section className="grid gap-3 rounded-md bg-second-deep p-4 text-on-second">
        <p className="text-sm text-on-second-muted">{t("invite")}</p>
        <p className="tabular font-display text-2xl font-semibold tracking-[0.12em]">{view.code}</p>
        <button type="button" onClick={share} className="min-h-11 w-fit rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">
          {copied ? t("copied") : t("share")}
        </button>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xs text-muted">{t("rosa", { count: view.candidates.length })}</h2>
        <ul className="grid grid-cols-4 gap-2">
          {view.candidates.map((m) => (
            <li key={m.id} className="grid gap-1">
              <Poster media={m} size="sm" />
              <span className="line-clamp-2 text-[11px] leading-tight">{m.title}</span>
            </li>
          ))}
        </ul>
      </section>

      {view.isHost ? (
        <button type="button" disabled={pending} onClick={onStart}
          className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {t("start")}
        </button>
      ) : (
        <p className="text-center text-sm text-muted">{t("wait", { name: host })}</p>
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
      className={`grid gap-2 rounded-sm border-2 p-0 text-left transition-[transform,border-color] duration-150 hover:-translate-y-0.5 disabled:cursor-wait ${
        bracket.myPick === m.id ? "border-accent" : "border-transparent"}`}>
      <Poster media={m} size="md" />
      <span className="px-1 pb-1.5">
        <span className="block text-sm font-semibold leading-tight">{m.title}</span>
        <span className="text-xs text-muted">{tk(m.kind)}{m.year ? ` · ${m.year}` : ""}</span>
      </span>
    </button>
  );
  return (
    <section className="grid gap-3">
      <p className="text-sm text-muted">{bracket.myPick ? t("pickedWait") : t("pick")}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        {side(bracket.a)}
        <span className="self-center font-display text-sm text-muted">{t("vs")}</span>
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
      <section className="grid gap-3 rounded-md border border-dashed border-rule p-4">
        <p className="font-semibold">{t("done")}</p>
        <button type="button" onClick={() => setEditing(true)} className="min-h-10 w-fit text-sm text-muted underline-offset-4 hover:text-ink hover:underline">{t("change")}</button>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <p className="text-sm text-muted">{t("hint", { dots: DOTS })}</p>
      <p className="tabular text-sm font-semibold" aria-live="polite">{t("left", { count: left })}</p>
      <ul className="grid gap-2">
        {candidates.map((m) => {
          const n = dots[m.id] ?? 0;
          const vetoed = veto === m.id;
          return (
            <li key={m.id} className={`flex items-center gap-3 rounded-md bg-paper-2 p-2 ${vetoed ? "opacity-60" : ""}`}>
              <Poster media={m} size="sm" className="w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${vetoed ? "line-through" : ""}`}>{m.title}</p>
                <p aria-hidden="true" className="tracking-[0.2em] text-accent">{"●".repeat(n)}<span className="text-rule">{"●".repeat(Math.max(0, DOTS - n))}</span></p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => bump(m.id, -1)} disabled={n === 0} aria-label={t("remove", { title: m.title })}
                  className="grid size-9 place-items-center rounded-full border border-rule text-lg disabled:opacity-30">−</button>
                <button type="button" onClick={() => bump(m.id, 1)} disabled={left === 0} aria-label={t("add", { title: m.title })}
                  className="grid size-9 place-items-center rounded-full border border-rule text-lg disabled:opacity-30">+</button>
                <button type="button" onClick={() => setVeto(vetoed ? null : m.id)} aria-pressed={vetoed}
                  className={`ml-1 min-h-9 rounded-full border px-2.5 text-xs ${vetoed ? "border-accent text-accent" : "border-rule text-muted"}`}>
                  {t("veto")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" disabled={left !== 0 || pending} onClick={() => { onSubmit(dots, veto); setEditing(false); }}
        className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
        {t("submit")}
      </button>
    </section>
  );
}

function Result({ view, meId, isGuest }: { view: RoomView; meId: string; isGuest: boolean }) {
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
    [result.circle?.name, format.dateTime(new Date(result.finishedAt), { day: "numeric", month: "short" })].filter(Boolean).join(" · "),
    [t(`mode.${view.mode}`), view.mode === "bracket" ? tr("rounds", { count: result.rounds }) : null, tr("people", { count: result.voters })].filter(Boolean).join(" · "),
  ];

  return (
    <section className="grid gap-4">
      <SerataCard kicker={tr("kicker")} subtitle={tr("subtitle")} title={result.winner.title} posterPath={result.winner.posterPath} lines={lines} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={share} className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover">
          {copied ? tr("copied") : tr("share")}
        </button>
        {!isGuest && view.circleId ? (
          <Link href={`/c/${view.circleId}/log?media=${result.winner.id}${withIds.map((id) => `&with=${id}`).join("")}`}
            className="grid min-h-12 place-items-center rounded-full border border-rule bg-paper-3 px-3 text-center text-sm font-semibold hover:bg-rule">
            {tr("log")}
          </Link>
        ) : (
          <a href={cardUrl} className="grid min-h-12 place-items-center rounded-full border border-rule bg-paper-3 px-3 text-center text-sm font-semibold hover:bg-rule">
            {tr("open")}
          </a>
        )}
      </div>

      {result.scores && (
        <section className="grid gap-2">
          <h2 className="text-xs text-muted">{tr("scores")}</h2>
          <ol className="grid gap-1">
            {result.scores.map((s) => (
              <li key={s.media.id} className="flex min-h-9 items-center gap-3 border-b border-rule text-sm">
                <span className={`min-w-0 flex-1 truncate ${s.vetoed ? "text-muted line-through" : ""}`}>{s.media.title}</span>
                {s.vetoed && <span className="text-xs text-accent">{tr("vetoed")}</span>}
                <span className="tabular text-xs text-muted">{tr("dots", { count: s.dots })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {isGuest && (
        <section className="grid gap-3 rounded-md bg-paper-2 p-4">
          <h2 className="font-display text-lg font-semibold">{tr("saveTitle")}</h2>
          <p className="text-sm text-muted">{tr("saveBody")}</p>
          {sent ? (
            <p role="status" className="text-sm text-second-text">{tr("saveSent")}</p>
          ) : (
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await authClient.signIn.magicLink({ email, callbackURL: `/${locale}/s/${view.code}` });
              if (!error) setSent(true);
            }}>
              <label htmlFor="save-email" className="sr-only">Email</label>
              <input id="save-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="Email"
                className="min-h-11 min-w-0 flex-1 rounded-sm border border-rule bg-paper px-3" />
              <button className="min-h-11 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">{tr("saveCta")}</button>
            </form>
          )}
          {result.circle && (
            <Link href={`/join/${result.circle.inviteCode}`} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
              {tr("joinCircle", { name: result.circle.name })}
            </Link>
          )}
        </section>
      )}

      {!isGuest && view.circleId && (
        <Link href={`/c/${view.circleId}`} className="text-center text-sm text-muted hover:text-ink">← {tr("backToCircle")}</Link>
      )}
    </section>
  );
}
