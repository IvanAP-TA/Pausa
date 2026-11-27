import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { achievementsApi } from "@/api/achievements";
import { ApiFailure } from "@/api/errors";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { num } from "@/features/diary/dates";
import { space } from "@/theme";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { Empty, ErrorState, Loading } from "@/ui/Status";
import { Chapter } from "@/ui/Surfaces";
import { Heading, Text } from "@/ui/Text";
import { MilestoneCard } from "./Milestone";
import "./public-profile.messages";

/**
 * `/u/:handle`: the page a member of the global board chose to turn on. No sign-in needed. Only what they chose to show: the
 * public name, the milestones reached, the score. Nothing about their Cerchie or what they watched.
 */
export function PublicProfile() {
  const { t, href, date } = useI18n();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const p = useResource((signal) => achievementsApi.publicProfile(String(handle ?? ""), signal), [handle]);
  const notFound = p.error instanceof ApiFailure && p.error.status === 404;
  return (
    <Screen>
      {p.loading && !p.data ? <Loading rows={3} /> : null}
      {notFound ? <Empty title={t("publicProfile.notFound")} body={t("publicProfile.notFoundBody")} /> : null}
      {p.error && !notFound ? <ErrorState error={p.error} onRetry={p.reload} /> : null}
      {p.data ? (
        <>
          <View style={{ gap: space.xs }}>
            <Heading level={1} testID="public-name">{p.data.publicName}</Heading>
            {p.data.scoreAll !== null && p.data.rankAll !== null ? (
              <Text tone="ink2" testID="public-score">{t("publicProfile.score", { count: num(p.data.scoreAll) ?? 0, rank: num(p.data.rankAll) ?? 0 })}</Text>
            ) : null}
            <Text variant="small" tone="muted">{t("publicProfile.since", { date: date(p.data.since) })}</Text>
          </View>
          <Chapter>{t("publicProfile.milestones")}</Chapter>
          {p.data.milestones.length === 0 ? (
            <Text tone="muted">{t("publicProfile.none")}</Text>
          ) : (
            <View role="list" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {p.data.milestones.map((m) => (
                <View role="listitem" key={m.kind} style={{ flexGrow: 1, flexBasis: 220 }}>
                  <MilestoneCard m={m} />
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
      <View style={{ gap: space.xs, marginTop: space.lg }}>
        <Text tone="ink2">{t("publicProfile.cta")}</Text>
        <Button label={t("publicProfile.ctaButton")} variant="secondary" href={href("/sign-in")} />
      </View>
    </Screen>
  );
}
