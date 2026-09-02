import { StyleSheet, Text, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";

interface Props {
  latitud: number | null;
  longitud: number | null;
  onChange: (latitud: number, longitud: number) => void;
}

export function EventLocationPicker({ latitud, longitud }: Props) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.text}>
        {latitud == null || longitud == null
          ? "Selecciona “Usar mi ubicación” para colocar el punto del evento."
          : `${latitud.toFixed(6)}, ${longitud.toFixed(6)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderRadius: EventTheme.radii.control,
    height: 220,
    justifyContent: "center",
    padding: 20,
  },
  text: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.medium,
    fontSize: 12,
    textAlign: "center",
  },
});
