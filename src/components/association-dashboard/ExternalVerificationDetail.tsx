import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  candidatos?: Candidato[];
  distancia_asociacion_km?: number | null;
  resumen_expediente?: any;
  analisis_video?: {
    observabilidad?: 'completa' | 'parcial' | 'insuficiente';
    resumen_breve?: string;
    areas_observadas?: string[];
    caracteristicas_visibles?: string[];
    condiciones_aparentes?: string[];
    riesgos_aparentes?: string[];
    otros_animales_visibles?: string[];
    espacios_aislamiento_visibles?: string[];
    puntos_no_observados?: string[];
    evidencias_temporales?: Array<{
      momento?: string;
      observacion?: string;
    }>;
    advertencia?: string;
  } | null;
  analisis_video_estado?:
    | 'pendiente'
    | 'procesando'
    | 'completado'
    | 'fallido'
    | 'sin_video'
    | 'no_configurado';
  analisis_video_error?: string | null;
  estado_coordenadas?:
    | 'pendiente'
    | 'procesando'
    | 'coincide'
    | 'imprecisa'
    | 'discrepancia'
    | 'sin_metadatos'
    | 'sin_video'
    | 'fallida';
  distancia_coordenadas_m?: number | null;
  coordenadas_fuente?: string | null;
  coordenadas_detalle?: {
    mensaje?: string;
  };
  motivo_resultado?: string | null;
  asignacion_actual?: {
    id: string;
    verificador_voluntario_id: string;
    verificador_nombre?: string;
    distancia_km: number;
    estado: 'propuesta' | 'aceptada' | 'rechazada' | 'cancelada' | 'completada' | 'expirada';
    propuesta_at?: string;
    respondida_at?: string | null;
    visita_programada_at?: string | null;
    motivo_rechazo?: string | null;
    horario_propuesto_at?: string | null;
    horario_propuesto_por?: 'verificador' | 'postulante' | null;
    horario_estado?:
      | 'sin_propuesta'
      | 'pendiente_postulante'
      | 'pendiente_verificador'
      | 'confirmado';
    horario_respondido_at?: string | null;
    motivo_reagenda?: string | null;
    check_in_at?: string | null;
    check_out_at?: string | null;
    check_in_distancia_m?: number | null;
    checklist?: Record<string, string> | null;
    notas_visita?: string | null;
    resultado_visita?: 'aprobar' | 'solicitar_ajustes' | 'rechazar' | null;
    motivo_resultado_visita?: string | null;
    resultado_at?: string | null;
  } | null;
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
  visita_aceptada: 'Visita aceptada',
  coordinando_visita: 'Coordinando visita',
  visita_programada: 'Visita programada',
  visita_en_curso: 'Visita en curso',
  visita_realizada: 'Visita realizada',
  revision_remota: 'Revisión remota',
  reagendar: 'Por reagendar',
  requiere_cambios: 'Requiere cambios',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

const CHECKLIST_VISITA_LABELS: Record<string, string> = {
  identidad_coincide: 'La identidad no coincide',
  espacio_coincide_video: 'El espacio no coincide con el recorrido',
  accesos_seguros: 'Los accesos necesitan atención',
  cierres_perimetrales: 'Las bardas, rejas o límites necesitan atención',
  ventanas_balcones: 'Las ventanas o balcones necesitan protección',
  espacio_aislamiento: 'No se comprobó un espacio adecuado de aislamiento',
  higiene_ventilacion: 'La higiene o ventilación necesita atención',
  convivencia_hogar: 'La convivencia del hogar necesita medidas adicionales',
  autorizacion_vivienda: 'No se comprobó autorización para recibir animales',
};

function textList(values?: unknown[]) {
  if (!values?.length) return 'No especificado';
  return values.filter(Boolean).join(', ');
}

function lowerText(value: string) {
  return value.toLocaleLowerCase('es-MX');
}

function joinNatural(values?: unknown[]) {
  const items = (values || []).filter(Boolean).map(String);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

function buildApplicationSummary({
  nombre,
  verification,
  hogar,
  disponibilidad,
  movilidad,
  manejo,
  casa,
  evidencias,
}: {
  nombre: string;
  verification: VerificationData;
  hogar: NonNullable<VerificationData['hogar']>;
  disponibilidad: any;
  movilidad: any;
  manejo: any;
  casa: any;
  evidencias: any;
}) {
  const paragraphs: string[] = [];
  const distance = verification.distancia_asociacion_km;
  const days = joinNatural(disponibilidad.dias);
  const timeSlots = joinNatural(disponibilidad.franjas);
  const reaction = disponibilidad.tiempo_reaccion;

  const locationSentence = distance != null
    ? `${nombre} se encuentra a ${distance} km de la asociación.`
    : `${nombre} registró la ubicación de su casa temporal.`;
  const availabilityParts = [
    days ? `declaró disponibilidad los días ${lowerText(days)}` : '',
    timeSlots ? `principalmente en horario ${lowerText(timeSlots)}` : '',
    reaction ? `con ${lowerText(reaction)}` : '',
  ].filter(Boolean);
  paragraphs.push(
    availabilityParts.length
      ? `${locationSentence} ${availabilityParts.join(', ')}.`
      : locationSentence,
  );

  const mobilityParts: string[] = [];
  if (movilidad.radio_max_km) {
    mobilityParts.push(`Puede desplazarse hasta ${movilidad.radio_max_km} km`);
  }
  const transport = joinNatural(movilidad.medios_transporte);
  if (transport) {
    mobilityParts.push(`suele utilizar ${lowerText(transport)}`);
  }
  if (movilidad.vehiculo_apto_traslado) {
    mobilityParts.push('cuenta con una unidad apta para trasladar animales');
  }
  if (mobilityParts.length) {
    paragraphs.push(`${mobilityParts.join(' y ')}.`);
  }

  const species = joinNatural(manejo.especies);
  const sizes = joinNatural(manejo.tamanios);
  const fieldExperience = joinNatural(manejo.experiencias_campo);
  let experienceText = species
    ? `Declaró experiencia con ${lowerText(species)}`
    : '';
  if (sizes) {
    experienceText += experienceText
      ? `, incluidos animales de tamaños ${lowerText(sizes)}`
      : `Indicó que puede manejar animales de tamaños ${lowerText(sizes)}`;
  }
  if (experienceText) {
    experienceText += '.';
  }
  if (fieldExperience) {
    experienceText += `${experienceText ? ' ' : ''}Su experiencia en campo incluye ${lowerText(fieldExperience)}.`;
  }
  if (experienceText) {
    paragraphs.push(experienceText);
  }

  const homeParts: string[] = [];
  if (
    casa.puede_aislar === 'si'
    || casa.condiciones_declaradas?.espacio_aislamiento === true
  ) {
    homeParts.push('cuenta con un espacio para mantener al animal separado');
  }
  if (casa.acepta_visita === 'si') {
    homeParts.push('acepta una visita de verificación');
  } else if (casa.acepta_visita === 'no') {
    homeParts.push('indicó que no acepta una visita de verificación');
  }
  if (homeParts.length) {
    paragraphs.push(`La vivienda ${joinNatural(homeParts)}.`);
  }

  const evidenceLabels = [
    evidencias.identificacion_recibida ? 'identificación' : '',
    evidencias.video_recibido ? 'video del hogar' : '',
    hogar.latitud != null && hogar.longitud != null ? 'ubicación declarada' : '',
  ].filter(Boolean);

  let modality = 'Aún por definir; primero se buscará una persona verificadora cercana.';
  if (verification.modalidad === 'presencial') {
    if (verification.estado === 'visita_propuesta') {
      modality = 'Presencial; la propuesta de visita está esperando confirmación.';
    } else if (verification.estado === 'visita_aceptada') {
      modality = 'Presencial; la persona verificadora aceptó y falta coordinar el horario.';
    } else if (verification.estado === 'coordinando_visita') {
      modality = 'Presencial; las partes están acordando la fecha y hora.';
    } else if (verification.estado === 'visita_programada') {
      modality = 'Presencial; la fecha y hora ya fueron confirmadas.';
    } else {
      modality = 'Presencial.';
    }
  } else if (verification.modalidad === 'remota') {
    modality = 'Remota; no se encontraron verificadores disponibles dentro de su radio de desplazamiento.';
  }

  return {
    paragraphs,
    evidence: evidenceLabels.length ? joinNatural(evidenceLabels) : 'Ninguna evidencia registrada',
    modality,
  };
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

function BulletList({ title, values }: { title: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: COLORS.textDark, fontSize: 12, fontWeight: '800' }}>
        {title}
      </Text>
      {values.map((value, index) => (
        <Text
          key={`${index}-${value}`}
          style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}
        >
          • {value}
        </Text>
      ))}
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
  const [isRetryingAnalysis, setIsRetryingAnalysis] = useState(false);
  const [decisionModal, setDecisionModal] = useState<'aprobar' | 'evidencia' | null>(null);
  const [motivoEvidencia, setMotivoEvidencia] = useState('');

  const cargar = async (silencioso = false) => {
    if (!token) return;
    if (!silencioso) setIsLoading(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/associations/me/postulaciones/${postulacion.id}/verificacion`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setVerification(data);
      setCandidatos(data.candidatos || []);
    } catch (error: any) {
      if (!silencioso) {
        showToast({
          type: 'error',
          title: 'No pudimos abrir el expediente',
          message: error?.response?.data?.detail || 'Intenta nuevamente.',
        });
      }
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [postulacion.id, token]);

  useEffect(() => {
    if (verification?.analisis_video_estado !== 'procesando') return;
    const interval = setInterval(() => {
      cargar(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [verification?.analisis_video_estado, postulacion.id, token]);

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
        message: data.mensaje,
      });
      onUpdated();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos continuar',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
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
        asignacion_actual: {
          id: data.asignacion_id,
          verificador_voluntario_id: candidato.voluntario_id,
          verificador_nombre: candidato.nombre,
          distancia_km: candidato.distancia_km,
          estado: 'propuesta',
        },
      } : actual);
      setCandidatos([]);
      showToast({
        type: 'success',
        title: 'Propuesta enviada',
        message: `Le preguntaremos a ${candidato.nombre} si puede realizar la visita.`,
      });
      onUpdated();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos enviar la propuesta',
        message: error?.response?.data?.detail || 'Intenta con otra persona.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const reintentarAnalisis = async () => {
    if (!token || !verification) return;
    setIsRetryingAnalysis(true);
    try {
      await axios.post(
        `${API_URL}/associations/me/verificaciones/${verification.id}/reintentar-analisis`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setVerification((actual) => actual ? {
        ...actual,
        analisis_video_estado: 'procesando',
        estado_coordenadas: 'procesando',
        analisis_video_error: null,
      } : actual);
      showToast({
        type: 'success',
        title: 'Análisis solicitado',
        message: 'Puedes continuar revisando el expediente mientras se procesa.',
      });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos reintentar',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsRetryingAnalysis(false);
    }
  };

  const resolverRevisionRemota = async (
    decision: 'aprobar' | 'solicitar_evidencia',
  ) => {
    if (!token || !verification) return;
    if (decision === 'solicitar_evidencia' && !motivoEvidencia.trim()) {
      showToast({
        type: 'error',
        title: 'Cuéntale qué hace falta',
        message: 'Escribe una indicación breve para que pueda enviar la evidencia correcta.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data } = await axios.patch(
        `${API_URL}/associations/me/verificaciones/${verification.id}/resolver-remota`,
        {
          decision,
          motivo: decision === 'solicitar_evidencia'
            ? motivoEvidencia.trim()
            : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setVerification((actual) => actual ? {
        ...actual,
        estado: data.estado,
        motivo_resultado: decision === 'solicitar_evidencia'
          ? motivoEvidencia.trim()
          : actual.motivo_resultado,
      } : actual);
      setDecisionModal(null);
      setMotivoEvidencia('');
      showToast({
        type: 'success',
        title: decision === 'aprobar' ? 'Casa temporal aprobada' : 'Solicitud enviada',
        message: data.mensaje,
      });
      await onUpdated();
      if (decision === 'aprobar') onClose();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos guardar la decisión',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
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
  const videoAnalysis = verification.analisis_video;
  const videoAnalysisState = verification.analisis_video_estado || 'pendiente';
  const coordinatesState = verification.estado_coordenadas || 'pendiente';
  const applicationSummary = buildApplicationSummary({
    nombre: voluntario.nombre,
    verification,
    hogar,
    disponibilidad,
    movilidad,
    manejo,
    casa,
    evidencias,
  });

  return (
    <View style={{ flex: 1 }}>
      <Toast toast={toast} translateY={translateY} />
      <View style={{
        paddingHorizontal: isMobile ? 18 : 24,
        paddingRight: 56,
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
      </View>

      <ScrollView contentContainerStyle={{ padding: isMobile ? 16 : 24, gap: 18 }}>
        <View
          style={{
            padding: isMobile ? 17 : 20,
            borderRadius: 20,
            backgroundColor: '#EAF7F6',
            borderWidth: 1,
            borderColor: '#D2EEEB',
            gap: 11,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: COLORS.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="document-text-outline" size={19} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textDark, fontSize: 15, fontWeight: '900' }}>
                Resumen de la postulación
              </Text>
              <Text style={{ marginTop: 2, color: COLORS.textLight, fontSize: 11 }}>
                Síntesis de la información declarada
              </Text>
            </View>
          </View>

          <View style={{ gap: 7 }}>
            {applicationSummary.paragraphs.map((paragraph, index) => (
              <Text
                key={`${index}-${paragraph}`}
                style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 20 }}
              >
                {paragraph}
              </Text>
            ))}
          </View>

          <View
            style={{
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: '#C9E7E3',
              gap: 5,
            }}
          >
            <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
              <Text style={{ fontWeight: '800' }}>Evidencias recibidas: </Text>
              {applicationSummary.evidence}.
            </Text>
            <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
              <Text style={{ fontWeight: '800' }}>Modalidad de verificación: </Text>
              {applicationSummary.modality}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: isMobile ? 'column' : 'row',
            gap: 18,
            alignItems: 'stretch',
          }}
        >
          <View
            style={{
              flex: 1,
              padding: isMobile ? 17 : 20,
              borderRadius: 20,
              backgroundColor: COLORS.cardBg,
              borderWidth: 1,
              borderColor: COLORS.border,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: '#FFF2E7',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="sparkles-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textDark, fontSize: 15, fontWeight: '900' }}>
                  Observaciones automáticas del recorrido
                </Text>
                <Text style={{ marginTop: 2, color: COLORS.textLight, fontSize: 11 }}>
                  Apoyo previo para la revisión humana
                </Text>
              </View>
              {videoAnalysisState === 'completado' && videoAnalysis?.observabilidad && (
                <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: '#EAF7F6' }}>
                  <Text style={{ color: COLORS.accent, fontSize: 10, fontWeight: '800', textTransform: 'capitalize' }}>
                    Vista {videoAnalysis.observabilidad}
                  </Text>
                </View>
              )}
            </View>

            {videoAnalysisState === 'pendiente' && (
              <View style={{ gap: 10 }}>
                <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                  El recorrido está listo para generar observaciones. Puedes iniciar el análisis sin detener la revisión del expediente.
                </Text>
                <TouchableOpacity
                  onPress={reintentarAnalisis}
                  disabled={isRetryingAnalysis}
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: COLORS.white,
                    borderWidth: 1,
                    borderColor: COLORS.primary,
                    opacity: isRetryingAnalysis ? 0.65 : 1,
                  }}
                >
                  <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '800' }}>
                    {isRetryingAnalysis ? 'Iniciando…' : 'Iniciar análisis'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {videoAnalysisState === 'procesando' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={{ flex: 1, color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                  Estamos revisando el recorrido. Puedes continuar con el resto del expediente.
                </Text>
              </View>
            )}

            {videoAnalysisState === 'completado' && videoAnalysis && (
              <>
                {!!videoAnalysis.resumen_breve && (
                  <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 20 }}>
                    {videoAnalysis.resumen_breve}
                  </Text>
                )}
                <BulletList title="Áreas observadas" values={videoAnalysis.areas_observadas} />
                <BulletList title="Características visibles" values={videoAnalysis.caracteristicas_visibles} />
                <BulletList title="Condiciones aparentes" values={videoAnalysis.condiciones_aparentes} />
                <BulletList title="Riesgos que conviene revisar" values={videoAnalysis.riesgos_aparentes} />
                <BulletList title="Otros animales visibles" values={videoAnalysis.otros_animales_visibles} />
                <BulletList title="Espacios de aislamiento visibles" values={videoAnalysis.espacios_aislamiento_visibles} />
                <BulletList title="Lo que no se alcanzó a observar" values={videoAnalysis.puntos_no_observados} />
                {!!videoAnalysis.evidencias_temporales?.length && (
                  <View style={{ gap: 5 }}>
                    <Text style={{ color: COLORS.textDark, fontSize: 12, fontWeight: '800' }}>
                      Momentos de referencia
                    </Text>
                    {videoAnalysis.evidencias_temporales.map((evidence, index) => (
                      <Text
                        key={`${index}-${evidence.momento}`}
                        style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}
                      >
                        • {evidence.momento || 'Sin tiempo'} — {evidence.observacion}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}

            {videoAnalysisState === 'sin_video' && (
              <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                No se recibió un recorrido en video. La asociación puede continuar con las demás evidencias.
              </Text>
            )}

            {(videoAnalysisState === 'fallido' || videoAnalysisState === 'no_configurado') && (
              <View style={{ gap: 10 }}>
                <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                  {videoAnalysisState === 'no_configurado'
                    ? 'Las observaciones automáticas todavía no están disponibles. El video puede revisarse manualmente.'
                    : verification.analisis_video_error || 'No fue posible analizar el recorrido automáticamente.'}
                </Text>
                <TouchableOpacity
                  onPress={reintentarAnalisis}
                  disabled={isRetryingAnalysis}
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: COLORS.white,
                    borderWidth: 1,
                    borderColor: COLORS.primary,
                    opacity: isRetryingAnalysis ? 0.65 : 1,
                  }}
                >
                  <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '800' }}>
                    {isRetryingAnalysis ? 'Solicitando…' : 'Reintentar análisis'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Text style={{ color: COLORS.textLight, fontSize: 10, lineHeight: 15 }}>
                Gemini genera observaciones de apoyo; la asociación o la persona verificadora toma la decisión.
              </Text>
            </View>
          </View>

          <View
            style={{
              width: isMobile ? '100%' : 285,
              padding: 17,
              borderRadius: 20,
              backgroundColor: COLORS.cardBg,
              borderWidth: 1,
              borderColor: COLORS.border,
              gap: 11,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Ionicons name="navigate-circle-outline" size={23} color={COLORS.primary} />
              <Text style={{ flex: 1, color: COLORS.textDark, fontSize: 14, fontWeight: '900' }}>
                Comprobación de ubicación
              </Text>
            </View>

            {(coordinatesState === 'pendiente' || coordinatesState === 'procesando') && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={{ flex: 1, color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                  Revisando los datos disponibles del video…
                </Text>
              </View>
            )}

            {coordinatesState === 'coincide' && (
              <>
                <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '900' }}>
                  Ubicación consistente
                </Text>
                <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                  Los metadatos del video corresponden con la ubicación declarada
                  {verification.distancia_coordenadas_m != null
                    ? `, con una diferencia aproximada de ${Math.round(verification.distancia_coordenadas_m)} m.`
                    : '.'}
                </Text>
              </>
            )}

            {coordinatesState === 'imprecisa' && (
              <>
                <Text style={{ color: COLORS.warning, fontSize: 13, fontWeight: '900' }}>
                  Coincidencia imprecisa
                </Text>
                <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                  La diferencia aproximada es de {Math.round(verification.distancia_coordenadas_m || 0)} m. Conviene confirmarla durante la revisión.
                </Text>
              </>
            )}

            {coordinatesState === 'discrepancia' && (
              <>
                <Text style={{ color: COLORS.danger, fontSize: 13, fontWeight: '900' }}>
                  Requiere revisión
                </Text>
                <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                  Los metadatos difieren aproximadamente {Math.round(verification.distancia_coordenadas_m || 0)} m de la ubicación declarada. Esto es una alerta, no un rechazo automático.
                </Text>
              </>
            )}

            {coordinatesState === 'sin_metadatos' && (
              <>
                <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '900' }}>
                  Sin datos de ubicación
                </Text>
                <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                  El video no conserva GPS. Es común cuando fue compartido o comprimido y no afecta automáticamente la postulación.
                </Text>
              </>
            )}

            {coordinatesState === 'sin_video' && (
              <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                No hay video disponible para comprobar sus metadatos.
              </Text>
            )}

            {coordinatesState === 'fallida' && (
              <>
                <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                  No fue posible revisar la ubicación del video. La evidencia puede evaluarse manualmente.
                </Text>
                <TouchableOpacity
                  onPress={reintentarAnalisis}
                  disabled={isRetryingAnalysis}
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: COLORS.white,
                    borderWidth: 1,
                    borderColor: COLORS.primary,
                    opacity: isRetryingAnalysis ? 0.65 : 1,
                  }}
                >
                  <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '800' }}>
                    Reintentar comprobación
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={{ color: COLORS.textLight, fontSize: 10, lineHeight: 15 }}>
              Coincidencia = señal positiva · ausencia = neutral · diferencia = punto para revisar.
            </Text>
          </View>
        </View>

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

            {verification.estado === 'requiere_cambios' && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F5DCA7', gap: 7 }}>
                <Text style={{ color: COLORS.warning, fontWeight: '900' }}>Esperando un nuevo recorrido</Text>
                <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 19 }}>
                  {verification.motivo_resultado || 'La asociación solicitó evidencia adicional al postulante.'}
                </Text>
                <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
                  El resto del expediente permanece guardado. Cuando envíe el video, volverá automáticamente a revisión remota.
                </Text>
              </View>
            )}

            {verification.estado === 'visita_propuesta' && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#EAF7F6', gap: 6 }}>
                <Text style={{ color: COLORS.accent, fontWeight: '900' }}>Propuesta enviada</Text>
                <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 19 }}>
                  {verification.asignacion_actual?.verificador_nombre
                    ? `Estamos esperando que ${verification.asignacion_actual.verificador_nombre} confirme si puede realizar la visita.`
                    : 'Estamos esperando que la persona voluntaria confirme si puede realizar la visita.'}
                </Text>
              </View>
            )}

            {verification.estado === 'visita_aceptada' && (
              <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#EAF7F6', borderWidth: 1, borderColor: '#D0ECE8', gap: 7 }}>
                <Text style={{ color: COLORS.accent, fontWeight: '900' }}>La visita fue aceptada</Text>
                <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 19 }}>
                  {verification.asignacion_actual?.verificador_nombre || 'La persona verificadora'} aceptó apoyar. El siguiente paso será coordinar fecha y hora con el postulante.
                </Text>
              </View>
            )}

            {['coordinando_visita', 'visita_programada'].includes(verification.estado) &&
              verification.asignacion_actual && (
                <View style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: verification.estado === 'visita_programada' ? '#EAF7F6' : '#FFF7E6',
                  borderWidth: 1,
                  borderColor: verification.estado === 'visita_programada' ? '#D0ECE8' : '#F5DCA7',
                  gap: 7,
                }}>
                  <Text style={{
                    color: verification.estado === 'visita_programada' ? COLORS.accent : COLORS.warning,
                    fontWeight: '900',
                  }}>
                    {verification.estado === 'visita_programada'
                      ? 'Visita programada'
                      : 'Coordinando fecha y hora'}
                  </Text>
                  {!!verification.asignacion_actual.horario_propuesto_at && (
                    <Text style={{ color: COLORS.textDark, fontSize: 14, fontWeight: '800' }}>
                      {new Date(verification.asignacion_actual.horario_propuesto_at)
                        .toLocaleString('es-MX', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                    </Text>
                  )}
                  <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                    {verification.asignacion_actual.horario_estado === 'pendiente_postulante'
                      ? `Esperando la respuesta de ${voluntario.nombre}.`
                      : verification.asignacion_actual.horario_estado === 'pendiente_verificador'
                        ? `Esperando la respuesta de ${verification.asignacion_actual.verificador_nombre || 'la persona verificadora'}.`
                        : 'El horario fue confirmado por ambas partes.'}
                  </Text>
                  {!!verification.asignacion_actual.motivo_reagenda &&
                    verification.asignacion_actual.horario_estado !== 'confirmado' && (
                      <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
                        Motivo del cambio: {verification.asignacion_actual.motivo_reagenda}
                      </Text>
                    )}
                </View>
              )}

            {['visita_en_curso', 'visita_realizada', 'aprobada', 'requiere_cambios', 'rechazada'].includes(verification.estado) &&
              verification.asignacion_actual?.check_in_at && (
                <View style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: verification.estado === 'visita_en_curso' ? '#FFF7E6' : '#EAF7F6',
                  borderWidth: 1,
                  borderColor: verification.estado === 'visita_en_curso' ? '#F5DCA7' : '#D0ECE8',
                  gap: 9,
                }}>
                  <Text style={{
                    color: verification.estado === 'visita_en_curso' ? COLORS.warning : COLORS.accent,
                    fontWeight: '900',
                  }}>
                    {verification.estado === 'visita_en_curso'
                      ? 'La visita está en curso'
                      : verification.estado === 'visita_realizada'
                        ? 'La visita terminó'
                        : 'Resultado de la visita'}
                  </Text>
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                    <View style={{ flex: 1, padding: 11, borderRadius: 13, backgroundColor: COLORS.white }}>
                      <Text style={{ color: COLORS.textLight, fontSize: 10, fontWeight: '800' }}>LLEGADA</Text>
                      <Text style={{ marginTop: 3, color: COLORS.textDark, fontSize: 12, fontWeight: '800' }}>
                        {new Date(verification.asignacion_actual.check_in_at).toLocaleString('es-MX')}
                      </Text>
                      {verification.asignacion_actual.check_in_distancia_m != null && (
                        <Text style={{ marginTop: 3, color: COLORS.textLight, fontSize: 10 }}>
                          Aprox. a {Math.round(verification.asignacion_actual.check_in_distancia_m)} m del hogar
                        </Text>
                      )}
                    </View>
                    {!!verification.asignacion_actual.check_out_at && (
                      <View style={{ flex: 1, padding: 11, borderRadius: 13, backgroundColor: COLORS.white }}>
                        <Text style={{ color: COLORS.textLight, fontSize: 10, fontWeight: '800' }}>SALIDA</Text>
                        <Text style={{ marginTop: 3, color: COLORS.textDark, fontSize: 12, fontWeight: '800' }}>
                          {new Date(verification.asignacion_actual.check_out_at).toLocaleString('es-MX')}
                        </Text>
                      </View>
                    )}
                  </View>
                  {!!verification.asignacion_actual.checklist?.completado_at && (
                    <View style={{ gap: 5 }}>
                      <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                        La persona verificadora completó los nueve puntos de la revisión presencial.
                      </Text>
                      {Object.entries(verification.asignacion_actual.checklist)
                        .filter(([, value]) => value === 'no_cumple')
                        .map(([key]) => (
                          <Text key={key} style={{ color: COLORS.danger, fontSize: 11, lineHeight: 17 }}>
                            • {CHECKLIST_VISITA_LABELS[key] || key}
                          </Text>
                        ))}
                    </View>
                  )}
                  {!!verification.asignacion_actual.notas_visita && (
                    <View style={{ padding: 11, borderRadius: 13, backgroundColor: COLORS.white, gap: 4 }}>
                      <Text style={{ color: COLORS.textLight, fontSize: 10, fontWeight: '800' }}>NOTAS DE LA VISITA</Text>
                      <Text style={{ color: COLORS.textDark, fontSize: 11, lineHeight: 17 }}>
                        {verification.asignacion_actual.notas_visita}
                      </Text>
                    </View>
                  )}
                  {!!verification.asignacion_actual.resultado_visita && (
                    <View style={{ padding: 11, borderRadius: 13, backgroundColor: COLORS.white, gap: 4 }}>
                      <Text style={{ color: COLORS.textLight, fontSize: 10, fontWeight: '800' }}>RESULTADO</Text>
                      <Text style={{
                        color: verification.asignacion_actual.resultado_visita === 'aprobar'
                          ? COLORS.accent
                          : verification.asignacion_actual.resultado_visita === 'solicitar_ajustes'
                            ? COLORS.warning
                            : COLORS.danger,
                        fontSize: 12,
                        fontWeight: '900',
                      }}>
                        {verification.asignacion_actual.resultado_visita === 'aprobar'
                          ? 'Hogar aprobado'
                          : verification.asignacion_actual.resultado_visita === 'solicitar_ajustes'
                            ? 'Se solicitaron ajustes'
                            : 'Hogar no aprobado'}
                      </Text>
                      {!!verification.asignacion_actual.motivo_resultado_visita && (
                        <Text style={{ color: COLORS.textDark, fontSize: 11, lineHeight: 17 }}>
                          {verification.asignacion_actual.motivo_resultado_visita}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

            {verification.estado === 'pendiente_asignacion' &&
              verification.asignacion_actual?.estado === 'rechazada' && (
                <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F5DCA7', gap: 7 }}>
                  <Text style={{ color: COLORS.warning, fontWeight: '900' }}>Necesitamos buscar a otra persona</Text>
                  <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 19 }}>
                    {verification.asignacion_actual.verificador_nombre || 'La persona seleccionada'} no pudo realizar la visita.
                  </Text>
                  {!!verification.asignacion_actual.motivo_rechazo && (
                    <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                      Motivo: {verification.asignacion_actual.motivo_rechazo}
                    </Text>
                  )}
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

      {verification.estado === 'pendiente_asignacion' && !candidatos.length && (
        <View style={{
          padding: isMobile ? 16 : 20,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          backgroundColor: COLORS.white,
        }}>
          <TouchableOpacity
            onPress={prepararVisita}
            disabled={isSubmitting}
            style={{ minWidth: isMobile ? undefined : 220, flex: isMobile ? 1 : undefined, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', opacity: isSubmitting ? 0.7 : 1 }}
          >
            {isSubmitting
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={{ color: COLORS.white, fontWeight: '800' }}>Buscar otra persona</Text>}
          </TouchableOpacity>
        </View>
      )}

      {verification.estado === 'revision_remota' && (
        <View style={{
          padding: isMobile ? 16 : 20,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          flexDirection: isMobile ? 'column-reverse' : 'row',
          justifyContent: 'flex-end',
          gap: 10,
          backgroundColor: COLORS.white,
        }}>
          <TouchableOpacity
            onPress={onReject}
            disabled={isSubmitting}
            style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.danger, alignItems: 'center' }}
          >
            <Text style={{ color: COLORS.danger, fontWeight: '800' }}>No aprobar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDecisionModal('evidencia')}
            disabled={isSubmitting}
            style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.warning, backgroundColor: '#FFF9EE', alignItems: 'center' }}
          >
            <Text style={{ color: COLORS.warning, fontWeight: '800' }}>Solicitar nueva evidencia</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDecisionModal('aprobar')}
            disabled={isSubmitting}
            style={{ minWidth: isMobile ? undefined : 190, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: 'center', opacity: isSubmitting ? 0.7 : 1 }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '800' }}>Aprobar casa temporal</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={decisionModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !isSubmitting && setDecisionModal(null)}
      >
        <View style={{ flex: 1, padding: 20, backgroundColor: 'rgba(38, 29, 22, 0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '100%', maxWidth: 460, padding: isMobile ? 20 : 26, borderRadius: 24, backgroundColor: COLORS.white, gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: decisionModal === 'aprobar' ? '#EAF7F6' : '#FFF7E6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons
                name={decisionModal === 'aprobar' ? 'checkmark-circle-outline' : 'videocam-outline'}
                size={27}
                color={decisionModal === 'aprobar' ? COLORS.accent : COLORS.warning}
              />
            </View>
            <Text style={{ color: COLORS.textDark, fontSize: 20, fontWeight: '900' }}>
              {decisionModal === 'aprobar'
                ? '¿Aprobar esta casa temporal?'
                : 'Solicitar un nuevo recorrido'}
            </Text>
            <Text style={{ color: COLORS.textLight, fontSize: 13, lineHeight: 20 }}>
              {decisionModal === 'aprobar'
                ? 'La postulación quedará aceptada y la persona podrá participar como voluntario externo con casa temporal.'
                : 'El formulario y la identificación se conservarán. La persona solo tendrá que reemplazar el video.'}
            </Text>

            {decisionModal === 'evidencia' && (
              <>
                <TextInput
                  value={motivoEvidencia}
                  onChangeText={setMotivoEvidencia}
                  placeholder="Ej. Necesitamos un recorrido donde se vean los accesos, ventanas y el espacio para aislar al animal."
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  maxLength={250}
                  editable={!isSubmitting}
                  style={{
                    minHeight: 110,
                    padding: 13,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    color: COLORS.textDark,
                    textAlignVertical: 'top',
                    fontSize: 13,
                    lineHeight: 19,
                  }}
                />
                <Text style={{ alignSelf: 'flex-end', color: COLORS.textLight, fontSize: 11 }}>
                  {motivoEvidencia.length}/250
                </Text>
              </>
            )}

            <View style={{ flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setDecisionModal(null);
                  setMotivoEvidencia('');
                }}
                disabled={isSubmitting}
                style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}
              >
                <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => resolverRevisionRemota(
                  decisionModal === 'aprobar' ? 'aprobar' : 'solicitar_evidencia',
                )}
                disabled={isSubmitting || (decisionModal === 'evidencia' && !motivoEvidencia.trim())}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: decisionModal === 'aprobar' ? COLORS.accent : COLORS.warning,
                  alignItems: 'center',
                  opacity: isSubmitting || (decisionModal === 'evidencia' && !motivoEvidencia.trim()) ? 0.6 : 1,
                }}
              >
                {isSubmitting
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                      {decisionModal === 'aprobar' ? 'Sí, aprobar' : 'Enviar solicitud'}
                    </Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
