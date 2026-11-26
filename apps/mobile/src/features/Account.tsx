import type { SessionInfo } from "@pausa/api-types";
import { Link, usePathname, useRouter, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { setToken } from "@/api/token";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { LOCALES, useI18n, type Locale } from "@/i18n";
import { hair, space, useTheme, type ThemePref } from "@/theme";
import { peopleApi } from "@/api/people";
import { BackLink } from "@/ui/BackLink";
import { ChevronRight } from "@/ui/lucide";
import { Select } from "@/ui/Select";
import { Well } from "@/ui/Surfaces";
import { Button, ErrorState, Field, Heading, Loading, Notice, Row, RowList, Screen, Tag, Text, TextLink } from "@/ui";
import { PushToggle } from "./people/PushToggle";
import { Services } from "./people/Services";
import { saveExport } from "./save-export";
import { RequireSession, useMe, useSession } from "./session";

/** Three people brought in make a Fondatore (v1 `FOUNDER_AT`): a badge, nothing more. */
const FOUNDER_AT = 3;

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
      <View style={{ gap: space.sm }}>
        <Select<Locale>
          label={t("common.language")}
          value={locale}
          testID="pref-language"
          // Same page, other language: swap the first path segment. On web a full page load, so the exported HTML of that language
          // (its <html lang>, its catalogue) is what runs; router.replace kept the old language's screen mounted (found by the e2e test).
          onChange={(l) => {
            const next = path.replace(/^\/(it|en|es)(?=\/|$)/, `/${l}`);
            if (Platform.OS === "web") window.location.assign(next);
            else router.replace(next as never);
          }}
          options={LOCALES.map((l) => ({ value: l, label: t(`app.languages.${l}`) }))}
        />
        <Select<ThemePref>
          label={t("common.theme")}
          value={pref}
          testID="pref-theme"
          onChange={setPref}
          options={(["system", "light", "dark"] as const).map((v) => ({ value: v, label: t(`common.themes.${v}`) }))}
        />
      </View>
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

function DeleteAccount({ email }: { email: string }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const act = useAction();
  const { signOut } = useSession();
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();
  return (
    <Section>
      <Heading level={2}>{t("account.deleteTitle")}</Heading>
      <Text tone="ink2">{t("account.deleteBody")}</Text>
      {!open ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button label={t("account.deleteOpen")} variant="quiet" onPress={() => setOpen(true)} testID="delete-open" />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Field
            label={t("account.deleteConfirm", { email })}
            value={typed}
            onChangeText={(v) => { setTyped(v); setMismatch(false); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            error={mismatch ? t("account.deleteMismatch") : null}
            testID="delete-email"
          />
          <Button
            label={act.busy ? t("app.account.deleting") : t("account.deleteGo")}
            variant="danger"
            busy={act.busy}
            testID="delete-go"
            onPress={async () => {
              if (!matches) {
                setMismatch(true);
                return;
              }
              if (await act.run(() => api.deleteAccount(typed.trim()))) {
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
  const { c } = useTheme();
  const { signOut } = useSession();
  const router = useRouter();
  const [out, setOut] = useState(false);
  const me = useResource((signal) => peopleApi.settings(signal), []);
  const guest = useMe().isAnonymous;
  return (
    <Screen>
      <View style={{ gap: space.xs }}>
        <BackLink to={href("/me")} label={t("profile.title")} />
        <Heading level={1}>{t("account.title")}</Heading>
        {me.data ? (
          <Text variant="small" tone="muted" selectable testID="account-email">
            {me.data.email}
          </Text>
        ) : null}
        {guest ? <Text tone="ink2">{t("app.account.guest")}</Text> : null}
        {me.data && me.data.brought > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }} testID="account-brought">
            <Text tone="ink2">{t("account.brought", { count: me.data.brought })}</Text>
            {me.data.brought >= FOUNDER_AT ? <Tag tone="accent" label={t("account.founder")} /> : null}
          </View>
        ) : null}
      </View>

      <Link href={href("/me/profile") as Href} asChild>
        <Pressable role="link" testID="account-edit-profile" style={{ minHeight: 44 }}>
          <Well style={{ padding: space.md, gap: space["3xs"] }}>
            <Text variant="strong">{t("profile.edit")}</Text>
            <Text variant="small" tone="muted">{t("profile.editHint")}</Text>
          </Well>
        </Pressable>
      </Link>

      <Preferences />
      <PushToggle />
      <Section>
        <RowList>
          <Row href={href("/me/settings")} testID="me-settings" style={{ gap: space.md }}>
            <View style={{ flex: 1, gap: space["3xs"] }}>
              <Text variant="strong">{t("app.account.alertsTitle")}</Text>
              <Text variant="small" tone="muted">{t("app.account.alertsBody")}</Text>
            </View>
            <ChevronRight size={20} strokeWidth={1.6} color={c.muted} />
          </Row>
        </RowList>
      </Section>
      <Services />
      <Sessions />
      <Data />
      <Section>
        <Button
          label={out ? t("account.loggingOut") : t("account.logout")}
          variant="quiet"
          busy={out}
          testID="logout"
          onPress={async () => {
            setOut(true);
            await signOut();
            router.replace(href() as never);
          }}
        />
      </Section>
      {me.data ? <DeleteAccount email={me.data.email} /> : null}
      <View role="navigation" aria-label={t("account.legal")} style={{ flexDirection: "row", gap: space.lg, flexWrap: "wrap" }}>
        <TextLink href={href("/privacy")}>{t("account.privacy")}</TextLink>
        <TextLink href={href("/terms")}>{t("account.terms")}</TextLink>
      </View>
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
