import type { ReactNode } from "react";
import { View } from "react-native";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/api/errors";
import { hair, space, useTheme } from "@/theme";
import { Button } from "./Button";
import { Skeleton } from "./motion";
import { Heading, Text } from "./Text";

/** Loading state: bars where the rows will be, announced once as "loading". */
export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <View role="progressbar" aria-busy aria-label={t("app.loading")} style={{ gap: space.md }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={44} />
      ))}
    </View>
  );
}

/** Error state: what happened in a sentence (mapped from the server code), and a way to try again. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <View role="alert" style={{ gap: space.sm, borderTopWidth: hair, paddingTop: space.md }}>
      <Heading level={3}>{t("errors.errorTitle")}</Heading>
      <Text tone="ink2">{errorMessage(t, error)}</Text>
      {onRetry ? <Button label={t("errors.retry")} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Empty state: the plain statement and what to do about it. The pause mark of the old app is not ported (T8). */
export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.sm, backgroundColor: c.paper2, padding: space.lg }}>
      <Heading level={3}>{title}</Heading>
      {body ? <Text tone="ink2">{body}</Text> : null}
      {children}
    </View>
  );
}

/** A confirmation or a notice that is not an error; announced politely. */
export function Notice({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "ink2" }) {
  return (
    <Text role="status" aria-live="polite" tone={tone} variant="strong">
      {children}
    </Text>
  );
}
