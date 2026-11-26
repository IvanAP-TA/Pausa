import type { ImportBatchDto } from "@pausa/api-types";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { ApiFailure, errorMessage } from "@/api/errors";
import { importApi } from "@/api/import";
import { RequireSession, useMe } from "@/features/session";
import { useI18n, type MessageKey } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Field } from "@/ui/Field";
import { ProgressBar } from "@/ui/ProgressBar";
import { Row, RowList } from "@/ui/Row";
import { Screen } from "@/ui/Screen";
import { ErrorState, Loading, Notice } from "@/ui/Status";
import { Heading, Text } from "@/ui/Text";
import { TextLink } from "@/ui/TextLink";
import { Toggle } from "@/ui/Toggle";
import "./import.messages";
import { anilistRows, jikanRows, type ImportRow } from "./parsers";
import { assertSomething, fetchAniList, fetchJikan, ImportReadError, parseFiles, type FileSource, type Parsed, type Picked, type ReadProblem } from "./parsers/read";
import { DropZone } from "./DropZone";
import { pickFiles } from "./picker";
import { runImport, type Progress, type RunResult, type Totals } from "./runner";

const SOURCES = ["letterboxd", "imdb", "trakt", "cinemaniac", "anilist", "mal"] as const;
type Source = (typeof SOURCES)[number];
const PRIVATE = "private";

const ACCEPT: Record<FileSource, { types: string[]; multiple: boolean }> = {
  letterboxd: { types: [".zip", ".csv", "application/zip", "text/csv"], multiple: true },
  imdb: { types: [".csv", "text/csv"], multiple: false },
  trakt: { types: [".zip", ".json", "application/zip", "application/json"], multiple: true },
  cinemaniac: { types: [".bak", ".json", "application/json", "application/octet-stream"], multiple: false },
  mal: { types: [".xml", ".gz", "application/xml", "application/gzip", "text/xml"], multiple: false },
};

function SourceTabs({ source, onChange, disabled }: { source: Source; onChange: (s: Source) => void; disabled: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <View role="tablist" aria-label={t("importApp.source")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {SOURCES.map((s) => {
        const on = s === source;
        return (
          <Pressable
            key={s}
            role="tab"
            aria-selected={on}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            onPress={() => onChange(s)}
            testID={`tab-${s}`}
            style={[{ minHeight: control, paddingHorizontal: space.md, justifyContent: "center", borderWidth: hair, borderColor: on ? c.accent : c.rule, backgroundColor: on ? c.paper3 : "transparent", opacity: disabled && !on ? 0.5 : 1 }, web({ cursor: "pointer" })]}
          >
            <Text variant={on ? "strong" : "body"} tone={on ? "ink" : "ink2"}>{t(`import.tabs.${s}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Steps({ source }: { source: Source }) {
  const { raw } = useI18n();
  const { c } = useTheme();
  const steps = raw<unknown>(`import.${source}.steps`);
  const list = (Array.isArray(steps) ? steps : steps && typeof steps === "object" ? Object.values(steps) : []).filter((x): x is string => typeof x === "string");
  if (list.length === 0) return null;
  return (
    <View role="list" style={{ gap: space.xs }}>
      {list.map((s, i) => (
        <View key={i} role="listitem" style={{ flexDirection: "row", gap: space.sm }}>
          <Text tone="muted" style={{ width: 22 }} aria-hidden>{i + 1}.</Text>
          <Text tone="ink2" style={{ flex: 1 }}>{s}</Text>
        </View>
      ))}
      <View style={{ height: hair, backgroundColor: c.rule }} />
    </View>
  );
}

const READ_KEYS: Record<ReadProblem, MessageKey> = {
  read: "import.errors.read",
  empty: "import.errors.empty",
  imdbFormat: "import.errors.imdbFormat",
  imdbZip: "import.errors.imdbZip",
  traktFormat: "import.errors.traktFormat",
  traktJson: "import.errors.traktJson",
  letterboxdFormat: "import.errors.letterboxdFormat",
  cinemaniacFormat: "import.errors.cinemaniacFormat",
  anilistNotFound: "import.errors.anilistNotFound",
  anilistDown: "import.errors.anilistDown",
  malNotFound: "import.errors.malNotFound",
  malDown: "import.errors.malDown",
};

type Phase =
  | { kind: "pick" }
  | { kind: "reading" }
  | { kind: "summary"; parsed: Parsed; resume: ImportBatchDto | null }
  | { kind: "running"; progress: Progress }
  | { kind: "ended"; result: RunResult; batchId: string; circleId: string | null; imported: number; parsed: Parsed };

function Impl() {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const me = useMe();
  const [source, setSource] = useState<Source>("letterboxd");
  const [malMode, setMalMode] = useState<"user" | "file">("user");
  const [username, setUsername] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [problem, setProblem] = useState<ReadProblem | null>(null);
  const [startError, setStartError] = useState<unknown>(null);
  const [dest, setDest] = useState<string>(PRIVATE);
  const [withLists, setWithLists] = useState(true);
  const [reviews, setReviews] = useState(true);
  const [undated, setUndated] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false);
  const alive = useRef(true);
  const [open, setOpen] = useState<ImportBatchDto[] | null>(null);
  const [tmdb, setTmdb] = useState<boolean | null>(null);

  useEffect(() => {
    alive.current = true;
    importApi.list().then(
      (all) => alive.current && setOpen(all.filter((b) => b.status === "running")),
      () => alive.current && setOpen([]),
    );
    importApi.config().then(
      (cfg) => alive.current && setTmdb(cfg.tmdb),
      () => undefined,
    );
    return () => {
      alive.current = false;
    };
  }, []);

  const reset = () => {
    setPhase({ kind: "pick" });
    setProblem(null);
    setStartError(null);
    setTotals(null);
    setStopping(false);
  };
  const choose = (s: Source) => {
    if (phase.kind === "running" || phase.kind === "reading") return;
    setSource(s);
    reset();
  };

  /** Parses, then looks on the server for an unfinished import of the same source and size: that one is resumed, not started again. */
  async function load(task: () => Promise<Parsed>) {
    reset();
    setPhase({ kind: "reading" });
    try {
      const parsed = assertSomething(await task());
      let resume: ImportBatchDto | null = null;
      try {
        const running = (await importApi.list()).filter((b) => b.status === "running" && b.source === source && b.total === parsed.rows.length && b.cursor > 0);
        resume = running[0] ?? null;
      } catch {
        // offline: a fresh import is still possible
      }
      if (resume) setDest(resume.circleId ?? PRIVATE);
      setPhase({ kind: "summary", parsed, resume });
    } catch (e) {
      setProblem(e instanceof ImportReadError ? e.problem : "read");
      setPhase({ kind: "pick" });
    }
  }

  const pickOrCancel = async (s: FileSource) => {
    // A cancelled dialog is not an error: stay where we were.
    reset();
    setPhase({ kind: "reading" });
    try {
      const files = await pickFiles(ACCEPT[s].types, ACCEPT[s].multiple);
      if (files.length === 0) {
        setPhase({ kind: "pick" });
        return;
      }
      await load(async () => parseFiles(s, files));
    } catch {
      setProblem("read");
      setPhase({ kind: "pick" });
    }
  };

  /** Files dropped on the zone (web): the same path as the picker. */
  const dropped = (s: FileSource, files: Picked[]) => {
    if (phase.kind !== "pick") return;
    const use = ACCEPT[s].multiple ? files : files.slice(0, 1);
    void load(async () => parseFiles(s, use));
  };

  const fromUser = () =>
    load(async () => {
      const name = username.trim();
      if (source === "anilist") {
        const { rows, undated: u } = anilistRows(await fetchAniList(name));
        return { rows, undated: u };
      }
      const { rows, undated: u } = jikanRows(await fetchJikan(name));
      return { rows, undated: u };
    });

  async function run(parsed: Parsed, resume: ImportBatchDto | null) {
    stop.current = false;
    setStopping(false);
    setStartError(null);
    const lists = withLists ? parsed.lists ?? [] : [];
    const listRows = lists.reduce((n, l) => n + l.rows.length, 0);
    setPhase({ kind: "running", progress: { done: 0, total: parsed.rows.length + listRows } });
    let batchId: string;
    let startAt = 0;
    let circleId: string | null = dest === PRIVATE ? null : dest;
    try {
      if (resume) {
        const st = await importApi.status(resume.id);
        batchId = st.id;
        startAt = st.cursor;
        circleId = st.circleId;
      } else {
        batchId = (await importApi.start({ source, circleId, total: parsed.rows.length })).id;
      }
    } catch (e) {
      setStartError(e);
      setPhase({ kind: "summary", parsed, resume });
      return;
    }
    const result = await runImport({
      batchId,
      rows: parsed.rows as ImportRow[],
      lists,
      startAt,
      includeReviews: reviews,
      includeUndated: undated,
      locale,
      api: { rows: (id, input) => importApi.rows(id, input), lists: (id, input) => importApi.lists(id, input), finish: (id) => importApi.finish(id) },
      shouldStop: () => stop.current,
      onProgress: (progress, tot) => {
        if (!alive.current) return;
        setTotals({ ...tot });
        setPhase((p) => (p.kind === "running" ? { kind: "running", progress } : p));
      },
    });
    if (!alive.current) return;
    setTotals(result.totals);
    // Where the person lands: the server's own count (this run only added what this run did; `imported` of the whole batch is on the manage page).
    setPhase({ kind: "ended", result, batchId, circleId, imported: result.totals.imported, parsed });
  }

  const circles = me.circles;
  const destCircle = circles.find((x) => x.id === dest) ?? null;
  const listItems = (p: Parsed) => (p.lists ?? []).reduce((n, l) => n + l.rows.length, 0);

  return (
    <Screen>
      <BackLink to={href("/me")} label={t("common.back")} />
      <Heading level={1}>{t("import.title")}</Heading>
      <Text variant="lead" tone="ink2">{t("import.lede")}</Text>
      <Text variant="small" tone="muted">{t("import.visibility")}</Text>

      {open && open.length > 0 && phase.kind === "pick" ? (
        <View role="status" style={{ borderWidth: hair, borderColor: c.rule, padding: space.sm, gap: space["2xs"] }} testID="open-imports">
          {open.map((b) => (
            <Text key={b.id} variant="small" tone="ink2">
              {t("importApp.openBanner", { source: t(`import.tabs.${b.source as Source}`), done: b.cursor, total: b.total ?? b.cursor })}
            </Text>
          ))}
        </View>
      ) : null}

      <SourceTabs source={source} onChange={choose} disabled={phase.kind === "running" || phase.kind === "reading"} />

      {(phase.kind === "pick" || phase.kind === "reading") && (
        <View style={{ gap: space.md }}>
          <Heading level={2} style={{ fontSize: 28, lineHeight: 32 }}>{t(`import.${source}.title`)}</Heading>
          {source === "anilist" ? <Text tone="ink2">{t("import.anilist.body")}</Text> : null}
          {source === "mal" ? (
            <Choice label={t("import.mal.mode")} value={malMode} options={[{ value: "user", label: t("import.mal.mode_user") }, { value: "file", label: t("import.mal.mode_file") }]} onChange={(m) => { setMalMode(m); reset(); }} />
          ) : null}
          {source === "mal" && malMode === "user" ? <Text tone="ink2">{t("import.mal.userBody")}</Text> : source !== "anilist" ? <Steps source={source} /> : null}
          {source === "letterboxd" && tmdb === false ? <Text variant="small" tone="muted" testID="no-covers">{t("import.letterboxd.noCovers")}</Text> : null}
          {source === "cinemaniac" ? <Text variant="small" tone="muted">{t("import.cinemaniac.dates")}</Text> : null}

          {source === "anilist" || (source === "mal" && malMode === "user") ? (
            <View style={{ gap: space.sm }}>
              <Field label={source === "anilist" ? t("import.anilist.user") : t("import.mal.user")} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={fromUser} testID="username" />
              <Button label={t("import.anilist.find")} onPress={fromUser} busy={phase.kind === "reading"} disabled={!username.trim()} testID="find" />
            </View>
          ) : (
            <DropZone onFiles={(files) => dropped(source === "mal" ? "mal" : (source as FileSource), files)} disabled={phase.kind !== "pick"}>
              <Button label={t(source === "mal" ? "import.mal.pick" : (`import.${source}.pick` as MessageKey))} onPress={() => pickOrCancel(source === "mal" ? "mal" : (source as FileSource))} busy={phase.kind === "reading"} testID="pick-file" />
              {Platform.OS === "web" ? <Text variant="small" tone="muted">{t("importApp.drop")}</Text> : null}
            </DropZone>
          )}
          {phase.kind === "reading" ? <Text variant="small" tone="muted" role="status">{t("import.reading")}</Text> : null}
          {problem ? <Text role="alert" tone="error" testID="read-error">{t(READ_KEYS[problem])}</Text> : null}
        </View>
      )}

      {phase.kind === "summary" ? (
        <View style={{ gap: space.lg }} testID="summary">
          <View style={{ gap: space["2xs"] }}>
            {phase.parsed.rows.length > 0 ? (
              <Text variant="strong" style={{ fontSize: 22, lineHeight: 28 }} testID="found">
                {phase.parsed.films !== undefined
                  ? t("import.found.films", { films: phase.parsed.films, views: phase.parsed.rows.length })
                  : phase.parsed.titles
                    ? t("import.found.titles", { count: phase.parsed.rows.length })
                    : t("import.found.anime", { count: phase.parsed.rows.length })}
              </Text>
            ) : null}
            {phase.parsed.skipped && phase.parsed.skipped.watching + phase.parsed.skipped.planned + phase.parsed.skipped.onHold + phase.parsed.skipped.dropped > 0 ? (
              <Text variant="small" tone="muted">{t("import.found.skipped", phase.parsed.skipped)}</Text>
            ) : null}
            {phase.parsed.imdbSkipped && phase.parsed.imdbSkipped.episodes + phase.parsed.imdbSkipped.other > 0 ? (
              <Text variant="small" tone="muted">{t("import.found.imdbSkipped", phase.parsed.imdbSkipped)}</Text>
            ) : null}
          </View>

          {phase.resume ? (
            <View role="status" style={{ borderWidth: hair, borderColor: c.accent, padding: space.sm, gap: space.xs }} testID="resume-banner">
              <Text variant="strong">{t("importApp.resumeFound", { done: phase.resume.cursor, total: phase.resume.total ?? phase.parsed.rows.length })}</Text>
              <Text variant="small" tone="ink2">{phase.resume.circleName ? t("importApp.resumeIntoCircle", { circle: phase.resume.circleName }) : t("importApp.resumePrivate")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                <Button label={t("importApp.resumeCta", { done: phase.resume.cursor })} onPress={() => run(phase.parsed, phase.resume)} testID="resume" />
                <Button label={t("importApp.restartCta")} variant="quiet" onPress={() => { const r = phase.resume; if (r) void importApi.finish(r.id, { cancel: true }).catch(() => undefined); setPhase({ kind: "summary", parsed: phase.parsed, resume: null }); setDest(PRIVATE); }} />
              </View>
            </View>
          ) : null}

          <View role="radiogroup" aria-label={t("import.dest.legend")} style={{ gap: space["2xs"] }}>
            <Text variant="strong">{t("import.dest.legend")}</Text>
            <View style={{ borderTopWidth: hair, borderColor: c.rule }}>
              {[{ id: PRIVATE, label: t("import.dest.private"), hint: t("import.dest.privateHint") }, ...circles.map((x) => ({ id: x.id, label: t("import.dest.circle", { circle: x.name }), hint: t("import.dest.circleHint") }))].map((o) => (
                <Row key={o.id} onPress={() => !phase.resume && setDest(o.id)} disabled={!!phase.resume && phase.resume.circleId !== (o.id === PRIVATE ? null : o.id)} testID={`dest-${o.id === PRIVATE ? "private" : o.id}`} radio={{ checked: dest === o.id }} style={{ alignItems: "flex-start" }}>
                  <View aria-hidden style={{ width: 22, height: 22, marginTop: 2, borderWidth: 2, borderColor: dest === o.id ? c.accent : c.muted, alignItems: "center", justifyContent: "center", borderRadius: 11 }}>
                    {dest === o.id ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text>{o.label}</Text>
                    <Text variant="small" tone="muted">{o.hint}</Text>
                  </View>
                </Row>
              ))}
            </View>
            {destCircle ? (
              <View role="alert" style={{ backgroundColor: c.paper2, padding: space.sm }} testID="dest-warning">
                <Text variant="small" tone="ink2">{t("import.dest.warning", { count: phase.parsed.rows.length + (withLists ? listItems(phase.parsed) : 0), circle: destCircle.name })}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: space.xs }}>
            {phase.parsed.lists && phase.parsed.lists.length > 0 ? (
              <View>
                <Toggle label={t("import.lists.include", { count: phase.parsed.lists.length, items: listItems(phase.parsed) })} hint={phase.parsed.lists.map((l) => l.name).join(", ")} value={withLists} onChange={setWithLists} testID="opt-lists" />
                {withLists ? <Text variant="small" tone="muted">{destCircle ? t("import.lists.scope_group") : t("import.lists.scope_personal")}</Text> : null}
              </View>
            ) : null}
            {phase.parsed.rows.length > 0 ? <Toggle label={t("import.options.reviews")} value={reviews} onChange={setReviews} testID="opt-reviews" /> : null}
            {phase.parsed.undated > 0 ? <Toggle label={t("import.options.undated", { count: phase.parsed.undated })} hint={t("import.options.undatedHint")} value={undated} onChange={setUndated} testID="opt-undated" /> : null}
          </View>

          {startError ? <Text role="alert" tone="error">{startError instanceof ApiFailure && startError.code === "rate_limited" ? t("import.errors.limit") : errorMessage(t, startError)}</Text> : null}
          {!phase.resume ? (
            <Button
              label={phase.parsed.rows.length === 0 ? t("import.lists.run", { count: listItems(phase.parsed) }) : t("import.run", { count: phase.parsed.rows.length + (withLists ? listItems(phase.parsed) : 0) })}
              onPress={() => run(phase.parsed, null)}
              disabled={phase.parsed.rows.length === 0 && !withLists}
              fullWidth
              testID="run"
            />
          ) : null}
          <Button label={t("app.cancel")} variant="quiet" onPress={reset} />
        </View>
      ) : null}

      {phase.kind === "running" ? (
        <View style={{ gap: space.md }} testID="running">
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
            <Text aria-hidden style={{ fontSize: 56, lineHeight: 60, fontFamily: "SofiaSansExtraCondensed_200" }} testID="done-number">{phase.progress.done}</Text>
            <Text variant="small" tone="muted" role="status" testID="progress-text">{t("import.progress", { done: phase.progress.done, total: phase.progress.total })}</Text>
          </View>
          <ProgressBar value={phase.progress.done} max={phase.progress.total} label={t("import.progress", { done: phase.progress.done, total: phase.progress.total })} />
          <Button label={stopping ? t("importApp.stopping") : t("importApp.stop")} variant="secondary" disabled={stopping} onPress={() => { stop.current = true; setStopping(true); }} testID="stop" />
          <Text variant="small" tone="muted">{t("importApp.keepOpen")}</Text>
        </View>
      ) : null}

      {phase.kind === "ended" ? <Ended phase={phase} totals={totals} onAgain={reset} onResume={() => { const p = phase; void importApi.status(p.batchId).then((b) => run(p.parsed, b)).catch((e) => setStartError(e)); }} circleName={circles.find((x) => x.id === phase.circleId)?.name ?? null} /> : null}
      {startError && phase.kind === "ended" ? <ErrorState error={startError} /> : null}
      {phase.kind === "reading" ? <Loading rows={1} /> : null}
    </Screen>
  );
}

function Ended({ phase, totals, onAgain, onResume, circleName }: { phase: Extract<Phase, { kind: "ended" }>; totals: Totals | null; onAgain: () => void; onResume: () => void; circleName: string | null }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const r = phase.result;
  const tot = totals ?? r.totals;
  const lines: Array<{ key: string; n: number; text: string; strong?: boolean }> = [];
  if (tot.lists > 0) lines.push({ key: "lists", n: tot.lists, text: t("import.done.lists", { count: tot.lists, items: tot.listItems }) });
  if (tot.newTitles > 0) lines.push({ key: "new", n: tot.newTitles, text: t("import.done.newTitles", { count: tot.newTitles }) });
  if (tot.already > 0) lines.push({ key: "already", n: tot.already, text: t("import.done.alreadyHad", { count: tot.already }) });
  if (tot.skippedUndated > 0) lines.push({ key: "undated", n: tot.skippedUndated, text: t("import.done.undated", { count: tot.skippedUndated }) });
  if (r.rejected.length > 0) lines.push({ key: "rejected", n: r.rejected.length, text: t("import.done.failed", { count: r.rejected.length }), strong: true });
  const label = (line: string) => line.replace(/^[\d.,'\s  ]+/, "");
  const head =
    r.status === "done"
      ? tot.imported === 0 && tot.lists > 0 ? t("import.done.listsOnly") : t("import.done.title", { count: tot.imported })
      : r.status === "stopped"
        ? t("importApp.stopped", { done: r.progress.done, total: r.progress.total })
        : r.status === "limited"
          ? t("importApp.retryIn")
          : t("importApp.failedTitle", { done: r.progress.done, total: r.progress.total });
  return (
    <View style={{ gap: space.lg, backgroundColor: c.paper2, padding: space.lg }} testID="ended" role="status">
      <Heading level={2} testID="ended-title">{head}</Heading>
      {r.status === "limited" ? <Text tone="ink2">{t("import.errors.limit")}</Text> : null}
      {r.status === "failed" ? <Text tone="ink2" role="alert">{t("import.errors.chunk")}</Text> : null}
      {r.status === "stopped" ? <Text tone="ink2">{t("importApp.stoppedBody")}</Text> : null}
      {r.status !== "done" && phase.circleId ? <Text variant="small" tone="muted">{t("importApp.resumeIntoCircle", { circle: circleName ?? "" })}</Text> : null}
      {lines.length > 0 ? (
        <RowList>
          {lines.map((l) => (
            <Row key={l.key} testID={`line-${l.key}`}>
              <Text style={{ fontSize: 32, lineHeight: 36, minWidth: 72, fontFamily: "SofiaSansExtraCondensed_200" }}>{l.n}</Text>
              <Text variant={l.strong ? "strong" : "small"} tone={l.strong ? "ink" : "muted"} style={{ flex: 1 }}>{label(l.text)}</Text>
            </Row>
          ))}
        </RowList>
      ) : null}
      {r.rejected.length > 0 ? (
        <View style={{ gap: space["2xs"] }} testID="rejected">
          <Text variant="strong">{t("importApp.rejectedTitle", { count: r.rejected.length })}</Text>
          {r.rejected.slice(0, 20).map((x) => (
            <Text key={x.index} variant="small" tone="ink2">{t("importApp.rejectedRow", { n: x.index + 1, title: x.title || "—", reason: t(`importApp.reason.${(["title", "kind", "review"].includes(x.reason) ? x.reason : "title") as "title" | "kind" | "review"}`) })}</Text>
          ))}
          {r.rejected.length > 20 ? <Text variant="small" tone="muted">{t("importApp.rejectedMore", { count: r.rejected.length - 20 })}</Text> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {r.status !== "done" ? <Button label={t("importApp.resume")} onPress={onResume} testID="resume-after" /> : null}
        {r.status === "done" ? (
          phase.circleId ? <Button label={t("import.done.toCircle", { circle: circleName ?? "" })} href={href(`/c/${phase.circleId}`)} /> : <Button label={t("import.done.toSpace")} href={`${href("/diary")}?only=private`} />
        ) : null}
        {r.status === "done" && tot.lists > 0 ? <Button label={t("import.done.toLists")} variant="secondary" href={`${href("/lists")}${phase.circleId ? `?circle=${phase.circleId}` : "?circle="}`} /> : null}
        <Button label={t("import.done.again")} variant="quiet" onPress={onAgain} />
      </View>
      <TextLink href={href("/imports")} tone="ink2">{t("importApp.toManage")}</TextLink>
      {phase.circleId && r.status === "done" ? <Notice tone="ink2">{t("import.done.inCircle", { count: tot.imported, circle: circleName ?? "" })}</Notice> : null}
    </View>
  );
}

export function ImportScreen() {
  return (
    <RequireSession>
      <Impl />
    </RequireSession>
  );
}
