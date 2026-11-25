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
import { hair, space, useTheme } from "@/theme";
import { Button, Chevron, Choice, ConfirmButton, Empty, ErrorState, Heading, Loading, Notice, Row, RowList, Screen, Stagger, Tag, Text, TextLink, Title } from "@/ui";
import { Avatar } from "@/ui/Avatar";
import { diaryApi } from "@/api/diary";
import { CircleNav, LogCard, useCircleScope } from "./diary/shared";
import { inviteLink } from "./circle-links";
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
  const revoke = useAction();
  const link = inviteLink(locale, invite.code);
  const copy = async () => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={{ gap: space.xs, paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule }}>
      <Title selectable>{invite.code}</Title>
      <Text variant="small" tone="muted">
        {invite.expiresAt ? t("circle.invites.expires", { date: date(invite.expiresAt) }) : t("circle.invites.never")}
      </Text>
      <Text variant="small" tone="muted">
        {invite.maxUses ? t("circle.invites.usesOf", { used: invite.uses, max: invite.maxUses }) : t("circle.invites.uses", { used: invite.uses })}
      </Text>
      <Text variant="small" tone="ink2" selectable>{link}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button label={copied ? t("circle.copied") : t("circle.copy")} variant="secondary" onPress={copy} />
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
      {copied ? <Notice>{t("circle.copied")}</Notice> : null}
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
    <View style={{ gap: space.sm }}>
      <Title>{t("circle.invites.new")}</Title>
      <Choice label={t("circle.invites.expiry")} value={expiry} onChange={setExpiry} options={EXPIRY.map((v) => ({ value: v, label: t(`circle.invites.expiryChoices.${v}`) }))} />
      <Choice
        label={t("circle.invites.maxUses")}
        value={max}
        onChange={setMax}
        options={MAX_USES.map((v) => ({ value: v, label: v === "none" ? t("circle.invites.unlimited") : String(v) }))}
      />
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

/** The latest viewings of the Cerchia (three), with a way into the whole feed. */
function Recent({ circleId }: { circleId: string }) {
  const { t, href, locale } = useI18n();
  const feed = useResource((signal) => diaryApi.feed(circleId, { locale }, signal), [circleId, locale]);
  return (
    <View style={{ gap: space.sm }}>
      <Heading level={2}>{t("diary.nav.recent")}</Heading>
      {feed.loading && !feed.data ? <Loading rows={2} /> : null}
      {feed.error ? <ErrorState error={feed.error} onRetry={feed.reload} /> : null}
      {feed.data && feed.data.items.length === 0 ? (
        <Empty title={t("feed.emptyTitle")} body={t("feed.emptyBody")}>
          <Button label={t("feed.emptyCta")} href={href("/log")} />
        </Empty>
      ) : null}
      {feed.data && feed.data.items.length > 0 ? (
        <>
          <RowList>
            {feed.data.items.slice(0, 3).map((log) => (
              <LogCard key={log.id} log={log} circleId={circleId} />
            ))}
          </RowList>
          <Button label={t("diary.nav.allFeed")} variant="secondary" href={href(`/c/${circleId}/feed`)} />
        </>
      ) : null}
    </View>
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
          <Tag label={t("app.circle.people", { count: circle.members.length })} />
          <Tag label={t(`app.role.${circle.myRole}`)} tone={circle.myRole === "member" ? "ink2" : "accent"} />
        </View>
      </View>
      <CircleNav circleId={circle.id} current="hub" />

      <Recent circleId={circle.id} />

      <View style={{ gap: space.sm, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg }}>
        <Heading level={2}>{t("circle.members")}</Heading>
        <RowList>
          {circle.members.map((m, i) => (
            <Member key={m.userId} circle={circle} member={m} index={i} onChanged={refresh} />
          ))}
        </RowList>
      </View>

      <View style={{ gap: space.sm, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg }}>
        <Heading level={2}>{t("circle.invites.title")}</Heading>
        <Text tone="ink2">{t("circle.invites.body")}</Text>
        {circle.invites.length === 0 ? (
          <Text variant="small" tone="muted">{canManage ? t("circle.invites.none") : t("circle.invites.noneMember")}</Text>
        ) : (
          <View>
            {circle.invites.map((inv) => (
              <Invite key={inv.id} circleId={circle.id} invite={inv} canRevoke={canManage} onChanged={refresh} />
            ))}
          </View>
        )}
        {canManage ? <NewInvite circleId={circle.id} onCreated={refresh} /> : null}
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
