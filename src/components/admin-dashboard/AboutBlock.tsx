import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

export function AboutBlock({ acercaDe }: { acercaDe: string | null }) {
  if (!acercaDe || !acercaDe.trim()) {
    return (
      <View style={styles.emptyRow}>
        <Ionicons name="alert-circle-outline" size={16} color="#C8B898" />
        <Text style={styles.emptyText}>Esta asociación no proporcionó una descripción.</Text>
      </View>
    );
  }
  return <Text style={styles.text}>{acercaDe}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 14, color: Brand.textDark, lineHeight: 21 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13, color: Brand.textFaint },
});