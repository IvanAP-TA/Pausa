import type { Provider } from "@pausa/api-types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/api/errors";
import { COUNTRIES, peopleApi } from "@/api/people";
import { useAction } from "@/api/useAction";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { control, hair, space, useTheme, web } from "@/theme";
import { Button } from "@/ui/Button";
import { Check } from "@/ui/lucide";
import { Section } from "@/ui/Section";
import { Select } from "@/ui/Select";
import { Loading, Notice, Text } from "@/ui";
import { regionName } from "@/i18n/intl";

const FALLBACK: Record<string, string> = { it: "IT", en: "GB", es: "ES" };

/** v1 account "services": the country, then the grid of services I have a subscription to (TMDB watch providers, data by JustWatch). */
export function Services() {
  const { t, locale } = useI18n();
  const { c } = useTheme();
  const mine = useResource((signal) => peopleApi.myProviders(signal), []);
  const [country, setCountry] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(false);
  const save = useAction();
  useEffect(() => {
    if (!mine.data) return;
    setCountry(mine.data.country ?? FALLBACK[locale] ?? "IT");
    setPicked(new Set(mine.data.providers.map((p) => p.id)));
  }, [mine.data, locale]);
  const catalogue = useResource((signal) => (country ? peopleApi.providerCatalogue(country, locale, signal) : Promise.resolve(null)), [country, locale]);
  const regionOf = useMemo(() => regionName(locale), [locale]);
  const list: Provider[] = catalogue.data?.providers ?? [];
  const toggle = (id: number) => {
    setSaved(false);
    setPicked((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  };
  return (
    <Section title={t("services.title")} lede={t("services.body")}>
      {mine.loading && !mine.data ? <Loading rows={2} /> : null}
      {country ? (
        <Select
          label={t("services.country")}
          value={country}
          testID="services-country"
          onChange={(v) => {
            setCountry(v);
            setSaved(false);
            // another region's services are not the ones I picked: start clean, as v1 does after "Mostra"
            if (v !== mine.data?.country) setPicked(new Set());
            else setPicked(new Set(mine.data?.providers.map((p) => p.id) ?? []));
          }}
          options={COUNTRIES.map((k) => ({ value: k as string, label: regionOf(k) }))}
        />
      ) : null}
      {catalogue.error ? <Text variant="small" tone="muted">{t("services.off")}</Text> : null}
      {catalogue.loading && !catalogue.data && country ? <Loading rows={2} /> : null}
      {list.length > 0 ? (
        <>
          <View role="group" aria-label={t("services.title")} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {list.map((p) => {
              const on = picked.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  role="checkbox"
                  aria-checked={on}
                  testID={`service-${p.id}`}
                  onPress={() => toggle(p.id)}
                  style={StyleSheet.flatten([
                    { flexBasis: "48%", flexGrow: 1, minHeight: control, flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, borderWidth: hair, borderColor: on ? c.accent : c.rule },
                    web({ cursor: "pointer" }),
                  ])}
                >
                  <Text variant="small" tone={on ? "ink" : "ink2"} numberOfLines={1} style={{ flex: 1 }}>
                    {p.name}
                  </Text>
                  <Check size={16} strokeWidth={1.6} color={c.accent} style={{ opacity: on ? 1 : 0 }} />
                </Pressable>
              );
            })}
          </View>
          <Button
            label={t("services.save")}
            busy={save.busy}
            testID="save-services"
            onPress={async () => {
              const chosen = [...list.filter((p) => picked.has(p.id)), ...(country === mine.data?.country ? (mine.data?.providers ?? []).filter((p) => picked.has(p.id) && !list.some((x) => x.id === p.id)) : [])];
              if (await save.run(() => peopleApi.saveProviders(country, chosen))) {
                setSaved(true);
                void mine.reload();
              }
            }}
          />
          {saved ? <Notice>{t("settings.saved")}</Notice> : null}
          {save.error ? (
            <Text tone="error" role="alert">
              {errorMessage(t, save.error)}
            </Text>
          ) : null}
          <Text variant="small" tone="muted">
            {t("services.credit")}
          </Text>
        </>
      ) : null}
    </Section>
  );
}
