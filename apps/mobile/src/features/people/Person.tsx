import type { MediaDto } from "@pausa/api-types";
import { Link, useLocalSearchParams, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/api";
import { peopleApi } from "@/api/people";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, space, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Stars } from "@/ui/Stars";
import { ErrorState, Heading, Loading, Screen, Tag, Text, Title } from "@/ui";
import { useCircleScope } from "../diary/shared";
import { RequireSession, useMe } from "../session";
import "./people.messages";

/** A row of posters that each open their title page. */
export function Shelf({ items, label }: { items: MediaDto[]; label: string }) {
  const { t, href } = useI18n();
  return (
    <View role="list" aria-label={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {items.map((m) => (
        <View key={m.id} role="listitem">
        <Link href={href(`/t/${m.id}`) as Href} asChild>
          <Pressable role="link" style={StyleSheet.flatten([{ minWidth: control, minHeight: control }, web({ cursor: "pointer" })])}>
            <MediaPoster title={m.title} path={m.posterPath} width={72} decorative={false} />
          </Pressable>
        </Link>
        </View>
      ))}
    </View>
  );
}

function PersonBody({ id, userId }: { id: string; userId: string }) {
  const { t, href, locale, date } = useI18n();
  const me = useMe();
  useCircleScope(id);
  const person = useResource((signal) => peopleApi.person(id, userId, locale, signal), [id, userId, locale]);
  const circle = useResource((signal) => api.circle(id, signal), [id]);
  const back = <BackLink to={href(`/c/${id}`)} label={circle.data?.name ?? t("person.back")} />;
  if (person.loading && !person.data)
    return (
      <Screen>
        {back}
        <Loading rows={4} />
      </Screen>
    );
  if (person.error || !person.data)
    return (
      <Screen>
        {back}
        <ErrorState error={person.error} onRetry={person.reload} />
      </Screen>
    );
  const p = person.data;
  const mine = p.person.id === me.id;
  const role = circle.data?.members.find((m) => m.userId === userId)?.role;
  const common = p.tasteCommon;
  return (
    <Screen>
      {back}
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        <Avatar name={p.person.name} image={p.person.image} size={72} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Heading level={1} style={{ fontSize: 44, lineHeight: 48 }}>
            {p.person.name}
          </Heading>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
            {role && role !== "member" ? <Tag label={t(`app.role.${role}`)} tone={role === "owner" ? "accent" : "ink2"} /> : null}
            <Text variant="small" tone="muted">
              {t("person.since", { date: date(p.joinedAt) })}
            </Text>
          </View>
        </View>
      </View>
      {p.bio ? <Text variant="lead">{p.bio}</Text> : mine ? <Text tone="muted">{t("profile.noBio")}</Text> : null}
      {mine ? <Button label={t("profile.edit")} variant="secondary" href={href("/me/profile")} /> : null}
      {p.genres.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {p.genres.map((g) => (
            <Tag key={g} label={g in GENRE_SET ? t(`profile.genres.${g as keyof typeof GENRE_SET}`) : g} />
          ))}
        </View>
      ) : null}

      <Section title={t("person.stats")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }} testID="person-stats">
          <View role="group" aria-label={`${p.logs} ${t("person.logs")}`}>
            <Title aria-hidden style={{ fontSize: 40, lineHeight: 42 }}>
              {p.logs}
            </Title>
            <Text aria-hidden variant="small" tone="ink2">
              {t("person.logs")}
            </Text>
          </View>
          {p.avgRating ? (
            <View role="group" aria-label={`${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(p.avgRating / 2)} ${t("person.avg")}`}>
              <Title aria-hidden style={{ fontSize: 40, lineHeight: 42 }}>
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(p.avgRating / 2)}
              </Title>
              <Stars halves={Math.round(p.avgRating)} size={14} />
              <Text aria-hidden variant="small" tone="ink2">
                {t("person.avg")}
              </Text>
            </View>
          ) : null}
        </View>
        {!mine ? (
          <Text testID="taste">{p.tasteMatch !== null ? t("person.taste", { percent: Math.round(p.tasteMatch * 100), count: common }) : t("person.tasteNone", { count: common })}</Text>
        ) : null}
        <Button label={t("person.all")} variant="secondary" href={`${href(`/c/${id}/feed`)}?person=${p.person.id}`} />
      </Section>

      {p.loved.length > 0 ? (
        <Section title={t("person.loved")}>
          <Shelf items={p.loved} label={t("person.loved")} />
        </Section>
      ) : null}
      {p.favorites.length > 0 ? (
        <Section title={t("profile.favorites")}>
          <Shelf items={p.favorites} label={t("profile.favorites")} />
        </Section>
      ) : null}
    </Screen>
  );
}

const GENRE_SET = { action: 1, adventure: 1, animation: 1, anime: 1, comedy: 1, crime: 1, documentary: 1, drama: 1, family: 1, fantasy: 1, history: 1, horror: 1, musical: 1, mystery: 1, romance: 1, scifi: 1, thriller: 1, war: 1, western: 1 } as const;

export function Person() {
  const { id, userId } = useLocalSearchParams<{ id: string; userId: string }>();
  return (
    <RequireSession>
      <PersonBody id={String(id)} userId={String(userId)} />
    </RequireSession>
  );
}
