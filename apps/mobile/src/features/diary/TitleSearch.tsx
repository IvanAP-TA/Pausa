import type { CandidateDto } from "@pausa/api-types";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { diaryApi } from "@/api/diary";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { ErrorState, Tag, Text, Title } from "@/ui";
import { dedupeCandidates } from "./dates";
import { num } from "./shared";
import "./diary.messages";

export type Picked = { key: string; title: string; year: number | null; kind: string; posterPath: string | null };
export const fromCandidate = (c: CandidateDto): Picked => ({ key: c.key, title: c.title, year: num(c.year), kind: c.kind, posterPath: c.posterPath });

/** Title search: 350ms after the last key, two letters at least, one request in flight; nothing is stored until a title is chosen. */
export function Search({ onPick, only, emptyHint, clearOnPick, autoFocus }: { /** Take the keyboard on open (the log form: the search is the whole screen). */ autoFocus?: boolean; onPick: (c: Picked) => void; /** Empty the field once a title is picked (adding several favourites in a row). */ clearOnPick?: boolean; /** Keep only some candidates (favourites need titles Pausa already holds). */ only?: (c: CandidateDto) => boolean; emptyHint?: string }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ status: "idle" | "searching" | "done" | "error"; items: CandidateDto[]; error?: unknown }>({ status: "idle", items: [] });
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) {
      setState({ status: "idle", items: [] });
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, status: "searching" }));
      try {
        const items = dedupeCandidates(await diaryApi.searchMedia(term, locale, ctl.signal));
        if (!ctl.signal.aborted) setState({ status: "done", items });
      } catch (error) {
        if (!ctl.signal.aborted && (error as { name?: string })?.name !== "AbortError") setState({ status: "error", items: [], error });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [term, locale]);
  return (
    <View style={{ gap: space.sm }}>
      <Field label={t("log.search")} value={q} onChangeText={setQ} autoFocus={autoFocus} autoCorrect={false} returnKeyType="search" hint={term.length > 0 && term.length < 2 ? t("diary.log.minChars") : undefined} testID="media-search" />
      {state.status === "searching" ? (
        <Text tone="muted" role="status" aria-live="polite">
          {t("log.searching")}
        </Text>
      ) : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={() => setQ((v) => v + " ")} /> : null}
      {state.status === "done" ? (
        <Text variant="small" tone="muted" role="status" aria-live="polite">
          {t("log.resultsCount", { count: (only ? state.items.filter(only) : state.items).length })}
        </Text>
      ) : null}
      {state.status === "done" && emptyHint && (only ? state.items.filter(only) : state.items).length === 0 ? (
        <Text variant="small" tone="ink2">
          {emptyHint}
        </Text>
      ) : null}
      <View role="list">
        {(only ? state.items.filter(only) : state.items).map((r) => (
          <View key={r.key} role="listitem">
          <Pressable
            role="button"
            aria-label={`${r.title}${r.year ? ` (${num(r.year)})` : ""}`}
            testID={`candidate-${r.key}`}
            onPress={() => {
              onPick(fromCandidate(r));
              if (clearOnPick) setQ("");
            }}
            style={StyleSheet.flatten([{ minHeight: control, flexDirection: "row", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule, alignItems: "center" }, web({ cursor: "pointer" })])}
          >
            <MediaPoster title={r.title} path={r.posterPath} width={44} />
            <View style={{ flex: 1, gap: space["3xs"] }}>
              <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>
                {r.title}
              </Title>
              <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                {r.year ? (
                  <Text variant="small" tone="muted">
                    {num(r.year)}
                  </Text>
                ) : null}
                {r.kind === "movie" || r.kind === "tv" || r.kind === "anime" ? <Tag label={t(`kind.${r.kind}`)} /> : null}
              </View>
            </View>
          </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

