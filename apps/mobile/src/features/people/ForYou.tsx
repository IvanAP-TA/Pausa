import type { ForYouPick } from "@pausa/api-types";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { peopleApi } from "@/api/people";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { MediaPoster } from "@/ui/MediaPoster";
import { Skeleton } from "@/ui/motion";
import { Well } from "@/ui/Surfaces";
import { Text, Title } from "@/ui";
import { useCurrentCircle } from "../current-circle";

/** v1 `for-you.tsx`: titles like the ones I rated well and have not logged; "why", the services of mine that carry it, and a way to log it. */
export function ForYou() {
  const { t, locale } = useI18n();
  const r = useResource((signal) => peopleApi.forYou(locale, signal), [locale]);
  if (r.loading && !r.data)
    return (
      <View aria-busy aria-label={t("discover.loading")} style={{ gap: space.md }}>
        <Skeleton height={160} />
      </View>
    );
  if (r.error || !r.data)
    return (
      <Well style={{ padding: space.lg }}>
        <Text tone="ink2">{r.error ? errorMessage(t, r.error) : t("discover.empty")}</Text>
      </Well>
    );
  if (!r.data.enabled)
    return (
      <Well style={{ padding: space.lg }}>
        <Text tone="ink2">{t("discover.off")}</Text>
      </Well>
    );
  if (r.data.picks.length === 0)
    return (
      <Well style={{ padding: space.lg }}>
        <Text tone="ink2">{t("discover.empty")}</Text>
      </Well>
    );
  return (
    <View role="list" testID="for-you">
      {r.data.picks.map((p) => (
        <Pick key={p.key} p={p} />
      ))}
    </View>
  );
}

function Pick({ p }: { p: ForYouPick }) {
  const { t, locale, href } = useI18n();
  const { c } = useTheme();
  const router = useRouter();
  const { circleId } = useCurrentCircle();
  const go = useAction();
  const list = (names: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  return (
    <View role="listitem" testID={`pick-${p.key}`} style={{ flexDirection: "row", gap: space.md, paddingVertical: space.lg, borderBottomWidth: hair, borderColor: c.rule }}>
      <MediaPoster title={p.title} path={p.posterPath} width={104} size="w342" />
      <View style={{ flex: 1, minWidth: 0, gap: space["2xs"] }}>
        <Title style={{ fontSize: 24, lineHeight: 26 }}>{p.title}</Title>
        <Text variant="small" tone="muted">
          {t(`kind.${p.kind as "movie"}`)}
          {p.year ? `, ${p.year}` : ""}
        </Text>
        <Text style={{ marginTop: space.xs }}>{t("discover.because", { titles: list(p.because.map((b) => b.title)) })}</Text>
        {p.on.length > 0 ? (
          <Text variant="small" tone="ink2">
            {t("discover.on", { services: list(p.on.map((x) => x.name)) })}
          </Text>
        ) : null}
        <View style={{ alignSelf: "flex-start" }}>
          <Button
            size="sm"
            variant="quiet"
            label={t("discover.log")}
            accessibilityLabel={`${t("discover.log")}: ${p.title}`}
            busy={go.busy}
            testID={`pick-log-${p.key}`}
            onPress={async () => {
              const res = await go.run(() => diaryApi.resolveMedia(p.key, locale));
              if (res) router.push(href(`/log?media=${res.value.id}${circleId ? `&circle=${circleId}` : ""}`) as never);
            }}
          />
        </View>
        {go.error ? (
          <Text tone="error" role="alert">
            {errorMessage(t, go.error)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
