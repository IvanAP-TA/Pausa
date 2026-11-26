import type { ListSummary } from "@pausa/api-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/api/errors";
import { ApiFailure } from "@/api/errors";
import { LIST_CAP, listsApi } from "@/api/lists";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useCurrentCircle } from "@/features/current-circle";
import { RequireSession, useMe } from "@/features/session";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button } from "@/ui/Button";
import { Choice } from "@/ui/Choice";
import { Field } from "@/ui/Field";
import { Row, RowList } from "@/ui/Row";
import { Screen } from "@/ui/Screen";
import { Section } from "@/ui/Section";
import { Empty, ErrorState, Loading } from "@/ui/Status";
import { Well } from "@/ui/Surfaces";
import { Tag } from "@/ui/Tag";
import { Heading, Text } from "@/ui/Text";
import { Collage } from "./Collage";
import { ListCard } from "./ListCard";
import "./lists.messages";

/** Which Cerchia's lists to show next to the personal ones: the URL's `?circle=`, else the one in use, else none. */
function useScope() {
  const { circle } = useLocalSearchParams<{ circle?: string }>();
  const { circleId } = useCurrentCircle();
  const me = useMe();
  const wanted = circle ?? circleId ?? null;
  return wanted && me.circles.some((c) => c.id === wanted) ? wanted : null;
}

function Card({ list, adding, onAdded }: { list: ListSummary; adding: string | null; onAdded: () => void }) {
  const { t, href } = useI18n();
  const add = useAction();
  const [state, setState] = useState<"added" | "already" | null>(null);
  const full = list.items >= LIST_CAP;
  const doAdd = async () => {
    if (!adding) return;
    const res = await add.run(() => listsApi.addItem(list.id, { mediaId: adding }));
    if (res) {
      setState(res.value.added ? "added" : "already");
      onAdded();
    }
  };
  const failure = add.error instanceof ApiFailure && add.error.code === "conflict" ? t("listsApp.full", { max: LIST_CAP }) : add.error ? errorMessage(t, add.error) : null;
  return (
    <Row href={adding ? undefined : href(`/lists/${list.id}`)} testID={`list-${list.id}`} style={{ alignItems: "flex-start", paddingVertical: space.sm }}>
      <Collage name={list.name} posters={list.posters} />
      <View style={{ flex: 1, minWidth: 0, gap: space["2xs"] }}>
        <Text variant="strong" numberOfLines={2}>{list.name}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
          <Tag label={t(`lists.kind.${list.kind as "watchlist" | "list" | "ranking"}`)} tone={list.kind === "watchlist" ? "accent" : "ink2"} />
          <Text variant="small" tone="muted">{t("lists.items", { count: list.items })}</Text>
        </View>
        {list.description ? <Text variant="small" tone="ink2" numberOfLines={2}>{list.description}</Text> : null}
        {adding ? (
          <View style={{ gap: space["2xs"], paddingTop: space.xs }}>
            <Button
              label={state === "added" ? t("listsApp.addedShort") : state === "already" ? t("listsApp.alreadyShort") : t("lists.add")}
              accessibilityLabel={t("listsApp.addTo", { list: list.name })}
              disabled={state !== null || full}
              busy={add.busy}
              onPress={doAdd}
              testID={`add-to-${list.id}`}
            />
            {full ? <Text variant="small" tone="muted">{t("listsApp.full", { max: LIST_CAP })}</Text> : null}
            {failure ? <Text role="alert" tone="error" variant="small">{failure}</Text> : null}
          </View>
        ) : null}
      </View>
    </Row>
  );
}

/** In "choose a list" mode the compact rows with an Add button; otherwise the full cards with the strip and in-place management. */
function Cards({ lists, adding, reload }: { lists: ListSummary[]; adding: string | null; reload: () => void }) {
  const { href } = useI18n();
  if (adding) return <RowList>{lists.map((l) => <Card key={l.id} list={l} adding={adding} onAdded={reload} />)}</RowList>;
  return (
    <View role="list">
      {lists.map((l) => <ListCard key={l.id} list={l} onChanged={reload} href={href(`/lists/${l.id}`)} />)}
    </View>
  );
}

function Create({ circleId, circleName, onCreated }: { circleId: string | null; circleName: string | null; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"personal" | "circle">("personal");
  const [kind, setKind] = useState<"list" | "watchlist" | "ranking">("list");
  const create = useAction();
  const go = async () => {
    const res = await create.run(() => listsApi.create({ name: name.trim(), kind, circleId: scope === "circle" ? circleId : null }));
    if (res) {
      setName("");
      onCreated(res.value.id);
    }
  };
  return (
    <Well style={{ gap: space.sm, padding: space.lg }}>
      <Field label={t("lists.name")} value={name} onChangeText={(v) => setName(v.slice(0, 80))} maxLength={80} returnKeyType="done" onSubmitEditing={go} testID="new-list-name" />
      {circleId ? (
        <Choice
          label={t("listsApp.where")}
          value={scope}
          options={[
            { value: "personal", label: t("lists.scopePersonal") },
            { value: "circle", label: circleName ? t("listsApp.forNamed", { name: circleName }) : t("lists.scopeCircle") },
          ]}
          onChange={setScope}
        />
      ) : null}
      <Choice
        label={t("listsApp.kindLabel")}
        value={kind}
        options={[
          { value: "list", label: t("lists.kind.list") },
          { value: "watchlist", label: t("lists.kind.watchlist") },
          { value: "ranking", label: t("lists.kind.ranking") },
        ]}
        onChange={setKind}
      />
      {create.error ? <Text role="alert" tone="error">{errorMessage(t, create.error)}</Text> : null}
      <Button label={t("lists.create")} onPress={go} busy={create.busy} disabled={!name.trim()} testID="create-list" />
    </Well>
  );
}

function Overview() {
  const { t, locale, href } = useI18n();
  const router = useRouter();
  const me = useMe();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const circleId = useScope();
  const circle = me.circles.find((c) => c.id === circleId) ?? null;
  const lists = useResource((signal) => listsApi.overview(circleId, signal, locale), [circleId, locale]);
  const adding = add ? String(add) : null;
  const title = useResource(async (signal) => (adding ? (await listsApi.media(adding, locale, signal)).media.title : null), [adding, locale]);
  const personal = (lists.data ?? []).filter((l) => l.circleId === null);
  const group = (lists.data ?? []).filter((l) => l.circleId !== null);

  const setCircle = (value: string) => router.setParams({ circle: value === "mine" ? "" : value });

  return (
    <Screen>
      <Heading level={1}>{t("lists.title")}</Heading>
      {adding ? (
        <View role="status" style={{ gap: space["2xs"] }} testID="add-mode">
          <Text variant="strong">{title.data ? t("listsApp.addingTitle", { title: title.data }) : t("listsApp.adding")}</Text>
          <Text variant="small" tone="muted">{t("listsApp.addingHint")}</Text>
          <Button label={t("app.cancel")} variant="quiet" onPress={() => router.back()} />
        </View>
      ) : (
        <Text variant="lead" tone="ink2">{t("listsApp.lede")}</Text>
      )}
      {me.circles.length > 0 ? (
        <Choice
          label={t("listsApp.show")}
          value={circleId ?? "mine"}
          options={[{ value: "mine", label: t("listsApp.onlyMine") }, ...me.circles.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={setCircle}
        />
      ) : null}

      {lists.loading && !lists.data ? <Loading rows={3} /> : null}
      {lists.error ? <ErrorState error={lists.error} onRetry={lists.reload} /> : null}
      {lists.data ? (
        <>
          <Section title={t("lists.mine")} first>
            {personal.length === 0 ? <Text tone="muted">{t("lists.emptyPersonal")}</Text> : <Cards lists={personal} adding={adding} reload={lists.reload} />}
          </Section>
          {circle ? (
            <Section title={`${t("lists.group")} · ${circle.name}`}>
              {group.length === 0 ? <Empty title={t("lists.empty")} /> : <Cards lists={group} adding={adding} reload={lists.reload} />}
            </Section>
          ) : null}
        </>
      ) : null}

      {!adding ? (
        <Section title={t("lists.newTitle")}>
          <Create circleId={circleId} circleName={circle?.name ?? null} onCreated={(id) => router.push(href(`/lists/${id}`) as never)} />
        </Section>
      ) : null}
    </Screen>
  );
}

export function ListsOverview() {
  return (
    <RequireSession>
      <Overview />
    </RequireSession>
  );
}
