import type { CandidateDto, LogDto, MediaDetailDto, PersonDto } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/api";
import { ApiFailure, errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { useAction } from "@/api/useAction";
import { isOnline } from "@/offline/connectivity";
import { useOutbox } from "../offline/OutboxProvider";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { readStored, writeStored } from "@/theme/pref-storage";
import { Avatar } from "@/ui/Avatar";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Chip, ChipGroup } from "@/ui/Chip";
import { Choice } from "@/ui/Choice";
import { ConfirmButton } from "@/ui/ConfirmButton";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { StarInput } from "@/ui/Stars";
import { Toggle } from "@/ui/Toggle";
import { ErrorState, Heading, Loading, Screen, Tag, Text, Title } from "@/ui";
import { useCurrentCircle } from "../current-circle";
import { RequireSession, useMe } from "../session";
import { isYmd, msToYmd, num, todayYmd, ymdToMs } from "./dates";
import { Search, type Picked } from "./TitleSearch";
import "./diary.messages";

const MAX_REVIEW = 4000;
/** What the save returns when the viewing went to the offline outbox instead of the server. */
const QUEUED = "queued-offline";
const PLATFORM_KEY = "pausa-platform";
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

function Form({ picked, onChangeTitle, edit, initial }: { picked: Picked; onChangeTitle?: () => void; edit?: { logId: string; sharedBefore: string[] }; initial: Initial }) {
  const { t, href, locale, date } = useI18n();
  const router = useRouter();
  const me = useMe();
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
  const [touched, setTouched] = useState(false);
  const save = useAction();
  const outbox = useOutbox();
  const series = isSeries(picked.kind);
  const localId = picked.key.startsWith("local:") ? picked.key.slice(6) : null;

  // Counts of seasons and episodes exist once the title is in Pausa; before that the numbers are free (1..99, 1..9999).
  useEffect(() => {
    if (!series || !localId) return;
    const ctl = new AbortController();
    diaryApi.media(localId, locale, ctl.signal).then(setDetail, () => undefined);
    return () => ctl.abort();
  }, [series, localId, locale]);

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
  const seasons = detail?.seasons ?? [];
  const seasonN = season ? Number(season) : null;
  const known = seasonN ? seasons.find((s) => num(s.season) === seasonN) : undefined;
  const maxEpisode = known ? num(known.episodes) : null;

  const dateError = !ymdOk(day) ? t("diary.log.dateInvalid") : day > todayYmd() ? t("diary.log.dateFuture") : null;
  const seasonError = season !== "" && !(Number.isInteger(seasonN) && seasonN! >= 1 && seasonN! <= 99) ? t("diary.log.numberInvalid", { max: 99 }) : null;
  const epN = episode ? Number(episode) : null;
  const episodeCap = maxEpisode ?? 9999;
  const episodeError = episode !== "" && (!season ? t("diary.log.episodeNeedsSeason") : !(Number.isInteger(epN) && epN! >= 1 && epN! <= episodeCap) ? t("diary.log.numberInvalid", { max: episodeCap }) : null);
  const invalid = !!dateError || !!seasonError || !!episodeError;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const recentPlatforms = useMemo(() => [...new Set([platform, ...COMMON_PLATFORMS].map((p) => p.trim()).filter(Boolean))].slice(0, 6), [platform]);

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    const input = {
      watchedOn: day,
      rating: rating || null,
      review: review.trim() || null,
      platform: platform.trim() || null,
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
      const body = { ...input, mediaKey: picked.key, circles, locale };
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
    if (platform.trim()) void writeStored(PLATFORM_KEY, platform.trim());
    router.replace((done.value === QUEUED || !circles[0] ? href("/diary") : href(`/c/${circles[0]}/log/${done.value}`)) as never);
  };

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }} testID="picked-title">
        <MediaPoster title={picked.title} path={picked.posterPath} width={64} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Title numberOfLines={3}>{picked.title}</Title>
          <Text variant="small" tone="muted">
            {[picked.year, t(`kind.${picked.kind === "tv" || picked.kind === "anime" ? picked.kind : "movie"}`)].filter(Boolean).join(" · ")}
          </Text>
          {onChangeTitle ? <Button label={t("diary.log.change")} variant="quiet" onPress={onChangeTitle} /> : null}
        </View>
      </View>

      <StarInput value={rating} onChange={setRating} label={t("log.rating")} />

      <View style={{ gap: space.xs }}>
        <Field label={t("log.watchedOn")} value={day} onChangeText={setDay} placeholder="2026-11-25" autoCorrect={false} maxLength={10} error={touched || day.length === 10 ? dateError : null} hint={ymdOk(day) ? date(ymdToMs(day)) : undefined} testID="watched-on" />
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={t("diary.log.today")} variant="quiet" onPress={() => setDay(todayYmd())} />
          <Button label={t("diary.log.yesterday")} variant="quiet" onPress={() => setDay(msToYmd(Date.now() - 86_400_000))} />
        </View>
      </View>

      {series ? (
        <Section title={t("log.progress")}>
          {seasons.length > 0 ? (
            <Choice
              label={t("log.seasonLogged")}
              value={season}
              onChange={(v) => {
                setSeason(v);
                if (!v) setEpisode("");
              }}
              options={[{ value: "", label: t("log.wholeShow") }, ...seasons.map((s) => ({ value: String(num(s.season)), label: String(num(s.season)) }))]}
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
              hint={known ? t("log.seasonOf", { n: seasonN!, count: maxEpisode! }) : t("diary.log.optional")}
              testID="episode"
            />
          ) : null}
        </Section>
      ) : null}

      <Field label={t("log.review")} value={review} onChangeText={setReview} multiline maxLength={MAX_REVIEW} hint={`${review.length}/${MAX_REVIEW}`} testID="review-input" />
      <Toggle label={t("log.spoilers")} value={spoilers} onChange={setSpoilers} />
      <Toggle label={t("log.rewatch")} value={rewatch} onChange={setRewatch} />

      <ChipGroup label={t("log.platform")}>
        {recentPlatforms.map((p) => (
          <Chip key={p} label={p} on={platform.trim().toLowerCase() === p.toLowerCase()} onPress={() => setPlatform(platform.trim().toLowerCase() === p.toLowerCase() ? "" : p)} />
        ))}
      </ChipGroup>
      <Field label={t("diary.log.platformOther")} value={platform} onChangeText={setPlatform} placeholder={t("log.platformPlaceholder")} maxLength={60} testID="platform" />

      <ChipGroup label={t("log.who")} hint={circles.length === 0 ? `${t("log.privateOnly")}. ${t("log.privateHelp")}` : t("diary.log.shareHint", { count: circles.length })}>
        {me.circles.map((c) => (
          <Chip key={c.id} label={c.name} on={circles.includes(c.id)} onPress={() => toggle(circles, setCircles, c.id)} testID={`share-${c.id}`} />
        ))}
      </ChipGroup>

      {taggable.length > 0 ? (
        <ChipGroup label={t("log.with")}>
          {taggable.map((p) => (
            <Chip key={p.id} label={p.name} on={withIds.includes(p.id)} onPress={() => toggle(withIds, setWithIds, p.id)} testID={`with-${p.id}`} />
          ))}
        </ChipGroup>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Button
          label={save.busy ? t("log.saving") : edit ? t("manage.saveChanges") : circles.length ? t("log.submit") : t("log.submitPrivate")}
          busy={save.busy}
          disabled={touched && invalid}
          onPress={() => void submit()}
          testID="submit-log"
        />
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
      </View>
    </View>
  );
}

function NewLog() {
  const { t, href, locale } = useI18n();
  const { media, circle } = useLocalSearchParams<{ media?: string; circle?: string }>();
  const { circleId } = useCurrentCircle();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(!!media);
  const [mediaError, setMediaError] = useState<unknown>(null);
  const asked = useRef(false);
  useEffect(() => {
    void readStored(PLATFORM_KEY).then((v) => setPlatform(v ?? ""));
  }, []);
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
    platform: platform ?? "",
    spoilers: false,
    rewatch: false,
    season: "",
    episode: "",
    withIds: [],
    circles: [circle ? String(circle) : circleId].filter((x): x is string => !!x),
  };
  return (
    <Screen>
      <BackLink to={href("/diary")} label={t("tabs.diary")} />
      <Heading level={1}>{t("log.title")}</Heading>
      {loadingMedia || platform === null ? <Loading rows={3} /> : null}
      {mediaError ? <ErrorState error={mediaError} /> : null}
      {!loadingMedia && platform !== null && !picked ? <Search onPick={setPicked} autoFocus /> : null}
      {picked && platform !== null ? <Form key={picked.key} picked={picked} onChangeTitle={() => setPicked(null)} initial={initial} /> : null}
    </Screen>
  );
}

/** Finds one of my viewings by id: the API has no single-log read, so the diary is paged until it turns up. */
async function findMyLog(id: string, locale: string): Promise<LogDto | null> {
  let before: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await diaryApi.diary({ before, locale });
    const hit = page.items.find((l) => l.id === id);
    if (hit) return hit;
    if (!page.next) return null;
    before = page.next;
  }
  return null;
}

function EditLog({ logId }: { logId: string }) {
  const { t, href, locale } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; log: LogDto; withIds: string[] }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const del = useAction();
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    (async () => {
      const log = await findMyLog(logId, locale);
      if (!log) throw new ApiFailure("not_found", 404);
      let withIds: string[] = [];
      const scope = log.sharedIn[0];
      if (scope) {
        try {
          withIds = (await diaryApi.thread(scope, logId, { reveal: true, locale })).watchedWith.map((p) => p.id);
        } catch {
          // the tags are a nicety: editing still works, without them
        }
      }
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
      <BackLink to={href("/diary")} label={t("tabs.diary")} />
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
                if (await del.run(() => diaryApi.deleteLog(logId))) router.replace(href("/diary") as never);
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

export function LogEdit() {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  return (
    <RequireSession>
      <EditLog logId={String(logId)} />
    </RequireSession>
  );
}
