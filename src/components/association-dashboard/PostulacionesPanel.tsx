import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { usePostulacionesAsociacion, PostulacionItem, VoluntarioData } from '../../hooks/usePostulacionesAsociacion';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../Toast';
import { AppModal } from '../AppModal';
import { AssocAvatar } from '../admin-dashboard/AssocAvatar';
import { AssocLocationMap } from '../admin-dashboard/AssocLocationMap';
import { ExternalVerificationDetail } from './ExternalVerificationDetail';

const COLORS = {
  bg: '#E8CCAD',
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  success: '#27AE60',
  warning: '#F39C12',
  cardBg: '#FAF3EA',
  pending: '#95A5A6',
};

type FiltroPostulacion = 'pendientes' | 'resueltas';

interface Props {
  visible: boolean;
}

export function PostulacionesPanel({ visible }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { data, isLoading, error, refetch } = usePostulacionesAsociacion();
  const { width } = useWindowDimensions();
  const isMobile = width < 900;

  const [filtro, setFiltro] = useState<FiltroPostulacion>('pendientes');
  // NUEVO: Estado para el filtro de tipo de voluntario
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'interno' | 'externo'>('todos');
  
  const [postulacionSeleccionada, setPostulacionSeleccionada] = useState<PostulacionItem | null>(null);
  const [voluntarioSeleccionado, setVoluntarioSeleccionado] = useState<VoluntarioData | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postulacionAccion, setPostulacionAccion] = useState<PostulacionItem | null>(null);

  if (!visible) return null;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} style={{ marginBottom: 16 }} />
        <Text style={{ color: COLORS.danger, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
          {error}
        </Text>
      </View>
    );
  }

  const postulacionesLista = data?.postulaciones || [];
  const pendientesCount = data?.pendientes_count || 0;
  const intentosPrevios = data?.intentos_previos || {};

  // ACTUALIZADO: Lógica de doble filtrado
  const postulacionesFiltradas = postulacionesLista.filter((p) => {
    // 1. Filtro de estado
    if (filtro === 'pendientes' && p.estado !== 'pendiente') return false;
    if (filtro === 'resueltas' && !['aceptada', 'rechazada'].includes(p.estado)) return false;

    // 2. Filtro de tipo (internos vs externos)
    if (filtroTipo === 'externo' && p.tipo !== 'externo') return false;
    // Si no es externo, lo consideramos interno
    if (filtroTipo === 'interno' && p.tipo === 'externo') return false;

    return true;
  });

  const handleAceptar = async (postulacion: PostulacionItem) => {
    if (!token) return;

    setIsSubmitting(true);
    try {
      await axios.patch(
        `${API_URL}/associations/me/postulaciones/${postulacion.id}`,
        { accion: 'aceptar' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ title: '¡Listo!', description: 'Postulación aceptada', type: 'success' });
      refetch();
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al aceptar postulación';
      showToast({ title: 'Error', description: message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRechazar = async () => {
    if (!token || !postulacionAccion) return;
    if (!motivoRechazo.trim()) {
      showToast({ title: 'Error', description: 'El motivo es obligatorio', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.patch(
        `${API_URL}/associations/me/postulaciones/${postulacionAccion.id}`,
        { accion: 'rechazar', motivo: motivoRechazo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ title: '¡Listo!', description: 'Postulación rechazada', type: 'success' });
      setShowRejectModal(false);
      setMotivoRechazo('');
      setPostulacionAccion(null);
      cerrarDetalles();
      refetch();
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Error al rechazar postulación';
      showToast({ title: 'Error', description: message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const cerrarDetalles = () => {
    setPostulacionSeleccionada(null);
    setVoluntarioSeleccionado(null);
  };

  const abrirRechazo = (postulacion: PostulacionItem) => {
    setPostulacionAccion(postulacion);
    setShowRejectModal(true);
  };

  return (
    <View>
      <Toast toast={toast} translateY={translateY} />

      {/* Header con conteo de pendientes */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 20 }}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: COLORS.textDark }}>Postulaciones</Text>
          <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 4 }}>
            {pendientesCount} pendiente{pendientesCount !== 1 ? 's' : ''}
          </Text>
        </View>
        {pendientesCount > 0 && (
          <View style={{ backgroundColor: COLORS.danger, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}>
            <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '800' }}>
              {pendientesCount}
            </Text>
          </View>
        )}
      </View>

      {/* Filtros principales de estado */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['pendientes', 'resueltas'] as FiltroPostulacion[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFiltro(f)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: filtro === f ? COLORS.primary : COLORS.cardBg,
                borderWidth: filtro === f ? 0 : 1,
                borderColor: 'rgba(0,0,0,0.05)',
              }}
            >
              <Text
                style={{
                  color: filtro === f ? COLORS.white : COLORS.textDark,
                  fontWeight: '700',
                  textTransform: 'capitalize',
                }}
              >
                {f === 'pendientes' ? 'Pendientes' : 'Resueltas'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Sub-filtros por tipo de voluntario con estilos unificados */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([
            { key: 'todos', label: 'Todos' },
            { key: 'interno', label: 'Voluntario de Asociación' },
            { key: 'externo', label: 'Casa Temporal Externa' },
          ] as const).map((ft) => (
            <TouchableOpacity
              key={ft.key}
              onPress={() => setFiltroTipo(ft.key)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: filtroTipo === ft.key ? COLORS.primary : COLORS.cardBg,
                borderWidth: filtroTipo === ft.key ? 0 : 1,
                borderColor: 'rgba(0,0,0,0.05)',
              }}
            >
              <Text
                style={{
                  color: filtroTipo === ft.key ? COLORS.white : COLORS.textDark,
                  fontWeight: '700',
                }}
              >
                {ft.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Lista de postulaciones */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {postulacionesFiltradas.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Ionicons name="inbox-outline" size={48} color={COLORS.textLight} style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.textLight }}>
              No hay postulaciones {filtro}
            </Text>
          </View>
        ) : (
          postulacionesFiltradas.map((postulacion) => (
            <TouchableOpacity
              key={postulacion.id}
              onPress={() => {
                setPostulacionSeleccionada(postulacion);
                setVoluntarioSeleccionado(postulacion.voluntario || null);
              }}
              style={{
                backgroundColor: COLORS.white,
                borderRadius: 16,
                padding: 16,
                marginBottom: 12,
                borderLeftWidth: 4,
                borderLeftColor:
                  postulacion.estado === 'pendiente'
                    ? COLORS.warning
                    : postulacion.estado === 'aceptada'
                    ? COLORS.success
                    : COLORS.danger,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 4 }}>
                    {postulacion.voluntario?.nombre || 'Voluntario'} {postulacion.voluntario?.apellido_paterno || ''}
                  </Text>
                  {postulacion.tipo === 'externo' && (
                    <View style={{ alignSelf: 'flex-start', marginBottom: 8, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(102, 188, 180, 0.15)' }}>
                      <Text style={{ color: COLORS.accent, fontSize: 10, fontWeight: '800' }}>Casa temporal externa</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 2 }}>
                    {postulacion.voluntario?.email}
                  </Text>
                  {!!postulacion.voluntario?.telefono && (
                    <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 8 }}>
                      {postulacion.voluntario.telefono}
                    </Text>
                  )}

                  {postulacion.capacidades && (() => {
                    // especies_final solo existe para interno (v2 con
                    // fallback a legacy); para externo queda undefined y el
                    // ?? cae directo a la columna legacy, igual que antes.
                    const especies = postulacion.capacidades.especies_final ?? postulacion.capacidades.especies;
                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {postulacion.capacidades.ofrece_casa_hogar && (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(102, 188, 180, 0.15)' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.accent }}>Mi Casa Temporal</Text>
                          </View>
                        )}
                        {!!especies?.length && (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(236, 128, 43, 0.1)' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary, textTransform: 'capitalize' }}>
                              {especies.join(', ')}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 4 }}>
                    Intento: {postulacion.numero_intento}
                  </Text>

                  <Text style={{ fontSize: 11, color: COLORS.textLight }}>
                    {new Date(postulacion.created_at).toLocaleDateString('es-MX')}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 12,
                    backgroundColor:
                      postulacion.estado === 'pendiente'
                        ? 'rgba(243, 156, 18, 0.1)'
                        : postulacion.estado === 'aceptada'
                        ? 'rgba(39, 174, 96, 0.1)'
                        : 'rgba(231, 76, 60, 0.1)',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color:
                        postulacion.estado === 'pendiente'
                          ? COLORS.warning
                          : postulacion.estado === 'aceptada'
                          ? COLORS.success
                          : COLORS.danger,
                      textTransform: 'capitalize',
                    }}
                  >
                    {postulacion.estado}
                  </Text>
                </View>
              </View>

              {postulacion.estado === 'pendiente' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (postulacion.tipo === 'externo') {
                        setPostulacionSeleccionada(postulacion);
                        setVoluntarioSeleccionado(postulacion.voluntario || null);
                      } else {
                        handleAceptar(postulacion);
                      }
                    }}
                    disabled={isSubmitting}
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.success,
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center',
                      opacity: isSubmitting ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 12 }}>
                      {postulacion.tipo === 'externo' ? 'Revisar expediente' : 'Aceptar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      abrirRechazo(postulacion);
                    }}
                    disabled={isSubmitting}
                    style={{
                      flex: 1,
                      backgroundColor: 'transparent',
                      borderWidth: 1,
                      borderColor: COLORS.danger,
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center',
                      opacity: isSubmitting ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 12 }}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {postulacion.estado === 'rechazada' && postulacion.motivo_rechazo && (
                <View
                  style={{
                    marginTop: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderRadius: 8,
                    borderLeftWidth: 3,
                    borderLeftColor: COLORS.danger,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.danger, marginBottom: 2 }}>
                    Motivo:
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textDark, lineHeight: 16 }}>
                    {postulacion.motivo_rechazo}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Modal de Rechazo */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View
            style={{
              backgroundColor: COLORS.white,
              borderRadius: 20,
              padding: 24,
              width: '100%',
              maxWidth: 400,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 12 }}>
              Rechazar postulación
            </Text>

            <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16, lineHeight: 18 }}>
              Proporciona un motivo (obligatorio) para que el voluntario entienda por qué fue rechazado.
            </Text>

            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: COLORS.textDark,
                minHeight: 100,
                textAlignVertical: 'top',
                marginBottom: 16,
              }}
              placeholder="Escribe el motivo del rechazo..."
              placeholderTextColor={COLORS.textLight}
              multiline
              maxLength={200}
              value={motivoRechazo}
              onChangeText={setMotivoRechazo}
              editable={!isSubmitting}
            />

            <Text style={{ textAlign: 'right', fontSize: 12, color: COLORS.textLight, marginBottom: 16 }}>
              {motivoRechazo.length}/200
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setShowRejectModal(false);
                  setMotivoRechazo('');
                  setPostulacionAccion(null);
                }}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: COLORS.textLight,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRechazar}
                disabled={isSubmitting || !motivoRechazo.trim()}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.danger,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  opacity: isSubmitting || !motivoRechazo.trim() ? 0.7 : 1,
                }}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={{ color: COLORS.white, fontWeight: '700' }}>Rechazar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Detalle */}
      <AppModal visible={!!postulacionSeleccionada} onClose={cerrarDetalles} maxWidth={900}>
        {postulacionSeleccionada?.tipo === 'externo' && voluntarioSeleccionado ? (
          <ExternalVerificationDetail
            postulacion={postulacionSeleccionada}
            voluntario={voluntarioSeleccionado}
            onClose={cerrarDetalles}
            onReject={() => {
              abrirRechazo(postulacionSeleccionada);
            }}
            onUpdated={refetch}
          />
        ) : postulacionSeleccionada && voluntarioSeleccionado ? (
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ padding: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0E6D6' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 }}>
                {voluntarioSeleccionado.nombre} {voluntarioSeleccionado.apellido_paterno}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight }}>
                Postulación #{postulacionSeleccionada.numero_intento}
              </Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
                {/* Columna izquierda: avatar, contacto, mapa */}
                <View style={{ width: isMobile ? '100%' : 260, gap: 16 }}>
                  <View style={{ alignItems: 'center' }}>
                    <AssocAvatar
                      nombre={`${voluntarioSeleccionado.nombre} ${voluntarioSeleccionado.apellido_paterno}`}
                      logoUrl={null}
                      size="lg"
                    />
                  </View>

                  <View style={{ backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 16 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textLight, marginBottom: 12, textTransform: 'uppercase' }}>
                      Datos de contacto
                    </Text>
                    <View style={{ gap: 8 }}>
                      <View>
                        <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Email</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark }}>
                          {voluntarioSeleccionado.email}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Teléfono</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark }}>
                          {voluntarioSeleccionado.telefono || 'No disponible'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {!!postulacionSeleccionada.capacidades?.latitud && !!postulacionSeleccionada.capacidades?.longitud && (
                    <View style={{ backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 16 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textLight, marginBottom: 8, textTransform: 'uppercase' }}>
                        Ubicación y distancia
                      </Text>
                      {postulacionSeleccionada.distancia_km != null && (
                        <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, marginBottom: 8 }}>
                          A {postulacionSeleccionada.distancia_km} km de tu asociación
                        </Text>
                      )}
                      <AssocLocationMap
                        latitud={postulacionSeleccionada.capacidades.latitud}
                        longitud={postulacionSeleccionada.capacidades.longitud}
                        radioKm={1}
                        height={160}
                      />
                    </View>
                  )}
                </View>

                {/* Columna derecha: capacidades + historial */}
                <View style={{ flex: 1, gap: 20 }}>
                  {postulacionSeleccionada.capacidades && (() => {
                    // v2 gana si el formulario actual lo llenó (incluso
                    // false/[]); si no, cae a la columna legacy. Ya resuelto
                    // por el backend (capacidades.*_final), este ?? solo
                    // cubre postulaciones viejas de antes de que existiera
                    // *_final en la respuesta.
                    const cap = postulacionSeleccionada.capacidades!;
                    const especies = cap.especies_final ?? cap.especies;
                    const tamanios = cap.tamanios_final ?? cap.tamanios;
                    const vehiculo = cap.vehiculo_final ?? cap.tiene_vehiculo;
                    const resumen = postulacionSeleccionada.resumen_interno;

                    return (
                      <>
                        <View style={{ backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 16 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textLight, marginBottom: 12, textTransform: 'uppercase' }}>
                            Resumen de la postulación
                          </Text>

                          <View style={{ gap: 10 }}>
                            {!!cap.disponibilidad?.dias?.length && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Días disponibles</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                  {cap.disponibilidad.dias.join(', ')}
                                </Text>
                              </View>
                            )}
                            {!!especies?.length && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Especies que atiende</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                  {especies.join(', ')}
                                </Text>
                              </View>
                            )}
                            {!!tamanios?.length && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Tamaños que puede manejar</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                  {tamanios.join(', ')}
                                </Text>
                              </View>
                            )}
                            <View style={{ flexDirection: 'row', gap: 24 }}>
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Mi Casa Temporal</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark }}>
                                  {cap.ofrece_casa_hogar ? 'Sí ofrece' : 'No ofrece'}
                                </Text>
                              </View>
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Vehículo</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark }}>
                                  {vehiculo ? 'Sí' : 'No'}
                                </Text>
                              </View>
                            </View>
                            {!!resumen?.manejo_animal.primeros_auxilios && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Primeros auxilios</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                  {resumen.manejo_animal.primeros_auxilios}
                                </Text>
                              </View>
                            )}
                            {!!resumen?.equipo_y_bienestar.equipamiento.length && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Equipo disponible</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                  {resumen.equipo_y_bienestar.equipamiento.join(', ')}
                                </Text>
                              </View>
                            )}
                            {!!cap.motivo_voluntario && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Por qué quiere ser voluntario</Text>
                                <Text style={{ fontSize: 13, color: COLORS.textDark }}>
                                  {cap.motivo_voluntario}
                                </Text>
                              </View>
                            )}
                            {!!resumen?.contacto_y_compromisos.motivaciones.length && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Motivaciones</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                  {resumen.contacto_y_compromisos.motivaciones.join(', ')}
                                </Text>
                              </View>
                            )}
                            {!!cap.experiencia_previa && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Experiencia previa</Text>
                                <Text style={{ fontSize: 13, color: COLORS.textDark }}>
                                  {cap.experiencia_previa}
                                </Text>
                              </View>
                            )}
                            {!!resumen?.contacto_y_compromisos.comentarios && (
                              <View>
                                <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Comentarios adicionales</Text>
                                <Text style={{ fontSize: 13, color: COLORS.textDark }}>
                                  {resumen.contacto_y_compromisos.comentarios}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {!!resumen && (resumen.movilidad.radio_max_km != null || !!resumen.movilidad.medios_transporte.length || !!resumen.disponibilidad.tiempo_reaccion || !!resumen.disponibilidad.urgencias) && (
                          <View style={{ backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 16 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textLight, marginBottom: 12, textTransform: 'uppercase' }}>
                              Disponibilidad y movilidad
                            </Text>
                            <View style={{ gap: 10 }}>
                              {(resumen.movilidad.radio_max_km != null || !!resumen.movilidad.medios_transporte.length) && (
                                <View>
                                  <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Radio y transporte</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                    {resumen.movilidad.radio_max_km != null ? `${resumen.movilidad.radio_max_km} km` : 'Radio no especificado'}
                                    {resumen.movilidad.medios_transporte.length ? ` · ${resumen.movilidad.medios_transporte.join(', ')}` : ''}
                                  </Text>
                                </View>
                              )}
                              {!!resumen.disponibilidad.tiempo_reaccion && (
                                <View>
                                  <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Tiempo de respuesta</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                    {resumen.disponibilidad.tiempo_reaccion}
                                  </Text>
                                </View>
                              )}
                              {!!resumen.disponibilidad.urgencias && (
                                <View>
                                  <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Disponibilidad en emergencias</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                    {resumen.disponibilidad.urgencias}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        )}

                        {!!resumen && (!!resumen.manejo_animal.experiencias_campo.length || !!resumen.manejo_animal.trayectoria.length || !!resumen.manejo_animal.experiencia_anios) && (
                          <View style={{ backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 16 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textLight, marginBottom: 12, textTransform: 'uppercase' }}>
                              Experiencia declarada
                            </Text>
                            <View style={{ gap: 10 }}>
                              {!!resumen.manejo_animal.experiencias_campo.length && (
                                <View>
                                  <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Experiencia en campo</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                    {resumen.manejo_animal.experiencias_campo.join(', ')}
                                  </Text>
                                </View>
                              )}
                              {!!resumen.manejo_animal.trayectoria.length && (
                                <View>
                                  <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Dónde ha adquirido experiencia</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                    {resumen.manejo_animal.trayectoria.join(', ')}
                                  </Text>
                                </View>
                              )}
                              {!!resumen.manejo_animal.experiencia_anios && (
                                <View>
                                  <Text style={{ fontSize: 11, color: COLORS.textLight, marginBottom: 2 }}>Años de experiencia</Text>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textDark, textTransform: 'capitalize' }}>
                                    {resumen.manejo_animal.experiencia_anios}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        )}
                      </>
                    );
                  })()}

                  {intentosPrevios[postulacionSeleccionada.voluntario_id] && (
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 12 }}>
                        Historial de postulaciones
                      </Text>

                      {intentosPrevios[postulacionSeleccionada.voluntario_id].map((intento: any) => (
                        <View
                          key={intento.id}
                          style={{
                            backgroundColor: COLORS.cardBg,
                            padding: 12,
                            borderRadius: 12,
                            marginBottom: 10,
                            borderLeftWidth: 3,
                            borderLeftColor:
                              intento.estado === 'aceptada'
                                ? COLORS.success
                                : intento.estado === 'rechazada'
                                ? COLORS.danger
                                : COLORS.warning,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textDark }}>
                              {intento.numero_intento}ª postulación
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 8,
                                backgroundColor:
                                  intento.estado === 'aceptada'
                                    ? 'rgba(39, 174, 96, 0.1)'
                                    : intento.estado === 'rechazada'
                                    ? 'rgba(231, 76, 60, 0.1)'
                                    : 'rgba(243, 156, 18, 0.1)',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '700',
                                  color:
                                    intento.estado === 'aceptada'
                                      ? COLORS.success
                                      : intento.estado === 'rechazada'
                                      ? COLORS.danger
                                      : COLORS.warning,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {intento.estado}
                              </Text>
                            </View>
                          </View>

                          {intento.motivo_rechazo && (
                            <Text style={{ fontSize: 11, color: COLORS.danger, marginTop: 6 }}>
                              Motivo: {intento.motivo_rechazo}
                            </Text>
                          )}

                          <Text style={{ fontSize: 10, color: COLORS.textLight, marginTop: 6 }}>
                            {new Date(intento.created_at).toLocaleDateString('es-MX')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </AppModal>
    </View>
  );
}
