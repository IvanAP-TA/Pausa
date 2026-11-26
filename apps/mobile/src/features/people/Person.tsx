import type { MediaDto } from "@pausa/api-types";
import { Link, useLocalSearchParams, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/api";
import { diaryApi } from "@/api/diary";
import { peopleApi } from "@/api/people";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { Chapter, Well } from "@/ui/Surfaces";
import { Stars } from "@/ui/Stars";
import { ErrorState, Heading, Loading, Screen, Tag, Text, Title } from "@/ui";
import { CardList, LogCard, useCircleScope } from "../diary/shared";
import { formatPosition } from "../diary/CircleHead";
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
  const recent = useResource((signal) => diaryApi.feed(id, { person: userId, locale }, signal), [id, userId, locale]);
  const { c } = useTheme();
  const circle = useResource((signal) => api.circle(id, signal), [id]);
  const back = <BackLink to={href(`/c/${id}/members`)} label={circle.data?.name ?? t("person.back")} />;
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
  const loved = p.loved.slice(0, 5);
  const stars = p.avgRating ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(p.avgRating / 2) : null;
  const figures: Array<{ label: string; value: string | number | null }> = [
    { label: t("person.logs"), value: p.logs },
    { label: t("person.titles"), value: p.titles },
    { label: t("person.avg"), value: stars },
  ];
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

      {p.watching ? (
        <Link href={href(`/t/${p.watching.media.id}`) as Href} asChild>
          <Pressable role="link" testID="person-watching" style={StyleSheet.flatten([web({ cursor: "pointer" })])}>
            <Well style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, minHeight: control }}>
              <MediaPoster title={p.watching.media.title} path={p.watching.media.posterPath} width={56} />
              <Text style={[{ flex: 1, minWidth: 0 }, web({ overflowWrap: "anywhere" })]}>
                {t("person.watching", { title: p.watching.media.title })}
                {formatPosition(p.watching.season, p.watching.episode) ? (
                  <Text tone="muted" style={web({ fontVariant: ["tabular-nums"] })}>
                    {" "}
                    {formatPosition(p.watching.season, p.watching.episode)}
                  </Text>
                ) : null}
              </Text>
            </Well>
          </Pressable>
        </Link>
      ) : null}

      {/* The figures: three large numbers parted by vertical hairlines, the label under each. */}
      <View
        role="group"
        aria-label={t("person.stats")}
        testID="person-stats"
        style={{ flexDirection: "row", borderTopWidth: hair, borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.md }}
      >
        {figures.map((f, i) => (
          <View
            key={f.label}
            style={{ flex: 1, minWidth: 0, gap: space["2xs"], paddingLeft: i === 0 ? 0 : space.sm, paddingRight: i === figures.length - 1 ? 0 : space.sm, borderLeftWidth: i === 0 ? 0 : hair, borderColor: c.rule }}
          >
            <Title style={{ fontSize: 40, lineHeight: 42 }} tone={f.value === null ? "muted" : undefined}>
              {f.value ?? "-"}
            </Title>
            <Text variant="small" tone="muted">
              {f.label}
            </Text>
          </View>
        ))}
      </View>

      {p.kinds.length > 0 ? (
        <Text variant="small" tone="muted" testID="person-kinds">
          {p.kinds.map((k) => `${t(`kind.${k.kind as "movie" | "tv" | "anime"}`)} ${k.count}`).join(", ")}
        </Text>
      ) : null}

      {!mine ? (
        <Text tone="ink2" testID="taste">
          {p.tasteMatch !== null ? t("person.taste", { percent: Math.round(p.tasteMatch * 100), count: common }) : t("person.tasteNone", { count: common })}
        </Text>
      ) : null}

      {loved.length > 0 ? (
        <View style={{ gap: space.sm }} testID="person-loved">
          <Chapter>{t("person.loved")}</Chapter>
          <View role="list" aria-label={t("person.loved")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {loved.map((m) => (
              <View key={m.id} role="listitem" style={{ width: 104, gap: space.xs }}>
                <Link href={href(`/t/${m.id}`) as Href} asChild>
                  <Pressable role="link" aria-label={m.title} style={web({ cursor: "pointer" })}>
                    <MediaPoster title={m.title} path={m.posterPath} width={104} decorative={false} />
                  </Pressable>
                </Link>
                <Stars halves={p.lovedRatings[p.loved.indexOf(m)]} size={16} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Chapter>{t("person.recent")}</Chapter>
        {recent.loading && !recent.data ? <Loading rows={2} /> : null}
        {recent.data && recent.data.items.length === 0 ? <Text tone="ink2">{t("person.noLogs")}</Text> : null}
        {recent.data && recent.data.items.length > 0 ? (
          <CardList>
            {recent.data.items.slice(0, 5).map((log) => (
              <LogCard key={log.id} log={log} circleId={id} />
            ))}
          </CardList>
        ) : null}
        {p.logs > 5 ? <Button label={t("person.all")} variant="secondary" href={`${href(`/c/${id}`)}?person=${p.person.id}`} /> : null}
      </View>

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
