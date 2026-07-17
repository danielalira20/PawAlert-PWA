import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  titulo: string;
  children: React.ReactNode;
  sinBorde?: boolean;
}

export function SectionBlock({ icon, titulo, children, sinBorde }: Props) {
  return (
    <View style={[styles.container, !sinBorde && styles.withBorder]}>
      <View style={styles.header}>
        <Ionicons name={icon} size={16} color={Brand.primary} />
        <View style={styles.divider} />
        <Text style={styles.titulo}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 18 },
  withBorder: { borderBottomWidth: 1, borderBottomColor: '#E4D3B8' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  divider: { width: 1, height: 12, backgroundColor: '#E4D3B8' },
  titulo: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Brand.textFaint,
    fontWeight: '700',
  },
});