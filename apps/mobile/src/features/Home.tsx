import type { CircleSummary } from "@pausa/api-types";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { useAction } from "@/api/useAction";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button, Chevron, Empty, Field, Heading, Poster, Row, RowList, Screen, Stagger, Tag, Text, Title } from "@/ui";
import { useCurrentCircle } from "./current-circle";
import { inviteCodeFrom } from "./next";
import { RequireSession, useMe, useSession } from "./session";

function CircleRow({ circle, index }: { circle: CircleSummary; index: number }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  return (
    <Stagger index={index}>
      <Row href={href(`/c/${circle.id}`)} testID={`circle-${circle.id}`}>
        <Poster title={circle.name} size={44} />
        <View style={{ flex: 1, gap: space["3xs"] }}>
          <Title numberOfLines={2}>{circle.name}</Title>
          {circle.role !== "member" ? <Tag label={t(`app.role.${circle.role}`)} /> : null}
        </View>
        {circle.unread > 0 ? <Tag tone="accent" label={String(circle.unread)} accessibilityLabel={t("app.home.unread", { count: circle.unread })} /> : null}
        <Chevron color={c.muted} />
      </Row>
    </Stagger>
  );
}

function CreateCircle() {
  const { t, href } = useI18n();
  const router = useRouter();
  const { reload } = useSession();
  const [name, setName] = useState("");
  const create = useAction();
  const submit = async () => {
    const res = await create.run(() => api.createCircle(name.trim()));
    if (!res) return;
    await reload();
    setName("");
    router.push(href(`/c/${res.value.id}`) as never);
  };
  return (
    <View style={{ gap: space.sm }}>
      <Heading level={2}>{t("circles.createTitle")}</Heading>
      <Text tone="ink2">{t("circles.createBody")}</Text>
      <Field
        label={t("home.createLabel")}
        value={name}
        onChangeText={setName}
        placeholder={t("home.createPlaceholder")}
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={submit}
        error={create.error ? errorMessage(t, create.error) : null}
      />
      <Button label={create.busy ? t("circles.creating") : t("home.createCta")} busy={create.busy} disabled={name.trim() === ""} onPress={submit} />
    </View>
  );
}

function JoinCircle() {
  const { t, href } = useI18n();
  const router = useRouter();
  const { reload } = useSession();
  const [input, setInput] = useState("");
  const join = useAction();
  const code = inviteCodeFrom(input);
  const submit = async () => {
    const res = await join.run(() => api.joinCircle(code));
    if (!res) return;
    await reload();
    setInput("");
    router.push(href(`/c/${res.value.circleId}`) as never);
  };
  return (
    <View style={{ gap: space.sm }}>
      <Heading level={2}>{t("circles.joinTitle")}</Heading>
      <Text tone="ink2">{t("circles.joinBody")}</Text>
      <Field
        label={t("circles.joinLabel")}
        value={input}
        onChangeText={setInput}
        hint={t("app.home.joinHint")}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={submit}
        error={join.error ? errorMessage(t, join.error) : null}
      />
      <Button label={join.busy ? t("circles.joining") : t("home.joinCta")} variant="secondary" busy={join.busy} disabled={code === ""} onPress={submit} />
    </View>
  );
}

function HomeBody() {
  const { t } = useI18n();
  const { c } = useTheme();
  const me = useMe();
  return (
    <Screen>
      <Text variant="small" tone="muted">{t("app.home.yourName", { name: me.name })}</Text>
      <Heading level={1}>{t("circles.title")}</Heading>
      {me.circles.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text variant="lead" tone="ink2">{t("circles.lede")}</Text>
          <RowList>
            {me.circles.map((circle, i) => (
              <CircleRow key={circle.id} circle={circle} index={i} />
            ))}
          </RowList>
        </View>
      ) : (
        <Empty title={t("home.noCircleTitle")} body={t("home.noCircleBody")} />
      )}
      <View style={{ gap: space.xl, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg }}>
        <CreateCircle />
        <JoinCircle />
      </View>
    </Screen>
  );
}

/** "My Cerchie": the list, and the two ways to get another one. */
export function Home() {
  return (
    <RequireSession>
      <HomeBody />
    </RequireSession>
  );
}

function Entry() {
  const me = useMe();
  const { circleId } = useCurrentCircle();
  const { href } = useI18n();
  if (me.circles.length > 0 && circleId) return <Redirect href={href(`/c/${circleId}`) as never} />;
  return <HomeBody />;
}

/** `/home`, as in v1: the diary of the last Cerchia I used; with no Cerchia yet, the page to join or create one. */
export function HomeEntry() {
  return (
    <RequireSession>
      <Entry />
    </RequireSession>
  );
}
