import React from 'react';
import { Modal, Pressable, View, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
  // Cuando es false, no se puede cerrar tocando el fondo, con Esc/botón
  // atrás, ni con la X — solo se cierra llamando a onClose desde dentro
  // (ej. al terminar de guardar un formulario). Úsalo cuando cerrar a
  // medias dejaría un cambio a medio aplicar (como una postulación que ya
  // se mandó al backend pero cuyo formulario de seguimiento aún no se
  // guardó).
  dismissable?: boolean;
}

// Modal genérico con fondo difuminado (no solo oscurecido), que deja ver la
// pantalla de atrás, con margen responsivo (más grande en web/desktop que en
// móvil) y que se cierra al tocar fuera del contenido — sin cerrar por
// accidente al tocar adentro, gracias al Pressable "absorbente" del contenido.
export function AppModal({ visible, onClose, children, maxWidth = 900, dismissable = true }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismissable ? onClose : () => {}}
    >
      {/* Fondo: toca aquí para cerrar (si es dismissable) */}
      <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>

      {/* Contenedor centrado — pointerEvents="box-none" deja pasar el toque
          hacia el fondo en las zonas vacías (el margen), pero no donde está
          el contenido real */}
      <View
        pointerEvents="box-none"
        style={[
          styles.centerWrap,
          {
            paddingHorizontal: isDesktop ? 48 : 16,
            paddingTop: isDesktop ? 48 : 60,
            paddingBottom: isDesktop ? 48 : 40,
          },
        ]}
      >
        <Pressable onPress={() => {}} style={[styles.contentBox, { maxWidth, width: '100%' }]}>
          {children}

          {dismissable && (
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBox: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(46,42,38,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});