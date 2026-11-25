import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { peopleApi } from "@/api/people";
import { useAction } from "@/api/useAction";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Toggle } from "@/ui/Toggle";
import { Text } from "@/ui";
import { useSession } from "../session";
import "./people.messages";

/** My two switches for one Cerchia: silence it, hide who is watching what. Each flips at once and goes back if the server says no. */
export function CircleSwitches({ circleId, muted, hideWatching, onChanged }: { circleId: string; muted: boolean; hideWatching: boolean; onChanged?: () => void }) {
  const { t } = useI18n();
  const { reload } = useSession();
  const [state, setState] = useState({ muted, hideWatching });
  const act = useAction();
  const set = async (patch: Partial<typeof state>) => {
    const before = state;
    setState({ ...before, ...patch });
    const res = await act.run(() => peopleApi.circleMe(circleId, patch));
    if (!res) setState(before);
    else {
      void reload();
      onChanged?.();
    }
  };
  return (
    <View style={{ gap: space["2xs"] }}>
      <Toggle label={t("settings.mute")} hint={t("settings.muteHint")} value={state.muted} onChange={(v) => void set({ muted: v })} testID={`mute-${circleId}`} />
      <Toggle label={t("settings.hideWatching")} hint={t("settings.hideWatchingHint")} value={state.hideWatching} onChange={(v) => void set({ hideWatching: v })} testID={`hide-${circleId}`} />
      {act.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, act.error)}
        </Text>
      ) : null}
    </View>
  );
}
