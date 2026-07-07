import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

interface Props {
  onLocationSelect: (lat: number, lng: number) => void;
  selectedPosition?: { latitud: number; longitud: number } | null;
}

const PUEBLA_CENTER = { latitude: 19.0414, longitude: -98.2063 };

// ─── Pin personalizado para selección de ubicación ────────────────────────────
function LocationPin() {
  return (
    <View style={{ alignItems: 'center' }}>
      {/* Círculo principal naranja */}
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#EC802B',
        borderWidth: 3, borderColor: '#D4691A',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#EC802B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
        elevation: 8,
      }}>
        {/* Cruz de posicionamiento */}
        <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: '#FFFFFF', borderRadius: 1 }} />
        <View style={{ position: 'absolute', width: 2, height: 16, backgroundColor: '#FFFFFF', borderRadius: 1 }} />
      </View>
      {/* Flecha apuntando al punto */}
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
        borderStyle: 'solid',
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: '#D4691A',
        marginTop: -1,
      }} />
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#D4691A', opacity: 0.7 }} />
    </View>
  );
}

export default function LocationPickerMap({ onLocationSelect, selectedPosition }: Props) {
  const mapRef = useRef<MapView>(null);
  const [markerCoord, setMarkerCoord] = useState(
    selectedPosition
      ? { latitude: selectedPosition.latitud, longitude: selectedPosition.longitud }
      : PUEBLA_CENTER
  );

  const handlePress = (e: any) => {
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
      {/* Instrucción superior */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#FFF5EE', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 7, marginBottom: 8,
      }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EC802B' }} />
        <Text style={{ fontSize: 11, color: '#D4691A', fontWeight: '600', flex: 1 }}>
          Toca el mapa para marcar la ubicación del animal
        </Text>
      </View>

      {/* Mapa */}
      <View style={{
        height: 220, width: '100%',
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1.5, borderColor: '#F0E8DC',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 6,
      }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{ ...markerCoord, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          onPress={handlePress}
          showsUserLocation
          showsMyLocationButton={false}
        >
          <Marker
            draggable
            coordinate={markerCoord}
            onDragEnd={handlePress}
            tracksViewChanges={false}
          >
            <LocationPin />
          </Marker>
        </MapView>
      </View>

      {/* Instrucción inferior */}
      <Text style={{ fontSize: 11, color: '#9B8B7A', textAlign: 'center', marginTop: 6 }}>
        También puedes arrastrar el pin para ajustar la posición
      </Text>
    </View>
  );
}