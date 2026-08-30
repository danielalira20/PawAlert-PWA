import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import type { EventType } from "../../../types/event";
import { EVENT_TYPE_META } from "../../../utils/eventFormatters";

interface EventTypeChipProps {
  type: EventType | null;
  customCategory?: string | null;
}

export function EventTypeChip({ type, customCategory }: EventTypeChipProps) {
  const meta = EVENT_TYPE_META[type ?? "otro"];
  const label =
    type === "otro" && customCategory?.trim() ? customCategory : meta.label;

  return (
    <View style={[styles.chip, { backgroundColor: meta.backgroundColor }]}>
      <Ionicons
        name={meta.icon as keyof typeof Ionicons.glyphMap}
        size={14}
        color={meta.color}
      />
      <Text numberOfLines={1} style={[styles.label, { color: meta.color }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: EventTheme.radii.chip,
    flexDirection: "row",
    gap: 5,
    maxWidth: "100%",
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    flexShrink: 1,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
  },
});
