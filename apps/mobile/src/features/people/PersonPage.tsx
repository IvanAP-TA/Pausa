import type { PersonWorkDto } from "@pausa/api-types";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { api } from "@/api";
import { diaryApi } from "@/api/diary";
import { peopleCatalogApi } from "@/api/people-catalog";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { hair, space, useTheme, web } from "@/theme";
import { BackButton } from "@/ui/BackLink";
import { MediaPoster } from "@/ui/MediaPoster";
import { Empty, ErrorState, Heading, Loading, Screen, Text, Title } from "@/ui";
import { num, ymdToMs } from "../diary/shared";
import { RequireSession, useMe } from "../session";
import { VoteAvatars } from "../stats/VoteAvatars";
import "./person.messages";

const GROUPS = [["movie", "authorPage.films"], ["tv", "authorPage.series"], ["anime", "authorPage.anime"]] as const;
const ROLES = { director: "authorPage.role.director", creator: "authorPage.role.creator", author: "authorPage.role.author" } as const;
type Member = { userId: string; name: string; image?: string | null };

function Work({ w, circleId, members, meId }: { w: PersonWorkDto; circleId?: string; members: Member[]; meId: string }) {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busyRef = useRef(false);
  const open = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const id = w.mediaId ?? (await diaryApi.resolveMedia(w.workKey, locale)).id;
      router.push(href(circleId ? `/c/${circleId}/m/${id}` : `/t/${id}`) as Href);
    } catch (e) {
      setError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const rated = new Map(w.ratings.map((r) => [r.userId, r.rating]));
  const voters = members.filter((m) => rated.has(m.userId));
  const y = num(w.year);
  const roleKey = (ROLES as Record<string, (typeof ROLES)[keyof typeof ROLES]>)[w.role];
  return (
    <View role="listitem" testID={`work-${w.workKey}`} style={{ borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.sm, gap: space.xs }}>
      <Pressable role="link" aria-busy={busy} onPress={open} style={[{ flexDirection: "row", gap: space.sm, alignItems: "center", opacity: busy ? 0.55 : 1 }, web({ cursor: "pointer" })]}>
        <MediaPoster title={w.title} path={w.posterPath} width={48} />
        <View style={{ flex: 1, gap: space["3xs"] }}>
          <Title numberOfLines={2} style={{ fontSize: 22, lineHeight: 24 }}>{w.title}</Title>
          <Text variant="small" tone="muted">{[y, roleKey ? t(roleKey) : null].filter(Boolean).join(" · ")}</Text>
        </View>
        {busy ? <ActivityIndicator size="small" color={c.ink} /> : null}
        {w.avg ? <Title style={{ fontSize: 32, lineHeight: 32 }}>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(w.avg / 2)}</Title> : null}
      </Pressable>
      {error ? <ErrorState error={error} onRetry={open} /> : null}
      {voters.length > 0 ? <VoteAvatars people={voters} ratings={rated} meId={meId} /> : null}
    </View>
  );
}

function Body({ circleId, personKey }: { circleId?: string; personKey: string }) {
  const { t, locale, date, href } = useI18n();
  const router = useRouter();
  const me = useMe();
  // A deep link opened directly has no history: go to the Cerchia ranking (or the diary) instead of nowhere.
  const back = () => (router.canGoBack() ? router.back() : router.replace(href(circleId ? `/c/${circleId}/ranking` : "/log") as Href));
  const p = useResource((signal) => peopleCatalogApi.person(personKey, { locale, circle: circleId }, signal), [personKey, locale, circleId]);
  const circle = useResource((signal) => (circleId ? api.circle(circleId, signal) : Promise.resolve(null)), [circleId]);
  // If the Cerchia fails to load the page stays usable: the works show without votes.
  const members: Member[] = (circle.data?.members ?? []).map((m) => ({ userId: m.userId, name: m.name, image: m.image }));
  if (p.loading && !p.data) return <Loading rows={4} />;
  if (p.error || !p.data) return <ErrorState error={p.error} onRetry={p.reload} />;
  const d = p.data;
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? date(ymdToMs(v)) : v);
  const facts = [d.born ? t("authorPage.born", { date: day(d.born) }) : null, d.place, d.died ? t("authorPage.died", { date: day(d.died) }) : null].filter(Boolean).join(" · ");
  return (
    <>
      <BackButton label={t("authorPage.back")} onPress={back} />
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
        <MediaPoster title={d.name} path={d.profilePath} width={96} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Heading level={1}>{d.name}</Heading>
          {facts ? <Text tone="ink2">{facts}</Text> : null}
        </View>
      </View>
      {d.bio ? <Text tone="ink2" numberOfLines={6}>{d.bio}</Text> : null}
      {d.works.length === 0 ? <Empty title={t("authorPage.noWorks")} /> : null}
      {GROUPS.map(([kind, label]) => {
        const ws = d.works.filter((w) => w.kind === kind);
        if (ws.length === 0) return null;
        return (
          <View key={kind} style={{ gap: space.xs }}>
            <Heading level={2}>{t(label)}</Heading>
            <View role="list">{ws.map((w) => <Work key={w.workKey} w={w} circleId={circleId} members={members} meId={me.id} />)}</View>
          </View>
        );
      })}
    </>
  );
}

/** The key from the route: links carry it unencoded (`tmdb:9339`), an old or hand-typed `tmdb%3A9339` is decoded, a broken escape left as is. */
function paramKey(key: string | string[] | undefined): string {
  const raw = String(Array.isArray(key) ? key[0] : key ?? "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function PersonPage() {
  const { id, key } = useLocalSearchParams<{ id?: string; key: string }>();
  return (
    <RequireSession>
      <Screen>
        <Body circleId={id ? String(id) : undefined} personKey={paramKey(key)} />
      </Screen>
    </RequireSession>
  );
}
