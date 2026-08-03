import React from 'react';
import {
  ActivityIndicator,
  Image,
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

interface Props {
  visible: boolean;
  condicion: string;
  destino: string;
  fechaLimite: string;
  notas: string;
  foto: string | null;
  ubicacionLista: boolean;
  obteniendoGPS: boolean;
  isSubmitting: boolean;
  onChangeCondicion: (valor: string) => void;
  onChangeDestino: (valor: string) => void;
  onChangeFechaLimite: (valor: string) => void;
  onChangeNotas: (valor: string) => void;
  onCapturarFoto: () => void;
  onCapturarUbicacion: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const CONDICIONES = ['Estable', 'Requiere vigilancia', 'En tratamiento'];

export function ResguardoModal({
  visible,
  condicion,
  destino,
  fechaLimite,
  notas,
  foto,
  ubicacionLista,
  obteniendoGPS,
  isSubmitting,
  onChangeCondicion,
  onChangeDestino,
  onChangeFechaLimite,
  onChangeNotas,
  onCapturarFoto,
  onCapturarUbicacion,
  onCancel,
  onConfirm,
}: Props) {
  const puedeConfirmar =
    !!condicion && !!destino && /^\d{4}-\d{2}-\d{2}$/.test(fechaLimite) && !!foto && ubicacionLista && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <View style={styles.iconWrap}>
                <Ionicons name="shield-checkmark" size={20} color={Brand.secondary} />
              </View>
              <View>
                <Text style={styles.eyebrow}>CUSTODIA SEGURA</Text>
                <Text style={styles.title}>Animal bajo resguardo</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Ionicons name="close" size={22} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.helper}>
              Registra este paso cuando el animal ya esté contigo y fuera de peligro inmediato.
            </Text>

            <Text style={styles.label}>Condición actual</Text>
            <View style={styles.optionRow}>
              {CONDICIONES.map((opcion) => (
                <TouchableOpacity
                  key={opcion}
                  onPress={() => onChangeCondicion(opcion)}
                  style={[styles.option, condicion === opcion && styles.optionActive]}
                >
                  <Text style={[styles.optionText, condicion === opcion && styles.optionTextActive]}>
                    {opcion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Ruta hacia tu hogar temporal</Text>
            <Text style={styles.fieldHint}>
              Como voluntario externo, el destino final siempre es tu hogar verificado.
            </Text>
            {[
              {
                value: 'directo_hogar',
                icon: 'home-outline' as const,
                title: 'Directo a mi hogar temporal',
                subtitle: 'El animal no requiere una parada veterinaria previa.',
              },
              {
                value: 'veterinaria_y_hogar',
                icon: 'medkit-outline' as const,
                title: 'Veterinaria y después mi hogar',
                subtitle: 'Primero registrarás la llegada a la veterinaria.',
              },
            ].map((ruta) => (
              <TouchableOpacity
                key={ruta.value}
                onPress={() => onChangeDestino(ruta.value)}
                style={[styles.routeCard, destino === ruta.value && styles.routeCardActive]}
              >
                <Ionicons
                  name={ruta.icon}
                  size={20}
                  color={destino === ruta.value ? Brand.secondary : Brand.textMuted}
                />
                <View style={styles.routeCopy}>
                  <Text style={[styles.routeTitle, destino === ruta.value && styles.routeTitleActive]}>
                    {ruta.title}
                  </Text>
                  <Text style={styles.routeSubtitle}>{ruta.subtitle}</Text>
                </View>
                <Ionicons
                  name={destino === ruta.value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={destino === ruta.value ? Brand.secondary : Brand.textFaint}
                />
              </TouchableOpacity>
            ))}

            <Text style={styles.label}>¿Hasta qué fecha puedes cuidarlo?</Text>
            <TextInput
              value={fechaLimite}
              onChangeText={onChangeFechaLimite}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={Brand.textFaint}
              style={styles.input}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.label}>Observaciones</Text>
            <TextInput
              value={notas}
              onChangeText={onChangeNotas}
              placeholder="Cuidados, comportamiento o indicaciones relevantes"
              placeholderTextColor={Brand.textFaint}
              style={[styles.input, styles.textArea]}
              multiline
              maxLength={500}
            />

            <View style={styles.evidenceRow}>
              <TouchableOpacity style={styles.evidenceCard} onPress={onCapturarFoto}>
                {foto ? (
                  <Image source={{ uri: foto }} style={styles.preview} />
                ) : (
                  <Ionicons name="camera-outline" size={24} color={Brand.primary} />
                )}
                <Text style={styles.evidenceTitle}>{foto ? 'Foto lista' : 'Tomar foto'}</Text>
                <Text style={styles.evidenceHint}>Animal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.evidenceCard}
                onPress={onCapturarUbicacion}
                disabled={obteniendoGPS}
              >
                {obteniendoGPS ? (
                  <ActivityIndicator color={Brand.secondary} />
                ) : (
                  <Ionicons
                    name={ubicacionLista ? 'checkmark-circle' : 'locate-outline'}
                    size={24}
                    color={Brand.secondary}
                  />
                )}
                <Text style={styles.evidenceTitle}>
                  {ubicacionLista ? 'GPS listo' : 'Capturar GPS'}
                </Text>
                <Text style={styles.evidenceHint}>Ubicación</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

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
                <Text style={styles.confirmText}>Confirmar resguardo</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Brand.secondary}18`,
  },
  eyebrow: {
    color: Brand.secondary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: { color: Brand.textDark, fontSize: 20, fontWeight: '900', marginTop: 2 },
  helper: { color: Brand.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 16 },
  label: { color: Brand.textDark, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  fieldHint: { color: Brand.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  optionRow: { gap: 7, marginBottom: 14 },
  option: {
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    padding: 10,
  },
  optionActive: { borderColor: Brand.secondary, backgroundColor: `${Brand.secondary}12` },
  optionText: { color: Brand.textMuted, fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: Brand.secondary, fontWeight: '900' },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 11,
    marginBottom: 8,
  },
  routeCardActive: { borderColor: Brand.secondary, backgroundColor: `${Brand.secondary}10` },
  routeCopy: { flex: 1 },
  routeTitle: { color: Brand.textDark, fontSize: 12, fontWeight: '800' },
  routeTitleActive: { color: Brand.secondary },
  routeSubtitle: { color: Brand.textMuted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  input: {
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    padding: 11,
    color: Brand.textDark,
    fontSize: 12,
    marginBottom: 14,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  evidenceRow: { flexDirection: 'row', gap: 10 },
  evidenceCard: {
    flex: 1,
    minHeight: 104,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4D3B8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: { width: '100%', height: 54, marginBottom: 5 },
  evidenceTitle: { color: Brand.textDark, fontSize: 11, fontWeight: '800', marginTop: 5 },
  evidenceHint: { color: Brand.textFaint, fontSize: 10, marginTop: 1 },
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
    backgroundColor: Brand.secondary,
  },
  disabled: { opacity: 0.45 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
