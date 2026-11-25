import type { SessionInfo } from "@pausa/api-types";
import { usePathname, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { setToken } from "@/api/token";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { LOCALES, useI18n, type Locale } from "@/i18n";
import { hair, space, useTheme, type ThemePref } from "@/theme";
import { Button, Choice, ErrorState, Field, Heading, Loading, Notice, Row, RowList, Screen, Tag, Text, TextLink, Title } from "@/ui";
import { saveExport } from "./save-export";
import { RequireSession, useMe, useSession } from "./session";

function Section({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={{ gap: space.sm, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg }}>{children}</View>;
}

function Preferences() {
  const { t, locale } = useI18n();
  const { pref, setPref } = useTheme();
  const router = useRouter();
  const path = usePathname();
  return (
    <Section>
      <Heading level={2}>{t("account.theme")}</Heading>
      <Text tone="ink2">{t("account.themeHint")}</Text>
      <Choice<ThemePref>
        label={t("account.theme")}
        value={pref}
        onChange={setPref}
        options={(["system", "light", "dark"] as const).map((v) => ({ value: v, label: t(`common.themes.${v}`) }))}
      />
      <Choice<Locale>
        label={t("common.language")}
        value={locale}
        // Same page, other language: swap the first path segment. On web a full page load, so the exported HTML of that language
        // (its <html lang>, its catalogue) is what runs; router.replace kept the old language's screen mounted (found by the e2e test).
        onChange={(l) => {
          const next = path.replace(/^\/(it|en|es)(?=\/|$)/, `/${l}`);
          if (Platform.OS === "web") window.location.assign(next);
          else router.replace(next as never);
        }}
        options={LOCALES.map((l) => ({ value: l, label: t(`app.languages.${l}`) }))}
      />
    </Section>
  );
}

function Sessions() {
  const { t, date } = useI18n();
  const list = useResource((signal) => api.sessions(signal), []);
  const revoke = useAction();
  return (
    <Section>
      <Heading level={2}>{t("app.account.sessionsTitle")}</Heading>
      <Text tone="ink2">{t("app.account.sessionsBody")}</Text>
      {list.loading && !list.data ? <Loading rows={2} /> : null}
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {list.data ? (
        <RowList>
          {list.data.map((s: SessionInfo) => {
            const kind = s.kind === "web" || s.kind === "native" ? t(`app.account.kind.${s.kind}`) : s.kind;
            return (
              <Row key={s.id} testID={`session-${s.id}`}>
                <View style={{ flex: 1, gap: space["3xs"] }}>
                  <Text variant="strong">{kind}</Text>
                  {s.userAgent ? <Text variant="small" tone="muted" numberOfLines={2}>{s.userAgent}</Text> : null}
                  <Text variant="small" tone="muted">{t("app.account.lastSeen", { date: date(s.lastSeenAt) })}</Text>
                </View>
                {s.current ? (
                  <Tag tone="accent" label={t("app.account.current")} />
                ) : (
                  <Button
                    label={t("app.account.revoke")}
                    accessibilityLabel={t("app.account.revokeNamed", { name: kind })}
                    variant="quiet"
                    busy={revoke.busy}
                    onPress={async () => {
                      if (await revoke.run(() => api.revokeSession(s.id))) void list.reload();
                    }}
                  />
                )}
              </Row>
            );
          })}
        </RowList>
      ) : null}
      {revoke.error ? <Text tone="error" role="alert">{errorMessage(t, revoke.error)}</Text> : null}
    </Section>
  );
}

function Data() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const exp = useAction();
  return (
    <Section>
      <Heading level={2}>{t("account.dataTitle")}</Heading>
      <Text tone="ink2">{t("account.dataBody")}</Text>
      <Button
        label={exp.busy ? t("app.account.exporting") : t("account.export")}
        variant="secondary"
        busy={exp.busy}
        onPress={async () => {
          setDone(false);
          const res = await exp.run(async () => saveExport(await api.exportData()));
          if (res) setDone(true);
        }}
      />
      {done ? <Notice>{t("app.account.exportDone")}</Notice> : null}
      {exp.error ? <Text tone="error" role="alert">{errorMessage(t, exp.error)}</Text> : null}
    </Section>
  );
}

function DeleteAccount() {
  const { t, href } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const act = useAction();
  const { signOut } = useSession();
  const matches = typed.trim() === me.name.trim();
  return (
    <Section>
      <Heading level={2}>{t("account.deleteTitle")}</Heading>
      <Text tone="ink2">{t("account.deleteBody")}</Text>
      {!open ? (
        <Button label={t("account.deleteOpen")} variant="quiet" onPress={() => setOpen(true)} />
      ) : (
        <View style={{ gap: space.sm }}>
          <Field
            label={t("app.account.deleteConfirmName", { name: me.name })}
            value={typed}
            onChangeText={(v) => { setTyped(v); setMismatch(false); }}
            autoCapitalize="none"
            autoCorrect={false}
            error={mismatch ? t("app.account.deleteMismatchName") : null}
          />
          <Button
            label={act.busy ? t("app.account.deleting") : t("account.deleteGo")}
            variant="danger"
            busy={act.busy}
            onPress={async () => {
              if (!matches) {
                setMismatch(true);
                return;
              }
              if (await act.run(() => api.deleteAccount())) {
                await setToken(null);
                await signOut();
                router.replace(href() as never);
              }
            }}
          />
          {act.error ? <Text tone="error" role="alert">{errorMessage(t, act.error)}</Text> : null}
        </View>
      )}
    </Section>
  );
}

function AccountBody() {
  const { t, href } = useI18n();
  const me = useMe();
  const { signOut } = useSession();
  const router = useRouter();
  const [out, setOut] = useState(false);
  return (
    <Screen>
      <Heading level={1}>{t("account.title")}</Heading>
      <View style={{ gap: space["2xs"] }}>
        <Text variant="label" tone="muted">{t("account.name")}</Text>
        <Title>{me.name}</Title>
        {me.isAnonymous ? <Text tone="ink2">{t("app.account.guest")}</Text> : null}
      </View>
      <Preferences />
      <Sessions />
      <Data />
      <Section>
        <Heading level={2}>{t("account.legal")}</Heading>
        <View style={{ flexDirection: "row", gap: space.md, flexWrap: "wrap" }}>
          <TextLink href={href("/privacy")}>{t("account.privacy")}</TextLink>
          <TextLink href={href("/terms")}>{t("account.terms")}</TextLink>
        </View>
      </Section>
      <Section>
        <Button
          label={out ? t("account.loggingOut") : t("account.logout")}
          variant="secondary"
          busy={out}
          onPress={async () => {
            setOut(true);
            await signOut();
            router.replace(href() as never);
          }}
        />
      </Section>
      <DeleteAccount />
    </Screen>
  );
}

export function Account() {
  return (
    <RequireSession>
      <AccountBody />
    </RequireSession>
  );
}
