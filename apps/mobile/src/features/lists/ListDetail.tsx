import type { ListDetail as Detail, ListItemDto } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ApiFailure, errorMessage } from "@/api/errors";
import { LIST_CAP, listsApi } from "@/api/lists";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { TitleSearch } from "@/features/TitleSearch";
import { RequireSession, useMe } from "@/features/session";
import { useI18n } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { ConfirmButton } from "@/ui/ConfirmButton";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { moved } from "@/ui/moved";
import { Screen } from "@/ui/Screen";
import { Section } from "@/ui/Section";
import { Sortable } from "@/ui/Sortable";
import { Empty, ErrorState, Loading, Notice } from "@/ui/Status";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import "./lists.messages";

const PRIORITIES = ["0", "1", "2", "3"] as const;

/** One title of the list, with its note and priority, and the editor behind a press. */
function ItemRow({ listId, item, watchlist, canEdit, onChanged }: { listId: string; item: ListItemDto; watchlist: boolean; canEdit: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const [priority, setPriority] = useState(String(Number(item.priority)));
  const save = useAction();
  const remove = useAction();
  const media = item.media;
  const prio = Number(item.priority);
  return (
    <View testID={`item-${media.id}`} style={{ paddingVertical: space.sm, borderBottomWidth: hair, borderColor: c.rule, gap: space.xs }}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
        <Text tone="muted" style={{ width: 22 }} aria-hidden>{Number(item.position) + 1}</Text>
        <MediaPoster title={media.title} path={media.posterPath} width={48} />
        <View style={{ flex: 1, minWidth: 0, gap: space["3xs"] }}>
          <Text variant="strong" numberOfLines={2}>{media.title}</Text>
          <Text variant="small" tone="muted">
            {t(`kind.${media.kind as "movie" | "tv" | "anime"}`)}
            {media.year !== null ? ` · ${Number(media.year)}` : ""}
            {item.addedBy ? ` · ${t("listsApp.addedBy", { name: item.addedBy.name })}` : ""}
          </Text>
          {watchlist && prio > 0 ? <Tag tone="accent" label={t("listsApp.priorityTag", { n: prio })} /> : null}
          {item.note ? <Text variant="small" tone="ink2">{item.note}</Text> : null}
        </View>
      </View>
      {canEdit ? (
        <View style={{ paddingLeft: 22 + space.sm }}>
          {!editing ? (
            <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
              <Button label={t("listsApp.edit")} accessibilityLabel={t("listsApp.editLabel", { title: media.title })} variant="quiet" onPress={() => setEditing(true)} />
              <Button label={t("listsApp.remove")} accessibilityLabel={t("listsApp.removeLabel", { title: media.title })} variant="quiet" onPress={async () => { if (await remove.run(() => listsApi.removeItem(listId, media.id))) onChanged(); }} busy={remove.busy} testID={`remove-${media.id}`} />
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              <Field label={t("listsApp.note")} value={note} onChangeText={(v) => setNote(v.slice(0, 280))} maxLength={280} multiline hint={t("listsApp.noteHint", { left: 280 - note.length })} testID={`note-${media.id}`} />
              {watchlist ? (
                <Choice label={t("listsApp.priority")} value={priority as (typeof PRIORITIES)[number]} options={PRIORITIES.map((p) => ({ value: p, label: p === "0" ? t("listsApp.priorityNone") : t("listsApp.priorityN", { n: Number(p) }) }))} onChange={setPriority} />
              ) : null}
              {save.error ? <Text role="alert" tone="error">{errorMessage(t, save.error)}</Text> : null}
              <View style={{ flexDirection: "row", gap: space.xs }}>
                <Button
                  label={t("listsApp.save")}
                  busy={save.busy}
                  testID={`save-${media.id}`}
                  onPress={async () => {
                    if (await save.run(() => listsApi.editItem(listId, media.id, { note: note.trim() === "" ? null : note.trim(), ...(watchlist ? { priority: Number(priority) } : {}) }))) {
                      setEditing(false);
                      onChanged();
                    }
                  }}
                />
                <Button label={t("app.cancel")} variant="quiet" onPress={() => setEditing(false)} />
              </View>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Reorder mode: the whole list as draggable rows (and the up/down buttons); "Done" sends the order in ONE call. */
function Reorder({ listId, items, onDone, onCancel }: { listId: string; items: ListItemDto[]; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [order, setOrder] = useState(items);
  const [spoken, setSpoken] = useState("");
  const save = useAction();
  const dirty = order.some((o, i) => o.media.id !== items[i]?.media.id);
  return (
    <View style={{ gap: space.sm }} testID="reorder">
      <Text tone="ink2">{t("listsApp.reorderHint")}</Text>
      <Sortable
        testID="reorder-list"
        items={order}
        keyOf={(i) => i.media.id}
        onMove={(from, to) => {
          setOrder((all) => moved(all, from, to));
          const it = order[from];
          if (it) setSpoken(t("listsApp.moved", { title: it.media.title, n: to + 1 }));
        }}
        labels={{
          drag: (i) => t("listsApp.drag", { title: i.media.title }),
          up: (i) => t("listsApp.up", { title: i.media.title }),
          down: (i) => t("listsApp.down", { title: i.media.title }),
        }}
        renderItem={(i, idx) => (
          <>
            <Text tone="muted" style={{ width: 22 }}>{idx + 1}</Text>
            <MediaPoster title={i.media.title} path={i.media.posterPath} width={36} />
            <Text variant="strong" numberOfLines={2} style={{ flex: 1 }}>{i.media.title}</Text>
          </>
        )}
      />
      <Text role="status" aria-live="polite" variant="small" tone="muted">{spoken}</Text>
      {save.error ? <Text role="alert" tone="error">{errorMessage(t, save.error)}</Text> : null}
      <View style={{ flexDirection: "row", gap: space.xs }}>
        <Button
          label={t("listsApp.done")}
          busy={save.busy}
          testID="reorder-done"
          onPress={async () => {
            // Nothing moved: nothing to send. Otherwise the whole order, once.
            if (!dirty || (await save.run(() => listsApi.reorder(listId, order.map((o) => o.media.id))))) onDone();
          }}
        />
        <Button label={t("app.cancel")} variant="quiet" onPress={onCancel} />
      </View>
    </View>
  );
}

function Header({ data, onChanged }: { data: Detail; onChanged: () => void }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const me = useMe();
  const list = data.list;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [dupTo, setDupTo] = useState("personal");
  const [dupOpen, setDupOpen] = useState(false);
  const rename = useAction();
  const dup = useAction();
  const del = useAction();
  const manageable = (id: string | null) => id !== null && me.circles.some((c) => c.id === id);
  return (
    <View style={{ gap: space.sm }}>
      {renaming ? (
        <View style={{ gap: space.sm }}>
          <Field label={t("lists.name")} value={name} onChangeText={(v) => setName(v.slice(0, 80))} maxLength={80} testID="rename-name" />
          <Field label={t("listsApp.description")} value={description} onChangeText={(v) => setDescription(v.slice(0, 500))} maxLength={500} multiline testID="rename-description" />
          {rename.error ? <Text role="alert" tone="error">{errorMessage(t, rename.error)}</Text> : null}
          <View style={{ flexDirection: "row", gap: space.xs }}>
            <Button
              label={t("listsApp.save")}
              busy={rename.busy}
              disabled={!name.trim()}
              testID="rename-save"
              onPress={async () => {
                if (await rename.run(() => listsApi.update(list.id, { name: name.trim(), description: description.trim() }))) {
                  setRenaming(false);
                  onChanged();
                }
              }}
            />
            <Button label={t("app.cancel")} variant="quiet" onPress={() => setRenaming(false)} />
          </View>
        </View>
      ) : (
        <>
          <Heading level={1} testID="list-name" style={{ fontSize: 44, lineHeight: 48 }}>{list.name}</Heading>
          {list.description ? <Text tone="ink2">{list.description}</Text> : null}
        </>
      )}
      <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
        <Tag label={t(`lists.kind.${list.kind as "watchlist" | "list" | "ranking"}`)} tone={list.kind === "watchlist" ? "accent" : "ink2"} />
        <Tag label={list.circleId ? t("lists.group") : t("lists.personal")} />
        <Text variant="small" tone="muted" testID="list-count">{t("listsApp.count", { count: list.items, max: LIST_CAP })}</Text>
      </View>
      {!renaming && data.canEdit ? (
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={t("listsApp.rename")} variant="secondary" onPress={() => setRenaming(true)} testID="rename" />
          <Button label={t("listsApp.duplicate")} variant="secondary" onPress={() => setDupOpen((o) => !o)} testID="duplicate" />
          {data.canDelete ? (
            <ConfirmButton label={t("listsApp.delete")} confirmLabel={t("listsApp.deleteConfirm", { name: list.name })} busy={del.busy} onConfirm={async () => { if (await del.run(() => listsApi.remove(list.id))) router.replace(href("/lists") as never); }} />
          ) : null}
        </View>
      ) : null}
      {!renaming && !data.canEdit ? (
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          <Button label={t("listsApp.duplicate")} variant="secondary" onPress={() => setDupOpen((o) => !o)} testID="duplicate" />
        </View>
      ) : null}
      {del.error ? <Text role="alert" tone="error">{errorMessage(t, del.error)}</Text> : null}
      {dupOpen ? (
        <View style={{ gap: space.sm }} testID="duplicate-panel">
          <Choice
            label={t("listsApp.duplicateWhere")}
            value={dupTo}
            options={[{ value: "personal", label: t("lists.scopePersonal") }, ...me.circles.filter((c) => manageable(c.id)).map((c) => ({ value: c.id, label: t("listsApp.forNamed", { name: c.name }) }))]}
            onChange={setDupTo}
          />
          {dup.error ? <Text role="alert" tone="error">{errorMessage(t, dup.error)}</Text> : null}
          <Button
            label={t("listsApp.duplicateGo")}
            busy={dup.busy}
            testID="duplicate-go"
            onPress={async () => {
              const res = await dup.run(() => listsApi.duplicate(list.id, { circleId: dupTo === "personal" ? null : dupTo }));
              if (res) router.push(href(`/lists/${res.value.id}`) as never);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function Inner({ id }: { id: string }) {
  const { t, locale, href } = useI18n();
  const detail = useResource((signal) => listsApi.detail(id, locale, signal), [id, locale]);
  const [reordering, setReordering] = useState(false);
  const add = useAction();
  const [addedNote, setAddedNote] = useState<string | null>(null);
  useEffect(() => setAddedNote(null), [id]);

  if (detail.loading && !detail.data)
    return (
      <Screen>
        <Loading rows={4} />
      </Screen>
    );
  if (detail.error && !detail.data)
    return (
      <Screen>
        <BackLink to={href("/lists")} label={t("lists.title")} />
        {detail.error instanceof ApiFailure && detail.error.code === "not_found" ? <Empty title={t("listsApp.notFound")} body={t("listsApp.notFoundBody")} /> : <ErrorState error={detail.error} onRetry={detail.reload} />}
      </Screen>
    );
  const data = detail.data;
  if (!data) return null;
  const full = data.items.length >= LIST_CAP;
  const watchlist = data.list.kind === "watchlist";
  const failure = add.error instanceof ApiFailure && add.error.code === "conflict" ? t("listsApp.full", { max: LIST_CAP }) : add.error ? errorMessage(t, add.error) : null;

  return (
    <Screen>
      <BackLink to={data.list.circleId ? `${href("/lists")}?circle=${data.list.circleId}` : `${href("/lists")}?circle=`} label={t("lists.title")} />
      <Header key={data.list.name + (data.list.description ?? "")} data={data} onChanged={detail.reload} />

      <Section title={t("listsApp.titles")}>
        {data.items.length === 0 ? <Empty title={t("listsApp.emptyList")} body={data.canEdit ? t("listsApp.emptyListBody") : undefined} /> : null}
        {data.canEdit && data.items.length > 1 && !reordering ? (
          <Button label={t("listsApp.reorder")} variant="secondary" onPress={() => setReordering(true)} testID="reorder-start" />
        ) : null}
        {reordering ? (
          <Reorder listId={data.list.id} items={data.items} onCancel={() => setReordering(false)} onDone={() => { setReordering(false); void detail.reload(); }} />
        ) : (
          <View testID="items">
            {data.items.map((i) => (
              <ItemRow key={i.media.id} listId={data.list.id} item={i} watchlist={watchlist} canEdit={data.canEdit} onChanged={detail.reload} />
            ))}
          </View>
        )}
      </Section>

      {data.canEdit && !reordering ? (
        <Section title={t("listsApp.addTitle")}>
          {full ? <Text role="status" tone="ink2" testID="cap-message">{t("listsApp.full", { max: LIST_CAP })}</Text> : null}
          <TitleSearch
            search={listsApi.search}
            disabled={full || add.busy}
            isPicked={(c) => c.key.startsWith("local:") && data.items.some((i) => `local:${i.media.id}` === c.key)}
            onPick={async (c) => {
              setAddedNote(null);
              const res = await add.run(() => listsApi.addItem(data.list.id, { mediaKey: c.key }));
              if (res) {
                setAddedNote(res.value.added ? t("listsApp.added", { title: c.title }) : t("listsApp.alreadyIn", { title: c.title }));
                void detail.reload();
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
          {failure ? <Text role="alert" tone="error">{failure}</Text> : null}
          {addedNote ? <Notice>{addedNote}</Notice> : null}
        </Section>
      ) : null}
    </Screen>
  );
}

export function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireSession>
      <Inner id={String(id)} />
    </RequireSession>
  );
}
