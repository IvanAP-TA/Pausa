import type { CircleDetail } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Switch, View } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { COVERS } from "@/api/endpoints";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button, Chevron, Choice, ConfirmButton, ErrorState, Field, Heading, Loading, Notice, Screen, Text, TextLink } from "@/ui";
import { RequireSession, useMe, useSession } from "./session";
import { peopleApi } from "@/api/people";
import { CircleSwitches } from "./people/CircleSwitches";
import { Withdraw } from "./people/Withdraw";
import { CircleNav } from "./diary/shared";

type Cover = (typeof COVERS)[number] | "none";

function Section({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={{ gap: space.sm, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg }}>{children}</View>;
}

/** Admins only: name, description, cover, the live-watching switch. */
function GroupSettings({ circle, onSaved }: { circle: CircleDetail; onSaved: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [name, setName] = useState(circle.name);
  const [description, setDescription] = useState(circle.description ?? "");
  const [cover, setCover] = useState<Cover>((circle.cover as Cover | null) ?? "none");
  const [live, setLive] = useState(circle.liveWatching);
  const [saved, setSaved] = useState(false);
  const save = useAction();
  return (
    <Section>
      <Heading level={2}>{t("settings.group")}</Heading>
      <Field label={t("manage.renameCircle")} value={name} onChangeText={(v) => { setName(v); setSaved(false); }} maxLength={60} />
      <Field label={t("settings.description")} value={description} onChangeText={(v) => { setDescription(v); setSaved(false); }} multiline maxLength={280} />
      <Choice
        label={t("settings.cover")}
        value={cover}
        onChange={(v) => { setCover(v); setSaved(false); }}
        options={[{ value: "none" as Cover, label: t("settings.noCover") }, ...COVERS.map((v) => ({ value: v as Cover, label: t(`settings.covers.${v}`) }))]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 }}>
        <Switch
          value={live}
          onValueChange={(v) => { setLive(v); setSaved(false); }}
          trackColor={{ false: c.rule, true: c.accent }}
          thumbColor={c.paper}
          aria-label={t("settings.live")}
        />
        <View style={{ flex: 1 }}>
          <Text variant="strong">{t("settings.live")}</Text>
          <Text variant="small" tone="muted">{t("settings.liveHint")}</Text>
        </View>
      </View>
      <Button
        label={t("settings.save")}
        busy={save.busy}
        disabled={name.trim() === ""}
        onPress={async () => {
          // Empty description / cover clear the field on the server (api-smoke).
          const res = await save.run(() => api.updateCircle(circle.id, { name: name.trim(), description: description.trim(), cover: cover === "none" ? "" : cover, liveWatching: live }));
          if (res) {
            setSaved(true);
            onSaved();
          }
        }}
      />
      {saved ? <Notice>{t("settings.saved")}</Notice> : null}
      {save.error ? <Text tone="error" role="alert">{errorMessage(t, save.error)}</Text> : null}
    </Section>
  );
}

function Transfer({ circle, onDone }: { circle: CircleDetail; onDone: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const others = circle.members.filter((m) => m.userId !== me.id);
  const [pick, setPick] = useState<string>("");
  const act = useAction();
  const target = others.find((m) => m.userId === pick);
  return (
    <Section>
      <Heading level={2}>{t("app.circle.transferTitle")}</Heading>
      <Text tone="ink2">{t("app.circle.transferBody")}</Text>
      {others.length === 0 ? (
        <Text variant="small" tone="muted">{t("app.circle.transferNone")}</Text>
      ) : (
        <>
          <Choice label={t("app.circle.transferPick")} value={pick} onChange={setPick} options={others.map((m) => ({ value: m.userId, label: m.name }))} />
          {target ? (
            <ConfirmButton
              label={t("app.circle.transferGo", { name: target.name })}
              confirmLabel={t("app.circle.transferGo", { name: target.name })}
              busy={act.busy}
              onConfirm={async () => {
                if (await act.run(() => api.transfer(circle.id, target.userId))) onDone();
              }}
            />
          ) : null}
          {act.error ? <Text tone="error" role="alert">{errorMessage(t, act.error)}</Text> : null}
        </>
      )}
    </Section>
  );
}

function Leave({ circle, onLeft }: { circle: CircleDetail; onLeft: () => void }) {
  const { t } = useI18n();
  const act = useAction();
  const owner = circle.myRole === "owner";
  return (
    <Section>
      <Heading level={2}>{t("circle.leave.title")}</Heading>
      <Text tone="ink2">{t("circle.leave.body")}</Text>
      {owner ? (
        <Text tone="ink2" role="note">{t("app.circle.ownerCannotLeave")}</Text>
      ) : (
        <ConfirmButton
          label={t("circle.leave.confirm")}
          confirmLabel={t("circle.leave.confirm")}
          busy={act.busy}
          onConfirm={async () => {
            if (await act.run(() => api.leave(circle.id))) onLeft();
          }}
        />
      )}
      {act.error ? <Text tone="error" role="alert">{errorMessage(t, act.error)}</Text> : null}
    </Section>
  );
}

function DeleteCircle({ circle, onDeleted }: { circle: CircleDetail; onDeleted: () => void }) {
  const { t } = useI18n();
  const [typed, setTyped] = useState("");
  const act = useAction();
  const matches = typed.trim() === circle.name.trim();
  return (
    <Section>
      <Heading level={2}>{t("manage.deleteCircle")}</Heading>
      <Text tone="ink2">{t("manage.deleteCircleWarn")}</Text>
      <Field label={t("app.circle.deleteType")} hint={t("manage.deleteCircleConfirm", { name: circle.name })} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
      <Button
        label={t("manage.deleteCircleGo")}
        variant="danger"
        busy={act.busy}
        disabled={!matches}
        onPress={async () => {
          if (await act.run(() => api.deleteCircle(circle.id, typed.trim()))) onDeleted();
        }}
      />
      {act.error ? <Text tone="error" role="alert">{errorMessage(t, act.error)}</Text> : null}
    </Section>
  );
}

/** My own switches for this Cerchia (silence, hide who is watching), read from my settings. */
function Mine({ id }: { id: string }) {
  const { t } = useI18n();
  const s = useResource((signal) => peopleApi.settings(signal), [id]);
  const mine = s.data?.circles.find((x) => x.circleId === id);
  return (
    <Section>
      <Heading level={2}>{t("settings.mine")}</Heading>
      {s.loading && !s.data ? <Loading rows={1} /> : null}
      {s.error ? <ErrorState error={s.error} onRetry={s.reload} /> : null}
      {mine ? <CircleSwitches key={id} circleId={id} muted={mine.muted} hideWatching={mine.hideWatching} /> : null}
    </Section>
  );
}

function SettingsBody({ id }: { id: string }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  const router = useRouter();
  const { reload: reloadMe } = useSession();
  const detail = useResource((signal) => api.circle(id, signal), [id]);
  const back = href(`/c/${id}`);
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Chevron dir="left" color={c.ink2} />
      <TextLink href={back} tone="ink2">{detail.data?.name ?? t("app.circle.back")}</TextLink>
    </View>
  );
  if (detail.loading && !detail.data)
    return (
      <Screen>
        {header}
        <Loading rows={4} />
      </Screen>
    );
  if (detail.error || !detail.data)
    return (
      <Screen>
        {header}
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </Screen>
    );
  const circle = detail.data;
  const admin = circle.myRole === "owner" || circle.myRole === "admin";
  const owner = circle.myRole === "owner";
  const goHome = async () => {
    await reloadMe();
    router.replace(href("/home") as never);
  };
  return (
    <Screen>
      {header}
      <Heading level={1}>{t("settings.title")}</Heading>
      <CircleNav circleId={id} current="settings" />
      <Mine id={id} />
      <View style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg }}>
        <Withdraw circleId={circle.id} circleName={circle.name} />
      </View>
      {admin ? <GroupSettings circle={circle} onSaved={() => { void detail.reload(); void reloadMe(); }} /> : null}
      {owner ? <Transfer circle={circle} onDone={() => { void detail.reload(); void reloadMe(); }} /> : null}
      <Leave circle={circle} onLeft={goHome} />
      {owner ? <DeleteCircle circle={circle} onDeleted={goHome} /> : null}
    </Screen>
  );
}

export function CircleSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <SettingsBody id={String(id)} />
    </RequireSession>
  );
}
