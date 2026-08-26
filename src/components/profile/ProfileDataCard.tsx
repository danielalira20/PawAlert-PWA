import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
  nombre?: string | null;
  apellidos?: string | null;
  // "bare" = sin su propia card blanca
  bare?: boolean;
  onEditPress?: () => void;
}

export function ProfileDataCard({ nombre, apellidos, bare, onEditPress }: Props) {
  const rows: Row[] = [
    {
      icon: 'person-outline',
      label: 'Nombre(s)',
      value: nombre?.trim() || 'No especificado',
      iconColor: Brand.primary,
      bgColor: `${Brand.primary}22`,
    },
    {
      icon: 'people-outline',
      label: 'Apellidos',
      value: apellidos?.trim() || 'No especificado',
      iconColor: Brand.secondary,
      bgColor: `${Brand.secondary}22`,
    },
  ];

  const content = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Text style={[styles.title, { marginBottom: 0 }]}>Datos del perfil</Text>
        {onEditPress && (
          <TouchableOpacity onPress={onEditPress}>
            <Text style={{ color: Brand.primary, fontSize: 12, fontWeight: '700' }}>Editar</Text>
          </TouchableOpacity>
        )}
      </View>
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