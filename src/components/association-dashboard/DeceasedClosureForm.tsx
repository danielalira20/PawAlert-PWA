import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Crypto from 'expo-crypto';
import { useMemo, useState } from 'react';
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

type ResultadoFinal =
  | 'contacto_realizado'
  | 'autoridad_atendio'
  | 'retiro_reportado'
  | 'sin_contacto_disponible'
  | 'voluntario_se_retiro_por_seguridad';

interface OpcionCierre {
  key: ResultadoFinal;
  label: string;
  detail: string;
  acciones: string[];
  icon: keyof typeof Ionicons.glyphMap;
}

const OPCIONES: OpcionCierre[] = [
  {
    key: 'contacto_realizado',
    label: 'Contacto realizado',
    detail: 'Se documentó el contacto, sin afirmar que el retiro concluyó.',
    acciones: ['contacto_oficial_realizado'],
    icon: 'call-outline',
  },
  {
    key: 'autoridad_atendio',
    label: 'La autoridad atendió',
    detail: 'La presencia de la autoridad quedó registrada.',
    acciones: ['autoridad_se_presento'],
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'retiro_reportado',
    label: 'Retiro reportado',
    detail: 'Un actor responsable informó que continuaría con el retiro.',
    acciones: [
      'autoridad_se_presento',
      'tercero_responsable_se_hizo_cargo',
      'retiro_gestionado_con_indicaciones',
    ],
    icon: 'checkmark-circle-outline',
  },
  {
    key: 'sin_contacto_disponible',
    label: 'Sin contacto disponible',
    detail: 'No se encontró un servicio verificado para la zona.',
    acciones: ['sin_contacto_disponible'],
    icon: 'information-circle-outline',
  },
  {
    key: 'voluntario_se_retiro_por_seguridad',
    label: 'Retiro por seguridad',
    detail: 'El voluntario tuvo que retirarse porque permanecer era inseguro.',
    acciones: ['retiro_por_seguridad'],
    icon: 'warning-outline',
  },
];

interface Props {
  reporteId: string;
  accionesRegistradas: string[];
  onCancel: () => void;
  onClosed: () => Promise<void>;
  onSubmittingChange?: (isSubmitting: boolean) => void;
}

function mensajeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return 'No pudimos cerrar el seguimiento. Conservamos tus datos para reintentar.';
}

export function DeceasedClosureForm({
  reporteId,
  accionesRegistradas,
  onCancel,
  onClosed,
  onSubmittingChange,
}: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal | null>(null);
  const [nota, setNota] = useState('');
  const [idempotencyKey] = useState(() => Crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const opcionesDisponibles = useMemo(() => {
    const acciones = new Set(accionesRegistradas);
    return OPCIONES.filter((opcion) => (
      opcion.acciones.some((accion) => acciones.has(accion))
    ));
  }, [accionesRegistradas]);

  const formularioValido = Boolean(
    resultadoFinal && nota.trim().length >= 5,
  );

  const cerrar = async () => {
    if (!resultadoFinal || nota.trim().length < 5) {
      showToast({
        type: 'warning',
        title: 'Completa el cierre',
        message: 'Selecciona una conclusión y explica la revisión realizada.',
      });
      return;
    }

    setIsSubmitting(true);
    onSubmittingChange?.(true);
    try {
      await axios.post(
        `${API_URL}/reports/${reporteId}/seguimiento-fallecimiento/cerrar`,
        {
          resultado_final: resultadoFinal,
          idempotency_key: idempotencyKey,
          nota_cierre: nota.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await onClosed();
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No se cerró el seguimiento',
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
      <Text style={styles.title}>Conclusión documentada</Text>
      <Text style={styles.helper}>
        Elige únicamente lo que las gestiones permiten afirmar. Este cierre es terminal.
      </Text>

      <View style={styles.options}>
        {opcionesDisponibles.map((opcion) => {
          const selected = resultadoFinal === opcion.key;
          return (
            <TouchableOpacity
              key={opcion.key}
              accessibilityRole="radio"
              accessibilityLabel={`Conclusión: ${opcion.label}`}
              accessibilityState={{ selected }}
              onPress={() => setResultadoFinal(opcion.key)}
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
        accessibilityLabel="Nota de cierre"
        value={nota}
        onChangeText={setNota}
        placeholder="Explica qué se revisó y por qué corresponde esta conclusión"
        placeholderTextColor={COLORS.textLight}
        multiline
        maxLength={1000}
        style={styles.notes}
      />

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cancelar cierre"
          onPress={onCancel}
          disabled={isSubmitting}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Confirmar cierre terminal"
          accessibilityState={{ disabled: !formularioValido || isSubmitting }}
          onPress={() => void cerrar()}
          disabled={!formularioValido || isSubmitting}
          style={[
            styles.submitButton,
            (!formularioValido || isSubmitting) && styles.disabledButton,
          ]}
        >
          {isSubmitting
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.submitText}>Cerrar seguimiento</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const COLORS = {
  primary: '#EC802B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  border: '#E8DCCA',
  cardBg: '#FAF3EA',
};

const styles = StyleSheet.create({
  container: {
    gap: 10, padding: 14, borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: '#FFF8F1',
  },
  title: { color: COLORS.textDark, fontSize: 15, fontWeight: '900' },
  helper: { color: COLORS.textLight, fontSize: 12, lineHeight: 18 },
  options: { gap: 7 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    backgroundColor: COLORS.cardBg,
  },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: '#FFFFFF' },
  optionText: { flex: 1, minWidth: 0 },
  optionLabel: { color: COLORS.textDark, fontSize: 13, fontWeight: '800' },
  optionDetail: { color: COLORS.textLight, fontSize: 11, lineHeight: 16, marginTop: 2 },
  notes: {
    minHeight: 96, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    color: COLORS.textDark, backgroundColor: COLORS.white,
    fontSize: 13, textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
  submitButton: {
    minWidth: 155, minHeight: 42, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center', borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  disabledButton: { opacity: 0.45 },
  submitText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
});
