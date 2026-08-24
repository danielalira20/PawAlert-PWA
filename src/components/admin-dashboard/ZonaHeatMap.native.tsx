import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';
import { Brand } from '../../constants/theme';

export interface ZonaStat {
  latitud: number;
  longitud: number;
  cantidad: number;
  nivel_urgencia_max: 'rojo' | 'amarillo' | 'verde' | null;
}

const NIVEL_COLOR: Record<string, string> = {
  rojo: '#E74C3C',
  amarillo: '#F39C12',
  verde: '#27AE60',
};

const claveZona = (z: ZonaStat) => `${z.latitud}-${z.longitud}`;

// Anillos concéntricos con opacidad decreciente — react-native-maps no
// soporta un fillColor con degradado radial nativo, así que se simula
// apilando varios círculos (mismo criterio que en MapScreen.native.tsx).
const ANILLOS_GLOW = [
  { factor: 1, opacity: 0.05 },
  { factor: 0.7, opacity: 0.09 },
  { factor: 0.45, opacity: 0.16 },
  { factor: 0.22, opacity: 0.3 },
];

const alphaHex = (opacity: number) =>
  Math.round(opacity * 255).toString(16).padStart(2, '0');

function ZonaGlow({ zona }: { zona: ZonaStat }) {
  const color = NIVEL_COLOR[zona.nivel_urgencia_max ?? ''] ?? '#95A5A6';
  const radioBase = 500 + zona.cantidad * 180;
  return (
    <>
      {ANILLOS_GLOW.map((anillo) => (
        <Circle
          key={anillo.factor}
          center={{ latitude: zona.latitud, longitude: zona.longitud }}
          radius={radioBase * anillo.factor}
          strokeWidth={0}
          fillColor={`${color}${alphaHex(anillo.opacity)}`}
        />
      ))}
    </>
  );
}

interface Props {
  zonas: ZonaStat[];
  height?: number;
}

export function ZonaHeatMap({ zonas, height = 220 }: Props) {
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  if (zonas.length === 0) {
    return (
      <View style={[styles.vacioContenedor, { height }]}>
        <Text style={styles.vacio}>Sin datos</Text>
      </View>
    );
  }

  const lats = zonas.map((z) => z.latitud);
  const lngs = zonas.map((z) => z.longitud);
  const centro = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  const delta = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs), 0.02) * 1.6;
  const zonaActiva = zonas.find((z) => claveZona(z) === seleccionada) ?? null;

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        style={styles.map}
        initialRegion={{ ...centro, latitudeDelta: delta, longitudeDelta: delta }}
      >
        {zonaActiva && <ZonaGlow zona={zonaActiva} />}
        {zonas.map((zona) => {
          const clave = claveZona(zona);
          const color = NIVEL_COLOR[zona.nivel_urgencia_max ?? ''] ?? '#95A5A6';
          return (
            <Marker
              key={clave}
              coordinate={{ latitude: zona.latitud, longitude: zona.longitud }}
              pinColor={color}
              onPress={() => setSeleccionada((actual) => (actual === clave ? null : clave))}
            >
              <Callout>
                <Text style={styles.calloutTexto}>
                  {zona.cantidad} {zona.cantidad === 1 ? 'reporte' : 'reportes'} en esta zona
                </Text>
              </Callout>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 14, overflow: 'hidden' },
  map: { flex: 1 },
  vacioContenedor: { alignItems: 'center', justifyContent: 'center' },
  vacio: { fontSize: 12, color: Brand.textFaint },
  calloutTexto: { fontSize: 12, color: Brand.textDark },
});
