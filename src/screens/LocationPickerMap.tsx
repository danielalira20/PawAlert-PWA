import React, { useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

interface Props {
  onLocationSelect: (lat: number, lng: number) => void;
}

const PUEBLA_CENTER = {
  latitude: 19.0414,
  longitude: -98.2063,
};

export default function LocationPickerMap({ onLocationSelect }: Props) {
  const [markerCoord, setMarkerCoord] = useState(PUEBLA_CENTER);

  const handleDragEnd = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setMarkerCoord({ latitude, longitude });
    onLocationSelect(latitude, longitude);
  };

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ height: 200, width: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            ...PUEBLA_CENTER,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          onPress={(e) => handleDragEnd(e)} // Permite mover el pin tocando el mapa
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