import type { MySettings } from "@pausa/api-types";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { COUNTRIES, NOTIFICATION_TYPES, peopleApi } from "@/api/people";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n, type MessageKey } from "@/i18n";
import { LOCALES } from "@/i18n";
import { space } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Section } from "@/ui/Section";
import { Toggle } from "@/ui/Toggle";
import { ErrorState, Heading, Loading, Notice, Screen, Text, Title } from "@/ui";
import { RequireSession } from "../session";
import { CircleSwitches } from "./CircleSwitches";
import "./people.messages";

function Form({ s }: { s: MySettings }) {
  const { t, href, locale } = useI18n();
  const [pref, setPref] = useState<string>(s.locale ?? "");
  const [country, setCountry] = useState<string>(s.country ?? "");
  const [digest, setDigest] = useState(s.emailDigest);
  const [off, setOff] = useState<string[]>(s.notifyOff);
  const [saved, setSaved] = useState(false);
  const save = useAction();
  const regions = new Intl.DisplayNames(locale, { type: "region" });
  const touch = () => setSaved(false);
  return (
    <>
      <Section title={t("people.settings.prefsTitle")} first>
        <Choice label={t("people.settings.language")} value={pref} onChange={(v) => { setPref(v); touch(); }} options={[{ value: "", label: t("people.settings.auto") }, ...LOCALES.map((l) => ({ value: l as string, label: t(`app.languages.${l}`) }))]} />
        <Choice label={t("people.settings.country")} value={country} onChange={(v) => { setCountry(v); touch(); }} options={[{ value: "", label: t("people.settings.none") }, ...COUNTRIES.map((c) => ({ value: c as string, label: regions.of(c) ?? c }))]} />
        <Toggle label={t("notifPrefs.digest")} hint={t("notifPrefs.digestHint")} value={digest} onChange={(v) => { setDigest(v); touch(); }} testID="digest" />
      </Section>
      <Section title={t("notifPrefs.title")} lede={t("notifPrefs.body")}>
        {NOTIFICATION_TYPES.map((type) => (
          <Toggle
            key={type}
            label={t(`people.settings.types.${type}` as MessageKey)}
            value={!off.includes(type)}
            onChange={(on) => {
              setOff((l) => (on ? l.filter((x) => x !== type) : [...l, type]));
              touch();
            }}
            testID={`notify-${type}`}
          />
        ))}
        <Button
          label={t("notifPrefs.save")}
          busy={save.busy}
          testID="save-settings"
          onPress={async () => {
            if (await save.run(() => peopleApi.saveSettings({ locale: pref, country, emailDigest: digest, notifyOff: off }))) setSaved(true);
          }}
        />
        {saved ? <Notice>{t("settings.saved")}</Notice> : null}
        {save.error ? (
          <Text tone="error" role="alert">
            {errorMessage(t, save.error)}
          </Text>
        ) : null}
      </Section>
      <Section title={t("people.settings.circlesTitle")}>
        {s.circles.length === 0 ? <Text tone="muted">{t("circles.none")}</Text> : null}
        {s.circles.map((c) => (
          <View key={c.circleId} style={{ gap: space.xs }} testID={`circle-switches-${c.circleId}`}>
            <Title>{c.name}</Title>
            <CircleSwitches circleId={c.circleId} muted={c.muted} hideWatching={c.hideWatching} />
          </View>
        ))}
      </Section>
      <Button label={t("people.edit.done")} variant="quiet" href={href("/me")} />
    </>
  );
}

function SettingsBody() {
  const { t, href } = useI18n();
  const s = useResource((signal) => peopleApi.settings(signal), []);
  return (
    <Screen>
      <BackLink to={href("/me")} label={t("tabs.profile")} />
      <Heading level={1}>{t("profile.settings")}</Heading>
      {s.loading && !s.data ? <Loading rows={4} /> : null}
      {s.error ? <ErrorState error={s.error} onRetry={s.reload} /> : null}
      {s.data ? <Form s={s.data} /> : null}
    </Screen>
  );
}

export function SettingsPage() {
  return (
    <RequireSession>
      <SettingsBody />
    </RequireSession>
  );
}
