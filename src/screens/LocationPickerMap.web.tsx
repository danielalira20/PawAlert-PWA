import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useRef, useState, useEffect } from 'react';
import { Text, View } from 'react-native';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

// Fix necesario para que Leaflet renderice el icono por defecto en React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

interface Props {
  onLocationSelect: (lat: number, lng: number) => void;
}

const PUEBLA_CENTER = {
  lat: 19.0414,
  lng: -98.2063,
};

export default function LocationPickerMap({ onLocationSelect }: Props) {
  const [position, setPosition] = useState(PUEBLA_CENTER);
  const markerRef = useRef<any>(null);

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker != null) {
        const { lat, lng } = marker.getLatLng();
        setPosition({ lat, lng });
        onLocationSelect(lat, lng);
      }
    },
  };

  // Disparar la ubicación por defecto al montar
  useEffect(() => {
    onLocationSelect(PUEBLA_CENTER.lat, PUEBLA_CENTER.lng);
  }, []);

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ height: 200, width: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', zIndex: 0 }}>
        <MapContainer center={PUEBLA_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={position}
            ref={markerRef}
          />
        </MapContainer>
      </View>
      <Text style={{ fontSize: 12, color: '#7F8C8D', textAlign: 'center', marginTop: 8 }}>
        Arrastra el pin para marcar la ubicación exacta del reporte.
      </Text>
    </View>
  );
}