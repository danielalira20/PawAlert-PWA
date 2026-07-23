import React from 'react';
import { View, Image } from 'react-native';
import { ICON_CAT, ICON_DOG, ICON_PAW, ICON_MULTIPLE } from '../../constants/mapIcons';
import { getCondicionPreview } from './condicionEstadoColors';

interface Props {
  tipoAnimal: string | null | undefined;
  condicion: string | null | undefined;
  size?: number;
  // Si true, solo regresa el ícono (sin su propio círculo de fondo) — útil
  // cuando el contenedor padre ya trae su propio color de fondo, para no
  // duplicar el círculo de color.
  bare?: boolean;
  count?: number;
}

// Mismo componente/lógica que ya usa MisReportesScreen.tsx — ícono real de
// perro/gato (o huella si no aplica ninguno), coloreado según la condición.
export function AnimalIcon({ tipoAnimal, condicion, size = 34, bare = false, count = 1 }: Props) {
  const cfg = getCondicionPreview(condicion);
  const tipo = tipoAnimal?.toLowerCase();
  const iconUri = count > 1 ? ICON_MULTIPLE : (tipo === 'perro' ? ICON_DOG : tipo === 'gato' ? ICON_CAT : ICON_PAW);
  const iconSize = size * 0.7;

  const image = (
    <Image
      source={{ uri: iconUri }}
      style={{ width: iconSize, height: iconSize, tintColor: cfg.color }}
      resizeMode="contain"
    />
  );

  if (bare) return image;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: cfg.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {image}
    </View>
  );
}