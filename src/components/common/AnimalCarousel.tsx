import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand, normalizeCondicion } from '../../constants/theme';
import { ConditionBadge } from '../staff-dashboard/ConditionBadge';
import { Animal, animalMasGrave } from '../../types/reporte';

interface Props {
  animales: Animal[];
  initialIndex?: number;
  compact?: boolean;
  onIndexChange?: (index: number) => void;
}

function tituloAnimal(a: Animal): string {
  const tipo = a.tipo_animal ? a.tipo_animal.charAt(0).toUpperCase() + a.tipo_animal.slice(1) : 'Animal';
  const cantidad = a.cantidad ?? 1;
  return a.es_grupo || cantidad > 1 ? `${tipo} · grupo de ${cantidad}` : tipo;
}

function indiceInicial(animales: Animal[], initialIndex?: number): number {
  if (initialIndex !== undefined) return initialIndex;
  const grave = animalMasGrave(animales);
  const idx = grave ? animales.indexOf(grave) : 0;
  return idx >= 0 ? idx : 0;
}

export function AnimalCarousel({ animales, initialIndex, compact = false, onIndexChange }: Props) {
  const [index, setIndex] = useState(() => indiceInicial(animales, initialIndex));

  useEffect(() => {
    onIndexChange?.(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const irAnterior = () => {
    setIndex((i) => {
      const nuevo = i === 0 ? animales.length - 1 : i - 1;
      onIndexChange?.(nuevo);
      return nuevo;
    });
  };

  const irSiguiente = () => {
    setIndex((i) => {
      const nuevo = i === animales.length - 1 ? 0 : i + 1;
      onIndexChange?.(nuevo);
      return nuevo;
    });
  };

  if (animales.length === 0) return null;

  const hayVarios = animales.length > 1;
  const actual = animales[Math.min(index, animales.length - 1)];
  const condicion = normalizeCondicion(actual.condicion);
  const pills = [actual.tamanio, actual.sexo, actual.edad_aproximada].filter(Boolean) as string[];

  return (
    <View style={compact ? styles.containerCompact : styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.titulo, compact && styles.tituloCompact]} numberOfLines={1}>
          {tituloAnimal(actual)}
        </Text>
        {condicion && <ConditionBadge condicion={condicion} />}
      </View>

      {pills.length > 0 && (
        <View style={styles.pillsRow}>
          {pills.map((p, i) => (
            <View key={i} style={styles.pill}>
              <Text style={styles.pillText}>{p}</Text>
            </View>
          ))}
        </View>
      )}

      {!compact && !!actual.descripcion && (
        <Text style={styles.descripcion}>{actual.descripcion}</Text>
      )}

      {hayVarios && (
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={irAnterior} 
            style={styles.navBtn} 
            hitSlop={8}
            >
          
            <Ionicons name="chevron-back" size={16} color={Brand.textMuted} />
          </TouchableOpacity>

          <View style={styles.dotsRow}>
            {animales.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <TouchableOpacity
            onPress={irSiguiente}
            style={styles.navBtn}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={16} color={Brand.textMuted} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  containerCompact: { gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { fontSize: 14, fontWeight: '800', color: Brand.textDark, flexShrink: 1 },
  tituloCompact: { fontSize: 13 },
  pillsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: {
    backgroundColor: `${Brand.primary}1A`,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 100,
  },
  pillText: { fontSize: 11, color: Brand.textDark, textTransform: 'capitalize', fontWeight: '600' },
  descripcion: { fontSize: 13, color: Brand.textMuted, lineHeight: 19 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 2 },
  navBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: `${Brand.textMuted}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: `${Brand.textMuted}40` },
  dotActive: { backgroundColor: Brand.primary, width: 16 },
});
