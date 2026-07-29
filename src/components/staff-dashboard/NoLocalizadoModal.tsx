import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';

const SEARCH_COLOR = '#9A6700';
const SEARCH_BUTTON = '#B7791F';

interface Ubicacion {
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  minutos: string;
  notas: string;
  ubicacionActual: Ubicacion | null;
  obteniendoGPS: boolean;
  isSubmitting: boolean;
  onChangeMinutos: (valor: string) => void;
  onChangeNotas: (valor: string) => void;
  onCapturarUbicacion: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function NoLocalizadoModal({
  visible,
  minutos,
  notas,
  ubicacionActual,
  obteniendoGPS,
  isSubmitting,
  onChangeMinutos,
  onChangeNotas,
  onCapturarUbicacion,
  onCancel,
  onConfirm,
}: Props) {
  const minutosValidos = Number.parseInt(minutos, 10) > 0;
  const puedeConfirmar =
    minutosValidos && !!notas.trim() && !!ubicacionActual && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>RESULTADO DE BÚSQUEDA</Text>
              <Text style={styles.title}>No localicé al animal</Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Ionicons name="close" size={23} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={20} color={SEARCH_COLOR} />
              <Text style={styles.noticeText}>
                El caso seguirá asignado. La asociación revisará esta evidencia y coordinará
                el siguiente paso.
              </Text>
            </View>

            <Text style={styles.label}>Tiempo de búsqueda</Text>
            <View style={styles.minutesRow}>
              <TextInput
                style={styles.minutesInput}
                value={minutos}
                onChangeText={(valor) => onChangeMinutos(valor.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="30"
                placeholderTextColor={Brand.textFaint}
                maxLength={4}
              />
              <Text style={styles.minutesSuffix}>minutos</Text>
            </View>

            <Text style={styles.label}>¿Dónde y cómo buscaste?</Text>
            <TextInput
              style={styles.textArea}
              value={notas}
              onChangeText={onChangeNotas}
              multiline
              maxLength={500}
              placeholder="Ej. Recorrí dos calles, revisé debajo de autos y pregunté a vecinos..."
              placeholderTextColor={Brand.textFaint}
            />
            <Text style={styles.counter}>{notas.length}/500</Text>

            <View style={styles.gpsCard}>
              <View style={styles.gpsCopy}>
                <Ionicons
                  name={ubicacionActual ? 'checkmark-circle' : 'location-outline'}
                  size={22}
                  color={ubicacionActual ? Brand.secondary : Brand.textFaint}
                />
                <View style={styles.gpsTextWrap}>
                  <Text style={styles.gpsTitle}>
                    {ubicacionActual ? 'Ubicación capturada' : 'Ubicación al finalizar'}
                  </Text>
                  <Text style={styles.gpsHint}>
                    {ubicacionActual
                      ? `${ubicacionActual.latitude.toFixed(5)}, ${ubicacionActual.longitude.toFixed(5)}`
                      : 'Obligatoria para respaldar la búsqueda'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.gpsButton}
                onPress={onCapturarUbicacion}
                disabled={obteniendoGPS || isSubmitting}
              >
                {obteniendoGPS ? (
                  <ActivityIndicator size="small" color={Brand.secondary} />
                ) : (
                  <Ionicons name="locate-outline" size={17} color={Brand.secondary} />
                )}
                <Text style={styles.gpsButtonText}>
                  {ubicacionActual ? 'Actualizar GPS' : 'Capturar GPS'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Volver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !puedeConfirmar && styles.disabled]}
              onPress={onConfirm}
              disabled={!puedeConfirmar}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Enviar actualización</Text>
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
    maxWidth: 440,
    maxHeight: '92%',
    borderRadius: 26,
    padding: 21,
    backgroundColor: Brand.cardWarm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: SEARCH_COLOR,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  title: { color: Brand.textDark, fontWeight: '900', fontSize: 21 },
  notice: {
    flexDirection: 'row',
    gap: 9,
    borderRadius: 14,
    padding: 12,
    backgroundColor: `${Brand.accent}1F`,
    marginBottom: 17,
  },
  noticeText: { flex: 1, color: Brand.textMuted, fontSize: 11, lineHeight: 17 },
  label: { color: Brand.textDark, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  minutesInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 13,
    color: Brand.textDark,
    fontWeight: '800',
    fontSize: 15,
  },
  minutesSuffix: {
    color: Brand.textMuted,
    paddingHorizontal: 13,
    fontSize: 12,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 96,
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    padding: 12,
    color: Brand.textDark,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },
  counter: {
    color: Brand.textFaint,
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 14,
  },
  gpsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${Brand.secondary}55`,
    backgroundColor: `${Brand.secondary}10`,
    padding: 12,
  },
  gpsCopy: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  gpsTextWrap: { flex: 1 },
  gpsTitle: { color: Brand.textDark, fontSize: 12, fontWeight: '800' },
  gpsHint: { color: Brand.textMuted, fontSize: 10, marginTop: 2 },
  gpsButton: {
    minHeight: 42,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  gpsButtonText: { color: Brand.secondary, fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 17 },
  cancelButton: {
    flex: 0.8,
    minHeight: 47,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFE3CD',
  },
  cancelText: { color: Brand.textMuted, fontWeight: '800' },
  confirmButton: {
    flex: 1.45,
    minHeight: 47,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SEARCH_BUTTON,
  },
  disabled: { opacity: 0.45 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
