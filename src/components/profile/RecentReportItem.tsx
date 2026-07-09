import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Brand } from '../../constants/theme';
import { getCondicionPreview, getEstadoPreview } from './condicionEstadoColors';
import { AnimalIcon } from './AnimalIcon';
import type { ReporteResumen } from '../../hooks/useRecentReports';

interface Props {
  reporte: ReporteResumen;
  onPress?: () => void;
}

export function RecentReportItem({ reporte, onPress }: Props) {
  const cond = getCondicionPreview(reporte.animal?.condicion);
  const est = getEstadoPreview(reporte.estado_reporte);
  const foto = reporte.fotos?.[0] || reporte.foto_url;
  const tipoAnimal = reporte.animal?.tipo_animal ?? null;
  const condicion = reporte.animal?.condicion ?? null;
  const tipoLabel = tipoAnimal ? tipoAnimal[0].toUpperCase() + tipoAnimal.slice(1) : 'Animal';
  const lugar = [reporte.colonia, reporte.municipio].filter(Boolean).join(', ') || 'Sin ubicación';
  const tiempo = formatDistanceToNow(new Date(reporte.created_at), { addSuffix: false, locale: es });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.card, { borderColor: `${cond.color}80`, shadowColor: cond.color }]}>
        {/* Franja superior de color — igual que en MisReportesScreen */}
        <View style={[styles.topStripe, { backgroundColor: cond.color }]} />

        <View style={styles.row}>
          <View style={[styles.photoWrap, { borderColor: `${cond.color}30`, backgroundColor: cond.bg }]}>
            {foto ? (
              <Image source={{ uri: foto }} style={styles.photo} resizeMode="cover" />
            ) : (
              <AnimalIcon tipoAnimal={tipoAnimal} condicion={condicion} size={56} bare />
            )}
          </View>

          <View style={styles.content}>
            <View style={styles.tipoRow}>
              <AnimalIcon tipoAnimal={tipoAnimal} condicion={condicion} size={22} />
              <Text style={styles.tipo}>{tipoLabel}</Text>
            </View>

            {!!reporte.animal?.descripcion && (
              <Text style={styles.descripcion} numberOfLines={1}>
                {reporte.animal.descripcion}
              </Text>
            )}

            <View style={styles.badgesRow}>
              <View style={[styles.condBadge, { backgroundColor: cond.bg, borderColor: `${cond.color}40` }]}>
                <View style={[styles.dot, { backgroundColor: cond.color }]} />
                <Text style={[styles.condBadgeText, { color: cond.color }]}>{cond.label}</Text>
              </View>
              <View style={[styles.estadoBadge, { backgroundColor: `${est.color}18` }]}>
                <Text style={[styles.estadoBadgeText, { color: est.color }]}>{est.label}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={11} color={Brand.textFaint} />
              <Text style={styles.metaText} numberOfLines={1}>
                {lugar}
              </Text>
              <Text style={styles.metaDot}>·</Text>
              <Ionicons name="time-outline" size={11} color={Brand.textFaint} />
              <Text style={styles.metaText}>hace {tiempo}</Text>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={Brand.textFaint} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 2,
  },
  topStripe: { height: 4, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  photoWrap: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  content: { flex: 1, minWidth: 0, gap: 5 },
  tipoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipo: { fontSize: 14, fontWeight: '800', color: Brand.textDark },
  descripcion: { fontSize: 12, color: Brand.textMuted },
  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  condBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  condBadgeText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  estadoBadgeText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 11, color: Brand.textFaint },
  metaDot: { fontSize: 11, color: Brand.textFaint, marginHorizontal: 2 },
});