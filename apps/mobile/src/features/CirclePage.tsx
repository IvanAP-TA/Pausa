import type { CircleDetail, InviteDto, MemberDto } from "@pausa/api-types";
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { errorMessage } from "@/api/errors";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { fonts, space, useTheme, web } from "@/theme";
import { Button, Chevron, ConfirmButton, ErrorState, Heading, Loading, Row, RowList, Screen, Stagger, Tag, Text, TextLink } from "@/ui";
import { Select } from "@/ui/Select";
import { Chapter, Well } from "@/ui/Surfaces";
import { Avatar } from "@/ui/Avatar";
import { useCircleScope } from "./diary/shared";
import { PushToggle } from "./people/PushToggle";
import { inviteLink } from "./circle-links";
import { QrCode } from "@/ui/QrCode";
import { QrCodeIcon } from "@/ui/lucide";
import "./circle-qr.messages";
import { RequireSession, useMe, useSession } from "./session";

const EXPIRY = ["1d", "7d", "30d", "never"] as const;
const MAX_USES = ["1", "5", "10", "25", "none"] as const;

function BackLink({ to, label }: { to: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Chevron dir="left" color={c.ink2} />
      <TextLink href={to} tone="ink2">{label}</TextLink>
    </View>
  );
}

function Invite({ circleId, invite, canRevoke, onChanged }: { circleId: string; invite: InviteDto; canRevoke: boolean; onChanged: () => void }) {
  const { t, locale, date } = useI18n();
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const revoke = useAction();
  const link = inviteLink(locale, invite.code);
  const copy = async () => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View role="listitem" style={{ gap: space.sm, paddingVertical: space.md }}>
      {/* v1: the code is the figure of the well, big, tracked, breaking anywhere rather than overflowing. */}
      <Text
        selectable
        style={[{ fontFamily: fonts.display200, fontSize: 48, lineHeight: 52, color: c.ink, textTransform: "uppercase", letterSpacing: 2 }, web({ overflowWrap: "anywhere", fontSynthesis: "none" })]}
      >
        {invite.code}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space["3xs"] }}>
        <Text variant="small" tone="muted">
          {invite.expiresAt ? t("circle.invites.expires", { date: date(invite.expiresAt) }) : t("circle.invites.never")}
        </Text>
        <Text variant="small" tone="muted">
          {invite.maxUses ? t("circle.invites.usesOf", { used: invite.uses, max: invite.maxUses }) : t("circle.invites.uses", { used: invite.uses })}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        <Button label={copied ? t("circle.copied") : t("circle.copy")} onPress={copy} testID={`invite-copy-${invite.id}`} />
        <Button label={qr ? t("circleQr.hide") : t("circleQr.show")} variant="secondary" icon={QrCodeIcon} onPress={() => setQr((v) => !v)} testID={`invite-qr-${invite.id}`} />
        {canRevoke ? (
          <ConfirmButton
            label={t("circle.invites.revoke")}
            confirmLabel={t("circle.invites.revoke")}
            busy={revoke.busy}
            onConfirm={async () => {
              if (await revoke.run(() => api.revokeInvite(circleId, invite.id))) onChanged();
            }}
          />
        ) : null}
      </View>
      {qr ? (
        <View style={{ gap: space.xs, alignItems: "flex-start" }}>
          <QrCode text={link} size={200} label={t("circleQr.alt")} testID={`invite-qr-code-${invite.id}`} />
          <Text variant="small" tone="muted">{t("circleQr.hint")}</Text>
        </View>
      ) : null}
      {revoke.error ? <Text tone="error" role="alert">{errorMessage(t, revoke.error)}</Text> : null}
    </View>
  );
}

function NewInvite({ circleId, onCreated }: { circleId: string; onCreated: () => void }) {
  const { t } = useI18n();
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]>("7d");
  const [max, setMax] = useState<(typeof MAX_USES)[number]>("none");
  const create = useAction();
  return (
    <View style={{ gap: space.md }}>
      <Heading level={3}>{t("circle.invites.new")}</Heading>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Select label={t("circle.invites.expiry")} value={expiry} onChange={setExpiry} options={EXPIRY.map((v) => ({ value: v, label: t(`circle.invites.expiryChoices.${v}`) }))} testID="invite-expiry" />
        <Select
          label={t("circle.invites.maxUses")}
          value={max}
          onChange={setMax}
          options={MAX_USES.map((v) => ({ value: v, label: v === "none" ? t("circle.invites.unlimited") : t("circle.invites.people", { count: Number(v) }) }))}
          testID="invite-max"
        />
      </View>
      <Button
        label={create.busy ? t("app.circle.creating") : t("circle.invites.create")}
        busy={create.busy}
        onPress={async () => {
          if (await create.run(() => api.createInvite(circleId, { expiry, maxUses: max === "none" ? null : Number(max) }))) onCreated();
        }}
      />
      {create.error ? <Text tone="error" role="alert">{errorMessage(t, create.error)}</Text> : null}
    </View>
  );
}

function Member({ circle, member, index, onChanged }: { circle: CircleDetail; member: MemberDto; index: number; onChanged: () => void }) {
  const { t, href } = useI18n();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const act = useAction();
  const isMe = member.userId === me.id;
  const iAmOwner = circle.myRole === "owner";
  const iAmAdmin = circle.myRole === "admin";
  // Server rules (api-smoke): the owner changes roles and removes anyone but themselves; an admin removes plain members only.
  const canRole = iAmOwner && member.role !== "owner";
  const canRemove = !isMe && member.role !== "owner" && (iAmOwner || (iAmAdmin && member.role === "member"));
  const manageable = canRole || canRemove;
  const done = async (fn: () => Promise<unknown>) => {
    if (await act.run(fn)) {
      setOpen(false);
      onChanged();
    }
  };
  return (
    <Stagger index={index}>
      <Row testID={`member-${member.userId}`}>
        <Avatar name={member.name} image={member.image} size={40} />
        <View style={{ flex: 1, gap: space["3xs"] }}>
          <TextLink href={href(`/c/${circle.id}/people/${member.userId}`)} label={`${member.name}${isMe ? ` (${t("app.circle.you")})` : ""}`}>
            {member.name}
            {isMe ? ` (${t("app.circle.you")})` : ""}
          </TextLink>
          {member.role !== "member" ? <Tag label={t(`app.role.${member.role}`)} tone={member.role === "owner" ? "accent" : "ink2"} /> : null}
        </View>
        {manageable ? <Button label={t("circle.actions.manageShort")} accessibilityLabel={t("circle.actions.manage", { name: member.name })} variant="quiet" onPress={() => setOpen((o) => !o)} /> : null}
      </Row>
      {open ? (
        <View role="group" aria-label={t("app.circle.memberActions", { name: member.name })} style={{ gap: space.xs, paddingVertical: space.sm, flexDirection: "row", flexWrap: "wrap" }}>
          {canRole ? (
            <Button
              label={member.role === "admin" ? t("circle.actions.makeMember") : t("circle.actions.makeAdmin")}
              variant="secondary"
              busy={act.busy}
              onPress={() => done(() => api.setRole(circle.id, member.userId, member.role === "admin" ? "member" : "admin"))}
            />
          ) : null}
          {canRemove ? (
            <ConfirmButton label={t("circle.actions.remove")} confirmLabel={t("circle.actions.confirmRemove", { name: member.name })} busy={act.busy} onConfirm={() => done(() => api.removeMember(circle.id, member.userId))} />
          ) : null}
          {act.error ? <Text tone="error" role="alert" style={{ flexBasis: "100%" }}>{errorMessage(t, act.error)}</Text> : null}
        </View>
      ) : null}
    </Stagger>
  );
}

/** One of the pages a Cerchia leads to: its name, and what is in it. */
function PageRow({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Row href={to} style={{ alignItems: "flex-start", flexDirection: "column", gap: space["3xs"], paddingVertical: space.md }}>
      <Heading level={3}>{title}</Heading>
      <Text variant="small" tone="muted">{body}</Text>
    </Row>
  );
}

function CircleBody({ id }: { id: string }) {
  const { t, href } = useI18n();
  useCircleScope(id);
  const { c } = useTheme();
  const { reload: reloadMe } = useSession();
  const detail = useResource((signal) => api.circle(id, signal), [id]);
  const refresh = () => {
    void detail.reload();
    void reloadMe();
  };

  if (detail.loading && !detail.data)
    return (
      <Screen>
        <BackLink to={href("/home")} label={t("app.circle.back")} />
        <Loading rows={4} />
      </Screen>
    );
  if (detail.error || !detail.data)
    return (
      <Screen>
        <BackLink to={href("/home")} label={t("app.circle.back")} />
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </Screen>
    );

  const circle = detail.data;
  const canManage = circle.myRole === "owner" || circle.myRole === "admin";
  return (
    <Screen>
      <BackLink to={href("/home")} label={t("app.circle.back")} />
      <View style={{ gap: space.sm }}>
        <Heading level={1}>{circle.name}</Heading>
        {circle.description ? <Text variant="lead" tone="ink2">{circle.description}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
          <Tag label={t(`app.role.${circle.myRole}`)} tone={circle.myRole === "member" ? "ink2" : "accent"} />
        </View>
      </View>

      {/* The invite comes first: bringing friends in is what this page is for. The one well on this screen. */}
      <Well grained style={{ padding: space.lg, gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Heading level={2}>{t("circle.invites.title")}</Heading>
          <Text tone="ink2">{t("circle.invites.body")}</Text>
        </View>
        {circle.invites.length === 0 ? (
          <Text variant="small" tone="muted">{canManage ? t("circle.invites.none") : t("circle.invites.noneMember")}</Text>
        ) : (
          <RowList style={{ borderTopWidth: 0 }}>
            {circle.invites.map((inv) => (
              <Invite key={inv.id} circleId={circle.id} invite={inv} canRevoke={canManage} onChanged={refresh} />
            ))}
          </RowList>
        )}
        {canManage ? <NewInvite circleId={circle.id} onCreated={refresh} /> : null}
      </Well>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
          <View style={{ flexShrink: 1 }}>
            <Chapter>{t("circle.members")}</Chapter>
          </View>
          <Text style={{ fontFamily: fonts.display200, fontSize: 32, lineHeight: 36, color: c.muted }} aria-label={String(circle.members.length)}>
            {circle.members.length}
          </Text>
        </View>
        <RowList>
          {circle.members.map((m, i) => (
            <Member key={m.userId} circle={circle} member={m} index={i} onChanged={refresh} />
          ))}
        </RowList>
      </View>

      <RowList>
        <PageRow to={href(`/lists?circle=${circle.id}`)} title={t("tabs.lists")} body={t("circle.listsBody")} />
        <PageRow to={href(`/c/${circle.id}/insights`)} title={t("circle.insightsTitle")} body={t("circle.insightsBody")} />
        <PageRow to={href("/import")} title={t("circle.importTitle")} body={t("circle.importBody")} />
        <PageRow to={href("/account")} title={t("manage.accountTitle")} body={t("manage.accountBody")} />
        <PageRow to={href(`/c/${circle.id}/settings`)} title={t("app.circle.settings")} body={t("settings.mine")} />
      </RowList>

      <PushToggle />

      <View style={{ gap: space.xs }}>
        <View role="navigation" aria-label={t("manage.legal")} style={{ flexDirection: "row", gap: space.lg }}>
          <TextLink href={href("/privacy")} tone="ink2">{t("manage.privacy")}</TextLink>
          <TextLink href={href("/terms")} tone="ink2">{t("manage.terms")}</TextLink>
        </View>
        <Text variant="small" tone="muted">{t("tmdb.attribution")}</Text>
      </View>
    </Screen>
  );
}

export function CirclePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <CircleBody id={String(id)} />
    </RequireSession>
  );
}
