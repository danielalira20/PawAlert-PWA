import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

const COLORS = {
  primary: '#EC802B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  warning: '#F39C12',
  card: '#FAF3EA',
  border: '#F0E6D6',
};

type Answer = 'cumple' | 'no_cumple' | 'no_aplica';
type Result = 'aprobar' | 'solicitar_ajustes' | 'rechazar';

type Checklist = {
  identidad_coincide?: Answer;
  espacio_coincide_video?: Answer;
  accesos_seguros?: Answer;
  cierres_perimetrales?: Answer;
  ventanas_balcones?: Answer;
  espacio_aislamiento?: Answer;
  higiene_ventilacion?: Answer;
  convivencia_hogar?: Answer;
  autorizacion_vivienda?: Answer;
  completado_at?: string;
};

interface Props {
  assignmentId: string;
  verificationState: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInDistanceM?: number | null;
  checklist?: Checklist | null;
  visitNotes?: string | null;
  result?: Result | null;
  resultReason?: string | null;
  onUpdated: () => Promise<unknown> | unknown;
  onFeedback: (feedback: {
    type: 'success' | 'error';
    title: string;
    message?: string;
  }) => void;
}

const QUESTIONS: Array<{
  key: keyof Omit<Checklist, 'completado_at'>;
  title: string;
  help: string;
  allowNA?: boolean;
}> = [
  {
    key: 'identidad_coincide',
    title: 'Identidad del postulante',
    help: 'La identificación corresponde con la persona que recibe la visita.',
  },
  {
    key: 'espacio_coincide_video',
    title: 'El espacio coincide con el recorrido',
    help: 'La distribución y las áreas principales corresponden con el video enviado.',
  },
  {
    key: 'accesos_seguros',
    title: 'Entradas y salidas seguras',
    help: 'Puertas, accesos y zonas de paso reducen el riesgo de escape.',
  },
  {
    key: 'cierres_perimetrales',
    title: 'Bardas, rejas o límites seguros',
    help: 'Los límites del espacio son adecuados para el animal que podría recibir.',
    allowNA: true,
  },
  {
    key: 'ventanas_balcones',
    title: 'Ventanas y balcones protegidos',
    help: 'No se observan aperturas peligrosas o cuentan con protección.',
    allowNA: true,
  },
  {
    key: 'espacio_aislamiento',
    title: 'Espacio para mantenerlo separado',
    help: 'Existe una zona utilizable en caso de adaptación, enfermedad o cuarentena.',
  },
  {
    key: 'higiene_ventilacion',
    title: 'Higiene, sombra y ventilación',
    help: 'El área se percibe limpia, ventilada y protegida del clima.',
  },
  {
    key: 'convivencia_hogar',
    title: 'Convivencia segura en el hogar',
    help: 'Personas y otros animales del hogar pueden convivir bajo medidas adecuadas.',
    allowNA: true,
  },
  {
    key: 'autorizacion_vivienda',
    title: 'Autorización para recibir animales',
    help: 'La persona responsable de la vivienda está de acuerdo.',
  },
];

const EMPTY_CHECKLIST: Checklist = {};

function formatTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function VisitExecutionPanel({
  assignmentId,
  verificationState,
  checkInAt,
  checkOutAt,
  checkInDistanceM,
  checklist,
  visitNotes,
  result,
  resultReason,
  onUpdated,
  onFeedback,
}: Props) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 680;
  const [answers, setAnswers] = useState<Checklist>(checklist || EMPTY_CHECKLIST);
  const [notes, setNotes] = useState(visitNotes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultChoice, setResultChoice] = useState<Result | null>(null);
  const [resultReasonInput, setResultReasonInput] = useState('');

  useEffect(() => {
    setAnswers(checklist || EMPTY_CHECKLIST);
    setNotes(visitNotes || '');
  }, [checklist, visitNotes]);

  const completedAnswers = useMemo(
    () => QUESTIONS.filter((question) => Boolean(answers[question.key])).length,
    [answers],
  );
  const checklistComplete = completedAnswers === QUESTIONS.length;
  const hasFailedAnswers = QUESTIONS.some(
    (question) => answers[question.key] === 'no_cumple',
  );
  const inProgress = Boolean(checkInAt) && !checkOutAt;
  const finishedVisit = Boolean(checkOutAt);

  const request = async (
    method: 'patch' | 'put',
    suffix: string,
    body?: Record<string, unknown>,
  ) => {
    if (!token) return null;
    return axios({
      method,
      url: `${API_URL}/voluntarios/me/verificaciones/${assignmentId}/${suffix}`,
      data: body || {},
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const checkIn = async () => {
    setIsSubmitting(true);
    try {
      let coordinates: { latitud?: number; longitud?: number } = {};
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coordinates = {
            latitud: current.coords.latitude,
            longitud: current.coords.longitude,
          };
        }
      } catch {
        // La ubicación es una señal de seguridad, no bloquea la visita.
      }
      const response = await request('patch', 'check-in', coordinates);
      onFeedback({
        type: 'success',
        title: 'Llegada registrada',
        message: response?.data?.mensaje,
      });
      await onUpdated();
    } catch (error: any) {
      onFeedback({
        type: 'error',
        title: 'No pudimos registrar tu llegada',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveChecklist = async () => {
    if (!checklistComplete) {
      onFeedback({
        type: 'error',
        title: 'Faltan puntos por revisar',
        message: `Has respondido ${completedAnswers} de ${QUESTIONS.length}.`,
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await request('put', 'checklist', {
        ...answers,
        notas: notes.trim() || undefined,
      });
      onFeedback({
        type: 'success',
        title: 'Revisión guardada',
        message: response?.data?.mensaje,
      });
      await onUpdated();
    } catch (error: any) {
      onFeedback({
        type: 'error',
        title: 'No pudimos guardar la revisión',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkOut = async () => {
    setIsSubmitting(true);
    try {
      const response = await request('patch', 'check-out');
      onFeedback({
        type: 'success',
        title: 'Salida registrada',
        message: response?.data?.mensaje,
      });
      await onUpdated();
    } catch (error: any) {
      onFeedback({
        type: 'error',
        title: 'No pudimos registrar tu salida',
        message: error?.response?.data?.detail || 'Guarda primero todos los puntos de la revisión.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitResult = async () => {
    if (!resultChoice) return;
    if (resultChoice !== 'aprobar' && !resultReasonInput.trim()) return;
    setIsSubmitting(true);
    try {
      const response = await request('patch', 'resultado', {
        resultado: resultChoice,
        motivo: resultReasonInput.trim() || undefined,
      });
      onFeedback({
        type: 'success',
        title: resultChoice === 'aprobar' ? 'Casa temporal aprobada' : 'Resultado enviado',
        message: response?.data?.mensaje,
      });
      setResultChoice(null);
      setResultReasonInput('');
      await onUpdated();
    } catch (error: any) {
      onFeedback({
        type: 'error',
        title: 'No pudimos enviar el resultado',
        message: error?.response?.data?.detail || 'Revisa la información e intenta nuevamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!['visita_programada', 'visita_en_curso', 'visita_realizada', 'aprobada', 'requiere_cambios', 'rechazada'].includes(verificationState)) {
    return null;
  }

  return (
    <>
      <View style={{
        padding: isMobile ? 16 : 19,
        borderRadius: 20,
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.border,
        gap: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 15, backgroundColor: '#EAF7F6', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textDark, fontSize: 16, fontWeight: '900' }}>
              Visita y revisión del hogar
            </Text>
            <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
              Tu asociación podrá acompañar el avance desde la plataforma.
            </Text>
          </View>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 13, backgroundColor: inProgress ? '#FFF7E6' : '#EAF7F6' }}>
            <Text style={{ color: inProgress ? COLORS.warning : COLORS.accent, fontSize: 10, fontWeight: '900' }}>
              {result ? 'Finalizada' : finishedVisit ? 'Salida registrada' : inProgress ? 'En curso' : 'Programada'}
            </Text>
          </View>
        </View>

        {!checkInAt && verificationState === 'visita_programada' && (
          <View style={{ padding: 15, borderRadius: 16, backgroundColor: COLORS.card, gap: 9 }}>
            <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>Cuando llegues al hogar</Text>
            <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
              Registra tu llegada. Si autorizas la ubicación, se compartirá únicamente como señal de seguridad con tu asociación.
            </Text>
            <TouchableOpacity
              onPress={checkIn}
              disabled={isSubmitting}
              style={{ paddingVertical: 12, borderRadius: 13, backgroundColor: COLORS.accent, alignItems: 'center', opacity: isSubmitting ? 0.65 : 1 }}
            >
              {isSubmitting
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={{ color: COLORS.white, fontWeight: '900' }}>Registrar mi llegada</Text>}
            </TouchableOpacity>
          </View>
        )}

        {!!checkInAt && (
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
            <View style={{ flex: 1, padding: 13, borderRadius: 15, backgroundColor: '#EAF7F6', gap: 4 }}>
              <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '900' }}>LLEGADA</Text>
              <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>{formatTime(checkInAt)}</Text>
              {checkInDistanceM != null && (
                <Text style={{ color: COLORS.textLight, fontSize: 10 }}>
                  Aprox. a {Math.round(checkInDistanceM)} m del hogar declarado
                </Text>
              )}
            </View>
            {!!checkOutAt && (
              <View style={{ flex: 1, padding: 13, borderRadius: 15, backgroundColor: '#EAF7F6', gap: 4 }}>
                <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '900' }}>SALIDA</Text>
                <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>{formatTime(checkOutAt)}</Text>
              </View>
            )}
          </View>
        )}

        {inProgress && (
          <View style={{ gap: 13 }}>
            <View>
              <Text style={{ color: COLORS.textDark, fontSize: 15, fontWeight: '900' }}>
                Revisión presencial
              </Text>
              <Text style={{ marginTop: 3, color: COLORS.textLight, fontSize: 11 }}>
                {completedAnswers} de {QUESTIONS.length} puntos revisados
              </Text>
            </View>

            {QUESTIONS.map((question, index) => (
              <View key={question.key} style={{ padding: 14, borderRadius: 16, backgroundColor: COLORS.card, gap: 9 }}>
                <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '900' }}>
                  {index + 1}. {question.title}
                </Text>
                <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
                  {question.help}
                </Text>
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 7 }}>
                  {([
                    ['cumple', 'Sí, cumple', COLORS.accent],
                    ['no_cumple', 'Necesita atención', COLORS.danger],
                    ...(question.allowNA ? [['no_aplica', 'No aplica', COLORS.textLight]] : []),
                  ] as Array<[Answer, string, string]>).map(([value, label, color]) => {
                    const selected = answers[question.key] === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setAnswers((current) => ({ ...current, [question.key]: value }))}
                        style={{
                          flex: 1,
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: selected ? color : COLORS.border,
                          backgroundColor: selected ? COLORS.white : 'transparent',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: selected ? color : COLORS.textLight, fontSize: 11, fontWeight: '800' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            <View style={{ gap: 7 }}>
              <Text style={{ color: COLORS.textDark, fontSize: 12, fontWeight: '800' }}>
                Notas de la visita (opcional)
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Agrega detalles útiles para la asociación."
                placeholderTextColor={COLORS.textLight}
                multiline
                maxLength={500}
                style={{ minHeight: 95, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, color: COLORS.textDark, textAlignVertical: 'top' }}
              />
              <Text style={{ alignSelf: 'flex-end', color: COLORS.textLight, fontSize: 10 }}>{notes.length}/500</Text>
            </View>

            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 9 }}>
              <TouchableOpacity
                onPress={saveChecklist}
                disabled={isSubmitting || !checklistComplete}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', opacity: isSubmitting || !checklistComplete ? 0.55 : 1 }}
              >
                <Text style={{ color: COLORS.white, fontWeight: '900' }}>Guardar revisión</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={checkOut}
                disabled={isSubmitting || !checklist?.completado_at}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: COLORS.accent, alignItems: 'center', opacity: isSubmitting || !checklist?.completado_at ? 0.5 : 1 }}
              >
                <Text style={{ color: COLORS.accent, fontWeight: '900' }}>Registrar salida</Text>
              </TouchableOpacity>
            </View>
            {!checklist?.completado_at && checklistComplete && (
              <Text style={{ color: COLORS.textLight, fontSize: 10, textAlign: 'center' }}>
                Guarda la revisión para habilitar el registro de salida.
              </Text>
            )}
          </View>
        )}

        {finishedVisit && !result && (
          <View style={{ padding: 15, borderRadius: 16, backgroundColor: COLORS.card, gap: 10 }}>
            <Text style={{ color: COLORS.textDark, fontSize: 14, fontWeight: '900' }}>
              ¿Cuál es el resultado de la visita?
            </Text>
            <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
              La decisión se enviará a la asociación y actualizará la postulación.
            </Text>
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setResultChoice('aprobar')}
                disabled={hasFailedAnswers}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center', opacity: hasFailedAnswers ? 0.45 : 1 }}
              >
                <Text style={{ color: COLORS.white, fontWeight: '900' }}>Aprobar hogar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setResultChoice('solicitar_ajustes')} style={{ flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: COLORS.warning, alignItems: 'center' }}>
                <Text style={{ color: COLORS.warning, fontWeight: '900' }}>Solicitar ajustes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setResultChoice('rechazar')} style={{ flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: COLORS.danger, alignItems: 'center' }}>
                <Text style={{ color: COLORS.danger, fontWeight: '900' }}>No aprobar</Text>
              </TouchableOpacity>
            </View>
            {hasFailedAnswers && (
              <Text style={{ color: COLORS.textLight, fontSize: 10, lineHeight: 16 }}>
                Para aprobar, todos los puntos aplicables deben estar marcados como “Sí, cumple”.
              </Text>
            )}
          </View>
        )}

        {!!result && (
          <View style={{ padding: 15, borderRadius: 16, backgroundColor: result === 'aprobar' ? '#EAF7F6' : '#FFF7E6', gap: 6 }}>
            <Text style={{ color: result === 'aprobar' ? COLORS.accent : COLORS.warning, fontWeight: '900' }}>
              {result === 'aprobar' ? 'Hogar aprobado' : result === 'solicitar_ajustes' ? 'Se solicitaron ajustes' : 'Hogar no aprobado'}
            </Text>
            {!!resultReason && (
              <Text style={{ color: COLORS.textDark, fontSize: 11, lineHeight: 17 }}>{resultReason}</Text>
            )}
          </View>
        )}
      </View>

      <Modal visible={resultChoice !== null} transparent animationType="fade">
        <View style={{ flex: 1, padding: 18, backgroundColor: 'rgba(38,29,22,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <ScrollView style={{ width: '100%', maxWidth: 480 }} contentContainerStyle={{ padding: isMobile ? 19 : 24, borderRadius: 23, backgroundColor: COLORS.white, gap: 13 }}>
            <Ionicons
              name={resultChoice === 'aprobar' ? 'checkmark-circle-outline' : resultChoice === 'solicitar_ajustes' ? 'construct-outline' : 'close-circle-outline'}
              size={42}
              color={resultChoice === 'aprobar' ? COLORS.accent : resultChoice === 'solicitar_ajustes' ? COLORS.warning : COLORS.danger}
            />
            <Text style={{ color: COLORS.textDark, fontSize: 19, fontWeight: '900' }}>
              {resultChoice === 'aprobar' ? 'Aprobar casa temporal' : resultChoice === 'solicitar_ajustes' ? 'Solicitar ajustes' : 'No aprobar el hogar'}
            </Text>
            <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 19 }}>
              {resultChoice === 'aprobar'
                ? 'El postulante se convertirá en voluntario externo y podrá recibir animales.'
                : resultChoice === 'solicitar_ajustes'
                  ? 'El postulante podrá corregir lo indicado y enviar un nuevo recorrido.'
                  : 'La postulación se cerrará. La persona podrá intentar participar como voluntario interno.'}
            </Text>
            <TextInput
              value={resultReasonInput}
              onChangeText={setResultReasonInput}
              placeholder={resultChoice === 'aprobar' ? 'Comentario final (opcional)' : 'Explica claramente qué observaste.'}
              placeholderTextColor={COLORS.textLight}
              multiline
              maxLength={500}
              style={{ minHeight: 105, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, color: COLORS.textDark, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: 9 }}>
              <TouchableOpacity
                onPress={() => {
                  setResultChoice(null);
                  setResultReasonInput('');
                }}
                disabled={isSubmitting}
                style={{ paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}
              >
                <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitResult}
                disabled={isSubmitting || (resultChoice !== 'aprobar' && !resultReasonInput.trim())}
                style={{ paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13, backgroundColor: resultChoice === 'aprobar' ? COLORS.accent : resultChoice === 'solicitar_ajustes' ? COLORS.warning : COLORS.danger, alignItems: 'center', opacity: isSubmitting || (resultChoice !== 'aprobar' && !resultReasonInput.trim()) ? 0.55 : 1 }}
              >
                {isSubmitting
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={{ color: COLORS.white, fontWeight: '900' }}>Confirmar resultado</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
