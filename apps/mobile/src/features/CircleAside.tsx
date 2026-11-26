import type { RankingPage, Recommendation } from "@pausa/api-types";
import { Link, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { statsApi } from "@/api/stats";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { fallbackSans, fonts, hair, space, useTheme, web } from "@/theme";
import { MediaPoster } from "@/ui/MediaPoster";
import { Skeleton } from "@/ui/motion";
import { Stars } from "@/ui/Stars";
import { Text } from "@/ui/Text";
import { TextLink } from "@/ui/TextLink";
import { usePressed } from "@/ui/usePressed";

// v1 circle-aside.tsx: the second column of a Cerchia on wide screens (80rem and up), "Da vedere insieme" from the
// recommendation engine and the top five of the ranking. Mounted only on screens that wide, so a phone never asks for it.

function Head({ children, id }: { children: string; id: string }) {
  const { c } = useTheme();
  return (
    <Text role="heading" aria-level={2} nativeID={id} style={[{ fontFamily: fonts.display400, fontSize: 23, lineHeight: 24, color: c.ink, textTransform: "uppercase" }, web({ fontFamily: `${fonts.display400}, ${fallbackSans}`, letterSpacing: "-0.005em" })]}>
      {children}
    </Text>
  );
}

function HoverRow({ to, children }: { to: string; children: React.ReactNode }) {
  const { c } = useTheme();
  const { hovered, bind } = usePressed();
  return (
    <Link href={to as Href} asChild>
      <Pressable role="link" {...bind} style={StyleSheet.flatten([{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 10, borderTopWidth: hair, borderColor: c.rule, backgroundColor: hovered ? c.paper2 : "transparent" }, web({ cursor: "pointer", transition: "background-color 150ms" })])}>
        {children}
      </Pressable>
    </Link>
  );
}

export function CircleAside({ circleId }: { circleId: string }) {
  const { c } = useTheme();
  const { t, href, locale } = useI18n();
  const recs = useResource<Recommendation[]>((s) => statsApi.recommendations(circleId, { limit: 4, locale }, s), [circleId, locale]);
  const top = useResource<RankingPage>((s) => statsApi.ranking(circleId, { locale }, s), [circleId, locale]);
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rule = { borderBottomWidth: hair, borderColor: c.rule };
  return (
    <View role="complementary" aria-label={t("aside.label")} style={[{ width: 288, flexShrink: 0 }, web({ height: "100dvh", position: "sticky", top: 0 })]}>
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingVertical: space.xl - 8 }}>
        <View style={{ gap: space.sm }}>
          <Head id="aside-recs">{t("insights.recs.title")}</Head>
          {recs.loading ? <Skeleton height={176} /> : !recs.data?.length ? (
            <Text variant="small" tone="muted">{t("insights.recs.empty")}</Text>
          ) : (
            <View style={rule}>
              {recs.data.map((r) => (
                <HoverRow key={r.media.id} to={href(`/t/${r.media.id}`)}>
                  <MediaPoster title={r.media.title} path={r.media.posterPath} width={40} size="w92" />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="strong" numberOfLines={1}>{r.media.title}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                      <Text variant="small" tone="muted">{t(`kind.${r.media.kind as "movie" | "tv" | "anime"}`)}{r.media.year ? `, ${r.media.year}` : ""}</Text>
                      <Stars halves={Math.round(r.score)} size={12} />
                    </View>
                  </View>
                </HoverRow>
              ))}
            </View>
          )}
          <View style={{ alignSelf: "flex-start" }}><TextLink href={href(`/c/${circleId}/insights`)}>{t("aside.why")}</TextLink></View>
        </View>
        <View style={{ gap: space.sm }}>
          <Head id="aside-top">{t("aside.top")}</Head>
          {top.loading ? <Skeleton height={176} /> : !top.data?.items.length ? (
            <Text variant="small" tone="muted">{t("aside.topEmpty")}</Text>
          ) : (
            <View style={rule}>
              {top.data.items.slice(0, 5).map((r, i) => (
                <HoverRow key={r.media.id} to={href(`/t/${r.media.id}`)}>
                  <Text style={[{ width: 20, fontFamily: fonts.display200, fontSize: 19.2, lineHeight: 22, color: c.muted }, web({ fontFamily: `${fonts.display200}, ${fallbackSans}` })]}>{i + 1}</Text>
                  <Text numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{r.media.title}</Text>
                  {r.avg ? <Text variant="small" tone="ink2" style={web({ fontVariantNumeric: "tabular-nums" })}>{fmt.format(r.avg / 2)}</Text> : null}
                </HoverRow>
              ))}
            </View>
          )}
          <View style={{ alignSelf: "flex-start" }}><TextLink href={href(`/c/${circleId}/ranking`)}>{t("aside.allRanking")}</TextLink></View>
        </View>
      </ScrollView>
    </View>
  );
}
