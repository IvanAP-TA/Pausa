import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { diaryApi } from "@/api/diary";
import { useAction } from "@/api/useAction";
import { useI18n } from "@/i18n";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { Section } from "@/ui/Section";
import { Notice, Text } from "@/ui";
import { useSession } from "../session";
import "../diary/diary.messages";
import "./people.messages";

const WORD = "PAUSA";

/** "Take all my films out of this Cerchia": nothing is deleted, only the sharing goes. Needs the word typed, as the server does. */
export function Withdraw({ circleId, circleName }: { circleId: string; circleName: string }) {
  const { t } = useI18n();
  const { reload } = useSession();
  const [typed, setTyped] = useState("");
  const [wrong, setWrong] = useState(false);
  const [removed, setRemoved] = useState<number | null>(null);
  const act = useAction();
  const matches = typed.trim().toUpperCase() === WORD;
  return (
    <Section title={t("settings.removeMineTitle")} lede={t("settings.removeMineBody", { circle: circleName })}>
      <Field label={t("settings.removeMineType", { word: WORD })} value={typed} onChangeText={(v) => { setTyped(v); setWrong(false); }} autoCapitalize="characters" autoCorrect={false} error={wrong ? t("settings.removeMineWrong", { word: WORD }) : null} testID="withdraw-word" />
      <Button
        label={t("settings.removeMineGo")}
        variant="danger"
        busy={act.busy}
        testID="withdraw-go"
        onPress={async () => {
          if (!matches) {
            setWrong(true);
            return;
          }
          const res = await act.run(() => diaryApi.withdraw(circleId, typed.trim()));
          if (res) {
            setRemoved(res.value.removed);
            setTyped("");
            void reload();
          }
        }}
      />
      {removed !== null ? <Notice>{t("settings.removeMineDone", { count: removed })}</Notice> : null}
      {act.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, act.error)}
        </Text>
      ) : null}
    </Section>
  );
}
