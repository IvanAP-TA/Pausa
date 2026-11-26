import { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useI18n } from "@/i18n";
import { fonts, space, useTheme, web } from "@/theme";
import { Text } from "@/ui/Text";
import "./serata.messages";
import { clock, elapsedShare, secondsLeft } from "./room-logic";

const RING = 64;
const R = 20;
const CIRC = 2 * Math.PI * R;

/**
 * The time left in this round as v1's ring: a 64px circle that empties clockwise with "0:SS" in the middle (display capitals). It is
 * read against the SERVER's clock (`offset`) and never closes anything: at zero it says it is waiting for the server, and asks the
 * room once more every few seconds in case the push was missed (`onOverdue`). Key it by the deadline so a new round starts a fresh
 * ring. Screen readers get the whole phrase from the label; the ticking digits and the ring are not announced (not a progressbar:
 * that role is the app's "loading" signal).
 */
export function Countdown({ deadline, offset, onOverdue }: { deadline: number; offset: number; onOverdue: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
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
  const remaining = 1 - elapsedShare(deadline, offset, duration, now);
  return (
    <View role="timer" aria-label={t("serataApp.room.timeLeft", { time: clock(left) })} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }} testID="countdown">
      {left === 0 ? (
        <Text aria-hidden variant="small" tone="muted">
          {t("serataApp.room.closing")}
        </Text>
      ) : null}
      <View aria-hidden style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
        <Svg width={RING} height={RING} viewBox="0 0 44 44" style={{ position: "absolute" }}>
          <Circle cx={22} cy={22} r={R} fill="none" stroke={c.rule} strokeWidth={2} />
          <Circle
            cx={22}
            cy={22}
            r={R}
            fill="none"
            stroke={c.accent}
            strokeWidth={2}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - Math.max(0, Math.min(1, remaining)))}
            rotation={-90}
            origin="22, 22"
          />
        </Svg>
        <Text style={[{ fontFamily: fonts.display200, fontSize: 24, lineHeight: 26, fontVariant: ["tabular-nums"] }, web({ fontFamily: `${fonts.display200}, ui-sans-serif, sans-serif` })]}>{clock(left)}</Text>
      </View>
    </View>
  );
}
