import type { CandidateDto } from "@pausa/api-types";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { Row, RowList } from "@/ui/Row";
import { ErrorState, Loading } from "@/ui/Status";
import { Text } from "@/ui/Text";
import { dedupeTitles } from "./title-identity";

export type TitleSearchLabels = {
  field: string;
  none: string;
  add: (title: string) => string;
  added: (title: string) => string;
  addLabel: string;
  addedLabel: string;
};

/** Typing waits this long before asking (the old app used the same 350 ms), and two letters are the minimum. */
export const SEARCH_DELAY = 350;

/**
 * A search box over the catalogue with its results as rows. Nothing is stored by searching: `onPick` hands back the candidate, whose
 * `key` goes to the API when the title is used. `isPicked` greys out what is already in; `disabled` stops adding (a full list).
 */
export function TitleSearch({
  search, onPick, isPicked, labels, disabled, placeholder,
}: {
  search: (q: string, locale: string, signal: AbortSignal) => Promise<CandidateDto[]>;
  onPick: (c: CandidateDto) => void;
  isPicked: (c: CandidateDto) => boolean;
  labels: TitleSearchLabels;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ q: string; results: CandidateDto[] | null; error: unknown; loading: boolean }>({ q: "", results: null, error: null, loading: false });
  const abort = useRef<AbortController | null>(null);

  const run = (query: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setState({ q: query, results: null, error: null, loading: true });
    search(query, locale, ctl.signal).then(
      (results) => !ctl.signal.aborted && setState({ q: query, results: dedupeTitles(results), error: null, loading: false }),
      (error) => !ctl.signal.aborted && (error as { name?: string })?.name !== "AbortError" && setState({ q: query, results: null, error, loading: false }),
    );
  };

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      abort.current?.abort();
      setState({ q: "", results: null, error: null, loading: false });
      return;
    }
    const timer = setTimeout(() => run(query), SEARCH_DELAY);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locale]);
  useEffect(() => () => abort.current?.abort(), []);

  return (
    <View style={{ gap: space.sm }}>
      <Field label={labels.field} value={q} onChangeText={setQ} placeholder={placeholder} autoCapitalize="none" autoCorrect={false} returnKeyType="search" testID="title-search" />
      {state.loading ? <Loading rows={2} /> : null}
      {state.error ? <ErrorState error={state.error} onRetry={() => run(state.q)} /> : null}
      {state.results && state.results.length === 0 ? <Text tone="muted">{labels.none}</Text> : null}
      {state.results && state.results.length > 0 ? (
        <RowList>
          {state.results.map((r) => {
            const picked = isPicked(r);
            return (
              <Row key={r.key} testID={`result-${r.key}`}>
                <MediaPoster title={r.title} path={r.posterPath} width={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="strong" numberOfLines={2}>{r.title}</Text>
                  <Text variant="small" tone="muted">
                    {t(`kind.${r.kind as "movie" | "tv" | "anime"}`)}
                    {r.year !== null ? ` · ${Number(r.year)}` : ""}
                  </Text>
                </View>
                <Button
                  label={picked ? labels.addedLabel : labels.addLabel}
                  accessibilityLabel={picked ? labels.added(r.title) : labels.add(r.title)}
                  variant={picked ? "quiet" : "secondary"}
                  disabled={picked || disabled}
                  onPress={() => onPick(r)}
                />
              </Row>
            );
          })}
        </RowList>
      ) : null}
    </View>
  );
}
