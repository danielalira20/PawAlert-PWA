import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import type { Animal } from '../../types/reporte';

interface Props {
  visible: boolean;
  animales: Animal[];
  cantidades: Record<string, number>;
  fotoLista: boolean;
  ubicacionLista: boolean;
  obteniendoGPS: boolean;
  puedeEsperarSeguro: boolean | null;
  riesgoVial: boolean;
  riesgoSanitario: boolean;
  identificacion: string;
  notas: string;
  motivoRetiro: string;
  isSubmitting: boolean;
  onSeleccionarAnimal: (animalId: string, cantidadMaxima: number) => void;
  onCambiarCantidad: (animalId: string, cantidad: number, cantidadMaxima: number) => void;
  onCapturarFoto: () => void;
  onCapturarUbicacion: () => void;
  onCambiarPuedeEsperar: (valor: boolean) => void;
  onCambiarRiesgoVial: (valor: boolean) => void;
  onCambiarRiesgoSanitario: (valor: boolean) => void;
  onCambiarIdentificacion: (valor: string) => void;
  onCambiarNotas: (valor: string) => void;
  onCambiarMotivoRetiro: (valor: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function etiquetaAnimal(animal: Animal, indice: number): string {
  const especie = animal.tipo_animal?.trim() || 'Animal';
  const cantidad = Math.max(1, animal.cantidad ?? 1);
  return cantidad > 1
    ? `${especie} ${indice + 1} · grupo de ${cantidad}`
    : `${especie} ${indice + 1}`;
}

export function SinVidaModal({
  visible,
  animales,
  cantidades,
  fotoLista,
  ubicacionLista,
  obteniendoGPS,
  puedeEsperarSeguro,
  riesgoVial,
  riesgoSanitario,
  identificacion,
  notas,
  motivoRetiro,
  isSubmitting,
  onSeleccionarAnimal,
  onCambiarCantidad,
  onCapturarFoto,
  onCapturarUbicacion,
  onCambiarPuedeEsperar,
  onCambiarRiesgoVial,
  onCambiarRiesgoSanitario,
  onCambiarIdentificacion,
  onCambiarNotas,
  onCambiarMotivoRetiro,
  onCancel,
  onConfirm,
}: Props) {
  const seleccionados = Object.keys(cantidades).length;
  const puedeConfirmar =
    seleccionados > 0 &&
    fotoLista &&
    ubicacionLista &&
    puedeEsperarSeguro !== null &&
    (puedeEsperarSeguro || !!motivoRetiro.trim()) &&
    !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Lo encontré sin vida</Text>
              <Text style={styles.subtitle}>Registra únicamente lo que observaste en el lugar.</Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={10} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color={Brand.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.notice}>
              <Ionicons name="lock-closed-outline" size={18} color="#6D4C41" />
              <Text style={styles.noticeText}>
                La evidencia será privada y se mostrará con advertencia de contenido sensible.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>¿Qué animal encontraste?</Text>
            {animales.map((animal, indice) => {
              const animalId = animal.id;
              if (!animalId) return null;
              const cantidadMaxima = Math.max(1, animal.cantidad ?? 1);
              const seleccionada = cantidades[animalId] !== undefined;
              return (
                <View key={animalId} style={[styles.animalRow, seleccionada && styles.animalRowSelected]}>
                  <TouchableOpacity
                    style={styles.animalSelect}
                    onPress={() => onSeleccionarAnimal(animalId, cantidadMaxima)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: seleccionada }}
                  >
                    <Ionicons
                      name={seleccionada ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={seleccionada ? Brand.primary : Brand.textFaint}
                    />
                    <View style={styles.animalCopy}>
                      <Text style={styles.animalTitle}>{etiquetaAnimal(animal, indice)}</Text>
                      <Text style={styles.animalMeta}>
                        {[animal.condicion, animal.tamanio].filter(Boolean).join(' · ') || 'Sin detalles adicionales'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {seleccionada && cantidadMaxima > 1 && (
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() =>
                          onCambiarCantidad(
                            animalId,
                            Math.max(1, cantidades[animalId] - 1),
                            cantidadMaxima,
                          )
                        }
                        accessibilityLabel="Disminuir cantidad"
                      >
                        <Ionicons name="remove" size={18} color={Brand.textDark} />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>
                        {cantidades[animalId]} de {cantidadMaxima}
                      </Text>
                      <TouchableOpacity
                        style={styles.stepperButton}
                        onPress={() =>
                          onCambiarCantidad(
                            animalId,
                            Math.min(cantidadMaxima, cantidades[animalId] + 1),
                            cantidadMaxima,
                          )
                        }
                        accessibilityLabel="Aumentar cantidad"
                      >
                        <Ionicons name="add" size={18} color={Brand.textDark} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            <Text style={styles.sectionTitle}>Evidencia y ubicación</Text>
            <View style={styles.captureRow}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={onCapturarFoto}
                accessibilityLabel="Tomar evidencia fotográfica"
              >
                <Ionicons name={fotoLista ? 'checkmark-circle' : 'camera-outline'} size={18} color={Brand.primary} />
                <Text style={styles.captureText}>{fotoLista ? 'Foto capturada' : 'Tomar foto'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={onCapturarUbicacion}
                disabled={obteniendoGPS}
                accessibilityLabel="Capturar ubicación GPS"
              >
                {obteniendoGPS ? (
                  <ActivityIndicator size="small" color={Brand.secondary} />
                ) : (
                  <Ionicons
                    name={ubicacionLista ? 'checkmark-circle' : 'location-outline'}
                    size={18}
                    color={Brand.secondary}
                  />
                )}
                <Text style={styles.captureText}>{ubicacionLista ? 'GPS capturado' : 'Capturar GPS'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>¿Puedes esperar de forma segura?</Text>
            <View style={styles.segmented}>
              <TouchableOpacity
                style={[styles.segment, puedeEsperarSeguro === true && styles.segmentSelected]}
                onPress={() => onCambiarPuedeEsperar(true)}
              >
                <Text style={[styles.segmentText, puedeEsperarSeguro === true && styles.segmentTextSelected]}>Sí</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, puedeEsperarSeguro === false && styles.segmentSelected]}
                onPress={() => onCambiarPuedeEsperar(false)}
              >
                <Text style={[styles.segmentText, puedeEsperarSeguro === false && styles.segmentTextSelected]}>No</Text>
              </TouchableOpacity>
            </View>

            {puedeEsperarSeguro === false && (
              <TextInput
                style={styles.input}
                placeholder="Describe el riesgo por el que necesitas retirarte"
                placeholderTextColor={Brand.textFaint}
                value={motivoRetiro}
                onChangeText={onCambiarMotivoRetiro}
                maxLength={500}
              />
            )}

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchTitle}>Riesgo vial</Text>
                <Text style={styles.switchText}>Está en una vía peligrosa o dificulta el tránsito.</Text>
              </View>
              <Switch value={riesgoVial} onValueChange={onCambiarRiesgoVial} />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchTitle}>Riesgo sanitario</Text>
                <Text style={styles.switchText}>Hay una condición que requiere atención prioritaria.</Text>
              </View>
              <Switch value={riesgoSanitario} onValueChange={onCambiarRiesgoSanitario} />
            </View>

            <TextInput
              style={styles.input}
              placeholder="Collar, placa u otra identificación (opcional)"
              placeholderTextColor={Brand.textFaint}
              value={identificacion}
              onChangeText={onCambiarIdentificacion}
              maxLength={500}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              placeholder="Observaciones adicionales (opcional)"
              placeholderTextColor={Brand.textFaint}
              value={notas}
              onChangeText={onCambiarNotas}
              maxLength={1000}
            />
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={isSubmitting}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !puedeConfirmar && styles.confirmButtonDisabled]}
              onPress={onConfirm}
              disabled={!puedeConfirmar}
              accessibilityLabel="Registrar resultado sin vida"
              accessibilityState={{ disabled: !puedeConfirmar }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Registrar resultado</Text>
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
    backgroundColor: 'rgba(46,42,38,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '94%',
    backgroundColor: Brand.cardWarm,
    borderRadius: 16,
    padding: 18,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 19, fontWeight: '800', color: Brand.textDark },
  subtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, color: Brand.textMuted },
  content: { paddingBottom: 8 },
  notice: {
    flexDirection: 'row',
    gap: 9,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#F3E8E3',
    marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#6D4C41' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: Brand.textDark, marginBottom: 8, marginTop: 4 },
  animalRow: {
    borderWidth: 1,
    borderColor: '#E4D3B8',
    borderRadius: 8,
    padding: 11,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  animalRowSelected: { borderColor: Brand.primary, backgroundColor: `${Brand.primary}0D` },
  animalSelect: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  animalCopy: { flex: 1 },
  animalTitle: { color: Brand.textDark, fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },
  animalMeta: { color: Brand.textMuted, fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#EFE3CD',
  },
  stepperValue: { minWidth: 62, textAlign: 'center', color: Brand.textDark, fontWeight: '700', fontSize: 12 },
  captureRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  captureButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: '#EFE3CD',
    paddingHorizontal: 8,
  },
  captureText: { color: Brand.textDark, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  segmented: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segment: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D9C7AA',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  segmentSelected: { borderColor: Brand.primary, backgroundColor: `${Brand.primary}14` },
  segmentText: { color: Brand.textMuted, fontWeight: '700' },
  segmentTextSelected: { color: Brand.primary },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D9C7AA',
  },
  switchCopy: { flex: 1 },
  switchTitle: { color: Brand.textDark, fontWeight: '800', fontSize: 13 },
  switchText: { color: Brand.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#D9C7AA',
    borderRadius: 8,
    backgroundColor: '#fff',
    color: Brand.textDark,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    marginTop: 12,
  },
  textArea: { minHeight: 74, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 14 },
  cancelButton: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 8, backgroundColor: '#EFE3CD' },
  cancelText: { color: Brand.textMuted, fontWeight: '800' },
  confirmButton: { flex: 1.5, paddingVertical: 13, alignItems: 'center', borderRadius: 8, backgroundColor: '#6D4C41' },
  confirmButtonDisabled: { opacity: 0.45 },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
