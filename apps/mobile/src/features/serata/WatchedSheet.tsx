import type { LogDto } from "@pausa/api-types";
import { View } from "react-native";
import { serataApi } from "@/api/serata";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { errorMessage } from "@/api/errors";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/Button";
import { Row, RowList } from "@/ui/Row";
import { Sheet } from "@/ui/Sheet";
import { Empty, ErrorState, Loading } from "@/ui/Status";
import { Text } from "@/ui/Text";
import "./serata.messages";

/**
 * Finds MY diary entries of one title, newest first, by reading my diary page by page (the API has no filter by title; PAGE is 20,
 * so a few pages cover anybody's recent history of a film they just chose). Stops after three pages.
 */
async function myEntriesOf(mediaId: string, locale: string, signal: AbortSignal): Promise<LogDto[]> {
  const found: LogDto[] = [];
  let before: string | null = null;
  for (let page = 0; page < 3; page++) {
    const res = await serataApi.myDiary(locale, before, signal);
    found.push(...res.items.filter((l) => l.media.id === mediaId));
    if (!res.next) break;
    before = res.next;
  }
  return found;
}

/** "We watched it": pick one of MY diary entries for the winning title (or open the log form to make one), and link it to the Serata. */
export function WatchedSheet({ code, winner, open, onClose, onLinked }: { code: string; winner: { id: string; title: string } | undefined; open: boolean; onClose: () => void; onLinked: () => void }) {
  const { t, locale, href, date } = useI18n();
  const entries = useResource((signal) => (open && winner ? myEntriesOf(winner.id, locale, signal) : Promise.resolve([] as LogDto[])), [open, winner?.id, locale]);
  const link = useAction();
  if (!winner) return null;
  const pick = async (logId: string) => {
    if (await link.run(() => serataApi.watched(code, logId))) {
      onLinked();
      onClose();
    }
  };
  return (
    <Sheet title={t("serataApp.watched.title", { title: winner.title })} open={open} onClose={onClose}>
      <Text tone="ink2">{t("serataApp.watched.body")}</Text>
      {entries.loading ? <Loading rows={2} /> : null}
      {entries.error ? <ErrorState error={entries.error} onRetry={entries.reload} /> : null}
      {entries.data && entries.data.length === 0 ? <Empty title={t("serataApp.watched.none", { title: winner.title })}>{null}</Empty> : null}
      {entries.data && entries.data.length > 0 ? (
        <RowList>
          {entries.data.map((l) => (
            <Row key={l.id} onPress={() => pick(l.id)} testID={`log-${l.id}`}>
              <View style={{ flex: 1 }}>
                <Text variant="strong">{t("serataApp.watched.pick", { date: date(Date.parse(l.watchedOn)) })}</Text>
                <Text variant="small" tone="muted">
                  {l.rating !== null ? `${l.rating / 2} ★ · ` : ""}
                  {l.isRewatch ? t("serataApp.watched.rewatch") : t("serataApp.watched.first")}
                </Text>
              </View>
            </Row>
          ))}
        </RowList>
      ) : null}
      {link.error ? <Text role="alert" tone="error">{errorMessage(t, link.error)}</Text> : null}
      <Button label={t("serata.result.log")} variant="secondary" href={`${href("/log")}?media=${encodeURIComponent(winner.id)}`} />
    </Sheet>
  );
}
