import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Brand } from '../../constants/theme';

interface Props {
  numero: string;
  titulo: string;
  children: React.ReactNode;
  sinBorde?: boolean;
}

export function SectionBlock({ numero, titulo, children, sinBorde }: Props) {
  return (
    <View style={[styles.container, !sinBorde && styles.withBorder]}>
      <View style={styles.header}>
        <Text style={styles.numero}>{numero}</Text>
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
  numero: { fontSize: 11, fontWeight: '800', color: Brand.primary },
  divider: { width: 1, height: 12, backgroundColor: '#E4D3B8' },
  titulo: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Brand.textFaint,
    fontWeight: '700',
  },
});