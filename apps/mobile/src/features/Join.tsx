import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { ApiFailure, errorMessage } from "@/api/errors";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button, ErrorState, Heading, Loading, Screen, Text } from "@/ui";
import { Wordmark } from "@/ui/Brand";
import { inviteCodeFrom } from "./next";
import { useSession } from "./session";

type Reason = "not_found" | "expired" | "revoked" | "exhausted";

/**
 * `/{locale}/join/{code}`, the page an invite link opens (legacy join/[code]/page.tsx).
 * 1. The preview says who invites, or exactly why the link does not work: "expired" is something the person can fix by asking for
 *    a new one. The server answers a dead link with the reason only, never the Cerchia's name or size (circles.rs `preview`).
 * 2. Signed out (or a guest): straight to sign-in, which comes back here (`next`).
 * 3. Signed in: "Entra in {Cerchia}" and an explicit button. Joining never happens just because the page loaded.
 */
export function Join() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = inviteCodeFrom(String(raw ?? ""));
  const { t, href, locale } = useI18n();
  const { state, reload } = useSession();
  const preview = useResource((signal) => api.invitePreview(code, signal), [code]);
  const join = useAction();
  const [entered, setEntered] = useState<string | null>(null);

  if (entered) return <Redirect href={href(`/c/${entered}`) as never} />;

  const failure = preview.error;
  const notFound = code === "" || (failure instanceof ApiFailure && failure.code === "not_found");
  const reason: Reason | null = notFound
    ? "not_found"
    : preview.data && preview.data.state !== "active"
      ? (preview.data.state as Reason)
      : null;

  // Guessing codes is limited per address: the person lands on the quiet "slow down" page, as in legacy.
  if (failure instanceof ApiFailure && failure.code === "rate_limited") return <Redirect href={href("/slow-down") as never} />;

  const sheet = (children: React.ReactNode) => (
    <Screen width={640}>
      <Wordmark size={36} />
      <View style={{ gap: space.lg, paddingVertical: space.xl }}>{children}</View>
    </Screen>
  );

  if (reason)
    return sheet(
      <>
        <Heading level={1}>{t(`join.invalid.${reason}.title`)}</Heading>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 520 }}>{t(`join.invalid.${reason}.body`)}</Text>
      </>,
    );

  if (failure) return sheet(<ErrorState error={failure} onRetry={() => void preview.reload()} />);
  if (!preview.data || state.status === "loading") return sheet(<Loading rows={2} />);

  // Joining needs a real account; Serata guests and signed-out people sign in first.
  if (state.status === "anonymous")
    return <Redirect href={`${href("/sign-in")}?next=${encodeURIComponent(`/${locale}/join/${code}`)}` as never} />;
  if (state.status === "error") return sheet(<ErrorState error={state.error} />);

  const enter = async () => {
    const res = await join.run(() => api.joinCircle(code));
    if (!res) return;
    await reload();
    setEntered(res.value.circleId);
  };

  return sheet(
    <>
      <View style={{ gap: space.md }}>
        <Heading level={1}>{t("join.title", { name: preview.data.circleName })}</Heading>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 520 }}>{t("join.body")}</Text>
      </View>
      <View style={{ gap: space.sm }}>
        <Button label={join.busy ? t("auth.sending") : t("join.cta")} size="lg" busy={join.busy} onPress={enter} testID="join-enter" />
        {join.error ? (
          <Text role="alert" tone="error">{errorMessage(t, join.error)}</Text>
        ) : null}
      </View>
    </>,
  );
}
