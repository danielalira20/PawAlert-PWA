import MapView, {
  MapPressEvent,
  Marker,
  MarkerDragStartEndEvent,
} from "react-native-maps";
import { StyleSheet, View } from "react-native";

import { EventTheme } from "../../../constants/eventTheme";

interface Props {
  latitud: number | null;
  longitud: number | null;
  onChange: (latitud: number, longitud: number) => void;
}

export function EventLocationPicker({ latitud, longitud, onChange }: Props) {
  const latitude = latitud ?? 19.4326;
  const longitude = longitud ?? -99.1332;
  const handlePress = (event: MapPressEvent) =>
    onChange(
      event.nativeEvent.coordinate.latitude,
      event.nativeEvent.coordinate.longitude,
    );
  const handleDragEnd = (event: MarkerDragStartEndEvent) =>
    onChange(
      event.nativeEvent.coordinate.latitude,
      event.nativeEvent.coordinate.longitude,
    );

  return (
    <View style={styles.container}>
      <MapView
        key={`${latitude}-${longitude}`}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={handlePress}
        style={styles.map}
      >
        {latitud != null && longitud != null && (
          <Marker
            coordinate={{ latitude: latitud, longitude: longitud }}
            draggable
            onDragEnd={handleDragEnd}
            pinColor={EventTheme.colors.primary}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: EventTheme.radii.control,
    height: 240,
    overflow: "hidden",
  },
  map: { flex: 1 },
});
