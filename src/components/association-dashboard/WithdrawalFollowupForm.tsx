import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../Toast';

const COLORS = {
  primary: '#EC802B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  cardBg: '#FAF3EA',
  border: '#E8DCCA',
};

type AccionRetiro =
  | 'contacto_oficial_realizado'
  | 'autoridad_se_presento'
  | 'tercero_responsable_se_hizo_cargo'
  | 'retiro_gestionado_con_indicaciones'
  | 'sin_comunicacion'
  | 'sin_contacto_disponible'
  | 'retiro_por_seguridad';

const ACCIONES: {
  key: AccionRetiro;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'contacto_oficial_realizado',
    label: 'Contactamos a un servicio',
    detail: 'Se realizó la llamada o solicitud oficial.',
    icon: 'call-outline',
  },
  {
    key: 'autoridad_se_presento',
    label: 'La autoridad se presentó',
    detail: 'Personal autorizado llegó al lugar.',
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'tercero_responsable_se_hizo_cargo',
    label: 'Un responsable se hizo cargo',
    detail: 'Otra persona o institución aceptó continuar.',
    icon: 'people-outline',
  },
  {
    key: 'retiro_gestionado_con_indicaciones',
    label: 'Seguimos indicaciones de un servicio',
    detail: 'La gestión se realizó con instrucciones identificables.',
    icon: 'document-text-outline',
  },
  {
    key: 'sin_comunicacion',
    label: 'No hubo respuesta',
    detail: 'Se intentó contactar, pero no contestaron.',
    icon: 'call-outline',
  },
  {
    key: 'sin_contacto_disponible',
    label: 'No hay contacto disponible',
    detail: 'No existe un servicio verificado para la zona.',
    icon: 'information-circle-outline',
  },
  {
    key: 'retiro_por_seguridad',
    label: 'La persona tuvo que retirarse',
    detail: 'Permanecer en el lugar representaba un riesgo.',
    icon: 'warning-outline',
  },
];

interface Props {
  reporteId: string;
  resultadoId: string;
  nombreServicioInicial?: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onSubmittingChange?: (isSubmitting: boolean) => void;
}

function mensajeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return 'No pudimos guardar la gestión. Conservamos tus datos para reintentar.';
}

export function WithdrawalFollowupForm({
  reporteId,
  resultadoId,
  nombreServicioInicial = '',
  onCancel,
  onSaved,
  onSubmittingChange,
}: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [accion, setAccion] = useState<AccionRetiro | null>(
    nombreServicioInicial ? 'contacto_oficial_realizado' : null,
  );
  const [folio, setFolio] = useState('');
  const [nombreServicio, setNombreServicio] = useState(nombreServicioInicial);
  const [destino, setDestino] = useState('');
  const [nota, setNota] = useState('');
  const [idempotencyKey] = useState(() => Crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiereServicio = accion === 'retiro_gestionado_con_indicaciones';
  const formularioValido = Boolean(
    accion && (!requiereServicio || nombreServicio.trim()),
  );

  const guardar = async () => {
    if (!accion || (requiereServicio && !nombreServicio.trim())) {
      showToast({
        type: 'warning',
        title: 'Completa la gestión',
        message: requiereServicio
          ? 'Indica qué servicio proporcionó las instrucciones.'
          : 'Selecciona la acción que se realizó.',
      });
      return;
    }

    setIsSubmitting(true);
    onSubmittingChange?.(true);
    try {
      await axios.post(
        `${API_URL}/reports/${reporteId}/resultados/${resultadoId}/seguimiento-retiro`,
        {
          accion,
          idempotency_key: idempotencyKey,
          folio: folio.trim() || null,
          nombre_servicio: nombreServicio.trim() || null,
          destino_informado: destino.trim() || null,
          nota: nota.trim() || null,
          evidencia_lugar_id: null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await onSaved();
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se guardó la gestión',
        message: mensajeError(error),
      });
    } finally {
      setIsSubmitting(false);
      onSubmittingChange?.(false);
    }
  };

  return (
    <View style={styles.container}>
      <Toast toast={toast} translateY={translateY} />
      <Text style={styles.title}>¿Qué gestión se realizó?</Text>
      <Text style={styles.helper}>
        Registrar una acción no confirma por sí sola que el retiro haya concluido.
      </Text>

      <View style={styles.options}>
        {ACCIONES.map((opcion) => {
          const selected = accion === opcion.key;
          return (
            <TouchableOpacity
              key={opcion.key}
              accessibilityRole="radio"
              accessibilityLabel={`Gestión: ${opcion.label}`}
              accessibilityState={{ selected }}
              onPress={() => setAccion(opcion.key)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Ionicons
                name={opcion.icon}
                size={19}
                color={selected ? COLORS.primary : COLORS.textLight}
              />
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{opcion.label}</Text>
                <Text style={styles.optionDetail}>{opcion.detail}</Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? COLORS.primary : COLORS.textLight}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        accessibilityLabel="Servicio o institución"
        value={nombreServicio}
        onChangeText={setNombreServicio}
        placeholder={requiereServicio ? 'Servicio o institución *' : 'Servicio o institución'}
        placeholderTextColor={COLORS.textLight}
        maxLength={200}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Folio de atención"
        value={folio}
        onChangeText={setFolio}
        placeholder="Folio de atención, si existe"
        placeholderTextColor={COLORS.textLight}
        maxLength={200}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Destino informado"
        value={destino}
        onChangeText={setDestino}
        placeholder="Destino informado, si existe"
        placeholderTextColor={COLORS.textLight}
        maxLength={500}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Notas de la gestión"
        value={nota}
        onChangeText={setNota}
        placeholder="Notas adicionales"
        placeholderTextColor={COLORS.textLight}
        maxLength={1000}
        multiline
        style={[styles.input, styles.notes]}
      />

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cancelar gestión"
          onPress={onCancel}
          disabled={isSubmitting}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Guardar gestión de retiro"
          accessibilityState={{ disabled: !formularioValido || isSubmitting }}
          onPress={() => void guardar()}
          disabled={!formularioValido || isSubmitting}
          style={[
            styles.submitButton,
            (!formularioValido || isSubmitting) && styles.disabledButton,
          ]}
        >
          {isSubmitting
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.submitText}>Guardar gestión</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  title: { color: COLORS.textDark, fontSize: 15, fontWeight: '900' },
  helper: { color: COLORS.textLight, fontSize: 12, lineHeight: 18 },
  options: { gap: 7 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    backgroundColor: COLORS.cardBg,
  },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: '#FFF8F1' },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { color: COLORS.textDark, fontSize: 13, fontWeight: '800' },
  optionDetail: { color: COLORS.textLight, fontSize: 11, lineHeight: 16, marginTop: 2 },
  input: {
    minHeight: 44, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    color: COLORS.textDark, backgroundColor: COLORS.white, fontSize: 13,
  },
  notes: { minHeight: 88, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
  submitButton: {
    minWidth: 142, minHeight: 42, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center', borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  disabledButton: { opacity: 0.45 },
  submitText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
});
