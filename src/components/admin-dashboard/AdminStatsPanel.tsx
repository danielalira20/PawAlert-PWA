import axios from 'axios';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Brand } from '../../constants/theme';
import { StatsRow, type StatItem } from '../staff-dashboard/StatsRow';

interface ZonaStat {
  latitud: number;
  longitud: number;
  cantidad: number;
  nivel_urgencia_max: 'rojo' | 'amarillo' | 'verde' | null;
}

interface StatsAdmin {
  casos_activos_actuales: number;
  tiempo_promedio_aceptacion_horas: number | null;
  tasa_duplicados: number;
  tasa_fraude_detectado: number;
  recursos_mas_solicitados: { categoria: string; cantidad: number }[];
  casos_sin_cobertura_por_zona: { municipio: string | null; colonia: string | null; cantidad: number }[];
  mapa_calor_activo: ZonaStat[];
  mapa_calor_historico: ZonaStat[];
}

const COLOR_NIVEL: Record<string, string> = {
  rojo: Brand.danger,
  amarillo: Brand.accent,
  verde: Brand.secondary,
};

function ZonasList({ titulo, zonas }: { titulo: string; zonas: ZonaStat[] }) {
  const top = [...zonas].sort((a, b) => b.cantidad - a.cantidad).slice(0, 8);
  return (
    <View style={styles.bloque}>
      <Text style={styles.bloqueTitulo}>{titulo}</Text>
      {top.length === 0 ? (
        <Text style={styles.vacio}>Sin datos</Text>
      ) : (
        top.map((zona, i) => (
          <View key={`${zona.latitud}-${zona.longitud}-${i}`} style={styles.fila}>
            <View
              style={[
                styles.punto,
                { backgroundColor: COLOR_NIVEL[zona.nivel_urgencia_max ?? ''] ?? '#B5A99A' },
              ]}
            />
            <Text style={styles.filaTexto}>
              {zona.latitud.toFixed(2)}, {zona.longitud.toFixed(2)}
            </Text>
            <Text style={styles.filaCantidad}>{zona.cantidad}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function AdminStatsPanel() {
  const { token } = useAuth();
  const [stats, setStats] = useState<StatsAdmin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    (async () => {
      setIsLoading(true);
      setError(false);
      try {
        const res = await axios.get<StatsAdmin>(`${API_URL}/stats/admin`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelado) setStats(res.data);
      } catch {
        if (!cancelado) setError(true);
      } finally {
        if (!cancelado) setIsLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (isLoading) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={Brand.primary} />
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={styles.centro}>
        <Text style={styles.vacio}>No se pudieron cargar las estadísticas.</Text>
      </View>
    );
  }

  const statItems: StatItem[] = [
    { label: 'Casos activos', value: stats.casos_activos_actuales, icon: 'pulse-outline', color: Brand.primary, primary: true },
    { label: 'Horas a aceptación', value: Math.round(stats.tiempo_promedio_aceptacion_horas ?? 0), icon: 'time-outline', color: Brand.secondary },
    { label: '% duplicados', value: Math.round(stats.tasa_duplicados * 100), icon: 'copy-outline', color: Brand.accent },
    { label: '% fraude detectado', value: Math.round(stats.tasa_fraude_detectado * 100), icon: 'warning-outline', color: Brand.danger },
  ];

  return (
    <View style={styles.contenedor}>
      <StatsRow stats={statItems} />

      <View style={styles.bloque}>
        <Text style={styles.bloqueTitulo}>Recursos más solicitados</Text>
        {stats.recursos_mas_solicitados.length === 0 ? (
          <Text style={styles.vacio}>Sin datos</Text>
        ) : (
          stats.recursos_mas_solicitados.map((r) => (
            <View key={r.categoria} style={styles.fila}>
              <Text style={styles.filaTexto}>{r.categoria}</Text>
              <Text style={styles.filaCantidad}>{r.cantidad}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.bloque}>
        <Text style={styles.bloqueTitulo}>Casos sin cobertura por zona</Text>
        {stats.casos_sin_cobertura_por_zona.length === 0 ? (
          <Text style={styles.vacio}>Sin datos</Text>
        ) : (
          stats.casos_sin_cobertura_por_zona.map((z, i) => (
            <View key={`${z.municipio}-${z.colonia}-${i}`} style={styles.fila}>
              <Text style={styles.filaTexto}>
                {z.colonia ?? 'Sin colonia'}, {z.municipio ?? 'Sin municipio'}
              </Text>
              <Text style={styles.filaCantidad}>{z.cantidad}</Text>
            </View>
          ))
        )}
      </View>

      <ZonasList titulo="Zonas activas (mapa de calor)" zonas={stats.mapa_calor_activo} />
      <ZonasList titulo="Zonas históricas (mapa de calor)" zonas={stats.mapa_calor_historico} />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { gap: 18, paddingVertical: 12 },
  centro: { padding: 32, alignItems: 'center', justifyContent: 'center' },
  vacio: { fontSize: 12, color: Brand.textFaint },
  bloque: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  bloqueTitulo: { fontSize: 13, fontWeight: '800', color: Brand.textDark, marginBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filaTexto: { flex: 1, fontSize: 12, color: Brand.textMuted, textTransform: 'capitalize' },
  filaCantidad: { fontSize: 12, fontWeight: '800', color: Brand.textDark },
  punto: { width: 8, height: 8, borderRadius: 4 },
});
