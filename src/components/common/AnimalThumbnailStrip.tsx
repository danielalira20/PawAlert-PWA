import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand, normalizeCondicion } from '../../constants/theme';
import { ConditionBadge } from '../staff-dashboard/ConditionBadge';

export interface DuplicadoAnimal {
  tipo_animal: string | null;
  condicion: string | null;
  cantidad: number | null;
  foto_url: string | null;
}

interface Props {
  animales: DuplicadoAnimal[];
}

// Tira informativa, no navegable — a diferencia de AnimalCarousel, aquí solo
// se resume de un vistazo la composición del caso existente (foto + tipo +
// condición por animal), sin flechas ni índice.
export function AnimalThumbnailStrip({ animales }: Props) {
  if (animales.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {animales.map((a, i) => {
        const condicion = normalizeCondicion(a.condicion);
        const tipo = a.tipo_animal ? a.tipo_animal.charAt(0).toUpperCase() + a.tipo_animal.slice(1) : 'Animal';
        const cantidad = a.cantidad ?? 1;
        return (
          <View key={i} style={styles.item}>
            <View style={styles.photoWrap}>
              {a.foto_url ? (
                <Image source={{ uri: a.foto_url }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="paw-outline" size={18} color="#B0A098" />
                </View>
              )}
            </View>
            <Text style={styles.tipo} numberOfLines={1}>
              {tipo}{cantidad > 1 ? ` ×${cantidad}` : ''}
            </Text>
            {condicion && <ConditionBadge condicion={condicion} />}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 2 },
  item: { alignItems: 'center', width: 72, gap: 4 },
  photoWrap: { width: 56, height: 56, borderRadius: 14, overflow: 'hidden', backgroundColor: '#E2D0B8' },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  tipo: { fontSize: 11, fontWeight: '700', color: Brand.textDark, textAlign: 'center' },
});
