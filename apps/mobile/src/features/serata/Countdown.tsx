import { useEffect, useState } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { ProgressBar } from "@/ui/ProgressBar";
import { Text } from "@/ui/Text";
import "./serata.messages";
import { clock, elapsedShare, secondsLeft } from "./room-logic";

/**
 * The time left in this round, read against the SERVER's clock (`offset`). It never closes anything: at zero it says it is waiting for
 * the server, and asks the room once more every few seconds in case the push was missed (`onOverdue`). Key it by the deadline so a
 * new round starts a fresh bar. Screen readers get the whole phrase from the label; the ticking digits are not announced.
 */
export function Countdown({ deadline, offset, onOverdue }: { deadline: number; offset: number; onOverdue: () => void }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [duration] = useState(() => Math.max(1000, deadline - (Date.now() + offset)));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = secondsLeft(deadline, offset, now) ?? 0;
  useEffect(() => {
    if (left > 0) return;
    const id = setInterval(onOverdue, 3000);
    const first = setTimeout(onOverdue, 1200);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [left, onOverdue]);
  return (
    <View role="timer" aria-label={t("serataApp.room.timeLeft", { time: clock(left) })} style={{ gap: space["2xs"] }} testID="countdown">
      <Text variant="strong" aria-hidden style={{ fontVariant: ["tabular-nums"] }}>
        {left > 0 ? clock(left) : t("serataApp.room.closing")}
      </Text>
      <ProgressBar value={Math.round(elapsedShare(deadline, offset, duration, now) * 100)} max={100} label={t("serataApp.room.timeLeft", { time: clock(left) })} tone="accent" height={6} decorative />
    </View>
  );
}
