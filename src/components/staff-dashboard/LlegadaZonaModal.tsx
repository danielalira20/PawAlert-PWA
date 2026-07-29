import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

interface Ubicacion {
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  ubicacionActual: Ubicacion | null;
  obteniendoGPS: boolean;
  isSubmitting: boolean;
  onCapturarUbicacion: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LlegadaZonaModal({
  visible,
  ubicacionActual,
  obteniendoGPS,
  isSubmitting,
  onCapturarUbicacion,
  onCancel,
  onConfirm,
}: Props) {
  const puedeConfirmar = !!ubicacionActual && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons name="navigate" size={25} color={Brand.secondary} />
          </View>

          <Text style={styles.eyebrow}>PRIMER HITO EN CAMPO</Text>
          <Text style={styles.title}>¿Ya llegaste a la zona?</Text>
          <Text style={styles.description}>
            Validaremos que estés cerca del punto del reporte. La ubicación se
            guarda como evidencia para la asociación coordinadora.
          </Text>

          <View style={styles.privacyCard}>
            <Ionicons name="shield-checkmark-outline" size={19} color={Brand.secondary} />
            <Text style={styles.privacyText}>
              Este registro no se comparte con el reportante ni con otros voluntarios.
            </Text>
          </View>

          <View style={[styles.gpsCard, ubicacionActual && styles.gpsCardReady]}>
            <View style={styles.gpsHeader}>
              <View>
                <Text style={styles.gpsLabel}>Ubicación actual</Text>
                <Text style={styles.gpsStatus}>
                  {ubicacionActual ? 'Lista para validar' : 'Pendiente de capturar'}
                </Text>
              </View>
              <Ionicons
                name={ubicacionActual ? 'checkmark-circle' : 'location-outline'}
                size={25}
                color={ubicacionActual ? Brand.secondary : Brand.textFaint}
              />
            </View>

            {ubicacionActual && (
              <Text style={styles.coordinates}>
                {ubicacionActual.latitude.toFixed(5)}, {ubicacionActual.longitude.toFixed(5)}
              </Text>
            )}

            <TouchableOpacity
              style={styles.captureButton}
              onPress={onCapturarUbicacion}
              disabled={obteniendoGPS || isSubmitting}
            >
              {obteniendoGPS ? (
                <ActivityIndicator size="small" color={Brand.secondary} />
              ) : (
                <Ionicons name="locate-outline" size={18} color={Brand.secondary} />
              )}
              <Text style={styles.captureText}>
                {obteniendoGPS
                  ? 'Obteniendo ubicación...'
                  : ubicacionActual
                    ? 'Actualizar ubicación'
                    : 'Capturar mi ubicación'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !puedeConfirmar && styles.disabled]}
              onPress={onConfirm}
              disabled={!puedeConfirmar}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.confirmText}>Registrar llegada</Text>
                </>
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
    backgroundColor: 'rgba(46,42,38,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 26,
    padding: 22,
    backgroundColor: Brand.cardWarm,
    shadowColor: '#2E2A26',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Brand.secondary}1F`,
    marginBottom: 14,
  },
  eyebrow: {
    color: Brand.secondary,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  title: { color: Brand.textDark, fontWeight: '900', fontSize: 22, marginBottom: 8 },
  description: { color: Brand.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 15 },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: `${Brand.secondary}12`,
    marginBottom: 14,
  },
  privacyText: { color: Brand.textMuted, fontSize: 11, lineHeight: 16, flex: 1 },
  gpsCard: {
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  gpsCardReady: { borderColor: `${Brand.secondary}88` },
  gpsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  gpsLabel: { color: Brand.textDark, fontSize: 13, fontWeight: '800' },
  gpsStatus: { color: Brand.textMuted, fontSize: 11, marginTop: 2 },
  coordinates: {
    color: Brand.secondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  captureButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: `${Brand.secondary}18`,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureText: { color: Brand.secondary, fontSize: 13, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelButton: {
    flex: 0.8,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFE3CD',
  },
  cancelText: { color: Brand.textMuted, fontWeight: '800' },
  confirmButton: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: Brand.secondary,
  },
  disabled: { opacity: 0.45 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 13 },
});
