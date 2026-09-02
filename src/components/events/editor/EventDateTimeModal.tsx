import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { EventTheme } from "../../../constants/eventTheme";
import { AppModal } from "../../AppModal";

function inputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const TIMES = Array.from(
  { length: 48 },
  (_, index) =>
    `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
);

export function EventDateTimeModal({
  visible,
  title,
  date,
  time,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  date: string;
  time: string;
  onClose: () => void;
  onConfirm: (date: string, time: string) => void;
}) {
  const dates = useMemo(
    () =>
      Array.from({ length: 180 }, (_, index) => {
        const value = new Date();
        value.setHours(12, 0, 0, 0);
        value.setDate(value.getDate() + index);
        return value;
      }),
    [],
  );
  const [selectedDate, setSelectedDate] = useState(date || inputDate(dates[0]));
  const [selectedTime, setSelectedTime] = useState(time || "09:00");

  return (
    <AppModal visible={visible} onClose={onClose} maxWidth={650}>
      <View style={styles.modal}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          Selecciona una fecha y un horario. Las horas se muestran en la zona
          elegida para el evento.
        </Text>
        <Text style={styles.label}>Fecha</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}
        >
          {dates.map((option) => {
            const value = inputDate(option);
            const active = selectedDate === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setSelectedDate(value)}
                style={[styles.dateCard, active && styles.active]}
              >
                <Text style={[styles.weekday, active && styles.activeText]}>
                  {option.toLocaleDateString("es-MX", { weekday: "short" })}
                </Text>
                <Text style={[styles.day, active && styles.activeText]}>
                  {option.getDate()}
                </Text>
                <Text style={[styles.month, active && styles.activeText]}>
                  {option.toLocaleDateString("es-MX", { month: "short" })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Text style={styles.label}>Hora</Text>
        <ScrollView
          style={styles.timeScroll}
          contentContainerStyle={styles.timeGrid}
        >
          {TIMES.map((option) => {
            const active = selectedTime === option;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => setSelectedTime(option)}
                style={[styles.timeChip, active && styles.active]}
              >
                <Text style={[styles.timeText, active && styles.activeText]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          onPress={() => onConfirm(selectedDate, selectedTime)}
          style={styles.confirm}
        >
          <Text style={styles.confirmText}>Usar fecha y hora</Text>
        </TouchableOpacity>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: EventTheme.colors.surface, flex: 1, padding: 24 },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 21,
    paddingRight: 40,
  },
  subtitle: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  label: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 13,
    marginBottom: 9,
    marginTop: 20,
  },
  dateRow: { gap: 8, paddingRight: 12 },
  dateCard: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: 15,
    borderWidth: 1,
    minWidth: 68,
    padding: 10,
  },
  weekday: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
    textTransform: "capitalize",
  },
  day: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.extraBold,
    fontSize: 19,
  },
  month: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 10,
    textTransform: "capitalize",
  },
  active: {
    backgroundColor: EventTheme.colors.primary,
    borderColor: EventTheme.colors.primary,
  },
  activeText: { color: EventTheme.colors.surface },
  timeScroll: { flex: 1, minHeight: 170 },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  timeChip: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderColor: EventTheme.colors.border,
    borderRadius: 13,
    borderWidth: 1,
    minWidth: 70,
    padding: 10,
  },
  timeText: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.semiBold,
    fontSize: 12,
  },
  confirm: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.primary,
    borderRadius: EventTheme.radii.control,
    marginTop: 16,
    minHeight: 48,
    justifyContent: "center",
  },
  confirmText: {
    color: EventTheme.colors.surface,
    fontFamily: EventTheme.typography.bold,
    fontSize: 13,
  },
});
