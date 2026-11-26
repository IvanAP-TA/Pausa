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
import { Chapter } from "@/ui/Surfaces";
import { X } from "@/ui/lucide";
import { ErrorState, Heading, Loading, Notice, Screen, Text } from "@/ui";
import { Search } from "../diary/TitleSearch";
import { RequireSession, useSession } from "../session";
import { PosterGrid } from "./PosterGrid";
import "./people.messages";

type AvatarChoice = "keep" | "none" | (typeof AVATARS)[number];

function AvatarPicker({ name, current, value, onChange }: { name: string; current: string | null; value: AvatarChoice; onChange: (v: AvatarChoice) => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const cols = w >= 560 ? 8 : 6;
  const gap = space.xs;
  const cell = w > 0 ? Math.floor((w - gap * (cols - 1)) / cols) : 0;
  const tile = (key: AvatarChoice, label: string, body: React.ReactNode) => (
    <Pressable
      key={key}
      role="radio"
      aria-checked={value === key}
      aria-label={label}
      testID={`avatar-${key}`}
      onPress={() => onChange(key)}
      style={StyleSheet.flatten([{ width: cell, height: cell, minWidth: control, minHeight: control, alignItems: "center", justifyContent: "center", borderWidth: hair, borderColor: value === key ? c.accent : c.rule, backgroundColor: value === key ? c.paper2 : "transparent" }, web({ cursor: "pointer" })])}
    >
      {body}
    </Pressable>
  );
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="ink2">
        {t("profile.avatar")}
      </Text>
      <View role="radiogroup" aria-label={t("profile.avatar")} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {cell > 0 ? (
          <>
            {current && !current.startsWith("emoji:") ? tile("keep", t("profile.avatarPhoto"), <Avatar name={name} image={current} size={40} />) : null}
            {tile("none", t("profile.avatarInitial"), <Avatar name={name} image={null} size={40} />)}
            {AVATARS.map((g) => tile(g, t("profile.avatarPick", { glyph: g }), <Text style={{ fontSize: 28, lineHeight: 34 }}>{g}</Text>))}
          </>
        ) : null}
      </View>
    </View>
  );
}

function Favorites({ initial, onChanged }: { initial: MediaDto[]; onChanged: () => void }) {
  const { t } = useI18n();
  const { c } = useTheme();
  const [list, setList] = useState(initial);
  const act = useAction();
  useEffect(() => setList(initial), [initial]);
  const full = list.length >= MAX_FAVORITES;
  return (
    <View style={{ gap: space.md, borderTopWidth: hair, borderColor: c.rule, paddingTop: space.xl }}>
      <View style={{ gap: space["2xs"] }}>
        <Chapter>{t("profile.favorites")}</Chapter>
        <Text variant="small" tone="muted">
          {t("profile.favoritesHint")}
        </Text>
      </View>
      <PosterGrid
        items={list}
        corner={(m) => (
          <Pressable
            role="button"
            aria-label={t("profile.removeFavorite", { title: m.title })}
            onPress={async () => {
              if (await act.run(() => peopleApi.removeFavorite(m.id))) {
                setList((l) => l.filter((x) => x.id !== m.id));
                onChanged();
              }
            }}
            style={StyleSheet.flatten([{ width: control, height: control, alignItems: "center", justifyContent: "center", backgroundColor: c.paper }, web({ cursor: "pointer" })])}
          >
            <X size={18} strokeWidth={1.8} color={c.ink} />
          </Pressable>
        )}
      />
      <Text variant="small" tone="muted" role="status" aria-live="polite">
        {full ? t("profile.full", { max: MAX_FAVORITES }) : t("profile.count", { count: list.length, max: MAX_FAVORITES })}
      </Text>
      {full ? null : (
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
      )}
      {act.error ? (
        <Text tone="error" role="alert">
          {errorMessage(t, act.error)}
        </Text>
      ) : null}
    </View>
  );
}

function Form({ s, onSaved }: { s: MySettings; onSaved: () => void }) {
  const { t, href } = useI18n();
  const { reload } = useSession();
  const [name, setName] = useState(s.name);
  const [bio, setBio] = useState(s.bio ?? "");
  const [genres, setGenres] = useState<string[]>(s.genres);
  const [avatar, setAvatar] = useState<AvatarChoice>(() => {
    const g = s.image?.startsWith("emoji:") ? s.image.slice(6) : null;
    return AVATARS.find((a) => a === g) ?? (s.image ? "keep" : "none");
  });
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
      <AvatarPicker name={name || s.name} current={s.image} value={avatar} onChange={(v) => { setAvatar(v); touch(); }} />
      <Field label={t("profile.bio")} value={bio} onChangeText={(v) => { setBio(v); touch(); }} multiline maxLength={MAX_BIO} placeholder={t("profile.bioPlaceholder")} hint={`${bio.length}/${MAX_BIO}`} testID="profile-bio" />
      <ChipGroup label={t("profile.genresPick", { max: MAX_GENRES })} hint={genres.length >= MAX_GENRES ? t("people.edit.genresFull", { max: MAX_GENRES }) : undefined}>
        {GENRES.map((g) => (
          <Chip key={g} label={t(`profile.genres.${g}`)} on={genres.includes(g)} onPress={() => toggleGenre(g)} testID={`genre-${g}`} />
        ))}
      </ChipGroup>
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
