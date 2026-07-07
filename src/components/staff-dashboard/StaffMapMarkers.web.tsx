import React, { Suspense, lazy, useState } from 'react';
import { View, LayoutChangeEvent, ActivityIndicator } from 'react-native';
import { CondicionColors, normalizeCondicion } from '../../constants/theme';
import type { ReporteStaff } from '../../types/reportestaff';

// IMPORTANTE: no se importa LeafletMap directo arriba del archivo — Leaflet
// toca `window`/DOM al momento de importarse, lo cual truena cuando Expo
// Router intenta pre-renderizar la app del lado del servidor (SSR), donde
// `window` no existe. Con React.lazy(), Metro empaqueta LeafletMap en un
// chunk aparte que solo se pide y evalúa en el navegador, nunca en el
// servidor — el error "window is not defined" desaparece con esto.
const LeafletMap = lazy(() => import('../../screens/LeafletMap'));

interface Props {
  reportes: ReporteStaff[];
  onSelectReporte?: (reporte: ReporteStaff) => void;
}

function getMarkerColor(condicion: string) {
  const cond = normalizeCondicion(condicion);
  return cond ? CondicionColors[cond] : '#9B8B7E';
}

export function StaffMapMarkers({ reportes, onSelectReporte }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={{ flex: 1 }} onLayout={handleLayout}>
      {size && (
        <Suspense
          fallback={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#9B8B7E" />
            </View>
          }
        >
          <LeafletMap
            reportes={reportes as any}
            getMarkerColor={getMarkerColor}
            onSelectReport={(r: any) => onSelectReporte?.(r)}
            onMapClick={() => {}}
            width={size.width}
            height={size.height}
          />
        </Suspense>
      )}
    </View>
  );
}