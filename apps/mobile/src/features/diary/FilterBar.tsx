import type { MemberDto } from "@pausa/api-types";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { FeedFilters } from "@/api/diary";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { ChevronDown, Search } from "@/ui/lucide";
import { PersonChip } from "@/ui/PersonChip";
import { Select } from "@/ui/Select";
import { Text } from "@/ui/Text";
import { usePressed } from "@/ui/usePressed";

export type Draft = { q: string; kind: string; watchedYear: string; minRating: string; person: string; with: string; platform: string };
export const EMPTY: Draft = { q: "", kind: "", watchedYear: "", minRating: "", person: "", with: "", platform: "" };

export const toFilters = (d: Draft): FeedFilters => ({
  q: d.q.trim().slice(0, 80) || undefined,
  kind: (d.kind || undefined) as FeedFilters["kind"],
  watchedYear: d.watchedYear ? Number(d.watchedYear) : undefined,
  minRating: d.minRating ? Number(d.minRating) : undefined,
  person: d.person || undefined,
  with: d.with || undefined,
  platform: d.platform.trim() || undefined,
});

/**
 * v1 FilterBar: "Cerca e filtra" as a disclosure between two rules, open while filters are active. The head carries the count
 * of results (with "+" when there are more pages); the panel holds the title search, type / year watched / minimum stars as
 * selects, "Visto da" and "Visto con" as person chips, and (main only) the platform. Nothing applies until "Cerca".
 */
export function FilterBar({
  members,
  applied,
  onApply,
  resultCount,
  hasMore,
}: {
  members: MemberDto[];
  applied: Draft;
  onApply: (d: Draft) => void;
  resultCount: number | null;
  hasMore: boolean;
}) {
  const { t } = useI18n();
  const { c } = useTheme();
  const active = Object.values(applied).some(Boolean);
  const [open, setOpen] = useState(active);
  const [draft, setDraft] = useState<Draft>(applied);
  const { hovered, bind } = usePressed();
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const year = new Date().getFullYear();
  const any = { value: "", label: t("feed.filter.any") };
  const toggle = () => {
    if (!open) setDraft(applied);
    setOpen(!open);
  };

  return (
    <View style={{ borderTopWidth: hair, borderBottomWidth: hair, borderColor: c.rule }}>
      <Pressable
        role="button"
        aria-expanded={open}
        aria-label={t("feed.filter.title")}
        onPress={toggle}
        testID="open-filters"
        {...bind}
        style={[{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm }, web({ cursor: "pointer" })]}
      >
        <Search size={20} strokeWidth={1.6} color={c.ink} />
        <Text variant="strong" style={{ flex: 1, color: hovered ? c.accent : c.ink }}>
          {t("feed.filter.title")}
        </Text>
        {active && resultCount !== null ? (
          <Text aria-hidden variant="small" tone="accentInk" testID="filter-count" style={[{ backgroundColor: c.accent, paddingHorizontal: space.xs, paddingVertical: 2, fontWeight: "600" }, web({ fontVariantNumeric: "tabular-nums" })]}>
            {resultCount}
            {hasMore ? "+" : ""}
          </Text>
        ) : null}
        <View style={[{ transform: [{ rotate: open ? "180deg" : "0deg" }] }, web({ transition: "transform 150ms" })]}>
          <ChevronDown size={18} strokeWidth={1.6} color={c.muted} />
        </View>
      </Pressable>

      {open ? (
        <View {...({ role: "search" } as object)} testID="filter-panel" style={[{ gap: space.md, paddingTop: space["2xs"], paddingBottom: space.lg - 4 }, web({ animation: "pausa-unfold 220ms cubic-bezier(0.16, 1, 0.3, 1)" })]}>
          <Field label={t("feed.filter.q")} value={draft.q} onChangeText={set("q")} maxLength={80} inputMode="search" returnKeyType="search" onSubmitEditing={() => onApply(draft)} testID="filter-q" />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Select
              label={t("feed.filter.kind")}
              value={draft.kind}
              onChange={set("kind")}
              testID="filter-kind"
              options={[any, { value: "movie", label: t("kind.movie") }, { value: "tv", label: t("kind.tv") }, { value: "anime", label: t("kind.anime") }]}
            />
            <Select
              label={t("feed.filter.year")}
              value={draft.watchedYear}
              onChange={set("watchedYear")}
              testID="filter-year"
              options={[any, ...Array.from({ length: 10 }, (_, i) => String(year - i)).map((y) => ({ value: y, label: y }))]}
            />
            <Select
              label={t("feed.filter.rating")}
              value={draft.minRating}
              onChange={set("minRating")}
              testID="filter-rating"
              options={[any, ...[10, 8, 6].map((h) => ({ value: String(h), label: t("feed.filter.atLeast", { stars: h / 2 }) }))]}
            />
          </View>
          <People label={t("feed.filter.by")} none={t("feed.filter.everyone")} members={members} value={draft.person} onChange={set("person")} />
          <People label={t("feed.filter.with")} none={t("feed.filter.anyone")} members={members} value={draft.with} onChange={set("with")} />
          <Field label={t("log.platform")} value={draft.platform} onChangeText={set("platform")} placeholder={t("log.platformPlaceholder")} maxLength={60} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
            <Button label={t("feed.filter.apply")} onPress={() => onApply(draft)} testID="apply-filters" />
            {active ? (
              <Button
                label={t("feed.filter.clear")}
                variant="quiet"
                onPress={() => {
                  setDraft(EMPTY);
                  onApply(EMPTY);
                }}
                style={{ minHeight: control }}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function People({ label, none, members, value, onChange }: { label: string; none: string; members: MemberDto[]; value: string; onChange: (v: string) => void }) {
  return (
    <View role="radiogroup" aria-label={label} style={{ gap: space.xs }}>
      <Text variant="small" tone="ink2">
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <PersonChip label={none} on={!value} onPress={() => onChange("")} />
        {members.map((m) => (
          <PersonChip key={m.userId} label={m.name} person={m} on={value === m.userId} onPress={() => onChange(m.userId)} />
        ))}
      </View>
    </View>
  );
}
