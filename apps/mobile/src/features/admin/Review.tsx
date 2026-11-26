import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { adminApi } from "@/api/admin";
import { ApiFailure, errorMessage } from "@/api/errors";
import { setToken } from "@/api/token";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button, Field, Heading, Loading, Screen, Text } from "@/ui";
import { Well } from "@/ui/Surfaces";
import { useSession } from "../session";
import { AdminError } from "./NotHere";
import "./admin.messages";

/**
 * Sign-in for app-store reviewers, who cannot receive an email link. The page exists only when the server has the review
 * password configured: until it answers, nothing is shown, and when it answers 404 the page is a missing page.
 * The password is sent once to the server and kept nowhere (not in the address, not in storage).
 */
export function Review() {
  const { t, href } = useI18n();
  const router = useRouter();
  const { reload } = useSession();
  const status = useResource((s) => adminApi.reviewStatus(s), []);
  const [password, setPassword] = useState("");
  const act = useAction();

  const submit = async () => {
    if (!password) return;
    const res = await act.run(() => adminApi.reviewSignIn(password, Platform.OS !== "web"));
    if (!res) return;
    setPassword("");
    if (res.value.token) await setToken(res.value.token);
    await reload();
    router.replace(href(`/c/${res.value.circleId}`) as never);
  };

  const failure = act.error;
  const message =
    failure instanceof ApiFailure && failure.code === "unauthorized"
      ? t("admin.review.wrong")
      : failure instanceof ApiFailure && failure.code === "rate_limited"
        ? t("admin.review.slow")
        : failure
          ? errorMessage(t, failure)
          : null;

  return (
    <Screen width={640}>
      {status.loading ? (
        <Loading rows={2} />
      ) : status.error ? (
        <AdminError error={status.error} onRetry={status.reload} />
      ) : (
        <View style={{ gap: space.md, paddingTop: space.lg }}>
          <Heading level={1}>{t("admin.review.title")}</Heading>
          <Text variant="lead" tone="ink2">{t("admin.review.lede")}</Text>
          <Well grained style={{ padding: space.md, gap: space.md }}>
            <Field
              label={t("admin.review.password")}
              required
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                act.clear();
              }}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={submit}
              testID="review-password"
              error={message}
            />
            <Button label={t("admin.review.go")} size="lg" busy={act.busy} disabled={!password} onPress={submit} testID="review-go" />
          </Well>
        </View>
      )}
    </Screen>
  );
}
