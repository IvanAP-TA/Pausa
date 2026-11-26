import type { AuthorDto } from "@pausa/api-types";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Text, TextLink } from "@/ui";
import "./diary.messages";

/** Who made the title (director, creator or author): one role label, then each name linked to its person page. */
export function Authors({ authors, circleId }: { authors: AuthorDto[]; circleId?: string }) {
  const { t, href } = useI18n();
  if (authors.length === 0) return null;
  const role = authors[0].role as "director" | "creator" | "author";
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: space["2xs"] }}>
      <Text tone="muted">{t(`diary.authors.${role}`)}</Text>
      {/* Each link is its own flex child, not nested in a Text: inline inside a Text its padding stops counting and the target drops under 44pt. */}
      {authors.map((a, i) => (
        <View key={a.key} style={{ flexDirection: "row", alignItems: "baseline" }}>
          <TextLink href={href(circleId ? `/c/${circleId}/person/${a.key}` : `/person/${a.key}`)}>{a.name}</TextLink>
          {i < authors.length - 1 ? <Text>,</Text> : null}
        </View>
      ))}
    </View>
  );
}
