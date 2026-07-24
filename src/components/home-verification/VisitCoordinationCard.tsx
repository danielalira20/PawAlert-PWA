import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import SchedulePickerModal from './SchedulePickerModal';

const COLORS = {
  primary: '#EC802B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  card: '#FAF3EA',
  border: '#F0E6D6',
};

type Coordinacion = {
  id: string;
  asociacion_nombre: string;
  verificador_nombre: string;
  estado_verificacion: string;
  horario_propuesto_at?: string | null;
  horario_propuesto_por?: 'verificador' | 'postulante' | null;
  horario_estado:
    | 'sin_propuesta'
    | 'pendiente_postulante'
    | 'pendiente_verificador'
    | 'confirmado';
  visita_programada_at?: string | null;
  motivo_reagenda?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  horarios_declarados?: Array<{ dia?: string; hora?: string }>;
};

interface Props {
  onUpdated?: () => Promise<unknown> | unknown;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function VisitCoordinationCard({ onUpdated }: Props) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 620;
  const [data, setData] = useState<Coordinacion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showChangePicker, setShowChangePicker] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(
        `${API_URL}/voluntarios/me/coordinacion-visita`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(response.data);
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        setFeedback({
          type: 'error',
          message: error?.response?.data?.detail || 'No pudimos consultar la visita.',
        });
      }
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (
    respuesta: 'confirmar' | 'proponer_cambio',
    horario?: string,
    motivo?: string,
  ) => {
    if (!token) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await axios.patch(
        `${API_URL}/voluntarios/me/coordinacion-visita/responder`,
        {
          respuesta,
          horario,
          motivo,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setFeedback({ type: 'success', message: response.data.mensaje });
      setShowChangePicker(false);
      await load();
      await onUpdated?.();
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.response?.data?.detail || 'No pudimos guardar tu respuesta.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ padding: 18, alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (!data) return null;

  const proposedDate = data.horario_propuesto_at;
  const confirmed = data.horario_estado === 'confirmado';
  const visitStarted = Boolean(data.check_in_at);

  return (
    <>
      <View style={{
        marginTop: 18,
        padding: isMobile ? 16 : 19,
        borderRadius: 18,
        backgroundColor: confirmed ? '#EAF7F6' : COLORS.card,
        borderWidth: 1,
        borderColor: confirmed ? '#D0ECE8' : COLORS.border,
        gap: 11,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{
            width: 38,
            height: 38,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: confirmed ? COLORS.white : '#FFF2E7',
          }}>
            <Ionicons name="calendar-outline" size={20} color={confirmed ? COLORS.accent : COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textDark, fontSize: 15, fontWeight: '900' }}>
              {data.check_out_at
                ? 'La visita fue realizada'
                : visitStarted
                  ? 'La visita está en curso'
                  : confirmed
                    ? 'Tu visita está programada'
                    : 'Coordinación de la visita'}
            </Text>
            <Text style={{ marginTop: 2, color: COLORS.textLight, fontSize: 11 }}>
              {data.asociacion_nombre} · {data.verificador_nombre}
            </Text>
          </View>
        </View>

        {proposedDate ? (
          <Text style={{ color: COLORS.textDark, fontSize: 15, fontWeight: '800', lineHeight: 22 }}>
            {formatDate(proposedDate)}
          </Text>
        ) : (
          <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
            La persona verificadora aceptó la visita. En cuanto proponga una fecha podrás confirmarla desde aquí.
          </Text>
        )}

        {data.horario_estado === 'pendiente_postulante' && (
          <>
            <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
              ¿Este horario te funciona?
            </Text>
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 9 }}>
              <TouchableOpacity
                onPress={() => setShowChangePicker(true)}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: COLORS.primary,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: COLORS.primary, fontWeight: '800' }}>
                  Necesito otro horario
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => respond('confirmar')}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  borderRadius: 13,
                  backgroundColor: COLORS.accent,
                  alignItems: 'center',
                  opacity: isSubmitting ? 0.65 : 1,
                }}
              >
                {isSubmitting
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={{ color: COLORS.white, fontWeight: '800' }}>Confirmar horario</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {data.horario_estado === 'pendiente_verificador' && (
          <View style={{ padding: 12, borderRadius: 13, backgroundColor: COLORS.white, gap: 5 }}>
            <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '800' }}>
              Tu propuesta fue enviada
            </Text>
            <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
              Esperaremos que {data.verificador_nombre} confirme el nuevo horario.
            </Text>
          </View>
        )}

        {confirmed && !visitStarted && (
          <>
            <Text style={{ color: COLORS.accent, fontSize: 12, fontWeight: '800' }}>
              Ambas partes confirmaron este horario.
            </Text>
            <TouchableOpacity
              onPress={() => setShowChangePicker(true)}
              style={{
                alignSelf: isMobile ? 'stretch' : 'flex-start',
                paddingHorizontal: 15,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.primary,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.primary, fontWeight: '800' }}>
                Necesito reagendar
              </Text>
            </TouchableOpacity>
          </>
        )}

        {visitStarted && !data.check_out_at && (
          <View style={{ padding: 12, borderRadius: 13, backgroundColor: COLORS.white, gap: 5 }}>
            <Text style={{ color: COLORS.accent, fontSize: 12, fontWeight: '900' }}>
              La persona verificadora ya llegó
            </Text>
            <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
              Está realizando la revisión del hogar. La asociación también puede consultar este avance.
            </Text>
          </View>
        )}

        {!!data.check_out_at && (
          <View style={{ padding: 12, borderRadius: 13, backgroundColor: COLORS.white, gap: 5 }}>
            <Text style={{ color: COLORS.accent, fontSize: 12, fontWeight: '900' }}>
              La visita terminó
            </Text>
            <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
              La persona verificadora está registrando el resultado final.
            </Text>
          </View>
        )}

        {!!feedback && (
          <Text style={{
            padding: 10,
            borderRadius: 11,
            color: feedback.type === 'success' ? COLORS.accent : COLORS.danger,
            backgroundColor: feedback.type === 'success' ? '#FFFFFF' : '#FFF1EF',
            fontSize: 11,
            lineHeight: 17,
          }}>
            {feedback.message}
          </Text>
        )}
      </View>

      <SchedulePickerModal
        visible={showChangePicker}
        title={confirmed ? 'Reagendar visita' : 'Proponer otro horario'}
        description="La persona verificadora recibirá tu propuesta y deberá confirmarla."
        horariosDeclarados={data.horarios_declarados}
        requireReason
        isSubmitting={isSubmitting}
        submitLabel="Enviar propuesta"
        onClose={() => setShowChangePicker(false)}
        onSubmit={(horario, motivo) => respond('proponer_cambio', horario, motivo)}
      />
    </>
  );
}
