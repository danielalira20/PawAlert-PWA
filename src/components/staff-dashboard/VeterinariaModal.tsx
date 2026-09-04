import React from 'react';
import {
  ActivityIndicator,
  Image,
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

interface Ubicacion {
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  notas: string;
  onChangeNotas: (valor: string) => void;
  ubicacionActual: Ubicacion | null;
  obteniendoGPS: boolean;
  onCapturarUbicacion: () => void;
  foto: string | null;
  onCapturarFoto: () => void;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Checkpoint de tránsito, no una evaluación de condición (decisión A) — sin
// select de estado, solo notas opcionales + GPS y foto obligatorios.
export function VeterinariaModal({
  visible,
  notas,
  onChangeNotas,
  ubicacionActual,
  obteniendoGPS,
  onCapturarUbicacion,
  foto,
  onCapturarFoto,
  isSubmitting,
  onCancel,
  onConfirm,
}: Props) {
  const puedeConfirmar = !!ubicacionActual && !!foto && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Registrar llegada a la veterinaria</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Ionicons name="close" size={22} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Notas adicionales (opcional)"
              placeholderTextColor={Brand.textFaint}
          value={notas}
          maxLength={500}
              onChangeText={onChangeNotas}
            />

            {/* Ubicación GPS — obligatoria */}
            <View style={[styles.section, styles.sectionGps]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location-outline" size={18} color={Brand.secondary} />
                <Text style={[styles.sectionTitle, { color: Brand.secondary }]}>Ubicación GPS</Text>
              </View>

              {ubicacionActual ? (
                <View style={styles.sectionResult}>
                  <Text style={styles.sectionResultOk}>✓ Ubicación capturada</Text>
                  <Text style={styles.sectionResultDetail}>
                    Lat: {ubicacionActual.latitude.toFixed(4)}
                  </Text>
                  <Text style={styles.sectionResultDetail}>
                    Lon: {ubicacionActual.longitude.toFixed(4)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.sectionHint}>
                  Se capturará automáticamente cuando presiones el botón
                </Text>
              )}

              <TouchableOpacity
                onPress={onCapturarUbicacion}
                disabled={obteniendoGPS}
                style={[styles.sectionButton, { backgroundColor: Brand.secondary }]}
              >
                {obteniendoGPS ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.sectionButtonText}>Obteniendo ubicación...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="navigate-circle-outline" size={16} color="#fff" />
                    <Text style={styles.sectionButtonText}>Capturar mi ubicación GPS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Foto — obligatoria */}
            <View style={[styles.section, styles.sectionFoto]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="camera-outline" size={18} color={Brand.primary} />
                <Text style={[styles.sectionTitle, { color: Brand.primary }]}>Foto (obligatoria)</Text>
              </View>

              {foto ? (
                <View style={{ marginBottom: 10 }}>
                  <Image source={{ uri: foto }} style={styles.fotoPreview} resizeMode="cover" />
                  <Text style={styles.sectionResultOk}>✓ Foto capturada</Text>
                </View>
              ) : (
                <Text style={styles.sectionHint}>La foto se capturará con la cámara del dispositivo</Text>
              )}

              <TouchableOpacity
                onPress={onCapturarFoto}
                style={[styles.sectionButton, { backgroundColor: Brand.primary }]}
              >
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={styles.sectionButtonText}>{foto ? 'Cambiar foto' : 'Abrir cámara'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                { backgroundColor: Brand.secondary },
                !puedeConfirmar && styles.confirmButtonDisabled,
              ]}
              onPress={onConfirm}
              disabled={!puedeConfirmar}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>
                  {!ubicacionActual || !foto ? 'Faltan datos' : 'Registrar llegada'}
                </Text>
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
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: Brand.textDark, flexShrink: 1 },
  scroll: { maxHeight: 440 },
  textArea: {
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
    minHeight: 64,
    color: Brand.textDark,
    backgroundColor: '#FFFFFF',
  },
  section: { borderRadius: 14, padding: 12, marginBottom: 12 },
  sectionGps: { backgroundColor: `${Brand.secondary}1A`, borderWidth: 1, borderColor: `${Brand.secondary}55` },
  sectionFoto: { backgroundColor: `${Brand.primary}14`, borderWidth: 1, borderColor: `${Brand.primary}55` },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  sectionResult: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, marginBottom: 10 },
  sectionResultOk: { fontSize: 11, color: '#2E8B57', fontWeight: '700', marginBottom: 2 },
  sectionResultDetail: { fontSize: 10, color: Brand.textMuted },
  sectionHint: { fontSize: 11, color: Brand.textMuted, marginBottom: 10 },
  sectionButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  sectionButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  fotoPreview: { width: '100%', height: 120, borderRadius: 8, marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
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
  },
  confirmButtonDisabled: { opacity: 0.6 },
  confirmText: { color: '#fff', fontWeight: '800' },
});
