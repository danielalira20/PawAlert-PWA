import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { CondicionColors, normalizeCondicion } from '../../constants/theme';
import type { ReporteStaff } from '../../types/reportestaff';
import { getAnimales, condicionMasGrave, totalAnimales } from '../../types/reporte';

// Misma región por defecto que ya usan en MapScreen.native.tsx (Puebla centro)
const FALLBACK_REGION: Region = {
  latitude: 19.0414,
  longitude: -98.2063,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

interface Props {
  reportes: ReporteStaff[];
  onSelectReporte?: (reporte: ReporteStaff) => void;
}

type ReporteConCoords = ReporteStaff & { latitud: number; longitud: number };

function tieneCoords(r: ReporteStaff): r is ReporteConCoords {
  return typeof r.latitud === 'number' && typeof r.longitud === 'number';
}

// Calcula una región que englobe todos los pines asignados, con un margen.
// Si no hay ninguno con coordenadas, cae al centro de Puebla por defecto.
function calcularRegion(reportes: ReporteConCoords[]): Region {
  if (reportes.length === 0) return FALLBACK_REGION;

  const lats = reportes.map((r) => r.latitud);
  const lngs = reportes.map((r) => r.longitud);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat, 0.02) * 1.6,
    longitudeDelta: Math.max(maxLng - minLng, 0.02) * 1.6,
  };
}

// Nota de rendimiento: react-native-maps necesita `tracksViewChanges={true}`
// mientras el marcador custom está animando, para que refleje el cambio.
// Dejarlo en `true` para siempre con un loop infinito (como el radar-ping que
// sí hacemos en web con CSS) puede afectar el rendimiento con varios pines.
// Por eso aquí solo se anima la ENTRADA (~500ms) y luego se apaga el tracking;
// el pin "Grave" se queda con un anillo estático en vez de pulsar en loop.
function StaffMarker({ reporte, onPress }: { reporte: ReporteConCoords; onPress?: () => void }) {
  const [trackChanges, setTrackChanges] = useState(true);
  const animales = getAnimales(reporte);
  const total = totalAnimales(animales);
  const cond = normalizeCondicion(condicionMasGrave(animales));
  const color = cond ? CondicionColors[cond] : '#9B8B7E';

  useEffect(() => {
    const t = setTimeout(() => setTrackChanges(false), 550);
    return () => clearTimeout(t);
  }, []);

  return (
    <Marker
      coordinate={{ latitude: reporte.latitud, longitude: reporte.longitud }}
      onPress={onPress}
      tracksViewChanges={trackChanges}
    >
      <Animated.View entering={ZoomIn.springify().damping(12)}>
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          {cond === 'grave' && (
            <View
              style={{
                position: 'absolute',
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: color,
                opacity: 0.45,
              }}
            />
          )}
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: color,
              borderWidth: 2,
              borderColor: '#fff',
            }}
          />
          {total > 1 && (
            <View
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                minWidth: 14,
                height: 14,
                paddingHorizontal: 2,
                borderRadius: 7,
                backgroundColor: '#2C3E50',
                borderWidth: 1.5,
                borderColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 8, fontWeight: '800', color: '#fff' }}>{total}</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Marker>
  );
}

export function StaffMapMarkers({ reportes, onSelectReporte }: Props) {
  const reportesConCoords = useMemo(() => reportes.filter(tieneCoords), [reportes]);
  const region = useMemo(() => calcularRegion(reportesConCoords), [reportesConCoords]);

  return (
    <MapView style={{ flex: 1 }} initialRegion={region}>
      {reportesConCoords.map((reporte) => (
        <StaffMarker
          key={reporte.id}
          reporte={reporte}
          onPress={() => onSelectReporte?.(reporte)}
        />
      ))}
    </MapView>
  );
}