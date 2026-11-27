import { Linking, View } from "react-native";
import { peopleApi } from "@/api/people";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space, useTheme } from "@/theme";
import { ExternalLink } from "@/ui/lucide";
import { Row, RowList } from "@/ui/Row";
import { Section } from "@/ui/Section";
import { Loading } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Text } from "@/ui/Text";
import "./where-to-watch.messages";

/**
 * "Dove guardarlo" on a title page. A title TMDB knows: the subscription services of your country (data by JustWatch), the
 * ones you have first. An anime only AniList knows: AniList's streaming sites, as links (AniList does not say in which
 * countries). Unknown is said as unknown, never as "nowhere".
 */
export function WhereToWatch({ mediaId }: { mediaId: string }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const a = useResource((signal) => peopleApi.availability(mediaId, signal), [mediaId]);
  if (a.error) return null;
  const d = a.data;
  const mine = new Set(d?.mine.map((p) => p.id) ?? []);
  return (
    <Section title={t("watch.title")}>
      {a.loading && !d ? <Loading rows={1} /> : null}
      {d && d.links.length > 0 ? (
        <View style={{ gap: space.xs }} testID="watch-links">
          <RowList>
            {d.links.map((l) => (
              <Row key={l.url} onPress={() => void Linking.openURL(l.url)} accessibilityLabel={t("watch.open", { site: l.site })}>
                <Text style={{ flex: 1 }}>{l.site}</Text>
                <ExternalLink size={18} strokeWidth={1.6} color={c.muted} />
              </Row>
            ))}
          </RowList>
          <Text variant="small" tone="muted">{t("watch.anilist")}</Text>
        </View>
      ) : null}
      {d && d.links.length === 0 && d.providers.length > 0 ? (
        <View style={{ gap: space.xs }} testID="watch-providers">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {[...d.providers].sort((x, y) => Number(mine.has(y.id)) - Number(mine.has(x.id))).map((p) => (
              <Tag key={String(p.id)} label={p.name} tone={mine.has(p.id) ? "accent" : "ink2"} />
            ))}
          </View>
          <Text variant="small" tone="muted">{t("watch.country", { country: d.country })}</Text>
        </View>
      ) : null}
      {d && d.links.length === 0 && d.providers.length === 0 ? (
        <Text tone="muted" testID="watch-none">{d.known ? t("watch.none", { country: d.country }) : t("watch.unknown")}</Text>
      ) : null}
    </Section>
  );
}
