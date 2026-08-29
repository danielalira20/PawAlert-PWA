import MapView, { Marker, Polyline } from 'react-native-maps';
import { View } from 'react-native';
import type { PuntoRecorrido } from './recorridoAvistamientos.types';

interface Props {
  puntos: PuntoRecorrido[];
  height?: number;
}

function PinRecorrido({ punto }: { punto: PuntoRecorrido }) {
  if (punto.esMasReciente) {
    return (
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#EC802B',
          borderWidth: 3,
          borderColor: '#FFFFFF',
        }}
      />
    );
  }
  if (punto.esOrigen) {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          backgroundColor: '#8C7A6B',
          borderWidth: 2,
          borderColor: '#FFFFFF',
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#66BCB4',
        borderWidth: 2,
        borderColor: '#FFFFFF',
      }}
    />
  );
}

export default function RecorridoAvistamientosMap({ puntos, height = 230 }: Props) {
  if (puntos.length === 0) {
    return null;
  }

  const latitudes = puntos.map((p) => p.latitud);
  const longitudes = puntos.map((p) => p.longitud);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latitudeDelta = Math.max((maxLat - minLat) * 1.6, 0.008);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.6, 0.008);

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden' }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta,
          longitudeDelta,
        }}
      >
        <Polyline
          coordinates={puntos.map((p) => ({ latitude: p.latitud, longitude: p.longitud }))}
          strokeColor="#8C7A6B"
          strokeWidth={2}
        />
        {puntos.map((punto, indice) => (
          <Marker
            key={`${punto.latitud}-${punto.longitud}-${indice}`}
            coordinate={{ latitude: punto.latitud, longitude: punto.longitud }}
            title={punto.etiqueta}
          >
            <PinRecorrido punto={punto} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
}
