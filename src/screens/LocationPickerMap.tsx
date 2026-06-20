import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

interface Props {
  onLocationSelect: (lat: number, lng: number) => void;
  selectedPosition?: { latitud: number; longitud: number } | null;
}

const PUEBLA_CENTER = {
  latitude: 19.0414,
  longitude: -98.2063,
};

export default function LocationPickerMap({ onLocationSelect, selectedPosition }: Props) {
  const mapRef = useRef<MapView>(null);
  const [markerCoord, setMarkerCoord] = useState(
    selectedPosition
      ? { latitude: selectedPosition.latitud, longitude: selectedPosition.longitud }
      : PUEBLA_CENTER
  );

  const handleDragEnd = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setMarkerCoord({ latitude, longitude });
    onLocationSelect(latitude, longitude);
  };

  useEffect(() => {
    if (!selectedPosition) return;
    const next = { latitude: selectedPosition.latitud, longitude: selectedPosition.longitud };
    setMarkerCoord(next);
    mapRef.current?.animateToRegion({ ...next, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
  }, [selectedPosition?.latitud, selectedPosition?.longitud]);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ height: 200, width: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            ...markerCoord,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          onPress={(e) => handleDragEnd(e)}
        >
          <Marker
            draggable
            coordinate={markerCoord}
            onDragEnd={handleDragEnd}
            pinColor="#E74C3C"
          />
        </MapView>
      </View>
      <Text style={{ fontSize: 12, color: '#7F8C8D', textAlign: 'center', marginTop: 8 }}>
        Mantén presionado y arrastra el pin, o toca el mapa para ubicar al animal.
      </Text>
    </View>
  );
}