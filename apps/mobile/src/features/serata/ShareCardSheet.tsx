import type { SerataPublicResult } from "@pausa/api-types";
import { useMemo, useRef, useState } from "react";
import { View, useWindowDimensions, type HostInstance } from "react-native";
import { siteOrigin } from "@/features/circle-links";
import { serataApi } from "@/api/serata";
import { useResource } from "@/api/useResource";
import { useAction } from "@/api/useAction";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Sheet } from "@/ui/Sheet";
import { ErrorState, Loading, Notice } from "@/ui/Status";
import { Text } from "@/ui/Text";
import { exportCard } from "./card-image";
import { SIZES, type Variant } from "./card-spec";
import { CardView, type CardData } from "./CardView";
import { qrMatrix } from "./qr";
import { roomLink } from "./room-logic";
import "./serata.messages";

/** The text of a card, from the public result and the person's language. */
export function cardData(r: SerataPublicResult, t: ReturnType<typeof useI18n>["t"], locale: string, date: (ms: number) => string): CardData {
  const url = roomLink(siteOrigin(), locale, r.code);
  const parts = [t(`serata.mode.${r.mode as "bracket" | "table"}`), t("serata.result.rounds", { count: r.turns }), t("serata.result.people", { count: r.people })];
  return {
    title: r.winner.title,
    year: r.winner.year === null ? null : Number(r.winner.year),
    posterPath: r.winner.posterPath,
    kicker: t("serata.result.kicker"),
    meta: `${parts.join(" · ")} · ${date(r.finishedAt)}`,
    caption: t("serata.result.qr"),
    url,
    locale,
    qr: qrMatrix(url),
  };
}

/**
 * The share card of a finished Serata: a preview of the card in the shape chosen (story 1080x1920 for stories, 1200x630 for link
 * previews), and two ways out: share it (system sheet, or Web Share with the file) or save it (a download on web). The text comes
 * from `GET /api/serate/:code/result`, which needs no sign-in, so a guest can do it too.
 */
export function ShareCardSheet({ code, open, onClose }: { code: string; open: boolean; onClose: () => void }) {
  const { t, locale, date } = useI18n();
  const { width } = useWindowDimensions();
  const res = useResource((signal) => serataApi.publicResult(code, signal), [code]);
  const [variant, setVariant] = useState<Variant>("story");
  const action = useAction();
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HostInstance>(null);
  const data = useMemo(() => (res.data ? cardData(res.data, t, locale, date) : null), [res.data, t, locale, date]);
  const previewW = Math.min(340, width - 2 * space.md - 8);
  const scale = previewW / SIZES[variant].w;

  const go = async (saveOnly: boolean) => {
    if (!data) return;
    setDone(null);
    const out = await action.run(() => exportCard({ variant, data, viewRef: ref, saveOnly, fileName: `pausa-serata-${code}-${variant}.png` }));
    if (out && out.value !== "cancelled") setDone(out.value === "downloaded" ? t("serataApp.card.saved") : t("serataApp.card.shared"));
  };

  return (
    <Sheet title={t("serataApp.card.title")} open={open} onClose={onClose}>
      {res.loading ? <Loading rows={3} /> : null}
      {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : null}
      {data ? (
        <View style={{ gap: space.md }}>
          <Choice
            label={t("serataApp.card.format")}
            value={variant}
            options={[
              { value: "story", label: t("serataApp.card.story") },
              { value: "og", label: t("serataApp.card.og") },
            ]}
            onChange={(v) => {
              setVariant(v);
              setDone(null);
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            <Button label={t("serata.result.share")} onPress={() => go(false)} busy={action.busy} testID="card-share" />
            <Button label={t("serataApp.card.save")} variant="secondary" onPress={() => go(true)} busy={action.busy} testID="card-save" />
          </View>
          <View style={{ alignItems: "center" }} testID="card-preview">
            <CardView variant={variant} data={data} scale={scale} viewRef={ref} />
          </View>
          <Text variant="small" tone="muted">{t("serataApp.card.size", { w: SIZES[variant].w, h: SIZES[variant].h })}</Text>
          {action.error ? <Text role="alert" tone="error">{t("serataApp.card.failed")}</Text> : null}
          {done ? <Notice>{done}</Notice> : null}
        </View>
      ) : null}
    </Sheet>
  );
}
