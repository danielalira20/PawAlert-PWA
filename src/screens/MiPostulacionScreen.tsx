import React, { useState } from 'react';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVoluntarioStatus, VoluntarioStatusResponse } from '../hooks/useVoluntarioStatus';
import { Brand } from '../constants/theme';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import CapacidadesFormScreen from '../screens/CapacidadesFormScreen';
import VisitCoordinationCard from '../components/home-verification/VisitCoordinationCard';

const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  success: '#27AE60',
  warning: '#F39C12',
  pending: '#95A5A6',
  grayLight: '#F3F4F6',
  border: '#E5E7EB',
};

const DESKTOP_BREAKPOINT = 900;

interface Props {
  onClose?: () => void;
  onRetryExternal?: () => void;
}

export default function MiPostulacionScreen({ onClose, onRetryExternal }: Props) {
  const { token } = useAuth();
  const { data, isLoading, error, refetch  } = useVoluntarioStatus();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = screenWidth >= DESKTOP_BREAKPOINT;
  const [showCapacidadesForm, setShowCapacidadesForm] = useState(false);
  const [nuevoVideo, setNuevoVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [evidenceFeedback, setEvidenceFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  if (showCapacidadesForm) {
  return (
    <CapacidadesFormScreen
      onClose={async () => {
        // Refrescar antes de cerrar evita el parpadeo del estado viejo
        // justo al cerrar el modal.
        await refetch();
        setShowCapacidadesForm(false);
      }}
      fromProfile={true}
    />
  );
}

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'activo_nivel_1':
      case 'activo_nivel_2':
      case 'aceptada':
        return COLORS.success;
      case 'pendiente':
      case 'postulacion_pendiente':
      case 'revision_remota':
      case 'requiere_cambios':
      case 'visita_aceptada':
      case 'coordinando_visita':
        return COLORS.warning;
      case 'visita_programada':
      case 'visita_en_curso':
      case 'visita_realizada':
        return COLORS.bgTeal;
      case 'rechazada':
      case 'rechazado':
        return COLORS.danger;
      default:
        return COLORS.pending;
    }
  };

  const getEstadoLabel = (estado: string) => {
    const labels: { [key: string]: string } = {
      postulacion_pendiente: 'Postulación Pendiente',
      activo_nivel_1: 'Voluntario Activo (Nivel 1)',
      activo_nivel_2: 'Voluntario Activo (Nivel 2)',
      rechazado: 'Postulación Rechazada',
      dado_de_baja: 'Dado de Baja',
      baja_definitiva: 'Baja Definitiva',
      pendiente: 'Pendiente de Revisión',
      aceptada: 'Aceptada',
      rechazada: 'Rechazada',
      revision_remota: 'Revisión remota',
      requiere_cambios: 'Nueva evidencia solicitada',
      visita_aceptada: 'Visita aceptada',
      coordinando_visita: 'Coordinando visita',
      visita_programada: 'Visita programada',
      visita_en_curso: 'Visita en curso',
      visita_realizada: 'Visita realizada',
    };
    return labels[estado] || estado;
  };

  const getEstadoDescripcion = (estado: string) => {
    const descripciones: { [key: string]: string } = {
      postulacion_pendiente:
        'Tu solicitud ha sido enviada. Espera la revisión de la asociación.',
      activo_nivel_1:
        'Eres un voluntario activo. ¡Puedes recibir casos para ayudar!',
      activo_nivel_2:
        'Eres un voluntario activo con capacidades verificadas. ¡Eres un experto!',
      rechazado:
        'Por el momento, tu solicitud no fue aceptada. Puedes intentar de nuevo.',
      revision_remota:
        'La asociación está revisando tu hogar con las evidencias que compartiste.',
      requiere_cambios:
        'La asociación necesita un nuevo recorrido para continuar con tu revisión.',
      visita_aceptada:
        'Una persona verificadora aceptó visitar tu hogar.',
      coordinando_visita:
        'Estamos acordando contigo la fecha y hora de la visita.',
      visita_programada:
        'La fecha y hora de tu visita ya fueron confirmadas.',
      visita_en_curso:
        'La persona verificadora registró su llegada y está revisando el hogar.',
      visita_realizada:
        'La visita terminó y se está registrando el resultado.',
      dado_de_baja: 'Tu cuenta como voluntario ha sido temporalmente desactivada.',
      baja_definitiva: 'Tu cuenta como voluntario ha sido cerrada permanentemente.',
    };
    return descripciones[estado] || '';
  };

  const getIconoEstado = (estado: string) => {
    switch (estado) {
      case 'activo_nivel_1':
      case 'activo_nivel_2':
      case 'aceptada':
        return 'checkmark-circle';
      case 'pendiente':
      case 'postulacion_pendiente':
      case 'revision_remota':
      case 'visita_aceptada':
      case 'coordinando_visita':
        return 'time-outline';
      case 'visita_programada':
        return 'calendar-outline';
      case 'visita_en_curso':
        return 'shield-checkmark-outline';
      case 'visita_realizada':
        return 'clipboard-outline';
      case 'requiere_cambios':
        return 'videocam-outline';
      case 'rechazada':
      case 'rechazado':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

 
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Mi Postulación</Text>
          </View>
        </View>
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loaderText}>Cargando tu información...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Mi Postulación</Text>
          </View>
        </View>
        <View style={styles.centerLoader}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
          <Text style={[styles.loaderText, { color: COLORS.danger }]}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!data?.voluntario) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Mi Postulación</Text>
          </View>
        </View>
        <View style={styles.centerLoader}>
          <Text style={styles.loaderText}>Sin información disponible</Text>
        </View>
      </View>
    );
  }

  const voluntario = data.voluntario;
  const postulacion = data.postulacion_actual;
  const intentosPrevios = data.intentos_previos || [];
  const verificacionHogar = postulacion?.verificacion_hogar;
  const estadosVisiblesVerificacion = [
    'requiere_cambios',
    'revision_remota',
    'visita_aceptada',
    'coordinando_visita',
    'visita_programada',
    'visita_en_curso',
    'visita_realizada',
  ];
  const estadoPresentado = verificacionHogar?.estado
    && estadosVisiblesVerificacion.includes(verificacionHogar.estado)
      ? verificacionHogar.estado
      : voluntario.estado;

  const seleccionarNuevoVideo = async () => {
    setEvidenceFeedback(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (!result.canceled) setNuevoVideo(result.assets[0]);
  };

  const enviarNuevoVideo = async () => {
    if (!token || !nuevoVideo) return;
    setIsUploadingEvidence(true);
    setEvidenceFeedback(null);
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const response = await fetch(nuevoVideo.uri);
        formData.append(
          'video',
          await response.blob(),
          nuevoVideo.fileName || `recorrido_${Date.now()}.mp4`,
        );
      } else {
        formData.append('video', {
          uri: nuevoVideo.uri,
          name: nuevoVideo.fileName || `recorrido_${Date.now()}.mp4`,
          type: nuevoVideo.mimeType || 'video/mp4',
        } as any);
      }
      await axios.post(
        `${API_URL}/voluntarios/externo/evidencia-solicitada`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setNuevoVideo(null);
      setEvidenceFeedback({
        type: 'success',
        message: 'Recorrido enviado. La asociación podrá revisarlo cuando termine el análisis.',
      });
      await refetch();
    } catch (uploadError: any) {
      setEvidenceFeedback({
        type: 'error',
        message: uploadError?.response?.data?.detail || 'No pudimos enviar el video. Intenta nuevamente.',
      });
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const contenido = (
    <>
      {/* Card principal de estado */}
      <View style={styles.mainCard}>
        <View style={styles.estadoHeader}>
          <View
            style={[
              styles.estadoIconContainer,
              { backgroundColor: `${getEstadoColor(estadoPresentado)}20` },
            ]}
          >
            <Ionicons
              name={getIconoEstado(estadoPresentado)}
              size={32}
              color={getEstadoColor(estadoPresentado)}
            />
          </View>
          <View style={styles.estadoTextContainer}>
            <Text style={styles.estadoLabel}>
              {estadoPresentado === 'revision_remota'
                ? 'Revisión remota en curso'
                : estadoPresentado === 'requiere_cambios'
                  ? 'Necesitamos otro recorrido'
                  : getEstadoLabel(estadoPresentado)}
            </Text>
            <Text style={styles.estadoDescripcion}>
              {getEstadoDescripcion(estadoPresentado)}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Información de la postulación actual */}
        {postulacion && (
          <View style={styles.postulacionSection}>
            <Text style={styles.sectionTitle}>Postulación Actual</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Asociación:</Text>
              <Text style={styles.infoValue}>
                {postulacion.asociacion_nombre || 'Cargando...'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Estado:</Text>
              <View
                style={[
                  styles.estadoBadge,
                  { backgroundColor: `${getEstadoColor(postulacion.estado)}20` },
                ]}
              >
                <Text
                  style={[
                    styles.estadoBadgeText,
                    { color: getEstadoColor(postulacion.estado) },
                  ]}
                >
                  {getEstadoLabel(postulacion.estado)}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Intento:</Text>
              <Text style={styles.infoValue}>{postulacion.numero_intento}</Text>
            </View>

            {postulacion.motivo_rechazo && (
              <View style={styles.motivoContainer}>
                <Text style={styles.sectionTitle}>Motivo del Rechazo</Text>
                <Text style={styles.motivoText}>{postulacion.motivo_rechazo}</Text>
              </View>
            )}

            {postulacion.resuelta_at && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Resuelto:</Text>
                <Text style={styles.infoValue}>
                  {new Date(postulacion.resuelta_at).toLocaleDateString('es-MX')}
                </Text>
              </View>
            )}

            {verificacionHogar?.estado &&
              [
                'visita_aceptada',
                'coordinando_visita',
                'visita_programada',
                'visita_en_curso',
                'visita_realizada',
              ]
                .includes(verificacionHogar.estado) && (
                <VisitCoordinationCard onUpdated={refetch} />
              )}

            {verificacionHogar?.estado === 'revision_remota' && (
              <View style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 14,
                backgroundColor: 'rgba(102, 188, 180, 0.12)',
                borderWidth: 1,
                borderColor: 'rgba(102, 188, 180, 0.25)',
              }}>
                <Text style={{ color: COLORS.bgTeal, fontSize: 14, fontWeight: '800', marginBottom: 5 }}>
                  Tu hogar está en revisión
                </Text>
                <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                  No había una persona verificadora cercana, así que la asociación continuará con el video, tu identificación y las respuestas del expediente.
                </Text>
              </View>
            )}

            {verificacionHogar?.estado === 'requiere_cambios' && (
              <View style={{
                marginTop: 16,
                padding: 16,
                borderRadius: 16,
                backgroundColor: '#FFF7E6',
                borderWidth: 1,
                borderColor: '#F5DCA7',
                gap: 10,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Ionicons name="videocam-outline" size={22} color={COLORS.warning} />
                  <Text style={{ flex: 1, color: COLORS.textDark, fontSize: 15, fontWeight: '800' }}>
                    Comparte un nuevo recorrido
                  </Text>
                </View>
                <Text style={{ color: COLORS.textDark, fontSize: 12, lineHeight: 18 }}>
                  {verificacionHogar.motivo_resultado || 'La asociación necesita ver mejor algunos espacios de tu hogar.'}
                </Text>
                <Text style={{ color: COLORS.textLight, fontSize: 11, lineHeight: 17 }}>
                  No tendrás que repetir el formulario ni volver a subir tu identificación.
                </Text>

                {nuevoVideo ? (
                  <View style={{ padding: 12, borderRadius: 13, backgroundColor: COLORS.bgWhite, gap: 8 }}>
                    <Text style={{ color: COLORS.textDark, fontSize: 12, fontWeight: '700' }}>
                      Nuevo recorrido listo
                    </Text>
                    <Text numberOfLines={1} style={{ color: COLORS.textLight, fontSize: 11 }}>
                      {nuevoVideo.fileName || 'video seleccionado'}
                    </Text>
                    <TouchableOpacity onPress={seleccionarNuevoVideo} disabled={isUploadingEvidence}>
                      <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '700' }}>
                        Elegir otro video
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={seleccionarNuevoVideo}
                    disabled={isUploadingEvidence}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: COLORS.warning,
                      backgroundColor: COLORS.bgWhite,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: COLORS.warning, fontWeight: '800' }}>
                      Elegir nuevo video
                    </Text>
                  </TouchableOpacity>
                )}

                {!!nuevoVideo && (
                  <TouchableOpacity
                    onPress={enviarNuevoVideo}
                    disabled={isUploadingEvidence}
                    style={{
                      paddingVertical: 13,
                      borderRadius: 13,
                      backgroundColor: COLORS.primary,
                      alignItems: 'center',
                      opacity: isUploadingEvidence ? 0.65 : 1,
                    }}
                  >
                    {isUploadingEvidence
                      ? <ActivityIndicator color={COLORS.bgWhite} />
                      : <Text style={{ color: COLORS.bgWhite, fontWeight: '800' }}>Enviar recorrido</Text>}
                  </TouchableOpacity>
                )}

                {evidenceFeedback && (
                  <Text style={{
                    color: evidenceFeedback.type === 'success' ? COLORS.success : COLORS.danger,
                    fontSize: 11,
                    lineHeight: 17,
                    fontWeight: '600',
                  }}>
                    {evidenceFeedback.message}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Intentos previos */}
        {intentosPrevios.length > 0 && (
          <View style={styles.intentosSection}>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Intentos Previos</Text>

            {intentosPrevios.map((intento, index) => (
              <View key={intento.id} style={styles.intentoCard}>
                <View style={styles.intentoHeader}>
                  <Text style={styles.intentoLabel}>Intento #{intento.numero_intento}</Text>
                  <View
                    style={[
                      styles.intentoBadge,
                      { backgroundColor: `${getEstadoColor(intento.estado)}20` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.intentoBadgeText,
                        { color: getEstadoColor(intento.estado) },
                      ]}
                    >
                      {getEstadoLabel(intento.estado)}
                    </Text>
                  </View>
                </View>

                {intento.motivo_rechazo && (
                  <Text style={styles.intentoMotivo}>Motivo: {intento.motivo_rechazo}</Text>
                )}

                <Text style={styles.intentoFecha}>
                  {new Date(intento.created_at).toLocaleDateString('es-MX')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Botones de acción */}
      {(voluntario.estado === 'activo_nivel_1' ||
        voluntario.estado === 'activo_nivel_2') && (
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.actionButton, styles.completarButton]}
              activeOpacity={0.8}
              onPress={() => setShowCapacidadesForm(true)}
            >
              <Ionicons
                name={voluntario.tiene_capacidades ? 'pencil-outline' : 'clipboard-outline'}
                size={18}
                color={COLORS.bgWhite}
              />
              <Text style={styles.actionButtonText}>
                {voluntario.tiene_capacidades ? 'Ver / Editar mis capacidades' : 'Completa tus capacidades'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.capacidadesHint}>
              {voluntario.tiene_capacidades
                ? 'Consulta o actualiza tu disponibilidad, especies que puedes atender y zona de cobertura.'
                : 'Termina de configurar tu perfil para poder empezar a recibir casos.'}
            </Text>
          </View>
        )}

      {voluntario.estado === 'rechazado' && (
        <View style={styles.actionsSection}>
          {voluntario.tipo === 'externo' && (
            <>
              <Text style={styles.retryTitle}>¿Cómo te gustaría continuar?</Text>
              <Text style={styles.retryHint}>
                Conservaremos la información que ya compartiste para que solo revises o corrijas lo necesario.
              </Text>
              <TouchableOpacity
                style={[styles.actionButton, styles.casaTemporalButton]}
                activeOpacity={0.8}
                onPress={onRetryExternal}
              >
                <Ionicons name="home-outline" size={18} color={COLORS.bgWhite} />
                <Text style={styles.actionButtonText}>Corregir y reintentar como casa temporal</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[
              styles.actionButton,
              voluntario.tipo === 'externo'
                ? styles.asociacionOutlineButton
                : styles.volverPostularButton,
            ]}
            activeOpacity={0.8}
            onPress={() => {
              if (onClose) onClose();
              router.push('/(tabs)/join-association');
            }}
          >
            <Ionicons
              name="people-outline"
              size={18}
              color={voluntario.tipo === 'externo' ? COLORS.primary : COLORS.bgWhite}
            />
            <Text
              style={[
                styles.actionButtonText,
                voluntario.tipo === 'externo' && styles.asociacionOutlineButtonText,
              ]}
            >
              Postularme como voluntario de asociación
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Mi Postulación</Text>
        </View>
      </View>

      <ScrollView
        style={styles.bodySection}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          <View style={styles.desktopContainer}>{contenido}</View>
        ) : (
          contenido
        )}
      </ScrollView>

      {showCapacidadesForm && (
        <CapacidadesFormScreen
          onClose={() => setShowCapacidadesForm(false)}
          fromProfile={true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgWhite,
    position: 'relative',
  },

  headerSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    backgroundColor: COLORS.bgTeal,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.bgWhite,
  },

  bodySection: {
    flex: 1,
    backgroundColor: COLORS.bgWhite,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    paddingBottom: 40,
  },

  desktopContainer: {
    maxWidth: 700,
    alignSelf: 'center',
    width: '100%',
  },

  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  loaderText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
    textAlign: 'center',
  },

  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
  },

  mainCard: {
    backgroundColor: COLORS.bgWhite,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },

  estadoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },

  estadoIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },

  estadoTextContainer: {
    flex: 1,
  },

  estadoLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 4,
  },

  estadoDescripcion: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 18,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },

  postulacionSection: {
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },

  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
  },

  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },

  estadoBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },

  estadoBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  motivoContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },

  motivoText: {
    fontSize: 13,
    color: COLORS.textDark,
    fontWeight: '500',
    lineHeight: 18,
  },

  intentosSection: {},

  intentoCard: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },

  intentoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  intentoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },

  intentoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  intentoBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  intentoMotivo: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 6,
  },

  intentoFecha: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '500',
  },

  actionsSection: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 16,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
  },

  completarButton: {
    backgroundColor: COLORS.bgTeal,
  },

  misReportesButton: {
    backgroundColor: COLORS.primary,
  },

  volverPostularButton: {
    backgroundColor: COLORS.primary,
  },

  casaTemporalButton: {
    backgroundColor: COLORS.bgTeal,
  },

  asociacionOutlineButton: {
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },

  asociacionOutlineButtonText: {
    color: COLORS.primary,
  },

  retryTitle: {
    color: COLORS.textDark,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },

  retryHint: {
    color: COLORS.textLight,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 4,
  },

  actionButtonText: {
    color: COLORS.bgWhite,
    fontSize: 14,
    fontWeight: '700',
  },

    capacidadesHint: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 8,
    lineHeight: 16,
  },
});
