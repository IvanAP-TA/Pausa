import type { MediaDto, MySettings } from "@pausa/api-types";
import { Pressable, StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import { AVATARS, GENRES, MAX_BIO, MAX_FAVORITES, MAX_GENRES, peopleApi } from "@/api/people";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Avatar } from "@/ui/Avatar";
import { BackLink } from "@/ui/BackLink";
import { Button } from "@/ui/Button";
import { Chip, ChipGroup } from "@/ui/Chip";
import { Field } from "@/ui/Field";
import { MediaPoster } from "@/ui/MediaPoster";
import { Section } from "@/ui/Section";
import { ErrorState, Heading, Loading, Notice, Screen, Text, Title } from "@/ui";
import { Search } from "../diary/TitleSearch";
import { RequireSession, useSession } from "../session";
import "./people.messages";

type AvatarChoice = "keep" | "none" | (typeof AVATARS)[number];

function AvatarPicker({ name, current, value, onChange }: { name: string; current: string | null; value: AvatarChoice; onChange: (v: AvatarChoice) => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const cell = (key: AvatarChoice, label: string, body: React.ReactNode) => (
    <Pressable
      key={key}
      role="radio"
      aria-checked={value === key}
      aria-label={label}
      testID={`avatar-${key}`}
      onPress={() => onChange(key)}
      style={StyleSheet.flatten([{ minWidth: control + 4, minHeight: control + 4, alignItems: "center", justifyContent: "center", borderWidth: value === key ? 2 : hair, borderColor: value === key ? c.accent : c.rule }, web({ cursor: "pointer" })])}
    >
      {body}
    </Pressable>
  );
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="ink2">
        {t("profile.avatar")}
      </Text>
      <View role="radiogroup" aria-label={t("profile.avatar")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {current && !current.startsWith("emoji:") ? cell("keep", t("profile.avatarPhoto"), <Avatar name={name} image={current} size={36} />) : null}
        {cell("none", t("profile.avatarInitial"), <Avatar name={name} image={null} size={36} />)}
        {AVATARS.map((g) => cell(g, t("profile.avatarPick", { glyph: g }), <Text style={{ fontSize: 26, lineHeight: 32 }}>{g}</Text>))}
      </View>
    </View>
  );
}

function Favorites({ initial, onChanged }: { initial: MediaDto[]; onChanged: () => void }) {
  const { t } = useI18n();
  const [list, setList] = useState(initial);
  const act = useAction();
  useEffect(() => setList(initial), [initial]);
  const full = list.length >= MAX_FAVORITES;
  return (
    <Section title={t("profile.favorites")} lede={t("profile.favoritesHint")}>
      <Text variant="small" tone="muted" role="status" aria-live="polite">
        {t("profile.count", { count: list.length, max: MAX_FAVORITES })}
      </Text>
      <View role="list" style={{ gap: space.xs }}>
        {list.map((m) => (
          <View key={m.id} role="listitem" testID={`fav-${m.id}`} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <MediaPoster title={m.title} path={m.posterPath} width={40} />
            <Text style={{ flex: 1 }} variant="strong" numberOfLines={2}>
              {m.title}
            </Text>
            <Button
              label={t("circle.actions.remove")}
              accessibilityLabel={t("profile.removeFavorite", { title: m.title })}
              variant="quiet"
              onPress={async () => {
                if (await act.run(() => peopleApi.removeFavorite(m.id))) {
                  setList((l) => l.filter((x) => x.id !== m.id));
                  onChanged();
                }
              }}
            />
          </View>
        ))}
      </View>
      {full ? (
        <Text tone="ink2">{t("profile.full", { max: MAX_FAVORITES })}</Text>
      ) : (
        <View style={{ gap: space.xs }}>
          <Title style={{ fontSize: 22 }}>{t("people.edit.addFavorite")}</Title>
          <Search
            clearOnPick
            only={(c) => c.key.startsWith("local:")}
            emptyHint={t("people.edit.favoriteNone")}
            onPick={async (p) => {
              const id = p.key.slice(6);
              if (await act.run(() => peopleApi.addFavorite(id))) {
                setList((l) => (l.some((x) => x.id === id) ? l : [...l, { id, kind: p.kind, title: p.title, year: p.year as never, posterPath: p.posterPath }]));
                onChanged();
              }
            }}
          />
        </View>
      )}
      {act.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, act.error)}
        </Text>
      ) : null}
    </Section>
  );
}

function Form({ s, onSaved }: { s: MySettings; onSaved: () => void }) {
  const { t, href } = useI18n();
  const { reload } = useSession();
  const [name, setName] = useState(s.name);
  const [bio, setBio] = useState(s.bio ?? "");
  const [genres, setGenres] = useState<string[]>(s.genres);
  const [avatar, setAvatar] = useState<AvatarChoice>("keep");
  const [saved, setSaved] = useState(false);
  const save = useAction();
  const touch = () => setSaved(false);
  const toggleGenre = (g: string) => {
    touch();
    setGenres((l) => (l.includes(g) ? l.filter((x) => x !== g) : l.length >= MAX_GENRES ? l : [...l, g]));
  };
  return (
    <View style={{ gap: space.lg }}>
      <Field label={t("profile.name")} value={name} onChangeText={(v) => { setName(v); touch(); }} maxLength={40} testID="profile-name" />
      <Field label={t("profile.bio")} value={bio} onChangeText={(v) => { setBio(v); touch(); }} multiline maxLength={MAX_BIO} placeholder={t("profile.bioPlaceholder")} hint={`${bio.length}/${MAX_BIO}`} testID="profile-bio" />
      <ChipGroup label={t("profile.genresPick", { max: MAX_GENRES })} hint={genres.length >= MAX_GENRES ? t("people.edit.genresFull", { max: MAX_GENRES }) : undefined}>
        {GENRES.map((g) => (
          <Chip key={g} label={t(`profile.genres.${g}`)} on={genres.includes(g)} onPress={() => toggleGenre(g)} testID={`genre-${g}`} />
        ))}
      </ChipGroup>
      <AvatarPicker name={name || s.name} current={s.image} value={avatar} onChange={(v) => { setAvatar(v); touch(); }} />
      <View style={{ gap: space.sm }}>
        <Button
          label={save.busy ? t("profile.saving") : t("profile.save")}
          busy={save.busy}
          disabled={name.trim() === ""}
          testID="save-profile"
          onPress={async () => {
            const res = await save.run(() => peopleApi.saveProfile({ name: name.trim(), bio: bio.trim(), genres, avatar: avatar === "keep" ? "" : avatar }));
            if (res) {
              setSaved(true);
              onSaved();
              void reload();
            }
          }}
        />
        {saved ? <Notice>{t("profile.saved")}</Notice> : null}
        {save.error ? (
          <Text tone="error" role="alert">
            {errorMessage(t, save.error)}
          </Text>
        ) : null}
      </View>
      <Favorites initial={s.favorites} onChanged={onSaved} />
      <Button label={t("people.edit.done")} variant="quiet" href={href("/me")} />
    </View>
  );
}

function ProfileBody() {
  const { t, href } = useI18n();
  const s = useResource((signal) => peopleApi.settings(signal), []);
  return (
    <Screen>
      <BackLink to={href("/me")} label={t("tabs.profile")} />
      <Heading level={1}>{t("profile.edit")}</Heading>
      <Text tone="ink2">{t("profile.editHint")}</Text>
      {s.loading && !s.data ? <Loading rows={4} /> : null}
      {s.error ? <ErrorState error={s.error} onRetry={s.reload} /> : null}
      {s.data ? <Form s={s.data} onSaved={() => void s.reload()} /> : null}
    </Screen>
  );
}

export function ProfileEdit() {
  return (
    <RequireSession>
      <ProfileBody />
    </RequireSession>
  );
}
