import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";

export type MapContentMode = "rescues" | "events";
export type EventDiscoveryView = "list" | "map";

interface EventMapModeSwitchProps {
  contentMode: MapContentMode;
  eventView: EventDiscoveryView;
  floating?: boolean;
  showEventView?: boolean;
  onContentModeChange: (mode: MapContentMode) => void;
  onEventViewChange: (view: EventDiscoveryView) => void;
}

function Segment({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Ionicons
        name={icon}
        size={15}
        color={active ? EventTheme.colors.surface : EventTheme.colors.primary}
      />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function EventMapModeSwitch({
  contentMode,
  eventView,
  floating = false,
  showEventView = false,
  onContentModeChange,
  onEventViewChange,
}: EventMapModeSwitchProps) {
  return (
    <View style={[styles.container, floating && styles.containerFloating]}>
      <View style={styles.group}>
        <Segment
          active={contentMode === "rescues"}
          icon="paw-outline"
          label="Rescates"
          onPress={() => onContentModeChange("rescues")}
        />
        <Segment
          active={contentMode === "events"}
          icon="calendar-outline"
          label="Eventos"
          onPress={() => onContentModeChange("events")}
        />
      </View>
      {showEventView && contentMode === "events" && (
        <>
          <View style={styles.divider} />
          <View style={styles.group}>
            <Segment
              active={eventView === "list"}
              icon="list-outline"
              label="Lista"
              onPress={() => onEventViewChange("list")}
            />
            <Segment
              active={eventView === "map"}
              icon="map-outline"
              label="Mapa"
              onPress={() => onEventViewChange("map")}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surface,
    borderBottomColor: EventTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    padding: 7,
  },
  containerFloating: {
    borderColor: EventTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    left: 12,
    position: "absolute",
    right: 12,
    shadowColor: "#4A3728",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    top: 12,
    zIndex: 1500,
  },
  group: { flex: 1, flexDirection: "row", gap: 4 },
  divider: {
    backgroundColor: EventTheme.colors.border,
    height: 26,
    width: 1,
  },
  segment: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 7,
  },
  segmentActive: { backgroundColor: EventTheme.colors.primary },
  segmentText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
  },
  segmentTextActive: { color: EventTheme.colors.surface },
});
