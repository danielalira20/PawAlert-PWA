import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  size?: number;
  rotate?: number;
  color?: string;
  opacity?: number;
}

// Huellita decorativa suelta, para "romper" el vacío del fondo — estática
// (sin animación de flotado, para no complicar con Reanimated algo que es
// puramente decorativo).
export function DecoPaw({
  top,
  bottom,
  left,
  right,
  size = 120,
  rotate = 0,
  color = '#D9B48A',
  opacity = 0.3,
}: Props) {
  return (
    <Ionicons
      name="paw"
      size={size}
      color={color}
      style={{
        position: 'absolute',
        top,
        bottom,
        left,
        right,
        opacity,
        transform: [{ rotate: `${rotate}deg` }],
      }}
    />
  );
}