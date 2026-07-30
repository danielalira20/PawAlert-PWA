import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../Toast';

const COLORS = {
  primary: '#EC802B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  cardBg: '#FAF3EA',
  border: '#F0E6D6',
};

const QUESTIONS = [
  ['identificacion_legible', 'La identificación es legible'],
  ['identidad_consistente', 'La identidad coincide con la postulación'],
  ['direccion_consistente', 'La dirección es consistente con el expediente'],
  ['formulario_completo', 'El formulario tiene información suficiente'],
  ['recorrido_suficiente', 'El recorrido permite evaluar el hogar'],
  ['accesos_seguros', 'Los accesos se observan seguros'],
  ['cierres_perimetrales', 'Bardas, rejas o límites son adecuados'],
  ['ventanas_balcones', 'Ventanas y balcones cuentan con protección'],
  ['espacio_aislamiento', 'Se observa un espacio para aislamiento'],
  ['higiene_ventilacion', 'La higiene y ventilación son adecuadas'],
  ['convivencia_hogar', 'La convivencia declarada parece viable'],
  ['autorizacion_vivienda', 'La autorización de vivienda es suficiente'],
] as const;

type Answer = 'cumple' | 'no_cumple' | 'no_evaluable';
type Answers = Partial<Record<(typeof QUESTIONS)[number][0], Answer>> & {
  notas?: string | null;
};

interface Props {
  verificationId: string;
  initialValue?: Answers | null;
  onSaved: (checklist: Answers, completedAt: string) => void;
}

export default function RemoteReviewChecklist({
  verificationId,
  initialValue,
  onSaved,
}: Props) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [answers, setAnswers] = useState<Answers>(initialValue || {});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setAnswers(initialValue || {}), [initialValue]);

  const completed = useMemo(
    () => QUESTIONS.every(([key]) => Boolean(answers[key])),
    [answers],
  );

  const save = async () => {
    if (!token || !completed) return;
    setIsSaving(true);
    try {
      const { data } = await axios.put(
        `${API_URL}/associations/me/verificaciones/${verificationId}/checklist-remoto`,
        answers,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onSaved(data.checklist_remoto, data.checklist_remoto_completado_at);
      showToast({
        type: 'success',
        title: 'Revisión guardada',
        message: 'Ya puedes tomar una decisión sobre el expediente.',
      });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos guardar la revisión',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{
      padding: 18,
      borderRadius: 20,
      backgroundColor: COLORS.cardBg,
      borderWidth: 1,
      borderColor: COLORS.border,
      gap: 15,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="clipboard-outline" size={22} color={COLORS.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textDark, fontSize: 16, fontWeight: '900' }}>
            Checklist de revisión remota
          </Text>
          <Text style={{ color: COLORS.textLight, fontSize: 11, marginTop: 2 }}>
            Marca lo que puedes comprobar con el expediente y sus evidencias.
          </Text>
        </View>
      </View>

      {QUESTIONS.map(([key, label]) => (
        <View key={key} style={{ gap: 8 }}>
          <Text style={{ color: COLORS.textDark, fontSize: 12, fontWeight: '700' }}>
            {label}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {([
              ['cumple', 'Sí'],
              ['no_cumple', 'No'],
              ['no_evaluable', 'No se puede comprobar'],
            ] as const).map(([value, text]) => {
              const selected = answers[key] === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setAnswers((current) => ({ ...current, [key]: value }))}
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selected ? COLORS.accent : COLORS.border,
                    backgroundColor: selected ? '#EAF7F6' : COLORS.white,
                  }}
                >
                  <Text style={{
                    color: selected ? COLORS.accent : COLORS.textDark,
                    fontSize: 11,
                    fontWeight: '800',
                  }}>
                    {text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      <TextInput
        value={answers.notas || ''}
        onChangeText={(notas) => setAnswers((current) => ({ ...current, notas }))}
        placeholder="Notas de la revisión (opcional)"
        placeholderTextColor={COLORS.textLight}
        multiline
        maxLength={500}
        style={{
          minHeight: 90,
          padding: 12,
          borderRadius: 13,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.white,
          color: COLORS.textDark,
          textAlignVertical: 'top',
        }}
      />

      <TouchableOpacity
        onPress={save}
        disabled={!completed || isSaving}
        style={{
          paddingVertical: 12,
          borderRadius: 13,
          backgroundColor: COLORS.accent,
          alignItems: 'center',
          opacity: !completed || isSaving ? 0.55 : 1,
        }}
      >
        {isSaving
          ? <ActivityIndicator color={COLORS.white} />
          : <Text style={{ color: COLORS.white, fontWeight: '900' }}>
              Guardar checklist
            </Text>}
      </TouchableOpacity>
      {!completed && (
        <Text style={{ color: COLORS.danger, fontSize: 11, textAlign: 'center' }}>
          Responde todos los puntos antes de guardar.
        </Text>
      )}
    </View>
  );
}
