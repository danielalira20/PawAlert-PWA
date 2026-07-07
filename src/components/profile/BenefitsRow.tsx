import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Beneficio {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string; // usado para el tinte de fondo del círculo (por defecto)
  iconColor?: string; // oscurece solo el ícono si el color base no da contraste
  bgColor?: string; // fija el fondo del círculo a un color exacto, en vez del tinte automático
}

const BENEFICIOS: Beneficio[] = [
  { icon: 'location-outline', label: 'Reporta\nanimales', color: Brand.primary },
  { icon: 'notifications-outline', label: 'Alertas\ncerca', color: Brand.secondary },
  {
    icon: 'shield-checkmark-outline',
    label: 'Historial\nseguro',
    color: Brand.accent,
    iconColor: '#8A5F00',
    bgColor: '#e4d4a6', // dorado un poco más presente que el tinte automático
  },
];

// Mismo tamaño de círculo para los 3 (a propósito, ya que en el mockup de
// Figma salieron ligeramente distintos entre sí sin querer).
const CIRCLE_SIZE = 60;

export function BenefitsRow() {
  return (
    <View>
      <Text style={styles.eyebrow}>¿Por qué crear cuenta?</Text>
      <View style={styles.row}>
        {BENEFICIOS.map((b) => (
          <View key={b.label} style={styles.item}>
            <View style={[styles.iconCircle, { backgroundColor: b.bgColor ?? `${b.color}22` }]}>
              <Ionicons name={b.icon} size={20} color={b.iconColor ?? b.color} />
            </View>
            <Text style={styles.label}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 36 },
  item: { alignItems: 'center', width: 92 },
  iconCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: { fontSize: 12, fontWeight: '700', color: Brand.textDark, textAlign: 'center', lineHeight: 16 },
});