import { View } from "react-native";
import { peopleApi } from "@/api/people";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Row, RowList } from "@/ui/Row";
import { Section } from "@/ui/Section";
import { Chevron, ErrorState, Heading, Loading, Screen, Tag, Text } from "@/ui";
import { useTheme } from "@/theme";
import { RequireSession } from "../session";
import { Shelf } from "./Person";
import "./people.messages";

function MeBody() {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const s = useResource((signal) => peopleApi.settings(signal), []);
  const link = (to: string, title: string, body: string, testID: string) => (
    <Row href={to} testID={testID}>
      <View style={{ flex: 1, gap: space["3xs"] }}>
        <Text variant="strong">{title}</Text>
        <Text variant="small" tone="muted">
          {body}
        </Text>
      </View>
      <Chevron color={c.muted} />
    </Row>
  );
  return (
    <Screen>
      {s.loading && !s.data ? <Loading rows={3} /> : null}
      {s.error ? <ErrorState error={s.error} onRetry={s.reload} /> : null}
      {s.data ? (
        <>
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            <Avatar name={s.data.name} image={s.data.image} size={72} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Heading level={1} style={{ fontSize: 44, lineHeight: 48 }}>
                {s.data.name}
              </Heading>
              <Text variant="small" tone="muted" selectable>
                {s.data.email}
              </Text>
            </View>
          </View>
          <Text tone={s.data.bio ? "ink" : "muted"}>{s.data.bio ?? t("profile.noBio")}</Text>
          {s.data.genres.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {s.data.genres.map((g) => (
                <Tag key={g} label={t(`profile.genres.${g as "action"}`)} />
              ))}
            </View>
          ) : null}
          <Button label={t("profile.edit")} variant="secondary" href={href("/me/profile")} testID="edit-profile" />
          <Section title={t("profile.favorites")}>
            {s.data.favorites.length > 0 ? <Shelf items={s.data.favorites} label={t("profile.favorites")} /> : <Text tone="muted">{t("profile.favoritesEmpty")}</Text>}
            <Text variant="small" tone="muted">
              {t("profile.favoritesHint")}
            </Text>
          </Section>
          <RowList>
            {link(href("/diary"), t("profile.diary"), t("people.me.diaryBody"), "me-diary")}
            {link(href("/lists"), t("profile.lists"), t("profile.listsBody"), "me-lists")}
            {link(href("/import"), t("profile.import"), t("profile.importBody"), "me-import")}
            {link(href("/me/settings"), t("profile.settings"), t("people.me.settingsBody"), "me-settings")}
            {link(href("/me/account"), t("manage.accountTitle"), t("manage.accountBody"), "me-account")}
          </RowList>
        </>
      ) : null}
    </Screen>
  );
}

export function Me() {
  return (
    <RequireSession>
      <MeBody />
    </RequireSession>
  );
}
