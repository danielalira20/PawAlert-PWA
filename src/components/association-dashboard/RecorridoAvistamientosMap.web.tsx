import { lazy, Suspense, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  View,
} from 'react-native';
import type { PuntoRecorrido } from './recorridoAvistamientos.types';

const RecorridoAvistamientosLeafletMap = lazy(() => import('./RecorridoAvistamientosLeafletMap'));

interface Props {
  puntos: PuntoRecorrido[];
  height?: number;
}

export default function RecorridoAvistamientosMap({ puntos, height = 230 }: Props) {
  const [width, setWidth] = useState(0);
  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  if (puntos.length === 0) {
    return null;
  }

  return (
    <View
      onLayout={handleLayout}
      style={{ height, borderRadius: 16, overflow: 'hidden' }}
    >
      {width > 0 && (
        <Suspense
          fallback={(
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#66BCB4" />
            </View>
          )}
        >
          <RecorridoAvistamientosLeafletMap puntos={puntos} width={width} height={height} />
        </Suspense>
      )}
    </View>
  );
}
