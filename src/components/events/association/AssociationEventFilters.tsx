import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import {
  ASSOCIATION_EVENT_STATES,
  type AssociationEventFilter,
} from "../../../utils/associationEventFilters";
import { EVENT_STATE_META } from "../../../utils/eventFormatters";

const FILTERS: AssociationEventFilter[] = [
  "todos",
  ...ASSOCIATION_EVENT_STATES,
];

interface AssociationEventFiltersProps {
  selected: AssociationEventFilter;
  counts: Record<AssociationEventFilter, number>;
  onSelect: (filter: AssociationEventFilter) => void;
}

export function AssociationEventFilters({
  selected,
  counts,
  onSelect,
}: AssociationEventFiltersProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {FILTERS.map((filter) => {
        const active = selected === filter;
        const label =
          filter === "todos" ? "Todos" : EVENT_STATE_META[filter].label;
        return (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={filter}
            onPress={() => onSelect(filter)}
            style={[styles.filter, active && styles.filterActive]}
          >
            <Text
              style={[styles.filterLabel, active && styles.filterLabelActive]}
            >
              {label}
            </Text>
            <View style={[styles.count, active && styles.countActive]}>
              <Text
                style={[styles.countLabel, active && styles.countLabelActive]}
              >
                {counts[filter]}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    marginBottom: EventTheme.spacing.lg,
    width: "100%",
  },
  content: {
    gap: EventTheme.spacing.sm,
    paddingRight: EventTheme.spacing.md,
  },
  filter: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.chip,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: EventTheme.layout.minimumTouchTarget,
    paddingHorizontal: 14,
  },
  filterActive: {
    backgroundColor: EventTheme.colors.primary,
    borderColor: EventTheme.colors.primary,
  },
  filterLabel: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 12,
  },
  filterLabelActive: {
    color: EventTheme.colors.surface,
  },
  count: {
    alignItems: "center",
    backgroundColor: "rgba(140, 122, 107, 0.12)",
    borderRadius: 12,
    justifyContent: "center",
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countActive: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  countLabel: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.bold,
    fontSize: 10,
  },
  countLabelActive: {
    color: EventTheme.colors.surface,
  },
});
