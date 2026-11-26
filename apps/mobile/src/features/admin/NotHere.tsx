import { View } from "react-native";
import { ApiFailure } from "@/api/errors";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button, ErrorState, Heading, Text } from "@/ui";

/** True when the server answered 404: for the operator's pages that means "you are not the operator", and it is shown as a missing page. */
export const isMissing = (error: unknown) => error instanceof ApiFailure && error.code === "not_found";

/** The same words as the 404 page: the operator's area does not say that it exists. */
export function NotHere() {
  const { t, href } = useI18n();
  return (
    <View style={{ gap: space.sm, paddingTop: space.lg }}>
      <Heading level={1}>{t("errors.notFoundTitle")}</Heading>
      <Text tone="ink2">{t("errors.notFoundBody")}</Text>
      <Button label={t("errors.home")} href={href("/home")} variant="secondary" />
    </View>
  );
}

/** A failed load of an operator page: a missing page for 404, the usual error with a retry otherwise. */
export function AdminError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return isMissing(error) ? <NotHere /> : <ErrorState error={error} onRetry={onRetry} />;
}
