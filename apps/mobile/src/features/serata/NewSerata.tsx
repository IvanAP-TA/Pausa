import type { CandidateDto, MediaDto, Mode } from "@pausa/api-types";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View, useWindowDimensions } from "react-native";
import { errorMessage } from "@/api/errors";
import { listsApi } from "@/api/lists";
import { serataApi } from "@/api/serata";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { SEARCH_DELAY } from "@/features/TitleSearch";
import { useTmdbOff } from "@/features/useTmdbOff";
import { dedupeTitles, titleIdentity } from "@/features/title-identity";
import { useI18n } from "@/i18n";
import { control, fallbackSans, fontSize, fonts, hair, space, useTheme, web } from "@/theme";
import { Button } from "@/ui/Button";
import { Check, Plus, Search, Sparkles, STROKE } from "@/ui/lucide";
import { MediaPoster } from "@/ui/MediaPoster";
import { TextLink } from "@/ui/TextLink";
import { Well } from "@/ui/Surfaces";
import { Text } from "@/ui/Text";
import { titleType, useGrid } from "./room-ui";
import "./serata.messages";

export const MIN_TITLES = 2;
export const MAX_TITLES = 8;

type Pick = { key: string; kind: string; title: string; year: number | null; posterPath: string | null };
const pickOf = (c: CandidateDto): Pick => ({ key: c.key, kind: c.kind, title: c.title, year: c.year === null ? null : Number(c.year), posterPath: c.posterPath });
/** A title Pausa already holds is named to the API as `local:<id>` (a search result has its own `key`). */
const pickOfMedia = (m: MediaDto): Pick => ({ key: `local:${m.id}`, kind: m.kind, title: m.title, year: m.year === null ? null : Number(m.year), posterPath: m.posterPath });

/** One mode as a radio card (v1): the name in display, the hint, a tick box that is filled when it is the chosen one. */
function ModeCard({ mode, on, onPress, label, hint }: { mode: Mode; on: boolean; onPress: () => void; label: string; hint: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      role="radio"
      aria-checked={on}
      onPress={onPress}
      testID={`mode-${mode}`}
      style={[{ flex: 1, minWidth: 0, minHeight: control, borderWidth: hair, borderColor: on ? c.accent : c.rule, backgroundColor: on ? c.paper2 : "transparent", padding: space.sm, paddingRight: 40, gap: space.xs }, web({ cursor: "pointer", transition: "border-color 150ms ease-out" })]}
    >
      <View aria-hidden style={{ position: "absolute", right: 12, top: 12, width: 20, height: 20, alignItems: "center", justifyContent: "center", borderWidth: hair, borderColor: on ? c.accent : c.muted, backgroundColor: on ? c.accent : "transparent" }}>
        {on ? <Check size={14} strokeWidth={2.4} color={c.accentInk} /> : null}
      </View>
      <Text style={titleType(24)}>{label}</Text>
      <Text variant="small" tone={on ? "ink2" : "muted"}>{hint}</Text>
    </Pressable>
  );
}

/** One poster of the pool: tap to take it or leave it. The badge is its seed number once taken, a "+" before; the taken ones wear a 2px amber edge. */
function PosterCard({ pick, n, full, width, on, onPress }: { pick: Pick; n: number; full: boolean; width: number; on: string[] | undefined; onPress: () => void }) {
  const { c } = useTheme();
  const taken = n >= 0;
  return (
    <Pressable
      role="button"
      aria-pressed={taken}
      aria-label={on?.length ? `${pick.title}, ${on.join(", ")}` : pick.title}
      aria-disabled={full || undefined}
      disabled={full}
      onPress={onPress}
      testID={`pool-${pick.key}`}
      style={[{ width, gap: 6, opacity: full ? 0.4 : 1 }, web({ cursor: full ? "default" : "pointer" })]}
    >
      <View>
        <MediaPoster title={pick.title} path={pick.posterPath} width={width} size="w342" decorative />
        <View aria-hidden pointerEvents="none" style={{ position: "absolute", inset: 0, borderWidth: 2, borderColor: taken ? c.accent : "transparent" }} />
        <View aria-hidden pointerEvents="none" style={{ position: "absolute", right: 0, top: 0, width: 28, height: 28, alignItems: "center", justifyContent: "center", backgroundColor: taken ? c.accent : c.paper }}>
          {taken ? (
            <Text style={{ color: c.accentInk, fontFamily: fonts.body600, fontSize: 13, lineHeight: 16, fontVariant: ["tabular-nums"] }}>{n + 1}</Text>
          ) : (
            <Plus size={16} strokeWidth={2} color={c.ink} />
          )}
        </View>
      </View>
      <Text variant={taken ? "strong" : "body"} tone={taken ? "ink" : "ink2"} numberOfLines={2} style={{ fontSize: fontSize.sm, lineHeight: 17 }}>
        {pick.title}
      </Text>
      {on?.length ? (
        <Text variant="small" tone="muted" numberOfLines={1}>
          {on.join(", ")}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Setting up a Serata (v1): pick how to vote, pick 2 to 8 candidates by tapping posters (or let Pausa fill the list), open it. One pool:
 * what the search found, what is taken, what Pausa suggested, then the titles on the Cerchia's lists. The open button stays in reach.
 */
export function NewSerata({ circleId }: { circleId: string }) {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("bracket");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Pick[]>([]);
  const [searching, setSearching] = useState(false);
  const tmdbOff = useTmdbOff();
  const [focus, setFocus] = useState(false);
  const [suggested, setSuggested] = useState<Pick[]>([]);
  const [on, setOn] = useState<Record<string, string[]>>({});
  const [suggestEmpty, setSuggestEmpty] = useState(false);
  const suggest = useAction();
  const create = useAction();
  const cols = screenW >= 640 ? 4 : 3;
  const grid = useGrid(cols, space.sm);

  // Titles already on the Cerchia's lists (the watchlist first): the pool before anybody types.
  const services = useResource((signal) => serataApi.services(circleId, signal), [circleId]);
  const lists = useResource((signal) => listsApi.overview(circleId, signal, locale), [circleId, locale]);
  const quick = useMemo<Pick[]>(() => {
    const mine = (lists.data ?? []).filter((l) => l.circleId === circleId);
    const ordered = [...mine].sort((a, b) => Number(b.kind === "watchlist") - Number(a.kind === "watchlist"));
    return ordered.flatMap((l) => l.strip.map((i) => ({ key: `local:${i.id}`, kind: "", title: i.title, year: null, posterPath: i.posterPath })));
  }, [lists.data, circleId]);

  // Results as you type: a short pause, two letters at least, only the latest answer kept.
  const latest = useRef("");
  useEffect(() => {
    const clean = query.trim();
    latest.current = clean;
    if (clean.length < 2) {
      setFound([]);
      setSearching(false);
      return;
    }
    const ctl = new AbortController();
    const id = setTimeout(() => {
      setSearching(true);
      serataApi.search(clean, locale, ctl.signal).then(
        (rows) => {
          if (latest.current === clean) setFound(dedupeTitles(rows).map(pickOf));
        },
        () => undefined,
      ).finally(() => {
        if (latest.current === clean) setSearching(false);
      });
    }, SEARCH_DELAY);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [query, locale]);

  const has = (p: Pick) => picks.findIndex((x) => x.key === p.key || (x.kind !== "" && p.kind !== "" && titleIdentity(x) === titleIdentity(p)));
  const toggle = (p: Pick) => {
    const i = has(p);
    if (i >= 0) setPicks((all) => all.filter((_, k) => k !== i));
    else if (picks.length < MAX_TITLES) setPicks((all) => [...all, p]);
  };

  // What was just asked for first, then what is taken, what Pausa suggested, and the lists; every title once.
  const pool = useMemo(() => {
    const seen = new Set<string>();
    const out: Pick[] = [];
    for (const p of [...(query.trim().length >= 2 ? found : []), ...picks, ...suggested, ...quick]) {
      const id = p.kind ? titleIdentity(p) : p.key;
      if (seen.has(p.key) || seen.has(id)) continue;
      seen.add(p.key);
      seen.add(id);
      out.push(p);
    }
    return out;
  }, [found, picks, suggested, quick, query]);

  const doSuggest = async () => {
    setSuggestEmpty(false);
    const res = await suggest.run(() => serataApi.suggest(circleId, locale));
    if (!res) return;
    const titles = res.value.titles.map(pickOfMedia);
    const byKey: Record<string, string[]> = {};
    for (const m of res.value.titles) byKey[`local:${m.id}`] = res.value.on[m.id] ?? [];
    setSuggested(titles);
    setOn(byKey);
    setPicks(titles.slice(0, MAX_TITLES));
    setSuggestEmpty(titles.length === 0);
  };

  const go = async () => {
    const res = await create.run(() => serataApi.create({ circleId, mode, mediaKeys: picks.map((p) => p.key) }));
    if (res) router.push(href(`/s/${res.value.code}`) as never);
  };
  const ready = picks.length >= MIN_TITLES;
  const sv = services.data;

  return (
    <View style={{ gap: space.lg }}>
      <View role="radiogroup" aria-label={t("serata.modeLabel")} style={{ flexDirection: "row", gap: space.sm }}>
        {(["bracket", "table"] as const).map((m) => (
          <ModeCard key={m} mode={m} on={mode === m} onPress={() => setMode(m)} label={t(`serata.mode.${m}`)} hint={t(`serata.modeHint.${m}`)} />
        ))}
      </View>

      <View style={{ gap: space.md }}>
        <View style={{ gap: space["2xs"] }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
            <Text role="heading" aria-level={2} style={titleType(24)}>{t("serata.pickTitle")}</Text>
            <Text role="status" aria-live="polite" testID="picked-count" variant="small" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
              {t("serata.picked", { count: picks.length, max: MAX_TITLES })}
            </Text>
          </View>
          <Text variant="small" tone="muted">{t("serata.pickHint")}</Text>
        </View>

        <Well grained style={{ padding: space.md, gap: space.xs }}>
          <Button label={suggest.busy ? t("serata.suggesting") : t("serata.suggest")} icon={Sparkles} variant="secondary" onPress={doSuggest} busy={suggest.busy} fullWidth testID="suggest" />
          <Text variant="small" tone="muted" style={{ marginTop: 4 }}>{t("serata.suggestHint")}</Text>
          {sv && sv.names.length > 0 ? (
            <Text variant="small" tone="ink2">{t("serata.servicesCommon", { names: sv.names.join(", "), setBy: sv.setBy, members: sv.members })}</Text>
          ) : (
            <Text variant="small" tone="muted">
              {t("serata.servicesNone")} <TextLink href={href("/account")}>{t("serata.servicesLink")}</TextLink>
            </Text>
          )}
          {suggest.error ? <Text role="alert" tone="error">{errorMessage(t, suggest.error)}</Text> : null}
          {suggestEmpty ? <Text role="status">{t("serata.suggestEmpty")}</Text> : null}
        </Well>

        <View>
          <Search size={20} strokeWidth={STROKE} color={c.muted} style={{ position: "absolute", left: 16, top: 12, zIndex: 1 }} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            aria-label={t("serata.search")}
            placeholder={t("serata.search")}
            placeholderTextColor={c.muted}
            selectionColor={c.accent}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="serata-search"
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            style={[
              { minHeight: control, paddingLeft: 48, paddingRight: space.sm, borderWidth: hair, borderColor: focus ? c.focus : c.muted, color: c.ink, fontFamily: fonts.body400, fontSize: Math.max(16, fontSize.md) },
              web({ fontFamily: `${fonts.body400}, ${fallbackSans}` }),
            ]}
          />
        </View>
        <Text role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}>
          {searching ? t("log.searching") : ""}
        </Text>
        {tmdbOff ? <Text variant="small" tone="muted" testID="tmdb-off">{t("log.tmdbOff")}</Text> : null}

        {pool.length === 0 ? (
          <Text tone="ink2" style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.md }}>{t("serata.emptyPool")}</Text>
        ) : (
          <View onLayout={grid.onLayout} role="list" testID="pool" style={[grid.style, { opacity: searching ? 0.7 : 1 }]}>
            {grid.cell > 0
              ? pool.map((p) => {
                  const n = has(p);
                  return (
                    <View key={p.key} role="listitem">
                      <PosterCard pick={p} n={n} full={n < 0 && picks.length >= MAX_TITLES} width={grid.cell} on={on[p.key]} onPress={() => toggle(p)} />
                    </View>
                  );
                })
              : null}
          </View>
        )}
      </View>

      {create.error ? <Text role="alert" tone="error">{errorMessage(t, create.error)}</Text> : null}
      <View style={[{ backgroundColor: c.paper, paddingVertical: space.sm, borderTopWidth: hair, borderColor: c.rule, zIndex: 10 }, web({ position: "sticky", bottom: "var(--pausa-bar, 0px)" })]}>
        <Button
          label={create.busy ? t("log.saving") : ready ? t("serata.createWith", { count: picks.length }) : t("serata.needTwo", { count: picks.length })}
          onPress={go}
          busy={create.busy}
          disabled={!ready}
          fullWidth
          testID="create-serata"
        />
      </View>
    </View>
  );
}
