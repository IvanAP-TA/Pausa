import { Link, useLocalSearchParams, type Href } from "expo-router";
import type { ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { peopleApi } from "@/api/people";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { BookOpen, ChartColumn, ChevronRight, Download, List, Pencil, Settings, Trophy } from "@/ui/lucide";
import { Row, RowList } from "@/ui/Row";
import { Chapter, Well } from "@/ui/Surfaces";
import { ErrorState, Heading, Loading, Notice, Screen, Tag, Text, TextLink, Title } from "@/ui";
import { RequireSession } from "../session";
import { ForYou } from "./ForYou";
import { PosterGrid } from "./PosterGrid";
import "./people.messages";

type Icon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

/** v1 `door`: an accent icon, the title in display type and one line under it, a chevron; the whole row is the link. */
function Door({ to, icon: I, title, body, testID }: { to: string; icon: Icon; title: string; body: string; testID: string }) {
  const { c } = useTheme();
  return (
    <Row href={to} testID={testID} style={{ minHeight: 64, paddingVertical: space.md, gap: space.md }}>
      <I size={22} strokeWidth={1.6} color={c.accent} />
      <View style={{ flex: 1, minWidth: 0, gap: space["3xs"] }}>
        <Title style={{ fontSize: 22, lineHeight: 24 }}>{title}</Title>
        <Text variant="small" tone="muted">
          {body}
        </Text>
      </View>
      <ChevronRight size={20} strokeWidth={1.6} color={c.muted} />
    </Row>
  );
}

function MeBody() {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const { ok } = useLocalSearchParams<{ ok?: string }>();
  const s = useResource((signal) => peopleApi.settings(signal), []);
  const edit = href("/me/profile");
  return (
    <Screen>
      {ok === "profile" ? <Notice>{t("profile.saved")}</Notice> : null}
      {s.loading && !s.data ? <Loading rows={3} /> : null}
      {s.error ? <ErrorState error={s.error} onRetry={s.reload} /> : null}
      {s.data ? (
        <>
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <Avatar name={s.data.name} image={s.data.image} size={88} />
              <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                <Heading level={1}>{s.data.name}</Heading>
                <Text variant="small" tone="muted" testID="me-logs">
                  {t("profile.logs", { count: s.data.logs })}
                </Text>
              </View>
            </View>
            <Text tone={s.data.bio ? "ink2" : "muted"} variant={s.data.bio ? "lead" : "body"}>
              {s.data.bio ?? t("profile.noBio")}
            </Text>
            {s.data.genres.length > 0 ? (
              <View role="list" aria-label={t("profile.genresTitle")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                {s.data.genres.map((g) => (
                  <View key={g} role="listitem">
                    <Tag label={t(`profile.genres.${g as "action"}`)} />
                  </View>
                ))}
              </View>
            ) : null}
            <Button label={t("profile.edit")} variant="secondary" icon={Pencil} href={edit} fullWidth testID="edit-profile" />
          </View>

          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Chapter>{t("profile.favorites")}</Chapter>
              </View>
              {s.data.favorites.length > 0 ? <TextLink href={edit}>{t("profile.change")}</TextLink> : null}
            </View>
            {s.data.favorites.length === 0 ? (
              <Link href={edit as Href} asChild>
                <Pressable role="link" testID="favorites-empty" style={StyleSheet.flatten([{ minHeight: control }, web({ cursor: "pointer" })])}>
                  <Well grained style={{ padding: space.lg, gap: space["2xs"] }}>
                    <Text variant="strong">{t("profile.favoritesEmpty")}</Text>
                    <Text variant="small" tone="muted">
                      {t("profile.favoritesHint")}
                    </Text>
                  </Well>
                </Pressable>
              </Link>
            ) : (
              <PosterGrid items={s.data.favorites} />
            )}
          </View>

          <View role="navigation" aria-label={t("profile.mine")}>
            <RowList style={{ borderBottomWidth: hair, borderColor: c.rule }}>
              <Door to={href("/diary")} icon={BookOpen} title={t("profile.diary")} body={t("profile.diaryBody", { count: s.data.logs, private: s.data.privateLogs })} testID="me-diary" />
              <Door to={href("/lists")} icon={List} title={t("profile.lists")} body={t("profile.listsBody")} testID="me-lists" />
              <Door to={href("/import")} icon={Download} title={t("profile.import")} body={t("profile.importBody")} testID="me-import" />
              <Door to={href("/me/achievements")} icon={Trophy} title={t("people.me.achievementsTitle")} body={t("people.me.achievementsBody")} testID="me-achievements" />
              <Door to={href("/me/stats")} icon={ChartColumn} title={t("people.me.statsTitle")} body={t("people.me.statsBody")} testID="me-stats" />
              <Door to={href("/me/account")} icon={Settings} title={t("profile.settings")} body={t("profile.settingsBody")} testID="me-account" />
            </RowList>
          </View>

          <View style={{ gap: space.md }}>
            <View style={{ gap: space["2xs"] }}>
              <Chapter>{t("profile.forYou")}</Chapter>
              <Text variant="small" tone="muted">
                {t("profile.forYouBody")}
              </Text>
            </View>
            <ForYou />
          </View>
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
