import type { BulkDayDto, ImportBatchDto, ImportUndone } from "@pausa/api-types";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { importApi } from "@/api/import";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { RequireSession } from "@/features/session";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Lock, STROKE, Users } from "@/ui/lucide";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { Empty, ErrorState, Loading, Notice } from "@/ui/Status";
import { Chapter } from "@/ui/Surfaces";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { Toggle } from "@/ui/Toggle";
import "./import.messages";

type Source = "letterboxd" | "imdb" | "trakt" | "cinemaniac" | "anilist" | "mal";

/** v1 date and time of a run: "26 novembre 2026, 14:05". */
function useWhen() {
  const { locale } = useI18n();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return (ms: number) => f.format(new Date(ms));
  }, [locale]);
}

/** Where the run went: the people icon while a Cerchia can still see it, the lock otherwise. */
function Where({ circle, there, testID, children }: { circle: boolean; there: boolean; testID?: string; children: string }) {
  const { c } = useTheme();
  const Icon = circle && there ? Users : Lock;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
      <View style={{ paddingTop: 3 }}>
        <Icon size={16} strokeWidth={STROKE} color={c.ink2} aria-hidden />
      </View>
      <Text variant="small" tone="ink2" style={{ flex: 1 }} testID={testID}>
        {children}
      </Text>
    </View>
  );
}

/** One import run: what it added, where it went, and the two ways to take it back (out of the Cerchia, or for good). */
function Card({ b, onBanner, onChanged }: { b: ImportBatchDto; onBanner: (text: string) => void; onChanged: () => void }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const when = useWhen();
  const [sheet, setSheet] = useState<"remove" | "delete" | null>(null);
  const [withLists, setWithLists] = useState(false);
  const act = useAction();
  const circle = b.circleName ?? "";
  const there = b.inCircle + b.listsInCircle > 0;

  const removeFromCircle = async () => {
    const res = await act.run(() => importApi.removeFromCircle(b.id));
    if (res) done(res.value, "remove");
  };
  const del = async () => {
    const res = await act.run(() => importApi.remove(b.id, withLists));
    if (res) done(res.value, "delete");
  };
  const done = (u: ImportUndone, kind: "remove" | "delete") => {
    setSheet(null);
    onBanner(kind === "remove" ? t("imports.removed", { count: u.viewings, lists: u.lists }) : t("imports.deleted", { count: u.viewings }));
    onChanged();
  };

  return (
    <View testID={`import-${b.id}`} style={{ gap: space.xs, paddingVertical: space.md, borderBottomWidth: hair, borderColor: c.rule }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
        <Heading level={2} style={{ fontSize: 28, lineHeight: 32 }}>{t(`import.tabs.${b.source as Source}`)}</Heading>
        <Tag label={t(`importApp.status.${b.status as "running" | "done" | "failed" | "cancelled"}`)} tone={b.status === "running" ? "accent" : "ink2"} />
      </View>
      <Text variant="small" tone="muted" testID={`when-${b.id}`}>
        {when(b.finishedAt ?? b.createdAt)}
        {" · "}
        {t("imports.added", { count: b.imported })}
      </Text>
      <Text variant="small" tone="muted">
        {[
          b.newTitles > 0 ? t("import.done.newTitles", { count: b.newTitles }) : null,
          b.skipped > 0 ? t("importApp.skipped", { count: b.skipped }) : null,
          b.lists > 0 ? t("importApp.lists", { count: b.lists }) : null,
          b.failedRows > 0 ? t("importApp.failedRows", { count: b.failedRows }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {b.status === "running" ? <Text variant="small" tone="ink2">{t("importApp.runningAt", { done: b.cursor, total: b.total ?? b.cursor })}</Text> : null}
      <Where circle={!!b.circleId} there={there} testID={`dest-${b.id}`}>
        {b.circleId && there ? t("imports.inCircle", { circle, count: b.inCircle, lists: b.listsInCircle }) : b.circleId ? t("imports.takenOut", { circle }) : t("imports.privateOnly")}
      </Where>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingTop: space.xs }}>
        {b.circleId && there ? <Button size="sm" label={t("imports.remove", { circle })} variant="secondary" onPress={() => setSheet("remove")} testID={`remove-${b.id}`} /> : null}
        {b.status === "running" ? <Button size="sm" label={t("importApp.continue")} variant="secondary" href={href("/import")} /> : null}
        {b.imported > 0 ? <Button size="sm" label={t("imports.delete", { count: b.imported })} variant="danger" onPress={() => setSheet("delete")} testID={`delete-${b.id}`} /> : null}
      </View>
      {act.error ? <Text role="alert" tone="error">{errorMessage(t, act.error)}</Text> : null}

      <Sheet title={t("imports.confirmTitle", { circle })} open={sheet === "remove"} onClose={() => setSheet(null)}>
        <Text>{t("imports.confirmBody", { count: b.inCircle, circle, lists: b.listsInCircle })}</Text>
        <Text tone="ink2">{t("imports.confirmKeep")}</Text>
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={act.busy ? t("imports.removing") : t("imports.confirmCta")} onPress={removeFromCircle} busy={act.busy} testID="confirm-remove" />
          <Button label={t("imports.cancel")} variant="quiet" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
      <Sheet title={t("imports.deleteTitle")} open={sheet === "delete"} onClose={() => setSheet(null)}>
        <Text>{t("imports.deleteBody", { count: b.imported })}</Text>
        <Text tone="ink2">{t("imports.deleteKeep")}</Text>
        {b.lists > 0 ? <Toggle label={t("importApp.deleteLists", { count: b.lists })} value={withLists} onChange={setWithLists} testID="delete-lists" /> : null}
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={act.busy ? t("imports.deleting") : t("imports.deleteCta")} variant="danger" onPress={del} busy={act.busy} testID="confirm-delete" />
          <Button label={t("imports.cancel")} variant="quiet" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </View>
  );
}

/** "Import vecchi": a UTC day with ten or more viewings and no run (older imports left no mark): hide it from the Cerchie or delete it. */
function Day({ d, onBanner, onChanged }: { d: BulkDayDto; onBanner: (text: string) => void; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const [sheet, setSheet] = useState<"hide" | "delete" | null>(null);
  const act = useAction();
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.day}T12:00:00Z`)), [locale, d.day]);

  const hide = async () => {
    const res = await act.run(() => importApi.hideBulkDay(d.day));
    if (res) {
      setSheet(null);
      onBanner(t("imports.removed", { count: res.value.viewings, lists: 0 }));
      onChanged();
    }
  };
  const del = async () => {
    const res = await act.run(() => importApi.deleteBulkDay(d.day));
    if (res) {
      setSheet(null);
      onBanner(t("imports.deleted", { count: res.value.viewings }));
      onChanged();
    }
  };

  return (
    <View testID={`day-${d.day}`} style={{ gap: space.xs, paddingVertical: space.md, borderBottomWidth: hair, borderColor: c.rule }}>
      <Heading level={3} style={{ fontSize: 28, lineHeight: 32 }}>{date}</Heading>
      <Text variant="small" tone="muted">{t("imports.olderAdded", { count: d.logs })}</Text>
      <Where circle={d.inCircles > 0} there={d.inCircles > 0} testID={`day-where-${d.day}`}>
        {d.inCircles > 0 ? t("imports.olderInCircles", { count: d.inCircles }) : t("imports.privateOnly")}
      </Where>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingTop: space.xs }}>
        {d.inCircles > 0 ? <Button size="sm" label={t("imports.olderHide")} variant="secondary" onPress={() => setSheet("hide")} testID={`hide-${d.day}`} /> : null}
        <Button size="sm" label={t("imports.delete", { count: d.logs })} variant="danger" onPress={() => setSheet("delete")} testID={`delete-day-${d.day}`} />
      </View>
      {act.error ? <Text role="alert" tone="error">{errorMessage(t, act.error)}</Text> : null}

      <Sheet title={t("imports.olderHideTitle", { date })} open={sheet === "hide"} onClose={() => setSheet(null)}>
        <Text>{t("imports.olderHideBody", { count: d.inCircles })}</Text>
        <Text tone="ink2">{t("imports.olderAll", { count: d.logs })}</Text>
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={act.busy ? t("imports.removing") : t("imports.olderHideCta")} onPress={hide} busy={act.busy} testID="confirm-hide-day" />
          <Button label={t("imports.cancel")} variant="quiet" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
      <Sheet title={t("imports.olderDeleteTitle", { date })} open={sheet === "delete"} onClose={() => setSheet(null)}>
        <Text>{t("imports.deleteBody", { count: d.logs })}</Text>
        <Text tone="ink2">{t("imports.olderAll", { count: d.logs })}</Text>
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={act.busy ? t("imports.deleting") : t("imports.deleteCta")} variant="danger" onPress={del} busy={act.busy} testID="confirm-delete-day" />
          <Button label={t("imports.cancel")} variant="quiet" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </View>
  );
}

function Impl() {
  const { t, href } = useI18n();
  const list = useResource((signal) => importApi.list(signal), []);
  const days = useResource((signal) => importApi.bulkDays(signal), []);
  const [banner, setBanner] = useState<string | null>(null);
  const reload = () => {
    void list.reload();
    void days.reload();
  };
  const batches = list.data ?? [];
  const older = days.data ?? [];
  const loaded = !!list.data && !!days.data;
  return (
    <Screen>
      <BackLink to={href("/me")} label={t("common.back")} />
      <Heading level={1}>{t("imports.title")}</Heading>
      <Text variant="lead" tone="ink2">{t("imports.lede")}</Text>
      {banner ? <Notice>{banner}</Notice> : null}
      {(list.loading && !list.data) || (days.loading && !days.data) ? <Loading rows={3} /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {loaded && batches.length === 0 && older.length === 0 ? (
        <Empty title={t("imports.emptyTitle")} body={t("imports.emptyBody")}>
          <Button label={t("imports.toImport")} href={href("/import")} />
        </Empty>
      ) : null}
      {batches.length > 0 ? (
        <View testID="imports">
          {batches.map((b) => (
            <Card key={b.id} b={b} onBanner={setBanner} onChanged={reload} />
          ))}
        </View>
      ) : null}
      {older.length > 0 ? (
        <View style={{ gap: space.sm }} testID="older-imports">
          <Chapter>{t("imports.olderTitle")}</Chapter>
          <Text variant="small" tone="ink2">{t("imports.olderLede")}</Text>
          <View>
            {older.map((d) => (
              <Day key={d.day} d={d} onBanner={setBanner} onChanged={reload} />
            ))}
          </View>
        </View>
      ) : null}
      <Text variant="small" tone="muted">{t("imports.note")}</Text>
    </Screen>
  );
}

export function ImportsManage() {
  return (
    <RequireSession>
      <Impl />
    </RequireSession>
  );
}
