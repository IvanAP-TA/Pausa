import type { ListDetail, ListSummary } from "@pausa/api-types";
import { Link, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ApiFailure, errorMessage } from "@/api/errors";
import { LIST_CAP, listsApi } from "@/api/lists";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { TitleSearch } from "@/features/TitleSearch";
import { useMe } from "@/features/session";
import { useI18n } from "@/i18n";
import { control, fonts, hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { ArrowDown, ArrowUp, ChevronDown, Trash2, X } from "@/ui/lucide";
import { MediaPoster } from "@/ui/MediaPoster";
import { Well } from "@/ui/Surfaces";
import { Notice } from "@/ui/Status";
import { Heading, Text } from "@/ui/Text";
import "./lists.messages";

const POSTER = 104;

type Kind = "watchlist" | "list" | "ranking";

/** A 44px square icon button with a rule outline (v1 `btn btn-quiet size-11`). */
function IconButton({ icon: Icon, label, onPress, disabled, testID, danger }: { icon: typeof X; label: string; onPress: () => void; disabled?: boolean; testID?: string; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={{ width: control, height: control, alignItems: "center", justifyContent: "center", borderWidth: hair, borderColor: c.rule, opacity: disabled ? 0.4 : 1 }}
    >
      <Icon size={18} strokeWidth={1.6} color={danger ? c.error : c.ink2} />
    </Pressable>
  );
}

/** The contact strip: up to eight posters side by side with their titles (and the rank, for a ranking), scrolling sideways. */
function Strip({ list }: { list: ListSummary }) {
  const { t } = useI18n();
  const { c } = useTheme();
  if (list.strip.length === 0) return null;
  const ranking = list.kind === "ranking";
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} aria-label={t("listsApp.stripLabel", { name: list.name })} testID={`strip-${list.id}`} contentContainerStyle={{ gap: space.sm }}>
      <View role="list" style={{ flexDirection: "row", gap: space.sm }}>
      {list.strip.map((m, i) => (
        <View key={m.id} role="listitem" style={{ width: POSTER, gap: space.xs }}>
          <MediaPoster title={m.title} path={m.posterPath} width={POSTER} />
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
            {ranking ? (
              <Text aria-label={t("listsApp.rankLabel", { n: i + 1 })} style={{ fontFamily: fonts.display400, fontSize: 28, lineHeight: 30, color: c.ink }}>
                {i + 1}
              </Text>
            ) : null}
            <Text variant="small" tone="ink2" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>{m.title}</Text>
          </View>
        </View>
      ))}
      </View>
    </ScrollView>
  );
}

/** The inline manager: add a title, every title with its arrows (ranking) and X, and rename. Loads the whole list when opened. */
function Manage({ list, onChanged }: { list: ListSummary; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const detail = useResource((signal) => listsApi.detail(list.id, locale, signal), [list.id, locale]);
  const act = useAction();
  const rename = useAction();
  const add = useAction();
  const [name, setName] = useState(list.name);
  const [note, setNote] = useState<string | null>(null);
  const data: ListDetail | null = detail.data;
  const ranking = list.kind === "ranking";
  const changed = () => {
    void detail.reload();
    onChanged();
  };
  const full = (data?.items.length ?? list.items) >= LIST_CAP;
  const failure = add.error instanceof ApiFailure && add.error.code === "conflict" ? t("listsApp.full", { max: LIST_CAP }) : add.error ? errorMessage(t, add.error) : null;
  const move = async (from: number, to: number) => {
    if (!data) return;
    const ids = data.items.map((i) => i.media.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    if (await act.run(() => listsApi.reorder(list.id, ids))) changed();
  };
  return (
    <View style={{ gap: space.md, paddingBottom: space.sm }} testID={`manage-${list.id}`}>
      <TitleSearch
        search={listsApi.search}
        disabled={full || add.busy}
        isPicked={(cand) => cand.key.startsWith("local:") && !!data?.items.some((i) => `local:${i.media.id}` === cand.key)}
        onPick={async (cand) => {
          setNote(null);
          const res = await add.run(() => listsApi.addItem(list.id, { mediaKey: cand.key }));
          if (res) {
            setNote(res.value.added ? t("listsApp.added", { title: cand.title }) : t("listsApp.alreadyIn", { title: cand.title }));
            changed();
          }
        }}
        labels={{
          field: t("listsApp.search"),
          none: t("listsApp.noResults"),
          add: (title) => t("listsApp.addOne", { title }),
          added: (title) => t("listsApp.alreadyIn", { title }),
          addLabel: t("lists.add"),
          addedLabel: t("listsApp.inList"),
        }}
      />
      {full ? <Text role="status" tone="ink2">{t("listsApp.full", { max: LIST_CAP })}</Text> : null}
      {failure ? <Text role="alert" tone="error">{failure}</Text> : null}
      {note ? <Notice>{note}</Notice> : null}

      {data && data.items.length > 0 ? (
        <View role="list" style={{ borderTopWidth: hair, borderColor: c.rule }}>
          {data.items.map((m, i) => (
            <View key={m.media.id} role="listitem" testID={`inline-item-${m.media.id}`} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: control, paddingVertical: space["2xs"], borderBottomWidth: hair, borderColor: c.rule }}>
              {ranking ? <Text aria-hidden style={{ width: 32, fontFamily: fonts.display400, fontSize: 28, lineHeight: 30 }}>{i + 1}</Text> : null}
              <Text numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{m.media.title}</Text>
              {ranking ? (
                <>
                  <IconButton icon={ArrowUp} label={t("listsApp.up", { title: m.media.title })} disabled={i === 0 || act.busy} onPress={() => void move(i, i - 1)} />
                  <IconButton icon={ArrowDown} label={t("listsApp.down", { title: m.media.title })} disabled={i === data.items.length - 1 || act.busy} onPress={() => void move(i, i + 1)} />
                </>
              ) : null}
              <IconButton icon={X} label={t("listsApp.removeLabel", { title: m.media.title })} disabled={act.busy} testID={`inline-remove-${m.media.id}`} onPress={async () => { if (await act.run(() => listsApi.removeItem(list.id, m.media.id))) changed(); }} />
            </View>
          ))}
        </View>
      ) : null}
      {act.error ? <Text role="alert" tone="error">{errorMessage(t, act.error)}</Text> : null}

      <View style={{ gap: space.xs }}>
        <Field label={t("lists.name")} value={name} onChangeText={(v) => setName(v.slice(0, 80))} maxLength={80} testID={`inline-name-${list.id}`} />
        {rename.error ? <Text role="alert" tone="error">{errorMessage(t, rename.error)}</Text> : null}
        <Button
          label={t("listsApp.rename")}
          variant="secondary"
          busy={rename.busy}
          disabled={!name.trim() || name.trim() === list.name}
          testID={`inline-rename-${list.id}`}
          onPress={async () => { if (await rename.run(() => listsApi.update(list.id, { name: name.trim() }))) onChanged(); }}
        />
      </View>
    </View>
  );
}

/**
 * One list on the overview, the same in a Cerchia and among my own (v1 `ListCard`): name and who made it, a strip of posters with
 * their titles, "Gestisci la lista" to add, reorder (ranking), remove and rename in place, and the bin in the header that asks first.
 */
export function ListCard({ list, onChanged, href }: { list: ListSummary; onChanged: () => void; href: string }) {
  const { t } = useI18n();
  const me = useMe();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const del = useAction();
  const personal = list.circleId === null;
  const role = me.circles.find((c) => c.id === list.circleId)?.role;
  const canDelete = list.ownerId === me.id || (!personal && (role === "owner" || role === "admin"));
  const kind = list.kind as Kind;
  return (
    <View role="listitem" testID={`list-${list.id}`} style={{ gap: space.md, paddingTop: space.lg, paddingBottom: space.sm, borderTopWidth: hair, borderColor: c.rule }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: space["3xs"] }}>
          <Link href={href as Href} aria-label={t("listsApp.openList", { name: list.name })} testID={`list-open-${list.id}`} style={{ minHeight: control, justifyContent: "center" }}>
            <Heading level={3}>{list.name}</Heading>
          </Link>
          <Text variant="small" tone="muted">
            {`${t(`lists.kind.${kind}`)}, ${t("lists.items", { count: list.items })}, ${personal ? t("lists.personal") : t("lists.by", { name: list.ownerName })}`}
          </Text>
        </View>
        {canDelete ? <IconButton icon={Trash2} label={t("listsApp.deleteNamed", { name: list.name })} onPress={() => setAsking((a) => !a)} testID={`list-delete-${list.id}`} danger /> : null}
      </View>
      {asking ? (
        <Well style={{ padding: space.md, gap: space.sm }}>
          <Text>{personal ? t("listsApp.deleteWarnPersonal") : t("listsApp.deleteWarnGroup")}</Text>
          {del.error ? <Text role="alert" tone="error">{errorMessage(t, del.error)}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            <Button label={t("listsApp.deleteConfirm", { name: list.name })} variant="danger" busy={del.busy} testID={`list-delete-confirm-${list.id}`} onPress={async () => { if (await del.run(() => listsApi.remove(list.id))) onChanged(); }} />
            <Button label={t("app.cancel")} variant="quiet" onPress={() => setAsking(false)} />
          </View>
        </Well>
      ) : null}
      {list.description ? <Text tone="ink2">{list.description}</Text> : null}
      <Strip list={list} />
      <Pressable
        role="button"
        aria-expanded={open}
        aria-label={open ? t("listsApp.manageHide") : t("listsApp.manage")}
        onPress={() => setOpen((o) => !o)}
        testID={`manage-toggle-${list.id}`}
        style={{ minHeight: control, flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" }}
      >
        <Text tone="ink2" variant="small">{t("listsApp.manage")}</Text>
        <ChevronDown size={16} strokeWidth={1.6} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open ? <Manage list={list} onChanged={onChanged} /> : null}
    </View>
  );
}
