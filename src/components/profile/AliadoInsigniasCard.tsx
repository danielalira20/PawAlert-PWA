import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import type { InsigniaAliado } from '../../hooks/useAliadoInsignias';

interface Props {
  insignias: InsigniaAliado[];
  isLoading: boolean;
}

// Mismos códigos que evalua_insignias_aliado en el backend
// (insignias_aliado_service.py) — nombre para mostrar + ícono + nivel
// máximo posible (o null si es de un solo nivel, no cobre/plata/oro).
const INSIGNIA_INFO: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; tieneNiveles: boolean }> = {
  aliado_de_impacto: { label: 'Aliado de impacto', icon: 'ribbon-outline', tieneNiveles: true },
  apoyo_critico: { label: 'Apoyo crítico', icon: 'flash-outline', tieneNiveles: false },
  constancia_solidaria: { label: 'Constancia solidaria', icon: 'calendar-outline', tieneNiveles: false },
  recurso_multiplicado: { label: 'Recurso multiplicado', icon: 'git-network-outline', tieneNiveles: false },
  comunidad_que_recompensa: { label: 'Comunidad que recompensa', icon: 'gift-outline', tieneNiveles: false },
};

const NIVEL_COLOR: Record<string, string> = {
  cobre: '#B08D57',
  plata: '#9AA3AB',
  oro: '#D4A72C',
};

const NIVEL_LABEL: Record<string, string> = { cobre: 'Cobre', plata: 'Plata', oro: 'Oro' };

export function AliadoInsigniasCard({ insignias, isLoading }: Props) {
  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Brand.primary} />
        </View>
      </View>
    );
  }

  if (insignias.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.headerInner}>
          <Text style={styles.headerTitle}>Tus insignias</Text>
          <Ionicons name="ribbon-outline" size={22} color={Brand.primary} />
        </View>
        <View style={styles.topDivider} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            Cuando tus contribuciones y lotes queden confirmados, aquí verás tus insignias.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerInner}>
        <Text style={styles.headerTitle}>Tus insignias</Text>
        <Ionicons name="ribbon-outline" size={22} color={Brand.primary} />
      </View>
      <View style={styles.topDivider} />
      <View style={styles.grid}>
        {insignias.map((insignia) => {
          const info = INSIGNIA_INFO[insignia.codigo_insignia] || {
            label: insignia.codigo_insignia,
            icon: 'ribbon-outline' as const,
            tieneNiveles: !!insignia.nivel,
          };
          const colorNivel = insignia.nivel ? NIVEL_COLOR[insignia.nivel] : Brand.secondary;
          return (
            <View key={insignia.id} style={styles.badge}>
              <View style={[styles.badgeIcon, { backgroundColor: `${colorNivel}22` }]}>
                <Ionicons name={info.icon} size={22} color={colorNivel} />
              </View>
              <Text style={styles.badgeLabel} numberOfLines={2}>{info.label}</Text>
              {insignia.nivel && (
                <Text style={[styles.badgeNivel, { color: colorNivel }]}>{NIVEL_LABEL[insignia.nivel] || insignia.nivel}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 2,
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.08)',
    overflow: 'hidden',
    marginBottom: 20,
    ...CARD_SHADOW,
  },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: Brand.primary },
  topDivider: { height: 1, backgroundColor: 'rgba(46,42,38,0.08)' },
  loadingWrap: { alignItems: 'center', paddingVertical: 30 },
  emptyWrap: { padding: 22 },
  emptyText: { fontSize: 14, color: Brand.textMuted, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 22 },
  badge: {
    width: 110,
    alignItems: 'center',
    padding: 12,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.06)',
  },
  badgeIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  badgeLabel: { fontSize: 11, fontWeight: '700', color: Brand.textDark, textAlign: 'center' },
  badgeNivel: { fontSize: 10, fontWeight: '900', marginTop: 4, textTransform: 'uppercase' },
});
