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
  opciones: string[];
  estado: string;
  onSelectEstado: (opcion: string) => void;
  notas: string;
  onChangeNotas: (valor: string) => void;
  ubicacionActual: Ubicacion | null;
  obteniendoGPS: boolean;
  onCapturarUbicacion: () => void;
  foto: string | null;
  onCapturarFoto: () => void;
  fotoEntorno?: string | null;
  onCapturarFotoEntorno?: () => void;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  esHogarTemporal?: boolean;
  fechaLimite?: string;
  onChangeFechaLimite?: (valor: string) => void;
}

// Morado intencionalmente distinto a la paleta cálida principal — marca
// visualmente que "cerrar caso" es una acción terminal, distinta de las
// acciones de progreso (naranja) o positivas (verde-azulado).
const CLOSE_COLOR = '#8E44AD';

export function RefugioModal({
  visible,
  opciones,
  estado,
  onSelectEstado,
  notas,
  onChangeNotas,
  ubicacionActual,
  obteniendoGPS,
  onCapturarUbicacion,
  foto,
  onCapturarFoto,
  fotoEntorno = null,
  onCapturarFotoEntorno,
  isSubmitting,
  onCancel,
  onConfirm,
  esHogarTemporal = false,
  fechaLimite = '',
  onChangeFechaLimite,
}: Props) {
  const puedeConfirmar =
    !!ubicacionActual &&
    !!foto &&
    (!esHogarTemporal || !!fotoEntorno) &&
    (!esHogarTemporal || /^\d{4}-\d{2}-\d{2}$/.test(fechaLimite)) &&
    !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {esHogarTemporal ? 'Llegada a tu hogar temporal' : '¿Cómo concluyó el rescate?'}
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Ionicons name="close" size={22} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
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

            <TextInput
              style={styles.textArea}
              multiline
              placeholder={esHogarTemporal ? 'Condición y observaciones al llegar' : 'Notas del cierre (opcional)'}
              placeholderTextColor={Brand.textFaint}
              value={notas}
              maxLength={500}
              onChangeText={onChangeNotas}
            />

            {esHogarTemporal && (
              <View style={[styles.section, styles.sectionFecha]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="calendar-outline" size={18} color={Brand.secondary} />
                  <Text style={[styles.sectionTitle, { color: Brand.secondary }]}>Fecha límite de custodia</Text>
                </View>
                <Text style={styles.sectionHint}>
                  Confirma o ajusta la fecha que propusiste al tomar al animal bajo resguardo.
                </Text>
                <TextInput
                  value={fechaLimite}
                  onChangeText={onChangeFechaLimite}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={Brand.textFaint}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={styles.fechaInput}
                />
              </View>
            )}

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

            {esHogarTemporal && (
              <View style={[styles.section, styles.sectionEntorno]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="home-outline" size={18} color={Brand.secondary} />
                  <Text style={[styles.sectionTitle, { color: Brand.secondary }]}>
                    Foto del entorno (obligatoria)
                  </Text>
                </View>
                {fotoEntorno ? (
                  <View style={{ marginBottom: 10 }}>
                    <Image source={{ uri: fotoEntorno }} style={styles.fotoPreview} resizeMode="cover" />
                    <Text style={styles.sectionResultOk}>✓ Entorno capturado</Text>
                  </View>
                ) : (
                  <Text style={styles.sectionHint}>
                    Muestra el espacio donde permanecerá el animal
                  </Text>
                )}
                <TouchableOpacity
                  onPress={onCapturarFotoEntorno}
                  style={[styles.sectionButton, { backgroundColor: Brand.secondary }]}
                >
                  <Ionicons name="camera-outline" size={16} color="#fff" />
                  <Text style={styles.sectionButtonText}>
                    {fotoEntorno ? 'Cambiar foto del entorno' : 'Fotografiar entorno'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                { backgroundColor: CLOSE_COLOR },
                !puedeConfirmar && styles.confirmButtonDisabled,
              ]}
              onPress={onConfirm}
              disabled={!puedeConfirmar}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>
                  {!ubicacionActual || !foto || (esHogarTemporal && (!fotoEntorno || !fechaLimite))
                    ? 'Faltan datos'
                    : esHogarTemporal
                      ? 'Iniciar custodia'
                      : 'Completar rescate'}
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
  opcion: {
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  opcionSeleccionada: {
    borderColor: '#8E44AD',
    backgroundColor: '#8E44AD1A',
  },
  opcionText: { fontSize: 13, color: Brand.textDark, fontWeight: '600' },
  opcionTextSeleccionada: { color: '#8E44AD', fontWeight: '800' },
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
  sectionEntorno: { backgroundColor: `${Brand.secondary}14`, borderWidth: 1, borderColor: `${Brand.secondary}55` },
  sectionFecha: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4D3B8' },
  fechaInput: {
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 11,
    padding: 11,
    color: Brand.textDark,
    backgroundColor: Brand.cardWarm,
    fontSize: 13,
  },
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
