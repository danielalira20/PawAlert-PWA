import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Brand } from '../../constants/theme';
import { ImageLightbox } from '../common/ImageLightbox';

interface Props {
  nombre: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** Paleta de fondo para las iniciales cuando no hay logo. Default: AVATAR_COLORS. */
  colors?: string[];
  /** Si es true y hay logoUrl, tocar el avatar abre el logo en ImageLightbox. */
  zoomable?: boolean;
}

const SIZES = { sm: 40, md: 48, lg: 80 } as const;
const FONT_SIZES = { sm: 14, md: 16, lg: 26 } as const;

// Paleta chica para asignar color de fondo a las iniciales cuando no hay
// logo — determinista por nombre, así la misma asociación siempre saca el
// mismo color entre re-renders (no es aleatorio en cada carga).
const AVATAR_COLORS = [Brand.primary, Brand.secondary, Brand.accent, '#A08070', '#8E6BAE'];

function pickAvatarColor(seed: string, palette: string[]): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

export function AssocAvatar({ nombre, logoUrl, size = 'md', colors = AVATAR_COLORS, zoomable = false }: Props) {
  const dim = SIZES[size];
  const [showLightbox, setShowLightbox] = useState(false);

  if (logoUrl) {
    const img = (
      <Image
        source={{ uri: logoUrl }}
        style={[styles.base, { width: dim, height: dim, borderRadius: dim / 2 }]}
        resizeMode="cover"
      />
    );
    if (!zoomable) return img;
    return (
      <>
        <TouchableOpacity onPress={() => setShowLightbox(true)} activeOpacity={0.85}>
          {img}
        </TouchableOpacity>
        <ImageLightbox
          visible={showLightbox}
          fotos={[logoUrl]}
          onClose={() => setShowLightbox(false)}
        />
      </>
    );
  }

  return (
    <View
      style={[
        styles.base,
        styles.initialsCircle,
        { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: pickAvatarColor(nombre, colors) },
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