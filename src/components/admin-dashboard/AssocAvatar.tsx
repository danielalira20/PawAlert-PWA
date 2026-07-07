import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Brand } from '../../constants/theme';

interface Props {
  nombre: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 40, md: 48, lg: 80 } as const;
const FONT_SIZES = { sm: 14, md: 16, lg: 26 } as const;

// Paleta chica para asignar color de fondo a las iniciales cuando no hay
// logo — determinista por nombre, así la misma asociación siempre saca el
// mismo color entre re-renders (no es aleatorio en cada carga).
const AVATAR_COLORS = [Brand.primary, Brand.secondary, Brand.accent, '#A08070', '#8E6BAE'];

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

export function AssocAvatar({ nombre, logoUrl, size = 'md' }: Props) {
  const dim = SIZES[size];

  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={[styles.base, { width: dim, height: dim, borderRadius: dim / 2 }]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.base,
        styles.initialsCircle,
        { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: pickAvatarColor(nombre) },
      ]}
    >
      <Text style={[styles.initialsText, { fontSize: FONT_SIZES[size] }]}>{iniciales(nombre)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  initialsCircle: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#fff', fontWeight: '800' },
});