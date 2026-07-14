import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Brand } from '../../constants/theme';

type Rol = 'admin' | 'staff' | 'asociacion' | 'voluntario_interno' | 'voluntario_externo';

interface Props {
  rol: Rol;
  variant?: 'onColor' | 'onWhite';
  // Permite reposicionar/ajustar el badge desde donde se usa (ej. flotando
  // encima del avatar en vez de su posición por defecto debajo del nombre).
  style?: StyleProp<ViewStyle>;
}

const CONFIG: Record<Rol, { label: string; solid: string; textOnColor: string }> = {
  admin: { label: 'Administrador', solid: Brand.primary, textOnColor: Brand.primary },
  staff: { label: 'Staff', solid: '#D9A62A', textOnColor: '#8A5F00' },
  asociacion: { label: 'Asociación', solid: Brand.secondary, textOnColor: '#1F7A70' },
  // Mismo verde-azulado que asociación (ambos "operan en campo/con la
  // asociación"), pero con label propio para distinguir el rol real.
  voluntario_interno: { label: 'Voluntario', solid: Brand.accent, textOnColor: '#1F7A70' },
  // Tono cálido distinto (comparte paleta con "otro"/casa hogar) para
  // diferenciarlo visualmente del interno sin inventar un color nuevo.
  voluntario_externo: { label: 'Voluntario externo', solid: '#B0966E', textOnColor: '#7A6449' },
};

export function RoleBadge({ rol, variant = 'onColor', style }: Props) {
  const cfg = CONFIG[rol];

  if (variant === 'onWhite') {
    return (
      <View style={[styles.badge, { backgroundColor: cfg.solid, shadowColor: cfg.solid }, style]}>
        <Text style={[styles.text, { color: '#fff' }]}>{cfg.label.toUpperCase()}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.badgeOnColor, style]}>
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