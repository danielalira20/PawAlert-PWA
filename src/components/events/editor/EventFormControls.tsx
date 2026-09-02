import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";

import { EventTheme } from "../../../constants/eventTheme";

export function EventFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!description && (
        <Text style={styles.sectionDescription}>{description}</Text>
      )}
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

export function EventTextField({
  label,
  required,
  hint,
  ...props
}: TextInputProps & { label: string; required?: boolean; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={EventTheme.colors.textFaint}
        {...props}
        style={[
          styles.input,
          props.multiline && styles.inputMultiline,
          props.style,
        ]}
      />
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function EventOptionChips<T extends string>({
  options,
  selected,
  onToggle,
  multiple = true,
}: {
  options: readonly ({ value: T; label: string; description?: string } | T)[];
  selected: T[];
  onToggle: (value: T) => void;
  multiple?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        const description =
          typeof option === "string" ? undefined : option.description;
        const active = selected.includes(value);
        return (
          <TouchableOpacity
            accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityState={{ checked: active }}
            key={value}
            onPress={() => onToggle(value)}
            style={[
              styles.chip,
              description && styles.chipWithDescription,
              active && styles.chipActive,
            ]}
          >
            <Ionicons
              name={active ? "checkmark-circle" : "ellipse-outline"}
              size={17}
              color={
                active ? EventTheme.colors.surface : EventTheme.colors.textMuted
              }
            />
            <View style={description ? styles.chipCopy : undefined}>
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {label}
              </Text>
              {!!description && (
                <Text
                  style={[
                    styles.chipDescription,
                    active && styles.chipDescriptionActive,
                  ]}
                >
                  {description}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function EventChoiceField({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: EventTheme.colors.surface,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.card,
    borderWidth: 1,
    padding: 20,
  },
  sectionTitle: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 18,
  },
  sectionDescription: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 4,
  },
  sectionContent: { gap: 18, marginTop: 18 },
  field: { gap: 7 },
  label: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 13,
  },
  required: { color: EventTheme.colors.danger },
  input: {
    backgroundColor: "#FCFAF7",
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.regular,
    fontSize: 13,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputMultiline: { minHeight: 112, textAlignVertical: "top" },
  hint: {
    color: EventTheme.colors.textFaint,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 15,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  chip: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipWithDescription: {
    alignItems: "flex-start",
    flexBasis: 220,
    flexGrow: 1,
    maxWidth: 360,
  },
  chipActive: {
    backgroundColor: EventTheme.colors.primary,
    borderColor: EventTheme.colors.primary,
  },
  chipCopy: { flex: 1 },
  chipLabel: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 12,
  },
  chipLabelActive: { color: EventTheme.colors.surface },
  chipDescription: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  chipDescriptionActive: { color: "rgba(255,255,255,0.82)" },
});
