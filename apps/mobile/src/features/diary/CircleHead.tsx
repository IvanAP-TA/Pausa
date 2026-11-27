import type { CircleDetail, CircleExtras, WatchingDto } from "@pausa/api-types";
import { Link, type Href } from "expo-router";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { COVER_GLYPH, COVERS } from "@/api/endpoints";
import { diaryApi } from "@/api/diary";
import { errorMessage } from "@/api/errors";
import { useAction } from "@/api/useAction";
import { useI18n } from "@/i18n";
import { breakpoints, control, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { Button } from "@/ui/Button";
import { Glyph } from "@/ui/Glyph";
import { ChevronRight, List, Trophy } from "@/ui/lucide";
import { MediaPoster } from "@/ui/MediaPoster";
import { Row, RowList } from "@/ui/Row";
import { Chapter, Meter, Reel, Well } from "@/ui/Surfaces";
import { Heading, Text, Title } from "@/ui/Text";
import { usePressed } from "@/ui/usePressed";
import "./diary.messages";

const isCover = (v: string | null): v is (typeof COVERS)[number] => !!v && (COVERS as readonly string[]).includes(v);

/**
 * v1 diary head: the name of the Cerchia across the whole sheet (its cover glyph before it), the description, then who is in it
 * (four avatars and "N membri, N visioni quest'anno", a link to the Cerchia page) and, on a phone, Classifica and Liste as
 * buttons (from 64rem both are rows of the rail).
 */
export function CircleHead({ circle }: { circle: CircleDetail }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { hovered, bind } = usePressed();
  const phone = width < breakpoints.rail;
  const glyph = isCover(circle.cover) ? COVER_GLYPH[circle.cover] : null;
  const base = `/c/${circle.id}`;
  return (
    <View style={{ gap: space.sm }} testID="circle-head">
      <Heading level={1} style={web({ overflowWrap: "anywhere" })}>
        {glyph ? <Glyph style={{ marginRight: space.xs }}>{glyph}</Glyph> : null}
        {circle.name}
      </Heading>
      {circle.description ? (
        <Text tone="ink2" style={[{ maxWidth: 560 }, web({ overflowWrap: "anywhere" })]}>
          {circle.description}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: space.md, rowGap: space.sm }}>
        <Link href={href(`${base}/members`) as Href} asChild>
          <Pressable role="link" {...bind} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 }} testID="circle-head-members">
            <View aria-hidden style={{ flexDirection: "row" }}>
              {circle.members.slice(0, 4).map((m, i) => (
                <View key={m.userId} style={{ marginLeft: i === 0 ? 0 : -6, borderWidth: 2, borderColor: c.paper, borderRadius: 999 }}>
                  <Avatar name={m.name} image={m.image} size={28} />
                </View>
              ))}
            </View>
            <Text variant="small" tone={hovered ? "ink" : "muted"} style={{ flexShrink: 1 }}>
              {t("feed.members", { count: circle.members.length })}, {t("feed.logsThisYear", { count: circle.logsThisYear })}
            </Text>
          </Pressable>
        </Link>
        {phone ? (
          <View style={{ flexDirection: "row", gap: space.xs }}>
            <Button size="sm" style={{ minHeight: control }} variant="secondary" icon={Trophy} label={t("tabs.ranking")} href={href(`${base}/ranking`)} />
            <Button size="sm" style={{ minHeight: control }} variant="secondary" icon={List} label={t("tabs.lists")} href={`${href("/lists")}?circle=${circle.id}`} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** v1 `formatProgress`: S2·E5, E5, S2, or nothing. */
export const formatPosition = (season: number | null, episode: number | null): string | null =>
  season && episode ? `S${season}·E${episode}` : episode ? `E${episode}` : season ? `S${season}` : null;

/**
 * "Chi sta guardando adesso": a strip that scrolls sideways, each person a frame of film (`.reel`) with the poster, the title and
 * where they are. On my own frame, +1 episodio / Nuova stagione / Finito o mollato; on the others, a slow live dot.
 */
export function OnAir({ watching, meId, onChanged }: { watching: WatchingDto[]; meId: string | undefined; onChanged: () => void }) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  if (!watching.length) return null;
  const frame = Math.min(width * 0.82, 320);
  // v1: bleeds to the screen edge on a phone (-mx-4 px-4), sits inside the column from 64rem (lg:mx-0 lg:px-0).
  const bleed = width < breakpoints.rail ? 16 : 0;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={frame + 2}
      decelerationRate="fast"
      role="list"
      aria-label={t("feed.onAir")}
      testID="on-air"
      style={[{ marginHorizontal: -bleed, flexGrow: 0 }, web({ scrollbarWidth: "none", overscrollBehaviorX: "contain", scrollSnapType: "x mandatory", scrollPaddingLeft: bleed })]}
      contentContainerStyle={{ paddingHorizontal: bleed, gap: 2 }}
    >
      {watching.map((w) => (
        <OnAirFrame key={w.user.id} w={w} mine={w.user.id === meId} width={frame} onChanged={onChanged} />
      ))}
    </ScrollView>
  );
}

function OnAirFrame({ w, mine, width, onChanged }: { w: WatchingDto; mine: boolean; width: number; onChanged: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const act = useAction();
  // v1 .btn-sm: 36px under a pointer, 44 under a finger; the phone layout is the finger one.
  const finger = useWindowDimensions().width < breakpoints.rail ? { minHeight: control } : undefined;
  const where = formatPosition(w.season, w.episode);
  const run = async (fn: () => Promise<unknown>) => {
    if (await act.run(fn)) onChanged();
  };
  return (
    <View role="listitem" style={[{ width }, web({ scrollSnapAlign: "start" })]}>
      <Reel style={{ flex: 1, gap: space.sm, paddingHorizontal: space.sm, paddingVertical: 26 }}>
       <View style={{ flex: 1, flexDirection: "row", gap: space.sm }}>
        <MediaPoster title={w.media.title} path={w.media.posterPath} width={56} />
        <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between", gap: space.xs }}>
          <View>
            <Text variant="small">
              <Text variant="small" style={{ fontWeight: "600" }}>
                {w.user.name}
              </Text>{" "}
              <Text variant="small" tone="ink2">
                {t("feed.isWatching")}
              </Text>
            </Text>
            <Title numberOfLines={2} style={{ marginTop: space["2xs"], fontSize: 20, lineHeight: 24 }}>
              {w.media.title}
            </Title>
            {where ? (
              <Text variant="small" tone="muted" style={web({ fontVariantNumeric: "tabular-nums" })}>
                {where}
              </Text>
            ) : null}
          </View>
          {mine ? null : (
            <View aria-hidden style={[{ width: 8, height: 8, backgroundColor: c.accent }, web({ animation: "pausa-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" })]} />
          )}
        </View>
       </View>
          {/* My own frame: the actions get the whole width of the frame (in the text column they were squeezed to its edge). */}
          {mine ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {w.media.kind !== "movie" ? (
                <>
                  <Button size="sm" style={finger} label={t("feed.nextEpisode")} accessibilityLabel={`${t("feed.nextEpisode")}: ${w.media.title}`} busy={act.busy} onPress={() => void run(() => diaryApi.advance(w.media.id))} />
                  <Button size="sm" variant="quiet" style={finger} label={t("feed.nextSeason")} accessibilityLabel={`${t("feed.nextSeason")}: ${w.media.title}`} busy={act.busy} onPress={() => void run(() => diaryApi.advance(w.media.id, true))} />
                </>
              ) : null}
              <Button size="sm" variant="quiet" style={finger} label={t("feed.stopWatching")} accessibilityLabel={`${t("feed.stopWatching")}: ${w.media.title}`} busy={act.busy} onPress={() => void run(() => diaryApi.clearProgress(w.media.id))} />
            </View>
          ) : null}
          {act.error ? (
            <Text variant="small" tone="error" role="alert">
              {errorMessage(t, act.error)}
            </Text>
          ) : null}
      </Reel>
    </View>
  );
}

/**
 * v1 `Extras`: under the strip, before the diary. "Per cominciare" in a grained well (only what is left to do; what is done is a
 * count and a meter) and "Un anno fa… e oltre" (viewings shared here on this day of earlier years). Never in the way: nothing
 * shows while it loads or if it fails.
 */
export function CircleExtrasView({ circleId, extras }: { circleId: string; extras: CircleExtras | null }) {
  const { t, href } = useI18n();
  if (!extras) return null;
  const steps = [
    { done: extras.hasLog, label: t("retention.stepLog"), to: href("/log") },
    { done: extras.hasCompany, label: t("retention.stepInvite"), to: href(`/c/${circleId}/members`) },
    { done: extras.hasSerata, label: t("retention.stepSerata"), to: href(`/c/${circleId}/serate`) },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <>
      {doneCount < steps.length ? (
        <Well grained style={{ padding: space.md + 4, gap: space.sm }}>
          <View testID="first-steps" style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
              <Title role="heading" aria-level={2} style={{ fontSize: 32, lineHeight: 34 }}>
                {t("retention.firstStepsTitle")}
              </Title>
              <Text variant="small" tone="muted" style={[{ flexShrink: 0 }, web({ fontVariantNumeric: "tabular-nums" })]}>
                {t("retention.stepsDone", { done: doneCount, total: steps.length })}
              </Text>
            </View>
            <Meter value={doneCount / steps.length} />
          </View>
          <RowList>
            {steps
              .filter((s) => !s.done)
              .map((s) => (
                <StepRow key={s.label} label={s.label} to={s.to} />
              ))}
          </RowList>
        </Well>
      ) : null}
      {extras.memories.length ? (
        <View style={{ gap: space.sm }} testID="memories">
          <Chapter>{t("retention.memoriesTitle")}</Chapter>
          <RowList>
            {extras.memories.map((m) => (
              <Row key={m.logId} href={href(`/c/${circleId}/log/${m.logId}`)} style={{ alignItems: "flex-start" }}>
                <MediaPoster title={m.media.title} path={m.media.posterPath} width={56} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="small" tone="muted">
                    {t("retention.yearsAgo", { count: m.yearsAgo })}
                  </Text>
                  <Text>
                    <Text style={{ fontWeight: "600" }}>{m.author.name}</Text> {t("retention.saw")} <Text style={{ fontWeight: "600" }}>{m.media.title}</Text>
                  </Text>
                  {m.review ? (
                    <Text variant="small" tone="ink2" numberOfLines={2} style={{ marginTop: space["2xs"] }}>
                      {m.review}
                    </Text>
                  ) : null}
                </View>
              </Row>
            ))}
          </RowList>
        </View>
      ) : null}
    </>
  );
}

function StepRow({ label, to }: { label: string; to: string }) {
  const { c } = useTheme();
  const { hovered, bind } = usePressed();
  return (
    <View role="listitem" style={{ borderBottomWidth: 1, borderColor: c.rule }}>
      <Link href={to as Href} asChild>
        <Pressable role="link" {...bind} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <Text variant="strong" style={[{ color: hovered ? c.accent : c.ink }, web({ transition: "color 150ms" })]}>
            {label}
          </Text>
          <ChevronRight size={20} strokeWidth={1.6} color={c.muted} />
        </Pressable>
      </Link>
    </View>
  );
}
