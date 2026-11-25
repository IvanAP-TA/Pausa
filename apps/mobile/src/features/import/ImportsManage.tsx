import type { ImportBatchDto, ImportUndone } from "@pausa/api-types";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { importApi } from "@/api/import";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { RequireSession } from "@/features/session";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { Empty, ErrorState, Loading, Notice } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { Toggle } from "@/ui/Toggle";
import "./import.messages";

type Source = "letterboxd" | "imdb" | "trakt" | "cinemaniac" | "anilist" | "mal";

/** One import run: what it added, where it went, and the two ways to take it back (out of the Cerchia, or for good). */
function Card({ b, onBanner, onChanged }: { b: ImportBatchDto; onBanner: (text: string) => void; onChanged: () => void }) {
  const { t, date, href } = useI18n();
  const { c } = useTheme();
  const [sheet, setSheet] = useState<"remove" | "delete" | null>(null);
  const [withLists, setWithLists] = useState(false);
  const act = useAction();
  const circle = b.circleName ?? "";
  const when = date(b.finishedAt ?? b.createdAt);

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
        <Text variant="strong">{t(`import.tabs.${b.source as Source}`)}</Text>
        <Tag label={t(`importApp.status.${b.status as "running" | "done" | "failed" | "cancelled"}`)} tone={b.status === "running" ? "accent" : "ink2"} />
        <Text variant="small" tone="muted">{when}</Text>
      </View>
      <Text tone="ink2" testID={`added-${b.id}`}>{t("imports.added", { count: b.imported })}</Text>
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
      {b.status === "running" ? (
        <Text variant="small" tone="ink2">{t("importApp.runningAt", { done: b.cursor, total: b.total ?? b.cursor })}</Text>
      ) : null}
      <Text variant="small" tone={b.circleId ? "ink" : "muted"} testID={`dest-${b.id}`}>
        {b.circleId ? t("imports.inCircle", { circle, count: b.imported, lists: b.lists }) : t("imports.privateOnly")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingTop: space.xs }}>
        {b.circleId ? <Button label={t("imports.remove", { circle })} variant="secondary" onPress={() => setSheet("remove")} testID={`remove-${b.id}`} /> : null}
        {b.status === "running" ? <Button label={t("importApp.continue")} variant="secondary" href={href("/import")} /> : null}
        {b.imported > 0 ? <Button label={t("imports.delete", { count: b.imported })} variant="danger" onPress={() => setSheet("delete")} testID={`delete-${b.id}`} /> : null}
      </View>
      {act.error ? <Text role="alert" tone="error">{errorMessage(t, act.error)}</Text> : null}

      <Sheet title={t("imports.confirmTitle", { circle })} open={sheet === "remove"} onClose={() => setSheet(null)}>
        <Text>{t("imports.confirmBody", { count: b.imported, circle, lists: b.lists })}</Text>
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

function Impl() {
  const { t, href } = useI18n();
  const list = useResource((signal) => importApi.list(signal), []);
  const [banner, setBanner] = useState<string | null>(null);
  return (
    <Screen>
      <Heading level={1}>{t("imports.title")}</Heading>
      <Text variant="lead" tone="ink2">{t("imports.lede")}</Text>
      {banner ? <Notice>{banner}</Notice> : null}
      <Text variant="small" tone="muted">{t("imports.note")}</Text>
      {list.loading && !list.data ? <Loading rows={3} /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? (
        <Empty title={t("imports.emptyTitle")} body={t("imports.emptyBody")}>
          <Button label={t("imports.toImport")} href={href("/import")} />
        </Empty>
      ) : null}
      {list.data && list.data.length > 0 ? (
        <View testID="imports">
          {list.data.map((b) => (
            <Card key={b.id} b={b} onBanner={setBanner} onChanged={list.reload} />
          ))}
        </View>
      ) : null}
      {list.data && list.data.length > 0 ? <Button label={t("imports.toImport")} variant="secondary" href={href("/import")} /> : null}
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
