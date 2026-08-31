import { Ionicons } from "@expo/vector-icons";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { EVENT_TYPE_OPTIONS } from "../../../constants/eventForm";
import { EventTheme } from "../../../constants/eventTheme";
import type { EventType } from "../../../types/event";

export type PublicEventCostFilter = "todos" | "gratuito" | "con_costo";
export type PublicEventDateFilter = "todos" | "7_dias" | "30_dias";
export type PublicEventSpeciesFilter = "todos" | "Perros" | "Gatos";
export type PublicEventMunicipalityFilter = "todos" | "Puebla";

export interface PublicEventFilterState {
  type: EventType | "todos";
  cost: PublicEventCostFilter;
  date: PublicEventDateFilter;
  species: PublicEventSpeciesFilter;
  municipality: PublicEventMunicipalityFilter;
}

interface PublicEventFiltersProps {
  value: PublicEventFilterState;
  onChange: (value: PublicEventFilterState) => void;
}

function FilterChip({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={13}
          color={active ? EventTheme.colors.surface : EventTheme.colors.primary}
        />
      )}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function PublicEventFilters({
  value,
  onChange,
}: PublicEventFiltersProps) {
  const hasFilters = Object.values(value).some((filter) => filter !== "todos");

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Categoría</Text>
        {hasFilters && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() =>
              onChange({
                type: "todos",
                cost: "todos",
                date: "todos",
                species: "todos",
                municipality: "todos",
              })
            }
          >
            <Text style={styles.clearText}>Limpiar filtros</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.horizontalContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <FilterChip
          active={value.type === "todos"}
          icon="apps-outline"
          label="Todos"
          onPress={() => onChange({ ...value, type: "todos" })}
        />
        {EVENT_TYPE_OPTIONS.map((option) => (
          <FilterChip
            active={value.type === option.value}
            key={option.value}
            label={option.label}
            onPress={() => onChange({ ...value, type: option.value })}
          />
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Preferencias</Text>
      <View style={styles.wrapRow}>
        <FilterChip
          active={value.date === "todos"}
          icon="calendar-outline"
          label="Cualquier fecha"
          onPress={() => onChange({ ...value, date: "todos" })}
        />
        <FilterChip
          active={value.date === "7_dias"}
          label="Próximos 7 días"
          onPress={() => onChange({ ...value, date: "7_dias" })}
        />
        <FilterChip
          active={value.date === "30_dias"}
          label="Próximos 30 días"
          onPress={() => onChange({ ...value, date: "30_dias" })}
        />
        <FilterChip
          active={value.cost === "gratuito"}
          icon="gift-outline"
          label="Gratuitos"
          onPress={() =>
            onChange({
              ...value,
              cost: value.cost === "gratuito" ? "todos" : "gratuito",
            })
          }
        />
        <FilterChip
          active={value.cost === "con_costo"}
          icon="wallet-outline"
          label="Con costo"
          onPress={() =>
            onChange({
              ...value,
              cost: value.cost === "con_costo" ? "todos" : "con_costo",
            })
          }
        />
        <FilterChip
          active={value.species === "Perros"}
          icon="paw-outline"
          label="Perros"
          onPress={() =>
            onChange({
              ...value,
              species: value.species === "Perros" ? "todos" : "Perros",
            })
          }
        />
        <FilterChip
          active={value.species === "Gatos"}
          icon="paw-outline"
          label="Gatos"
          onPress={() =>
            onChange({
              ...value,
              species: value.species === "Gatos" ? "todos" : "Gatos",
            })
          }
        />
        <FilterChip
          active={value.municipality === "Puebla"}
          icon="location-outline"
          label="Puebla"
          onPress={() =>
            onChange({
              ...value,
              municipality:
                value.municipality === "Puebla" ? "todos" : "Puebla",
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: EventTheme.colors.surface,
    borderBottomColor: EventTheme.colors.border,
    borderBottomWidth: 1,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 11,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.bold,
    fontSize: 9,
    letterSpacing: 0.5,
    marginBottom: 7,
    textTransform: "uppercase",
  },
  clearText: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 9,
    marginBottom: 7,
  },
  horizontalContent: {
    gap: 6,
    paddingBottom: 11,
    paddingRight: 12,
  },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: EventTheme.radii.chip,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: EventTheme.colors.primary,
    borderColor: EventTheme.colors.primary,
  },
  chipText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 9,
  },
  chipTextActive: { color: EventTheme.colors.surface },
});
