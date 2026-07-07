import React, { Suspense, lazy, useState } from 'react';
import { View, LayoutChangeEvent, ActivityIndicator } from 'react-native';

// Mismo motivo que en StaffMapMarkers.web.tsx: Leaflet toca `window` al
// importarse, lo cual truena en el pre-renderizado de servidor de Expo
// Router. Con lazy(), Metro lo separa en un chunk que solo se evalúa en
// el navegador.
const AssocLeafletMap = lazy(() => import('./AssocLeafletMap'));

interface Props {
  latitud: number;
  longitud: number;
  radioKm: number;
  height?: number;
}

export function AssocLocationMap({ latitud, longitud, radioKm, height = 180 }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ width, height: h });
  };

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
          <AssocLeafletMap
            latitud={latitud}
            longitud={longitud}
            radioKm={radioKm}
            width={size.width}
            height={size.height}
          />
        </Suspense>
      )}
    </View>
  );
}