import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Brand } from '../../constants/theme';

type Rol = 'admin' | 'staff' | 'asociacion';

interface Props {
  rol: Rol;
  // "onColor" = pastilla blanca con texto de color (para fondos de color,
  // como el banner degradado de móvil).
  // "onWhite" = pastilla de color sólido con texto blanco (para fondos
  // blancos/claros, como la card de escritorio).
  variant?: 'onColor' | 'onWhite';
}

const CONFIG: Record<Rol, { label: string; solid: string; textOnColor: string }> = {
  admin: { label: 'Administrador', solid: Brand.primary, textOnColor: Brand.primary },
  staff: { label: 'Staff', solid: '#D9A62A', textOnColor: '#8A5F00' },
  asociacion: { label: 'Asociación', solid: Brand.secondary, textOnColor: '#1F7A70' },
};

export function RoleBadge({ rol, variant = 'onColor' }: Props) {
  const cfg = CONFIG[rol];

  if (variant === 'onWhite') {
    return (
      <View style={[styles.badge, { backgroundColor: cfg.solid, shadowColor: cfg.solid }]}>
        <Text style={[styles.text, { color: '#fff' }]}>{cfg.label.toUpperCase()}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.badgeOnColor]}>
      <Text style={[styles.text, { color: cfg.textOnColor }]}>{cfg.label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  badgeOnColor: { backgroundColor: 'rgba(255,255,255,0.95)', shadowColor: '#000', shadowOpacity: 0.15 },
  text: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7 },
});