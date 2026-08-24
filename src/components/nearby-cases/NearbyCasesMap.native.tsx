import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';

import type { CasoCercano } from '../../screens/NearbyCasesScreen';
import { CondicionColors, normalizeCondicion } from '../../constants/theme';
import { animalMasGrave, totalAnimales } from '../../types/reporte';

interface Props {
  casos: CasoCercano[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function regionFor(casos: CasoCercano[]): Region {
  if (casos.length === 0) {
    return {
      latitude: 19.0414,
      longitude: -98.2063,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }
  const latitudes = casos.map((caso) => caso.latitud_aproximada);
  const longitudes = casos.map((caso) => caso.longitud_aproximada);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.04) * 1.5,
    longitudeDelta: Math.max(maxLng - minLng, 0.04) * 1.5,
  };
}

export function NearbyCasesMap({ casos, selectedId, onSelect }: Props) {
  const region = useMemo(() => regionFor(casos), [casos]);
  const selectedCase = casos.find((caso) => caso.id === selectedId);
  const selectedAnimal = selectedCase ? animalMasGrave(selectedCase.animales) : null;
  const selectedCondition = normalizeCondicion(selectedAnimal?.condicion);
  const selectedColor = selectedCondition ? CondicionColors[selectedCondition] : '#EC802B';
  const coverageRings = [
    { radius: 520, opacity: '07' },
    { radius: 420, opacity: '0A' },
    { radius: 320, opacity: '11' },
    { radius: 225, opacity: '17' },
    { radius: 135, opacity: '1F' },
  ];

  return (
    <MapView style={StyleSheet.absoluteFillObject} initialRegion={region}>
      {selectedCase && coverageRings.map(({ radius, opacity }) => (
        <Circle
          key={radius}
          center={{
            latitude: selectedCase.latitud_aproximada,
            longitude: selectedCase.longitud_aproximada,
          }}
          radius={radius}
          strokeWidth={0}
          fillColor={`${selectedColor}${opacity}`}
        />
      ))}
      {casos.map((caso) => {
        const animal = animalMasGrave(caso.animales);
        const condicion = normalizeCondicion(animal?.condicion);
        const color = condicion ? CondicionColors[condicion] : '#EC802B';
        const selected = selectedId === caso.id;
        const total = totalAnimales(caso.animales);
        return (
          <Marker
            key={caso.id}
            coordinate={{
              latitude: caso.latitud_aproximada,
              longitude: caso.longitud_aproximada,
            }}
            onPress={() => onSelect(caso.id)}
            tracksViewChanges={false}
          >
            <View style={[styles.markerHalo, selected && { borderColor: color }]}>
              <View style={[styles.marker, { backgroundColor: color }]}>
                <Ionicons name="paw" size={18} color="#FFFFFF" />
              </View>
              {total > 1 && (
                <View style={styles.count}>
                  <Text style={styles.countText}>{total}</Text>
                </View>
              )}
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  markerHalo: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: '#2C3E50',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
});
