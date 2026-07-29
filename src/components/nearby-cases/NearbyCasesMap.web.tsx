import React, { lazy, Suspense, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { CasoCercano } from '../../screens/NearbyCasesScreen';

const LeafletMap = lazy(() => import('../../screens/LeafletMap'));

interface Props {
  casos: CasoCercano[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function NearbyCasesMap({ casos, selectedId, onSelect }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const reportes = useMemo(
    () =>
      casos.map((caso) => ({
        id: caso.id,
        latitud: caso.latitud_aproximada,
        longitud: caso.longitud_aproximada,
        municipio: caso.municipio,
        colonia: caso.colonia,
        estado_reporte: 'asignado',
        created_at: caso.created_at,
        animales: caso.animales,
        animal: caso.animales,
      })),
    [casos],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {size ? (
        <Suspense
          fallback={
            <View style={styles.loading}>
              <ActivityIndicator color="#EC802B" />
              <Text style={styles.loadingText}>Preparando el mapa…</Text>
            </View>
          }
        >
          <LeafletMap
            reportes={reportes as any}
            selectedReportId={selectedId}
            fitToMarkers
            onSelectReport={(reporte: any) => onSelect(reporte.id)}
            onMapClick={() => {}}
            width={size.width}
            height={size.height}
          />
        </Suspense>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color="#EC802B" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 240 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4E9D9',
  },
  loadingText: {
    color: '#8C7A6B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
});
