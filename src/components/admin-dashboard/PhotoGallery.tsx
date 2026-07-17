import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import type { AsociacionFoto } from '../../types/asociacionAdmin';
import { ImageLightbox } from '../common/ImageLightbox';

interface Props {
  fotos: AsociacionFoto[];
  columnas?: number; // el padre decide (2 en móvil, 3 en web, por ejemplo)
}

export function PhotoGallery({ fotos, columnas = 2 }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!fotos || fotos.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="image-outline" size={28} color="#C8B898" />
        <Text style={styles.emptyText}>Esta asociación no adjuntó fotos del refugio</Text>
      </View>
    );
  }

  const ordenadas = [...fotos].sort((a, b) => a.orden - b.orden);
  const anchoItem = `${100 / columnas - 3}%`;
  const urls = ordenadas.map((f) => f.foto_url);

  return (
    <>
      <View style={styles.grid}>
        {ordenadas.map((foto, i) => (
          <TouchableOpacity
            key={foto.id}
            style={[styles.item, { width: anchoItem as any }]}
            onPress={() => setLightboxIndex(i)}
            activeOpacity={0.85}
          >
            <Image source={{ uri: foto.foto_url }} style={styles.image} resizeMode="cover" />
            {!!foto.descripcion && (
              <Text style={styles.caption} numberOfLines={2}>
                {foto.descripcion}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ImageLightbox
        visible={lightboxIndex !== null}
        fotos={urls}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { marginBottom: 4 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: '#E2D0B8' },
  caption: { fontSize: 11, color: Brand.textMuted, marginTop: 4 },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D4C0A0',
    backgroundColor: '#EDE0CC',
    gap: 8,
  },
  emptyText: { fontSize: 13, color: Brand.textFaint, textAlign: 'center', paddingHorizontal: 20 },
});