import { useId, useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { control, fallbackSans, fontSize, fonts, hair, space, useTheme, web } from "@/theme";
import { Text } from "./Text";

type FieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  error?: string | null;
  hint?: string;
  /** Announced as required (`aria-required`); the label says so in words where it matters. */
  required?: boolean;
};

/** 1px muted edge on the ground, square, 44pt, the label above it. The error is announced, not only coloured. */
export function Field({ label, error, hint, required, onFocus, onBlur, ...input }: FieldProps) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  // The hint or the error is what the field is described by: a screen reader reads it with the field, not only when it is found by exploring.
  const base = useId().replace(/:/g, "");
  const describedBy = error ? `${base}-err` : hint ? `${base}-hint` : undefined;
  return (
    <View style={{ gap: space["2xs"], alignSelf: "stretch" }}>
      <Text variant="label" tone="ink2">
        {label}
      </Text>
      <TextInput
        {...input}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        placeholderTextColor={c.muted}
        selectionColor={c.accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: control,
            paddingHorizontal: space.sm,
            paddingVertical: space.xs,
            borderWidth: hair,
            borderColor: error ? c.error : focused ? c.focus : c.muted,
            backgroundColor: "transparent",
            color: c.ink,
            fontFamily: fonts.body400,
            fontSize: Math.max(16, fontSize.md),
          },
          web({ fontFamily: `${fonts.body400}, ${fallbackSans}` }),
        ]}
      />
      {hint && !error ? (
        <Text variant="small" tone="muted" nativeID={`${base}-hint`}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text variant="small" tone="error" role="alert" aria-live="assertive" nativeID={`${base}-err`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
