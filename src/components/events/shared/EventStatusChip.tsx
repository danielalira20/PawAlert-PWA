import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import type { EventState } from "../../../types/event";
import { EVENT_STATE_META } from "../../../utils/eventFormatters";

export function EventStatusChip({ state }: { state: EventState }) {
  const meta = EVENT_STATE_META[state];

  return (
    <View
      accessibilityLabel={`Estado: ${meta.label}`}
      style={[styles.chip, { backgroundColor: meta.backgroundColor }]}
    >
      <Ionicons
        name={meta.icon as keyof typeof Ionicons.glyphMap}
        size={14}
        color={meta.color}
      />
      <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
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
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
  },
});
