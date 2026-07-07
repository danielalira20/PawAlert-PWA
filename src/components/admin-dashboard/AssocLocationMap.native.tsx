import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Brand } from '../../constants/theme';

interface Props {
  latitud: number;
  longitud: number;
  radioKm: number;
  height?: number;
}

export function AssocLocationMap({ latitud, longitud, radioKm, height = 180 }: Props) {
  // Delta aproximado para que el círculo de cobertura quepa cómodo en el
  // encuadre inicial, sin importar si el radio es de 5 km o de 40 km.
  const delta = Math.max(radioKm / 60, 0.03);

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: latitud,
          longitude: longitud,
          latitudeDelta: delta,
          longitudeDelta: delta,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        <Circle
          center={{ latitude: latitud, longitude: longitud }}
          radius={radioKm * 1000}
          strokeColor={Brand.secondary}
          fillColor="rgba(102,188,180,0.15)"
          strokeWidth={1.5}
        />
        <Marker coordinate={{ latitude: latitud, longitude: longitud }} pinColor={Brand.primary} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 14, overflow: 'hidden' },
  map: { flex: 1 },
});