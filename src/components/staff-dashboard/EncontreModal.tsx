import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Props {
  visible: boolean;
  opciones: string[];
  estado: string;
  onSelectEstado: (opcion: string) => void;
  notas: string;
  onChangeNotas: (valor: string) => void;
  tieneFoto: boolean;
  onPickFoto: () => void;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EncontreModal({
  visible,
  opciones,
  estado,
  onSelectEstado,
  notas,
  onChangeNotas,
  tieneFoto,
  onPickFoto,
  isSubmitting,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>¿Cómo está el animal?</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Ionicons name="close" size={22} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.opcionesScroll}>
            {opciones.map((opcion) => {
              const seleccionada = estado === opcion;
              return (
                <TouchableOpacity
                  key={opcion}
                  onPress={() => onSelectEstado(opcion)}
                  style={[styles.opcion, seleccionada && styles.opcionSeleccionada]}
                >
                  <Text style={[styles.opcionText, seleccionada && styles.opcionTextSeleccionada]}>
                    {opcion}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Notas adicionales (opcional)"
            placeholderTextColor={Brand.textFaint}
            value={notas}
            onChangeText={onChangeNotas}
          />

          <TouchableOpacity onPress={onPickFoto} style={styles.fotoButton}>
            <Ionicons name="image-outline" size={16} color={Brand.textDark} />
            <Text style={styles.fotoButtonText}>
              {tieneFoto ? 'Foto adjuntada ✓' : 'Subir foto (opcional)'}
            </Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, isSubmitting && styles.confirmButtonDisabled]}
              onPress={onConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Confirmar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46,42,38,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 22,
    padding: 20,
    width: '100%',
    maxWidth: 420,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: Brand.textDark },
  opcionesScroll: { maxHeight: 260, marginBottom: 12 },
  opcion: {
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  opcionSeleccionada: {
    borderColor: Brand.primary,
    backgroundColor: `${Brand.primary}1A`,
  },
  opcionText: { fontSize: 13, color: Brand.textDark, fontWeight: '600' },
  opcionTextSeleccionada: { color: Brand.primary, fontWeight: '800' },
  textArea: {
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    marginBottom: 12,
    minHeight: 64,
    color: Brand.textDark,
    backgroundColor: '#FFFFFF',
  },
  fotoButton: {
    padding: 12,
    backgroundColor: '#EFE3CD',
    borderRadius: 14,
    marginBottom: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  fotoButtonText: { color: Brand.textDark, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#EFE3CD',
  },
  cancelText: { color: Brand.textMuted, fontWeight: '800' },
  confirmButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: Brand.primary,
  },
  confirmButtonDisabled: { opacity: 0.7 },
  confirmText: { color: '#fff', fontWeight: '800' },
});