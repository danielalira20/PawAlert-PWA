import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import {
  PostulacionItem,
  VoluntarioData,
} from '../../hooks/usePostulacionesAsociacion';
import { Toast, useToast } from '../Toast';
import { AssocLocationMap } from '../admin-dashboard/AssocLocationMap';

const COLORS = {
  primary: '#EC802B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  success: '#27AE60',
  warning: '#F39C12',
  cardBg: '#FAF3EA',
  border: '#F0E6D6',
};

type Candidato = {
  voluntario_id: string;
  nombre: string;
  distancia_km: number;
  tramo_distancia: 'preferente' | 'extendido';
  radio_max_km: number;
  disponibilidad?: {
    dias?: string[];
    franjas?: string[];
  };
  canal_contacto?: string;
};

type VerificationData = {
  id: string;
  estado: string;
  modalidad: 'por_definir' | 'presencial' | 'remota';
  distancia_asociacion_km?: number | null;
  resumen_expediente?: any;
  estado_coordenadas?: string;
  hogar?: {
    latitud?: number;
    longitud?: number;
    calle?: string;
    numero?: string;
    colonia?: string;
    municipio?: string;
    estado_ubicacion?: string;
    referencia?: string;
    identificacion_url?: string;
    video_recorrido_url?: string;
    horarios_visita?: Array<{ dia?: string; hora?: string }>;
  };
};

interface Props {
  postulacion: PostulacionItem;
  voluntario: VoluntarioData;
  onClose: () => void;
  onReject: () => void;
  onUpdated: () => void;
}

const ESTADOS: Record<string, string> = {
  pendiente_revision: 'Por revisar',
  pendiente_asignacion: 'Buscando verificador',
  visita_propuesta: 'Propuesta enviada',
  visita_programada: 'Visita programada',
  revision_remota: 'Revisión remota',
  reagendar: 'Por reagendar',
  requiere_cambios: 'Requiere cambios',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

function textList(values?: unknown[]) {
  if (!values?.length) return 'No especificado';
  return values.filter(Boolean).join(', ');
}

function InfoRow({ label, value }: { label: string; value: any }) {
  const visible =
    value === true || value === 'si'
      ? 'Sí'
      : value === false || value === 'no'
        ? 'No'
        : value;
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: COLORS.textLight, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '600', lineHeight: 18 }}>
        {visible ?? 'No especificado'}
      </Text>
    </View>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={{ padding: 16, borderRadius: 18, backgroundColor: COLORS.cardBg, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
        <Text style={{ flex: 1, color: COLORS.textDark, fontSize: 14, fontWeight: '800' }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function ExternalVerificationDetail({
  postulacion,
  voluntario,
  onClose,
  onReject,
  onUpdated,
}: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 760;
  const [verification, setVerification] = useState<VerificationData | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cargar = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/associations/me/postulaciones/${postulacion.id}/verificacion`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setVerification(data);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos abrir el expediente',
        description: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [postulacion.id, token]);

  const prepararVisita = async () => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      const { data } = await axios.patch(
        `${API_URL}/associations/me/postulaciones/${postulacion.id}`,
        { accion: 'aceptar' },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setCandidatos(data.candidatos || []);
      setVerification((actual) => actual ? {
        ...actual,
        estado: data.estado,
        modalidad: data.modalidad,
      } : actual);
      showToast({
        type: 'success',
        title: data.modalidad === 'remota' ? 'Revisión remota lista' : 'Encontramos verificadores',
        description: data.mensaje,
      });
      onUpdated();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos continuar',
        description: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const proponerVisita = async (candidato: Candidato) => {
    if (!token || !verification) return;
    setIsSubmitting(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/associations/me/verificaciones/${verification.id}/asignar`,
        { voluntario_id: candidato.voluntario_id },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setVerification((actual) => actual ? {
        ...actual,
        estado: data.estado,
        modalidad: 'presencial',
      } : actual);
      setCandidatos([]);
      showToast({
        type: 'success',
        title: 'Propuesta enviada',
        description: `Le preguntaremos a ${candidato.nombre} si puede realizar la visita.`,
      });
      onUpdated();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos enviar la propuesta',
        description: error?.response?.data?.detail || 'Intenta con otra persona.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ minHeight: 360, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.textLight }}>Preparando el expediente…</Text>
      </View>
    );
  }

  if (!verification) {
    return (
      <View style={{ minHeight: 320, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="document-text-outline" size={50} color={COLORS.textLight} />
        <Text style={{ marginTop: 14, color: COLORS.textDark, fontWeight: '700', textAlign: 'center' }}>
          No fue posible cargar esta verificación.
        </Text>
        <TouchableOpacity onPress={onClose} style={{ marginTop: 20 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const resumen = verification.resumen_expediente || {};
  const hogar = verification.hogar || {};
  const disponibilidad = resumen.disponibilidad || {};
  const movilidad = resumen.movilidad || {};
  const manejo = resumen.manejo_animal || {};
  const casa = resumen.hogar || {};
  const evidencias = resumen.evidencias || {};
  const alertas = resumen.alertas || [];

  return (
    <View style={{ flex: 1 }}>
      <Toast toast={toast} translateY={translateY} />
      <View style={{
        paddingHorizontal: isMobile ? 18 : 24,
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textDark, fontSize: isMobile ? 18 : 21, fontWeight: '900' }}>
            Expediente de casa temporal
          </Text>
          <Text style={{ marginTop: 3, color: COLORS.textLight, fontSize: 13 }}>
            {voluntario.nombre} {voluntario.apellido_paterno}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: '#FFF2E7' }}>
          <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '800' }}>
            {ESTADOS[verification.estado] || verification.estado}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          accessibilityLabel="Cerrar expediente"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.cardBg, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={21} color={COLORS.textDark} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: isMobile ? 16 : 24, gap: 18 }}>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 18, alignItems: 'flex-start' }}>
          <View style={{ width: isMobile ? '100%' : 285, gap: 14 }}>
            <SectionCard icon="location-outline" title="Ubicación y distancia">
              <InfoRow
                label="Zona del hogar"
                value={textList([hogar.colonia, hogar.municipio, hogar.estado_ubicacion])}
              />
              <InfoRow
                label="Distancia desde la asociación"
                value={
                  verification.distancia_asociacion_km != null
                    ? `${verification.distancia_asociacion_km} km`
                    : 'No disponible'
                }
              />
              {!!hogar.latitud && !!hogar.longitud && (
                <AssocLocationMap
                  latitud={hogar.latitud}
                  longitud={hogar.longitud}
                  radioKm={1}
                  height={170}
                />
              )}
            </SectionCard>

            <SectionCard icon="folder-open-outline" title="Evidencias recibidas">
              <InfoRow label="Identificación" value={evidencias.identificacion_recibida} />
              <InfoRow label="Video del hogar" value={evidencias.video_recibido} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {!!hogar.identificacion_url && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(hogar.identificacion_url!)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.white }}
                  >
                    <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>Ver identificación</Text>
                  </TouchableOpacity>
                )}
                {!!hogar.video_recorrido_url && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(hogar.video_recorrido_url!)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.white }}
                  >
                    <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>Ver recorrido</Text>
                  </TouchableOpacity>
                )}
              </View>
            </SectionCard>
          </View>

          <View style={{ flex: 1, width: '100%', gap: 14 }}>
            <SectionCard icon="time-outline" title="Disponibilidad y movilidad">
              <InfoRow label="Días" value={textList(disponibilidad.dias)} />
              <InfoRow label="Horarios" value={textList(disponibilidad.franjas)} />
              <InfoRow label="Tiempo de respuesta" value={disponibilidad.tiempo_reaccion} />
              <InfoRow
                label="Radio y transporte"
                value={`${movilidad.radio_max_km ? `${movilidad.radio_max_km} km` : 'Radio no especificado'} · ${textList(movilidad.medios_transporte)}`}
              />
            </SectionCard>

            <SectionCard icon="paw-outline" title="Experiencia declarada">
              <InfoRow label="Especies" value={textList(manejo.especies)} />
              <InfoRow label="Tamaños" value={textList(manejo.tamanios)} />
              <InfoRow label="Experiencia en campo" value={textList(manejo.experiencias_campo)} />
              <InfoRow label="Primeros auxilios" value={manejo.primeros_auxilios} />
            </SectionCard>

            <SectionCard icon="home-outline" title="Condiciones declaradas del hogar">
              <InfoRow label="Tipo de vivienda" value={resumen.ubicacion_hogar?.tipo_vivienda} />
              <InfoRow label="Dónde permanecería el animal" value={casa.ubicacion_animal} />
              <InfoRow label="Puede mantenerlo separado" value={casa.puede_aislar} />
              <InfoRow label="Tiempo que estaría solo" value={casa.horas_solo != null ? `${casa.horas_solo} horas` : null} />
              <InfoRow label="Especies que puede recibir" value={textList(casa.preferencia_especies)} />
            </SectionCard>

            {!!alertas.length && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#FFF7E8', borderWidth: 1, borderColor: '#F5D7A5', gap: 9 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="information-circle-outline" size={20} color={COLORS.warning} />
                  <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>Puntos para revisar</Text>
                </View>
                {alertas.map((alerta: any) => (
                  <Text key={alerta.clave} style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 19 }}>
                    • {alerta.texto}
                  </Text>
                ))}
              </View>
            )}

            {!!candidatos.length && (
              <View style={{ gap: 10 }}>
                <Text style={{ color: COLORS.textDark, fontSize: 16, fontWeight: '900' }}>
                  Verificadores disponibles
                </Text>
                <Text style={{ color: COLORS.textLight, fontSize: 13, lineHeight: 19 }}>
                  Se priorizan quienes están a 15 km o menos. La persona elegida todavía deberá aceptar la visita.
                </Text>
                {candidatos.map((candidato) => (
                  <View key={candidato.voluntario_id} style={{ padding: 15, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, gap: 10 }}>
                    <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.textDark, fontSize: 14, fontWeight: '800' }}>{candidato.nombre}</Text>
                        <Text style={{ marginTop: 3, color: COLORS.textLight, fontSize: 12 }}>
                          A {candidato.distancia_km} km · radio declarado de {candidato.radio_max_km} km
                        </Text>
                      </View>
                      {candidato.tramo_distancia === 'preferente' && (
                        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: '#E9F7F5' }}>
                          <Text style={{ color: COLORS.accent, fontSize: 10, fontWeight: '800' }}>Cercano</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => proponerVisita(candidato)}
                        disabled={isSubmitting}
                        style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center', opacity: isSubmitting ? 0.65 : 1 }}
                      >
                        <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '800' }}>Proponer visita</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {verification.estado === 'revision_remota' && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#EAF7F6', gap: 6 }}>
                <Text style={{ color: COLORS.accent, fontWeight: '900' }}>La revisión será remota</Text>
                <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 19 }}>
                  No encontramos verificadores dentro de su radio de desplazamiento. La asociación puede continuar con el video, la identificación y las respuestas del expediente.
                </Text>
              </View>
            )}

            {verification.estado === 'visita_propuesta' && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#EAF7F6', gap: 6 }}>
                <Text style={{ color: COLORS.accent, fontWeight: '900' }}>Propuesta enviada</Text>
                <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 19 }}>
                  Estamos esperando que la persona voluntaria confirme si puede realizar la visita.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {verification.estado === 'pendiente_revision' && (
        <View style={{
          padding: isMobile ? 16 : 20,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          flexDirection: isMobile ? 'column-reverse' : 'row',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <TouchableOpacity
            onPress={onReject}
            disabled={isSubmitting}
            style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.danger, alignItems: 'center' }}
          >
            <Text style={{ color: COLORS.danger, fontWeight: '800' }}>No continuar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={prepararVisita}
            disabled={isSubmitting}
            style={{ minWidth: isMobile ? undefined : 220, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', opacity: isSubmitting ? 0.7 : 1 }}
          >
            {isSubmitting
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={{ color: COLORS.white, fontWeight: '800' }}>Buscar verificador cercano</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
