import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  iconColor: string;
  bgColor: string;
}

interface Props {
  telefono?: string | null;
  email?: string | null;
  // "bare" = sin su propia card blanca (para cuando ya vive dentro de una
  // card unificada más grande, como en el layout de escritorio nuevo).
  bare?: boolean;
}

export function AccountDataCard({ telefono, email, bare }: Props) {
  const rows: Row[] = [
    {
      icon: 'call-outline',
      label: 'Teléfono',
      value: telefono?.trim() || 'No especificado',
      iconColor: Brand.secondary,
      bgColor: `${Brand.secondary}22`,
    },
    {
      icon: 'mail-outline',
      label: 'Correo electrónico',
      value: email?.trim() || 'No especificado',
      iconColor: '#8A5F00',
      bgColor: '#F5E0A8',
    },
  ];

  const content = (
    <>
      <Text style={styles.title}>Datos de cuenta</Text>
      {rows.map((row, i) => (
        <View key={row.label} style={[styles.row, i > 0 && styles.rowDivider]}>
          <View style={[styles.iconCircle, { backgroundColor: row.bgColor }]}>
            <Ionicons name={row.icon} size={16} color={row.iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
        </View>
      ))}
    </>
  );

  if (bare) return <View style={{ width: '100%' }}>{content}</View>;

  return <View style={styles.card}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#F0E6D6' },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, color: Brand.textFaint, fontWeight: '600' },
  value: { fontSize: 14, color: Brand.textDark, fontWeight: '600', marginTop: 1 },
});