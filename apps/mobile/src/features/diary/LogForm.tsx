import type { LogDto, MediaDetailDto, PersonDto } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { api } from "@/api";
import { ApiFailure, errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { useAction } from "@/api/useAction";
import { isOnline } from "@/offline/connectivity";
import { useOutbox } from "../offline/OutboxProvider";
import { useI18n } from "@/i18n";
import { control, fallbackSans, fonts, hair, layout, space, useTheme, web } from "@/theme";
import { BackButton, BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Chip, ChipGroup } from "@/ui/Chip";
import { ConfirmButton } from "@/ui/ConfirmButton";
import { Field } from "@/ui/Field";
import { ChevronDown, Download } from "@/ui/lucide";
import { MediaPoster } from "@/ui/MediaPoster";
import { PersonChip } from "@/ui/PersonChip";
import { Row, RowList } from "@/ui/Row";
import { Section } from "@/ui/Section";
import { Select } from "@/ui/Select";
import { StarInput } from "@/ui/Stars";
import { ErrorState, Heading, Loading, Screen, Skeleton, Text, Title } from "@/ui";
import { useCurrentCircle } from "../current-circle";
import { RequireSession, useMe } from "../session";
import { isYmd, msToYmd, num, todayYmd, ymdToMs } from "./dates";
import { Search, type Picked } from "./TitleSearch";
import "./diary.messages";

const MAX_REVIEW = 4000;
/** What the save returns when the viewing went to the offline outbox instead of the server. */
const QUEUED = "queued-offline";
const COMMON_PLATFORMS = ["Netflix", "Prime Video", "Disney+", "MUBI", "Cinema"];
const isSeries = (kind: string) => kind === "tv" || kind === "anime";
const ymdOk = isYmd;

type Initial = {
  rating: number;
  date: string;
  review: string;
  platform: string;
  spoilers: boolean;
  rewatch: boolean;
  season: string;
  episode: string;
  withIds: string[];
  circles: string[];
};

/** The picked title, compact: poster, name, meta (year, kind, two genres); the synopsis folded to two lines. */
function PickedCard({ picked, genres, overview, loadingOverview }: { picked: Picked; genres: string[]; overview: string | null; loadingOverview: boolean }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [more, setMore] = useState(false);
  const kind = picked.kind === "tv" || picked.kind === "anime" ? picked.kind : "movie";
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }} testID="picked-title">
        <MediaPoster title={picked.title} path={picked.posterPath} width={56} />
        <View style={{ flex: 1, gap: space["2xs"], alignItems: "flex-start" }}>
          <Title numberOfLines={3} style={{ fontSize: 24, lineHeight: 28 }}>
            {picked.title}
          </Title>
          <Text variant="small" tone="muted">
            {[picked.year, t(`kind.${kind}`), ...genres.slice(0, 2)].filter(Boolean).join(", ")}
          </Text>
        </View>
      </View>
      {overview ? (
        <View style={{ gap: space["3xs"] }}>
          <Text tone="ink2" numberOfLines={more ? undefined : 2} testID="overview">
            {overview}
          </Text>
          {!more ? (
            <Pressable role="button" aria-expanded={false} onPress={() => setMore(true)} style={[{ minHeight: control, flexDirection: "row", alignItems: "center", gap: space["3xs"], alignSelf: "flex-start" }, web({ cursor: "pointer" })]}>
              <Text variant="small" tone="muted">
                {t("log.more")}
              </Text>
              <ChevronDown size={16} strokeWidth={1.6} color={c.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : loadingOverview ? (
        <View role="status" aria-live="polite" style={{ gap: space.xs }}>
          <Skeleton height={18} />
          <Skeleton height={18} width="70%" />
          <Text style={web({ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 })}>{t("log.loadingOverview")}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** v1 mode toggle: two tabs, "Ho visto" / "Sto guardando", the chosen one underlined in the accent. */
function ModeTabs({ mode, onChange }: { mode: "watched" | "watching"; onChange: (m: "watched" | "watching") => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  return (
    <View role="radiogroup" aria-label={t("log.modeLabel")} style={{ flexDirection: "row", borderBottomWidth: hair, borderColor: c.rule }}>
      {(["watched", "watching"] as const).map((m) => (
        <Pressable
          key={m}
          role="radio"
          aria-checked={mode === m}
          aria-label={m === "watched" ? t("log.modeWatched") : t("log.modeWatching")}
          testID={`mode-${m}`}
          onPress={() => onChange(m)}
          style={[{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, marginBottom: -hair, borderColor: mode === m ? c.accent : "transparent" }, web({ cursor: "pointer" })]}
        >
          <Title tone={mode === m ? "ink" : "muted"} style={{ fontSize: 19, lineHeight: 24 }}>
            {m === "watched" ? t("log.modeWatched") : t("log.modeWatching")}
          </Title>
        </Pressable>
      ))}
    </View>
  );
}

/** The date: the browser's own picker on the web (`<input type="date">`, as Select is a `<select>`), a typed field on native. */
function DateField({ value, onChange, max, error, hint, testID }: { value: string; onChange: (v: string) => void; max: string; error: string | null; hint?: string; testID: string }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const id = useId().replace(/:/g, "");
  const [focused, setFocused] = useState(false);
  if (Platform.OS !== "web") {
    return <Field label={t("log.watchedOn")} value={value} onChangeText={onChange} placeholder="2026-11-25" autoCorrect={false} maxLength={10} error={error} hint={hint} testID={testID} />;
  }
  return (
    <View style={{ gap: space["2xs"], alignSelf: "stretch" }}>
      <label htmlFor={id} style={{ display: "contents" }}>
        <Text variant="label" tone="ink2">
          {t("log.watchedOn")}
        </Text>
      </label>
      <input
        id={id}
        type="date"
        aria-label={t("log.watchedOn")}
        data-testid={testID}
        value={value}
        max={max}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          minHeight: control,
          width: "100%",
          boxSizing: "border-box",
          padding: `0 ${space.sm}px`,
          border: `1px solid ${error ? c.error : focused ? c.focus : c.muted}`,
          borderRadius: 0,
          background: "transparent",
          color: c.ink,
          fontFamily: `${fonts.body400}, ${fallbackSans}`,
          fontSize: 16,
          fontVariantNumeric: "tabular-nums",
        }}
      />
      {error ? (
        <Text variant="small" tone="error" role="alert" aria-live="assertive" nativeID={`${id}-err`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** v1 `<details>`: a 56px row that says what is inside, a chevron that turns; the content is only mounted when it is open. */
function Details({ open, onToggle, title, hint, children }: { open: boolean; onToggle: () => void; title: string; hint: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ borderTopWidth: hair, borderBottomWidth: hair, borderColor: c.rule }}>
      <Pressable role="button" aria-expanded={open} onPress={onToggle} testID="log-details" style={[{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs }, web({ cursor: "pointer" })]}>
        <View style={{ flex: 1 }}>
          <Text variant="strong">{title}</Text>
          <Text variant="small" tone="muted">
            {hint}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <ChevronDown size={20} strokeWidth={1.6} color={c.muted} />
        </View>
      </Pressable>
      {open ? <View style={{ gap: space.lg, paddingTop: space.xs, paddingBottom: space.lg }}>{children}</View> : null}
    </View>
  );
}

/** Keeps the save button in reach: stuck to the bottom of the screen while the form scrolls (web; native keeps it in the flow). */
function SaveBar({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { gap: space.xs, marginHorizontal: -layout.gutter.phone, paddingHorizontal: layout.gutter.phone, paddingVertical: space.sm, borderTopWidth: hair, borderColor: c.rule, backgroundColor: c.paper },
        web({ position: "sticky", bottom: "var(--pausa-bar, 0px)", zIndex: 10 }),
      ]}
    >
      {children}
    </View>
  );
}

function Form({ picked, edit, initial }: { picked: Picked; edit?: { logId: string; sharedBefore: string[] }; initial: Initial }) {
  const { t, href, locale, date } = useI18n();
  const router = useRouter();
  const me = useMe();
  const [mode, setMode] = useState<"watched" | "watching">("watched");
  const [rating, setRating] = useState(initial.rating);
  const [day, setDay] = useState(initial.date);
  const [review, setReview] = useState(initial.review);
  const [platform, setPlatform] = useState(initial.platform);
  const [spoilers, setSpoilers] = useState(initial.spoilers);
  const [rewatch, setRewatch] = useState(initial.rewatch);
  const [season, setSeason] = useState(initial.season);
  const [episode, setEpisode] = useState(initial.episode);
  const [withIds, setWithIds] = useState<string[]>(initial.withIds);
  const [circles, setCircles] = useState<string[]>(initial.circles);
  const [people, setPeople] = useState<Record<string, PersonDto[]>>({});
  const [detail, setDetail] = useState<MediaDetailDto | null>(null);
  const [detailDone, setDetailDone] = useState(false);
  const [overview, setOverview] = useState("");
  // Everything optional is folded; an edit, or a viewing that arrives with people tagged, shows what it already holds.
  const [detailsOpen, setDetailsOpen] = useState(!!edit || initial.withIds.length > 0);
  const [touched, setTouched] = useState(false);
  const save = useAction();
  const outbox = useOutbox();
  const series = isSeries(picked.kind);
  const localId = picked.key.startsWith("local:") ? picked.key.slice(6) : null;

  // What the title is about (synopsis, genres) and, for a series, its counts of seasons and episodes: they exist once the title is
  // in Pausa; before that the numbers are free (1..99, 1..9999) and there is no synopsis to show.
  useEffect(() => {
    if (!localId) return;
    const ctl = new AbortController();
    diaryApi.media(localId, locale, ctl.signal).then(
      (d) => {
        setDetail(d);
        setDetailDone(true);
      },
      () => !ctl.signal.aborted && setDetailDone(true),
    );
    return () => ctl.abort();
  }, [localId, locale]);

  // Who can be tagged: members of the Cerchie it is shared with.
  useEffect(() => {
    for (const id of circles) {
      if (people[id]) continue;
      api.circle(id).then(
        (d) => setPeople((p) => ({ ...p, [id]: d.members.map((m) => ({ id: m.userId, name: m.name, image: m.image })) })),
        () => undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circles]);
  const taggable = useMemo(() => {
    const seen = new Map<string, PersonDto>();
    for (const id of circles) for (const p of people[id] ?? []) if (p.id !== me.id) seen.set(p.id, p);
    return [...seen.values()];
  }, [circles, people, me.id]);
  const seasons = series ? (detail?.seasons ?? []) : [];
  const seasonN = season ? Number(season) : null;
  const known = seasonN ? seasons.find((s) => num(s.season) === seasonN) : undefined;
  const maxEpisode = known ? num(known.episodes) : null;
  const catalogOverview = detail?.overview?.trim() || null;
  // No synopsis in the catalogue: the details offer a field to write one (the server keeps it only if nobody wrote one meanwhile).
  const offerOverview = !edit && (localId ? detailDone && !catalogOverview : true);

  const onWeb = Platform.OS === "web";
  const dateError = !day ? t("diary.log.dateRequired") : !ymdOk(day) ? t("diary.log.dateInvalid") : day > todayYmd() ? t("diary.log.dateFuture") : null;
  const seasonError = season !== "" && !(Number.isInteger(seasonN) && seasonN! >= 1 && seasonN! <= 99) ? t("diary.log.numberInvalid", { max: 99 }) : null;
  const epN = episode ? Number(episode) : null;
  const episodeCap = maxEpisode ?? 9999;
  const episodeError = episode !== "" && (!season ? t("diary.log.episodeNeedsSeason") : !(Number.isInteger(epN) && epN! >= 1 && epN! <= episodeCap) ? t("diary.log.numberInvalid", { max: episodeCap }) : null);
  const positionInvalid = !!seasonError || !!episodeError;
  const invalid = mode === "watching" ? positionInvalid : !!dateError || positionInvalid;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const recentPlatforms = useMemo(() => [...new Set([platform, ...COMMON_PLATFORMS].map((p) => p.trim()).filter(Boolean))].slice(0, 6), [platform]);

  const submit = async () => {
    setTouched(true);
    if (invalid) {
      // The field that refuses lives in the folded details: open them so the reason is in front of the person. A new log has
      // no details (its date is today), so there is nothing to open.
      if (mode === "watched" && edit) setDetailsOpen(true);
      return;
    }
    if (mode === "watching") {
      // Where I am in the title, written to the position (no viewing is logged); a title not in Pausa yet is created first.
      const done = await save.run(async () => {
        const mediaId = localId ?? (await diaryApi.resolveMedia(picked.key, locale)).id;
        await diaryApi.setProgress(mediaId, { ...(series && season ? { season: Number(season) } : {}), ...(series && season && episode ? { episode: Number(episode) } : {}), status: "watching" });
        return mediaId;
      });
      if (!done) return;
      const to = circles[0] ?? me.circles[0]?.id;
      router.replace((to ? href(`/c/${to}`) : href("/home")) as never);
      return;
    }
    const input = {
      watchedOn: day,
      rating: rating || null,
      review: review.trim() || null,
      // A new log does not show the platform: it sends none rather than one the person cannot see.
      platform: edit ? platform.trim() || null : null,
      season: series && season ? Number(season) : null,
      episode: series && season && episode ? Number(episode) : null,
      containsSpoilers: spoilers,
      isRewatch: rewatch,
      // Until the members are known, what was tagged stays as it is (an edit must not wipe the tags by being quick).
      watchedWith: circles.every((id) => people[id]) ? withIds.filter((id) => taggable.some((p) => p.id === id)) : withIds,
    };
    const startedAt = Date.now();
    const done = await save.run(async () => {
      if (edit) {
        await diaryApi.updateLog(edit.logId, input);
        const changed = circles.length !== edit.sharedBefore.length || circles.some((c) => !edit.sharedBefore.includes(c));
        if (changed) await diaryApi.setShares(edit.logId, circles);
        return edit.logId;
      }
      const body = { ...input, mediaKey: picked.key, circles, locale, ...(offerOverview && overview.trim() ? { overview: overview.trim() } : {}) };
      try {
        return (await diaryApi.createLog(body)).id;
      } catch (e) {
        // No connection (or the request died on the way): keep the viewing on the device and send it when the network is back.
        if (!(e instanceof ApiFailure) || e.code !== "network") throw e;
        const queued = await outbox.enqueue({ input: body, title: picked.title, kind: picked.kind, posterPath: picked.posterPath, firstAttemptAt: startedAt, maybeSent: isOnline() });
        if (!queued) throw e;
        return QUEUED;
      }
    });
    if (!done) return;
    router.replace((done.value === QUEUED || !circles[0] ? href("/diary") : href(`/c/${circles[0]}/log/${done.value}`)) as never);
  };

  const progress = series ? (
    <>
      {seasons.length > 0 ? (
        <Select
          label={t("log.seasonLogged")}
          value={season}
          onChange={(v) => {
            setSeason(v);
            if (!v) setEpisode("");
          }}
          options={[{ value: "", label: t("log.wholeShow") }, ...seasons.map((s) => ({ value: String(num(s.season)), label: onWeb ? t("log.seasonOf", { n: num(s.season)!, count: num(s.episodes)! }) : String(num(s.season)) }))]}
          testID="season"
        />
      ) : (
        <Field label={t("log.season")} value={season} onChangeText={(v) => setSeason(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} error={seasonError} hint={t("diary.log.optional")} testID="season" />
      )}
      {season !== "" || seasons.length === 0 ? (
        <Field
          label={t("log.episode")}
          value={episode}
          onChangeText={(v) => setEpisode(v.replace(/\D/g, ""))}
          keyboardType="number-pad"
          maxLength={4}
          error={episodeError || null}
          placeholder={known ? `1 / ${maxEpisode}` : undefined}
          hint={known ? undefined : t("diary.log.optional")}
          testID="episode"
        />
      ) : null}
    </>
  ) : null;

  const submitLabel = save.busy ? t("log.saving") : mode === "watching" ? t("log.setWatching") : edit ? t("manage.saveChanges") : circles.length ? t("log.submit") : t("log.submitPrivate");
  const saveBar = (
    <SaveBar>
      {save.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, save.error)}
        </Text>
      ) : null}
      {touched && invalid ? (
        <Text tone="error" role="alert">
          {t("app.apiErrors.invalid")}
        </Text>
      ) : null}
      <Button label={submitLabel} busy={save.busy} disabled={touched && invalid} onPress={() => void submit()} testID="submit-log" fullWidth />
    </SaveBar>
  );

  const head = <PickedCard picked={picked} genres={detail?.genres ?? []} overview={catalogOverview} loadingOverview={!!localId && !detailDone} />;

  if (mode === "watching") {
    return (
      <View style={{ gap: space.lg }}>
        {head}
        {edit || !series ? null : <ModeTabs mode={mode} onChange={setMode} />}
        {series ? (
          <View role="group" aria-label={t("log.progress")} style={{ gap: space.sm }}>
            <Text variant="label" tone="ink2">
              {t("log.progress")}
            </Text>
            {progress}
          </View>
        ) : null}
        {saveBar}
      </View>
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      {head}
      {edit || !series ? null : <ModeTabs mode={mode} onChange={setMode} />}

      <StarInput value={rating} onChange={setRating} label={t("log.rating")} />

      <Field label={t("log.review")} value={review} onChangeText={setReview} multiline maxLength={MAX_REVIEW} hint={`${review.length}/${MAX_REVIEW}`} testID="review-input" />

      {edit ? (
      <Details open={detailsOpen} onToggle={() => setDetailsOpen((o) => !o)} title={t("log.details")} hint={t("log.detailsHint")}>
        <View style={{ gap: space.xs }}>
          <DateField value={day} onChange={setDay} max={todayYmd()} error={touched || day.length === 10 ? dateError : null} hint={ymdOk(day) ? date(ymdToMs(day)) : undefined} testID="watched-on" />
          <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
            <Button label={t("diary.log.today")} variant="quiet" onPress={() => setDay(todayYmd())} />
            <Button label={t("diary.log.yesterday")} variant="quiet" onPress={() => setDay(msToYmd(Date.now() - 86_400_000))} />
          </View>
        </View>

        <ChipGroup label={t("log.platform")}>
          {recentPlatforms.map((p) => (
            <Chip key={p} label={p} on={platform.trim().toLowerCase() === p.toLowerCase()} onPress={() => setPlatform(platform.trim().toLowerCase() === p.toLowerCase() ? "" : p)} />
          ))}
        </ChipGroup>
        <Field label={t("diary.log.platformOther")} value={platform} onChangeText={setPlatform} placeholder={t("log.platformPlaceholder")} maxLength={60} testID="platform" />

        {series ? (
          <View role="group" aria-label={t("log.episodeLogged")} style={{ gap: space.sm }}>
            <Text variant="label" tone="ink2">
              {t("log.episodeLogged")}
            </Text>
            {progress}
          </View>
        ) : null}

        {offerOverview ? <Field label={t("log.overview")} value={overview} onChangeText={setOverview} multiline maxLength={1200} placeholder={t("log.overviewPlaceholder")} testID="overview-input" /> : null}

        {taggable.length > 0 ? (
          <View role="group" aria-label={t("log.with")} style={{ gap: space.xs }}>
            <Text variant="label" tone="ink2">
              {t("log.with")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {taggable.map((p) => (
                <PersonChip key={p.id} type="checkbox" label={p.name} person={p} on={withIds.includes(p.id)} onPress={() => toggle(withIds, setWithIds, p.id)} testID={`with-${p.id}`} />
              ))}
            </View>
          </View>
        ) : null}
      </Details>
      ) : null}

      <ChipGroup label={t("log.who")} hint={circles.length === 0 ? `${t("log.privateOnly")}. ${t("log.privateHelp")}` : t("diary.log.shareHint", { count: circles.length })}>
        {me.circles.map((c) => (
          <Chip key={c.id} label={c.name} on={circles.includes(c.id)} onPress={() => toggle(circles, setCircles, c.id)} testID={`share-${c.id}`} />
        ))}
      </ChipGroup>

      {saveBar}
    </View>
  );
}

function NewLog() {
  const { t, href, locale } = useI18n();
  const { media, circle, private: priv, pick, title: pickTitle, year: pickYear, kind: pickKind, poster: pickPoster } = useLocalSearchParams<{ media?: string; circle?: string; private?: string; pick?: string; title?: string; year?: string; kind?: string; poster?: string }>();
  const { circleId } = useCurrentCircle();
  const { c } = useTheme();
  // "Per te" hands over a catalogue title (not yet in Pausa): `pick` is its key, the rest is what the search would have shown.
  const [picked, setPicked] = useState<Picked | null>(() =>
    pick ? { key: String(pick), title: String(pickTitle ?? ""), year: pickYear ? Number(pickYear) : null, kind: String(pickKind ?? "movie"), posterPath: pickPoster ? String(pickPoster) : null } : null,
  );
  const [loadingMedia, setLoadingMedia] = useState(!!media);
  const [mediaError, setMediaError] = useState<unknown>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!media || asked.current) return;
    asked.current = true;
    diaryApi.media(String(media), locale).then(
      (d) => {
        setPicked({ key: `local:${d.media.id}`, title: d.media.title, year: num(d.media.year), kind: d.media.kind, posterPath: d.media.posterPath });
        setLoadingMedia(false);
      },
      (e) => {
        setMediaError(e);
        setLoadingMedia(false);
      },
    );
  }, [media, locale]);
  const initial: Initial = {
    rating: 0,
    date: todayYmd(),
    review: "",
    platform: "",
    spoilers: false,
    rewatch: false,
    season: "",
    episode: "",
    withIds: [],
    circles: (priv ? [] : [circle ? String(circle) : circleId]).filter((x): x is string => !!x),
  };
  return (
    <Screen>
      {picked ? <BackButton label={t("diary.log.back")} onPress={() => setPicked(null)} /> : null}
      <Heading level={1}>{t("log.title")}</Heading>
      {loadingMedia ? <Loading rows={3} /> : null}
      {mediaError ? <ErrorState error={mediaError} /> : null}
      {!loadingMedia && !picked ? <Search onPick={setPicked} autoFocus people /> : null}
      {picked ? <Form key={picked.key} picked={picked} initial={initial} /> : null}
      {/* The other way in: bring a whole history from another service. */}
      <RowList>
        <Row href={href("/import")} testID="log-import">
          <Download size={20} strokeWidth={1.6} color={c.accent} />
          <View style={{ flex: 1, gap: space["3xs"] }}>
            <Text variant="strong">{t("circle.importTitle")}</Text>
            <Text variant="small" tone="muted">
              {t("circle.importBody")}
            </Text>
          </View>
        </Row>
      </RowList>
    </Screen>
  );
}

function EditLog({ logId, circleId }: { logId: string; circleId?: string }) {
  const { t, href, locale } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; log: LogDto; withIds: string[] }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const del = useAction();
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    (async () => {
      // GET /api/logs/:id answers for the author only: the tags and the Cerchie it is shared with come along.
      const log = await diaryApi.log(logId, locale);
      const withIds = log.watchedWith.map((p) => p.id);
      return { log, withIds };
    })().then(
      (r) => alive && setState({ status: "ready", ...r }),
      (error) => alive && setState({ status: "error", error }),
    );
    return () => {
      alive = false;
    };
  }, [logId, locale, attempt]);
  return (
    <Screen>
      <BackLink to={circleId ? href(`/c/${circleId}/log/${logId}`) : href("/diary")} label={circleId ? t("diary.thread.backToLog") : t("tabs.diary")} />
      <Heading level={1}>{t("manage.editLog")}</Heading>
      {state.status === "loading" ? <Loading rows={4} /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={() => setAttempt((a) => a + 1)} /> : null}
      {state.status === "ready" ? (
        <>
          <Form
            key={state.log.id}
            picked={{ key: `local:${state.log.media.id}`, title: state.log.media.title, year: num(state.log.media.year), kind: state.log.media.kind, posterPath: state.log.media.posterPath }}
            edit={{ logId, sharedBefore: state.log.sharedIn }}
            initial={{
              rating: state.log.rating ?? 0,
              date: state.log.watchedOn,
              review: state.log.review ?? "",
              platform: state.log.platform ?? "",
              spoilers: state.log.containsSpoilers,
              rewatch: state.log.isRewatch,
              season: num(state.log.season) ? String(num(state.log.season)) : "",
              episode: num(state.log.episode) ? String(num(state.log.episode)) : "",
              withIds: state.withIds,
              circles: state.log.sharedIn,
            }}
          />
          <Section>
            <Text variant="small" tone="muted">
              {state.log.sharedIn.length ? t("space.deleteBodyShared") : t("space.deleteBody")}
            </Text>
            <ConfirmButton
              label={t("manage.delete")}
              confirmLabel={t("space.deleteCta")}
              busy={del.busy}
              onConfirm={async () => {
                if (await del.run(() => diaryApi.deleteLog(logId))) router.replace(href(circleId ? `/c/${circleId}` : "/diary") as never);
              }}
            />
            {del.error ? (
              <Text tone="error" role="alert">
                {errorMessage(t, del.error)}
              </Text>
            ) : null}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

export function LogNew() {
  return (
    <RequireSession>
      <NewLog />
    </RequireSession>
  );
}

/** `circleId`: set when opened from a Cerchia's thread (v1 `l/:logId/edit`), so the way back and the delete land there. */
export function LogEdit({ circleId }: { circleId?: string } = {}) {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  return (
    <RequireSession>
      <EditLog logId={String(logId)} circleId={circleId} />
    </RequireSession>
  );
}
