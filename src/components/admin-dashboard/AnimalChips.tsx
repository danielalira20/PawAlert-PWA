import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Brand } from '../../constants/theme';

const CATALOGO: Record<string, { label: string; emoji: string }> = {
  perro: { label: 'Perro', emoji: '🐕' },
  gato: { label: 'Gato', emoji: '🐈' },
  ave: { label: 'Ave', emoji: '🐦' },
  otro: { label: 'Otro', emoji: '🐾' },
};

// Cuando la asociación eligió "Otro" en el formulario, el backend guarda la
// especie libre tal cual la escribieron (ej. "tlacuache") — no está en el
// catálogo fijo, así que la mostramos capitalizada con un ícono genérico.
function resolverTipo(clave: string) {
  const normalizado = clave.toLowerCase().trim();
  if (CATALOGO[normalizado]) return CATALOGO[normalizado];
  return { label: clave.charAt(0).toUpperCase() + clave.slice(1), emoji: '🐾' };
}

export function AnimalChips({ tipos }: { tipos: string[] }) {
  if (!tipos || tipos.length === 0) {
    return <Text style={styles.empty}>No especificaron qué tipo de animales rescatan</Text>;
  }

  return (
    <View style={styles.row}>
      {tipos.map((t) => {
        const { label, emoji } = resolverTipo(t);
        return (
          <View key={t} style={styles.chip}>
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={styles.label}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDE0CC',
    borderWidth: 1,
    borderColor: '#D4C0A0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  emoji: { fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: Brand.textDark },
  empty: { fontSize: 13, color: Brand.textFaint },
});