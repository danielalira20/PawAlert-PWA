import React, { Suspense, lazy, useState } from 'react';
import { View, LayoutChangeEvent, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Brand } from '../../constants/theme';

// Mismo motivo que en AssocLocationMap.web.tsx: Leaflet toca `window` al
// importarse, lo cual truena en el pre-renderizado de servidor de Expo
// Router. Con lazy(), Metro lo separa en un chunk que solo se evalúa en
// el navegador.
const ZonaLeafletMap = lazy(() => import('./ZonaLeafletMap'));

export interface ZonaStat {
  latitud: number;
  longitud: number;
  cantidad: number;
  nivel_urgencia_max: 'rojo' | 'amarillo' | 'verde' | null;
}

interface Props {
  zonas: ZonaStat[];
  height?: number;
}

export function ZonaHeatMap({ zonas, height = 220 }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ width, height: h });
  };

  if (zonas.length === 0) {
    return (
      <View style={[styles.vacioContenedor, { height }]}>
        <Text style={styles.vacio}>Sin datos</Text>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: 14, overflow: 'hidden' }} onLayout={handleLayout}>
      {size && (
        <Suspense
          fallback={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#9B8B7E" />
            </View>
          }
        >
          <ZonaLeafletMap zonas={zonas} width={size.width} height={size.height} />
        </Suspense>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vacioContenedor: { alignItems: 'center', justifyContent: 'center' },
  vacio: { fontSize: 12, color: Brand.textFaint },
});
