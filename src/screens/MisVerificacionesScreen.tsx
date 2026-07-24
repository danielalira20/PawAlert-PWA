import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
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

import { Toast, useToast } from '../components/Toast';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

const COLORS = {
  primary: '#EC802B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  warning: '#F39C12',
  success: '#27AE60',
  background: '#FFF9F4',
  card: '#FAF3EA',
  border: '#F0E6D6',
};

type EstadoAsignacion =
  | 'propuesta'
  | 'aceptada'
  | 'rechazada'
  | 'cancelada'
  | 'completada'
  | 'expirada';

type Propuesta = {
  id: string;
  verificacion_hogar_id: string;
  distancia_km: number;
  tramo_distancia: 'preferente' | 'extendido';
  estado: EstadoAsignacion;
  estado_verificacion: string;
  propuesta_at: string;
  respondida_at?: string | null;
  visita_programada_at?: string | null;
  motivo_rechazo?: string | null;
  asociacion_nombre: string;
  postulante_nombre: string;
  zona_hogar?: {
    municipio?: string;
    colonia?: string;
    estado?: string;
    tipo_vivienda?: string;
  };
  resumen_previo?: {
    hogar?: Record<string, any>;
    disponibilidad?: Record<string, any>;
  };
};

type DetallePropuesta = Propuesta & {
  hogar?: {
    municipio?: string;
    colonia?: string;
    estado_ubicacion?: string;
    tipo_vivienda?: string;
    preferencia_especies?: string[];
    preferencia_tamanios?: string[];
    horarios_visita?: Array<{ dia?: string; hora?: string }>;
    latitud?: number;
    longitud?: number;
    calle?: string;
    numero?: string;
    referencia?: string;
    identificacion_url?: string;
    video_recorrido_url?: string;
  };
  resumen_expediente?: Record<string, any>;
  analisis_video?: {
    observabilidad?: string;
    resumen_breve?: string;
    areas_observadas?: string[];
    caracteristicas_visibles?: string[];
    condiciones_aparentes?: string[];
    riesgos_aparentes?: string[];
    puntos_no_observados?: string[];
  } | null;
  analisis_video_estado?: string;
  estado_coordenadas?: string;
  distancia_coordenadas_m?: number | null;
};

type Filtro = 'pendientes' | 'aceptadas' | 'historial';

interface Props {
  onClose: () => void;
}

const ESTADO_LABELS: Record<EstadoAsignacion, string> = {
  propuesta: 'Por responder',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  expirada: 'Expirada',
};

function zonaTexto(zona?: Propuesta['zona_hogar']) {
  return [zona?.colonia, zona?.municipio, zona?.estado]
    .filter(Boolean)
    .join(', ') || 'Zona no especificada';
}

function lista(values?: unknown[]) {
  return values?.filter(Boolean).join(', ') || 'No especificado';
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

export default function MisVerificacionesScreen({ onClose }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 720;
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [detalle, setDetalle] = useState<DetallePropuesta | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decision, setDecision] = useState<'aceptar' | 'rechazar' | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const cargar = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/voluntarios/me/verificaciones`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setPropuestas(data || []);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos cargar tus verificaciones',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [token]);

  const abrirDetalle = async (propuesta: Propuesta) => {
    if (!token) return;
    setIsLoadingDetail(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/voluntarios/me/verificaciones/${propuesta.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setDetalle({ ...propuesta, ...data });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos abrir la propuesta',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const responder = async () => {
    if (!token || !detalle || !decision) return;
    if (decision === 'rechazar' && !motivoRechazo.trim()) return;
    setIsSubmitting(true);
    try {
      const { data } = await axios.patch(
        `${API_URL}/voluntarios/me/verificaciones/${detalle.id}/responder`,
        {
          respuesta: decision,
          motivo: decision === 'rechazar' ? motivoRechazo.trim() : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showToast({
        type: 'success',
        title: decision === 'aceptar' ? 'Visita aceptada' : 'Respuesta enviada',
        message: data.mensaje,
      });
      setDecision(null);
      setMotivoRechazo('');
      await cargar();
      if (decision === 'aceptar') {
        await abrirDetalle({ ...detalle, estado: 'aceptada' });
      } else {
        setDetalle(null);
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos guardar tu respuesta',
        message: error?.response?.data?.detail || 'Intenta nuevamente.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtradas = useMemo(
    () => propuestas.filter((propuesta) => {
      if (filtro === 'pendientes') return propuesta.estado === 'propuesta';
      if (filtro === 'aceptadas') return propuesta.estado === 'aceptada';
      return !['propuesta', 'aceptada'].includes(propuesta.estado);
    }),
    [filtro, propuestas],
  );

  const pendientes = propuestas.filter((item) => item.estado === 'propuesta').length;

  if (detalle) {
    const hogar = detalle.hogar || {};
    const resumen = detalle.resumen_expediente || {};
    const aceptada = detalle.estado === 'aceptada';
    const analisis = detalle.analisis_video;
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <Toast toast={toast} translateY={translateY} />
        <View style={{
          paddingHorizontal: isMobile ? 18 : 24,
          paddingVertical: 18,
          backgroundColor: COLORS.white,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}>
          <TouchableOpacity
            onPress={() => setDetalle(null)}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textDark} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textDark, fontSize: isMobile ? 17 : 21, fontWeight: '900' }}>
              Propuesta de verificación
            </Text>
            <Text style={{ marginTop: 2, color: COLORS.textLight, fontSize: 12 }}>
              {detalle.asociacion_nombre}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 13, backgroundColor: aceptada ? '#EAF7F6' : '#FFF2E7' }}>
            <Text style={{ color: aceptada ? COLORS.accent : COLORS.primary, fontSize: 10, fontWeight: '800' }}>
              {ESTADO_LABELS[detalle.estado]}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 7 }}>
            <Ionicons name="close" size={23} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: isMobile ? 16 : 24, gap: 16, paddingBottom: aceptada ? 28 : 110 }}>
          <View style={{
            padding: 18,
            borderRadius: 20,
            backgroundColor: aceptada ? '#EAF7F6' : COLORS.card,
            borderWidth: 1,
            borderColor: aceptada ? '#D0ECE8' : COLORS.border,
            gap: 7,
          }}>
            <Text style={{ color: aceptada ? COLORS.accent : COLORS.primary, fontSize: 16, fontWeight: '900' }}>
              {aceptada ? 'Aceptaste realizar esta visita' : 'Tu asociación necesita apoyo'}
            </Text>
            <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 20 }}>
              {aceptada
                ? 'Ya puedes consultar la dirección y las evidencias. En el siguiente paso coordinaremos el horario con el postulante.'
                : `La casa se encuentra aproximadamente a ${detalle.distancia_km} km de tu zona base.`}
            </Text>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'stretch' }}>
            <View style={{ flex: 1, padding: 17, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="location-outline" size={20} color={COLORS.primary} />
                <Text style={{ color: COLORS.textDark, fontWeight: '900' }}>Ubicación</Text>
              </View>
              <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Zona general</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700' }}>
                {[hogar.colonia, hogar.municipio, hogar.estado_ubicacion].filter(Boolean).join(', ') || 'No especificada'}
              </Text>
              <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Distancia aproximada</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700' }}>
                {detalle.distancia_km} km
              </Text>
              {aceptada && (
                <>
                  <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Dirección para la visita</Text>
                  <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700', lineHeight: 19 }}>
                    {[hogar.calle, hogar.numero, hogar.colonia, hogar.municipio, hogar.estado_ubicacion].filter(Boolean).join(', ') || 'No especificada'}
                  </Text>
                  {!!hogar.referencia && (
                    <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
                      Referencia: {hogar.referencia}
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={{ flex: 1, padding: 17, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="home-outline" size={20} color={COLORS.primary} />
                <Text style={{ color: COLORS.textDark, fontWeight: '900' }}>Contexto del hogar</Text>
              </View>
              <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Postulante</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700' }}>
                {detalle.postulante_nombre}
              </Text>
              <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Tipo de vivienda</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700' }}>
                {hogar.tipo_vivienda || resumen.hogar?.tipo_vivienda || 'No especificado'}
              </Text>
              <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Especies que puede recibir</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700' }}>
                {lista(hogar.preferencia_especies || resumen.hogar?.especies)}
              </Text>
              <Text style={{ color: COLORS.textLight, fontSize: 11 }}>Tamaños</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700' }}>
                {lista(hogar.preferencia_tamanios || resumen.hogar?.tamanios)}
              </Text>
            </View>
          </View>

          {!aceptada && (
            <View style={{ padding: 16, borderRadius: 18, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F5DCA7', flexDirection: 'row', gap: 10 }}>
              <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.warning} />
              <Text style={{ flex: 1, color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                Para proteger la privacidad y tu seguridad, la dirección exacta y las evidencias se mostrarán únicamente si aceptas la visita.
              </Text>
            </View>
          )}

          {aceptada && (
            <>
              <View style={{ padding: 17, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="folder-open-outline" size={20} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textDark, fontWeight: '900' }}>Evidencias para preparar la visita</Text>
                </View>
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                  {!!hogar.identificacion_url && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(hogar.identificacion_url!)}
                      style={{ flex: 1, paddingVertical: 11, borderRadius: 13, backgroundColor: COLORS.card, alignItems: 'center' }}
                    >
                      <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Ver identificación</Text>
                    </TouchableOpacity>
                  )}
                  {!!hogar.video_recorrido_url && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(hogar.video_recorrido_url!)}
                      style={{ flex: 1, paddingVertical: 11, borderRadius: 13, backgroundColor: COLORS.card, alignItems: 'center' }}
                    >
                      <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Ver recorrido</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={{ padding: 17, borderRadius: 18, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, gap: 11 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="sparkles-outline" size={20} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textDark, fontWeight: '900' }}>Observaciones del recorrido</Text>
                </View>
                {analisis ? (
                  <>
                    <Text style={{ color: COLORS.textDark, fontSize: 13, lineHeight: 20 }}>
                      {analisis.resumen_breve}
                    </Text>
                    <BulletList title="Áreas observadas" values={analisis.areas_observadas} />
                    <BulletList title="Características visibles" values={analisis.caracteristicas_visibles} />
                    <BulletList title="Riesgos que conviene revisar" values={analisis.riesgos_aparentes} />
                    <BulletList title="Lo que no se alcanzó a observar" values={analisis.puntos_no_observados} />
                  </>
                ) : (
                  <Text style={{ color: COLORS.textLight, fontSize: 12, lineHeight: 18 }}>
                    No hay observaciones automáticas disponibles. Revisa el video directamente antes de la visita.
                  </Text>
                )}
                <Text style={{ paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.border, color: COLORS.textLight, fontSize: 10, lineHeight: 15 }}>
                  Estas observaciones sirven como apoyo. Tú registrarás lo que compruebes durante la visita.
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        {!aceptada && detalle.estado === 'propuesta' && (
          <View style={{ padding: isMobile ? 16 : 20, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setDecision('rechazar')}
              style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.danger, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.danger, fontWeight: '800' }}>No puedo realizarla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDecision('aceptar')}
              style={{ minWidth: isMobile ? undefined : 190, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '800' }}>Aceptar visita</Text>
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={decision !== null} transparent animationType="fade">
          <View style={{ flex: 1, padding: 20, backgroundColor: 'rgba(38,29,22,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: '100%', maxWidth: 440, padding: 24, borderRadius: 23, backgroundColor: COLORS.white, gap: 14 }}>
              <Ionicons
                name={decision === 'aceptar' ? 'checkmark-circle-outline' : 'close-circle-outline'}
                size={42}
                color={decision === 'aceptar' ? COLORS.accent : COLORS.danger}
              />
              <Text style={{ color: COLORS.textDark, fontSize: 19, fontWeight: '900' }}>
                {decision === 'aceptar' ? '¿Puedes realizar esta visita?' : 'Rechazar propuesta'}
              </Text>
              <Text style={{ color: COLORS.textLight, fontSize: 13, lineHeight: 20 }}>
                {decision === 'aceptar'
                  ? 'Al aceptar podrás ver la dirección y las evidencias para preparar la visita.'
                  : 'La asociación buscará a otra persona. Tu respuesta no afecta tu perfil como voluntario.'}
              </Text>
              {decision === 'rechazar' && (
                <>
                  <TextInput
                    value={motivoRechazo}
                    onChangeText={setMotivoRechazo}
                    placeholder="Ej. No tengo disponibilidad esta semana."
                    placeholderTextColor={COLORS.textLight}
                    multiline
                    maxLength={250}
                    style={{ minHeight: 100, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, color: COLORS.textDark, textAlignVertical: 'top' }}
                  />
                  <Text style={{ alignSelf: 'flex-end', color: COLORS.textLight, fontSize: 11 }}>
                    {motivoRechazo.length}/250
                  </Text>
                </>
              )}
              <View style={{ flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    setDecision(null);
                    setMotivoRechazo('');
                  }}
                  disabled={isSubmitting}
                  style={{ paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}
                >
                  <Text style={{ color: COLORS.textDark, fontWeight: '800' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={responder}
                  disabled={isSubmitting || (decision === 'rechazar' && !motivoRechazo.trim())}
                  style={{ paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13, backgroundColor: decision === 'aceptar' ? COLORS.accent : COLORS.danger, alignItems: 'center', opacity: isSubmitting || (decision === 'rechazar' && !motivoRechazo.trim()) ? 0.6 : 1 }}
                >
                  {isSubmitting
                    ? <ActivityIndicator color={COLORS.white} />
                    : <Text style={{ color: COLORS.white, fontWeight: '800' }}>
                        {decision === 'aceptar' ? 'Sí, aceptar' : 'Enviar respuesta'}
                      </Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Toast toast={toast} translateY={translateY} />
      <View style={{ paddingHorizontal: isMobile ? 18 : 24, paddingVertical: 18, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textDark, fontSize: isMobile ? 19 : 23, fontWeight: '900' }}>
            Mis verificaciones
          </Text>
          <Text style={{ marginTop: 3, color: COLORS.textLight, fontSize: 12 }}>
            Visitas de confianza para casas temporales
          </Text>
        </View>
        {!!pendientes && (
          <View style={{ minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: COLORS.white, fontSize: 11, fontWeight: '900' }}>{pendientes}</Text>
          </View>
        )}
        <TouchableOpacity onPress={onClose} style={{ padding: 7 }}>
          <Ionicons name="close" size={24} color={COLORS.textDark} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: isMobile ? 16 : 24, paddingTop: 18 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {([
              ['pendientes', 'Por responder'],
              ['aceptadas', 'Aceptadas'],
              ['historial', 'Historial'],
            ] as Array<[Filtro, string]>).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setFiltro(key)}
                style={{ paddingHorizontal: 15, paddingVertical: 8, borderRadius: 18, backgroundColor: filtro === key ? COLORS.primary : COLORS.card, borderWidth: 1, borderColor: filtro === key ? COLORS.primary : COLORS.border }}
              >
                <Text style={{ color: filtro === key ? COLORS.white : COLORS.textDark, fontSize: 12, fontWeight: '800' }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {isLoading || isLoadingDetail ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textLight }}>Cargando verificaciones…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: isMobile ? 16 : 24, gap: 12, paddingBottom: 40 }}>
          {!filtradas.length ? (
            <View style={{ minHeight: 290, padding: 28, borderRadius: 22, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Ionicons name="home-outline" size={43} color={COLORS.accent} />
              <Text style={{ color: COLORS.textDark, fontSize: 16, fontWeight: '900', textAlign: 'center' }}>
                {filtro === 'pendientes' ? 'No tienes propuestas pendientes' : 'Todavía no hay verificaciones aquí'}
              </Text>
              <Text style={{ maxWidth: 360, color: COLORS.textLight, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
                Cuando tu asociación necesite apoyo cerca de tu zona, la propuesta aparecerá en este espacio.
              </Text>
            </View>
          ) : filtradas.map((propuesta) => (
            <TouchableOpacity
              key={propuesta.id}
              onPress={() => abrirDetalle(propuesta)}
              activeOpacity={0.85}
              style={{ padding: isMobile ? 16 : 19, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: propuesta.estado === 'propuesta' ? '#F7D7BC' : COLORS.border, gap: 12 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 16, backgroundColor: propuesta.estado === 'aceptada' ? '#EAF7F6' : '#FFF2E7', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={propuesta.estado === 'aceptada' ? 'checkmark-circle-outline' : 'home-outline'} size={22} color={propuesta.estado === 'aceptada' ? COLORS.accent : COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textDark, fontSize: 14, fontWeight: '900' }}>
                    Verificación de casa temporal
                  </Text>
                  <Text style={{ marginTop: 3, color: COLORS.textLight, fontSize: 12 }}>
                    {zonaTexto(propuesta.zona_hogar)}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11, backgroundColor: propuesta.estado === 'propuesta' ? '#FFF2E7' : COLORS.card }}>
                  <Text style={{ color: propuesta.estado === 'propuesta' ? COLORS.primary : COLORS.textLight, fontSize: 9, fontWeight: '800' }}>
                    {ESTADO_LABELS[propuesta.estado]}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 5 : 18 }}>
                <Text style={{ color: COLORS.textDark, fontSize: 12 }}>
                  <Text style={{ fontWeight: '800' }}>{propuesta.distancia_km} km</Text> de tu zona
                </Text>
                <Text style={{ color: COLORS.textDark, fontSize: 12 }}>
                  {propuesta.zona_hogar?.tipo_vivienda || 'Vivienda'}
                </Text>
                <Text style={{ color: COLORS.textLight, fontSize: 11 }}>
                  {new Date(propuesta.propuesta_at).toLocaleDateString('es-MX')}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
