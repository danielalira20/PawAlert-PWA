import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { EVENT_FORM_STEPS } from "../../../constants/eventForm";
import { EventTheme } from "../../../constants/eventTheme";

export function EventProgressHeader({
  step,
  completed,
  disabled = false,
  onClose,
}: {
  step: number;
  completed: boolean[];
  disabled?: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <Text style={styles.eyebrow}>
            Paso {step} de {EVENT_FORM_STEPS.length}
          </Text>
          <Text style={styles.title}>{EVENT_FORM_STEPS[step - 1]}</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Cerrar editor"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onClose}
          style={[styles.close, disabled && styles.disabled]}
        >
          <Ionicons name="close" size={22} color={EventTheme.colors.surface} />
        </TouchableOpacity>
      </View>
      <View style={styles.steps}>
        {EVENT_FORM_STEPS.map((label, index) => {
          const current = index === step - 1;
          const done = completed[index];
          return (
            <View
              accessibilityLabel={`${label}: ${done ? "completo" : current ? "actual" : "pendiente"}`}
              key={label}
              style={styles.stepItem}
            >
              <View
                style={[
                  styles.segment,
                  done && styles.segmentDone,
                  current && !done && styles.segmentCurrent,
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: EventTheme.colors.secondary,
    paddingBottom: 18,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  topRow: { alignItems: "center", flexDirection: "row" },
  titleArea: { flex: 1 },
  eyebrow: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 11,
  },
  title: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 21,
    marginTop: 2,
  },
  close: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  disabled: { opacity: 0.45 },
  steps: { flexDirection: "row", gap: 7, marginTop: 15 },
  stepItem: { flex: 1 },
  segment: {
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 3,
    height: 5,
  },
  segmentDone: { backgroundColor: EventTheme.colors.primary },
  segmentCurrent: { backgroundColor: EventTheme.colors.accent },
});
