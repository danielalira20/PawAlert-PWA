import React, { useEffect, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Props {
  visible: boolean;
  fotos: string[];
  initialIndex?: number;
  onClose: () => void;
}

// Overlay negro + blanco a propósito: es chrome neutro de visor de fotos,
// no parte del sistema Brand (misma convención que ya usaban las dos
// implementaciones inline que este componente reemplaza).
export function ImageLightbox({ visible, fotos, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  if (!visible || fotos.length === 0) return null;
  const hayVarias = fotos.length > 1;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>

        {hayVarias && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>{index + 1} / {fotos.length}</Text>
          </View>
        )}

        <Image source={{ uri: fotos[index] }} style={styles.image} resizeMode="contain" />

        {hayVarias && (
          <View style={styles.navRow}>
            <TouchableOpacity
              onPress={() => setIndex((i) => (i === 0 ? fotos.length - 1 : i - 1))}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setIndex((i) => (i === fotos.length - 1 ? 0 : i + 1))}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-forward" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {hayVarias && (
          <View style={styles.thumbsRow}>
            {fotos.map((f, i) => (
              <TouchableOpacity key={i} onPress={() => setIndex(i)}>
                <Image
                  source={{ uri: f }}
                  style={[styles.thumb, i === index && styles.thumbActive]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  image: { width: '90%', height: '70%' },
  navRow: {
    position: 'absolute',
    top: '50%',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbsRow: {
    position: 'absolute',
    bottom: 24,
    flexDirection: 'row',
    gap: 8,
  },
  thumb: { width: 44, height: 44, borderRadius: 8, opacity: 0.5 },
  thumbActive: { opacity: 1, borderWidth: 2, borderColor: Brand.primary },
});
