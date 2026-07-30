import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../Toast';
import { EscanearQrModal } from '../red-aliados/EscanearQrModal';
import { AppModal } from '../AppModal';
import { AssocAvatar } from '../admin-dashboard/AssocAvatar';
import LocationPickerMap from '../../screens/LocationPickerMap';

// Misma paleta que PostulacionesPanel.tsx.
const COLORS = {
  primary: '#EC802B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  success: '#27AE60',
  warning: '#F39C12',
  cardBg: '#FAF3EA',
};

interface InvitacionLote {
  id: string;
  estado: 'invitada' | 'aceptada' | 'rechazada' | 'confirmada';
  cantidad_asignada: number | null;
  cantidad_disponible: number;
  cantidad_sugerida: number;
  created_at: string;
  lote: {
    id: string;
    categoria: string;
    subcategoria_descripcion: string | null;
    especies_aplica: string[];
    cantidad_valor: number;
    cantidad_unidad: string;
    tipo_empaque: string;
    divisible: 'no' | 'solo_empaques_completos' | 'aliado_prepara_lotes';
    forma_entrega: string;
    descripcion: string | null;
    fecha_disponibilidad: string | null;
    vigencia: string | null;
    lugar_entrega: string | null;
    direccion_entrega: string | null;
    direccion_detalle: Record<string, string>;
    detalle: Record<string, string>;
    aliado_nombre: string;
    aliado_logo_url?: string | null;
    ubicacion_aliado?: {
      calle?: string | null;
      colonia?: string | null;
      municipio?: string | null;
      referencia?: string | null;
      latitud?: number | null;
      longitud?: number | null;
    };
  };
}

const DETALLE_LABEL: Record<string, string> = {
  marca: 'Marca',
  etapa: 'Etapa',
  dieta_especial: 'Dieta',
  producto_cerrado: 'Producto cerrado',
  nuevo_o_usado: 'Estado',
  descripcion_contenido: 'Contenido',
  fecha_caducidad: 'Caducidad',
  tamanio: 'Tamaño',
  contenido_por_unidad: 'Contenido por unidad',
};

const normalizarValor = (valor?: string | null) => {
  if (!valor) return null;
  if (valor === 'si') return 'Sí';
  if (valor === 'no') return 'No';
  if (valor === 'no_aplica') return 'No aplica';
  return valor.replace(/_/g, ' ').replace(/^./, (letra) => letra.toUpperCase());
};

const formatearFecha = (valor?: string | null) => {
  if (!valor) return null;
  const fecha = new Date(`${valor.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

const coordenadasLote = (invitacion: InvitacionLote) => {
  const lugar = invitacion.lote.lugar_entrega;
  if (lugar) {
    const [latitudTexto, longitudTexto] = lugar.split(',');
    const latitud = Number(latitudTexto);
    const longitud = Number(longitudTexto);
    if (Number.isFinite(latitud) && Number.isFinite(longitud)) return { latitud, longitud };
  }

  const latitud = invitacion.lote.ubicacion_aliado?.latitud;
  const longitud = invitacion.lote.ubicacion_aliado?.longitud;
  return latitud != null && longitud != null ? { latitud, longitud } : null;
};

const FORMA_ENTREGA_LABEL: Record<string, string> = {
  institucion_lleva: 'El aliado lo lleva',
  asociacion_recoge: 'Ustedes deben recogerlo',
  ambas: 'Cualquiera de las dos formas',
  punto_acordado: 'Punto acordado',
};

const ESTADO_LABEL: Record<string, string> = {
  invitada: 'Pendiente',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  confirmada: 'Recibida',
};

const ESTADO_COLOR: Record<string, string> = {
  invitada: COLORS.warning,
  aceptada: COLORS.success,
  rechazada: COLORS.danger,
  confirmada: COLORS.success,
};

interface Props {
  visible: boolean;
}

export function LotesInvitacionesPanel({ visible }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [invitaciones, setInvitaciones] = useState<InvitacionLote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtro, setFiltro] = useState<'pendientes' | 'resueltas'>('pendientes');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [invitacionAccion, setInvitacionAccion] = useState<InvitacionLote | null>(null);
  const [showAceptarModal, setShowAceptarModal] = useState(false);
  const [cantidadAsignada, setCantidadAsignada] = useState('');
  const [showScanModal, setShowScanModal] = useState(false);
  const [invitacionDetalle, setInvitacionDetalle] = useState<InvitacionLote | null>(null);
  const [confirmarRechazo, setConfirmarRechazo] = useState(false);

  const cargarInvitaciones = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/invitaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInvitaciones(res.data);
    } catch {
      showToast({ title: 'Error', message: 'No pudimos cargar las invitaciones de lotes', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) cargarInvitaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const pendientesCount = invitaciones.filter((i) => i.estado === 'invitada').length;
  const filtradas = invitaciones.filter((i) =>
    filtro === 'pendientes' ? i.estado === 'invitada' : i.estado !== 'invitada'
  );

  const abrirAceptar = (invitacion: InvitacionLote) => {
    setInvitacionAccion(invitacion);
    setCantidadAsignada(String(invitacion.cantidad_sugerida || invitacion.cantidad_disponible));
    setShowAceptarModal(true);
  };

  const enviarAceptacion = async (invitacion: InvitacionLote, cantidad: number) => {
    if (!token) return;
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      showToast({ title: 'Cantidad inválida', message: 'Escribe una cantidad mayor a cero.', type: 'error' });
      return;
    }
    if (cantidad > invitacion.cantidad_disponible) {
      showToast({
        title: 'Cantidad no disponible',
        message: `Solo quedan ${invitacion.cantidad_disponible} ${invitacion.lote.cantidad_unidad}.`,
        type: 'error',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/red-aliados/invitaciones/${invitacion.id}/responder`,
        { aceptar: true, cantidad_asignada: cantidad },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ title: '¡Listo!', message: 'Aceptaste tu parte del lote', type: 'success' });
      setShowAceptarModal(false);
      setInvitacionAccion(null);
      setInvitacionDetalle(null);
      cargarInvitaciones();
    } catch (err: any) {
      showToast({ title: 'Error', message: err?.response?.data?.detail || 'No pudimos aceptar la invitación', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmarAceptar = async () => {
    if (!invitacionAccion) return;
    await enviarAceptacion(invitacionAccion, Number(cantidadAsignada));
  };

  const aceptarLoteCompleto = async (invitacion: InvitacionLote) => {
    await enviarAceptacion(invitacion, invitacion.lote.cantidad_valor);
  };

  const rechazar = async (invitacion: InvitacionLote) => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/red-aliados/invitaciones/${invitacion.id}/responder`,
        { aceptar: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ title: 'Invitación rechazada', message: '', type: 'success' });
      setConfirmarRechazo(false);
      setInvitacionDetalle(null);
      cargarInvitaciones();
    } catch (err: any) {
      showToast({ title: 'Error', message: err?.response?.data?.detail || 'No pudimos rechazar la invitación', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const abrirEscaner = () => {
    setInvitacionDetalle(null);
    setTimeout(() => setShowScanModal(true), 120);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View>
      <Toast toast={toast} translateY={translateY} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 20 }}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: COLORS.textDark }}>Lotes de aliados</Text>
          <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 4 }}>
            {pendientesCount} pendiente{pendientesCount !== 1 ? 's' : ''}
          </Text>
        </View>
        {pendientesCount > 0 && (
          <View style={{ backgroundColor: COLORS.danger, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}>
            <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '800' }}>{pendientesCount}</Text>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['pendientes', 'resueltas'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFiltro(f)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                backgroundColor: filtro === f ? COLORS.primary : COLORS.cardBg,
                borderWidth: filtro === f ? 0 : 1, borderColor: 'rgba(0,0,0,0.05)',
              }}
            >
              <Text style={{ color: filtro === f ? COLORS.white : COLORS.textDark, fontWeight: '700' }}>
                {f === 'pendientes' ? 'Pendientes' : 'Resueltas'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {filtradas.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Ionicons name="cube-outline" size={48} color={COLORS.textLight} style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.textLight }}>No hay invitaciones {filtro}</Text>
          </View>
        ) : (
          filtradas.map((inv) => (
            <TouchableOpacity
              key={inv.id}
              onPress={() => {
                setConfirmarRechazo(false);
                setInvitacionDetalle(inv);
              }}
              activeOpacity={0.7}
              style={{
                backgroundColor: COLORS.white, borderRadius: 18, marginBottom: 14,
                borderWidth: 1, borderColor: '#EFE5D9', overflow: 'hidden',
              }}
            >
              <View style={{ flexDirection: 'row' }}>
                {inv.lote.detalle?.foto_url ? (
                  <Image
                    source={{ uri: inv.lote.detalle.foto_url }}
                    style={{ width: 112, minHeight: 126 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 112, minHeight: 126, backgroundColor: '#FFF7EC', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="cube-outline" size={30} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textLight, fontSize: 10, marginTop: 5 }}>Sin fotografía</Text>
                  </View>
                )}
                <View style={{ flex: 1, padding: 15 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: COLORS.primary, textTransform: 'uppercase' }}>
                        {inv.lote.categoria}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark, marginTop: 2 }}>
                        {inv.lote.subcategoria_descripcion || inv.lote.categoria}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: `${ESTADO_COLOR[inv.estado]}18` }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: ESTADO_COLOR[inv.estado] }}>{ESTADO_LABEL[inv.estado]}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 5 }}>
                    Ofrecido por {inv.lote.aliado_nombre}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, color: COLORS.textLight, fontWeight: '800', textTransform: 'uppercase' }}>Cantidad</Text>
                      <Text style={{ fontSize: 14, color: COLORS.textDark, fontWeight: '900', marginTop: 2 }}>
                        {inv.cantidad_asignada || inv.cantidad_sugerida || inv.lote.cantidad_valor} {inv.lote.cantidad_unidad}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <EscanearQrModal
        visible={showScanModal}
        onClose={() => setShowScanModal(false)}
        onConfirmado={() => {
          cargarInvitaciones();
          setInvitacionDetalle(null);
        }}
      />

      <AppModal visible={!!invitacionDetalle} onClose={() => setInvitacionDetalle(null)} maxWidth={680}>
        {invitacionDetalle && (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {invitacionDetalle.lote.detalle?.foto_url ? (
              <Image
                source={{ uri: invitacionDetalle.lote.detalle.foto_url }}
                style={styles.detailHero}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.detailHero, styles.detailHeroPlaceholder]}>
                <Ionicons name="cube-outline" size={42} color={COLORS.primary} />
                <Text style={styles.photoPlaceholderText}>Este lote no tiene fotografía</Text>
              </View>
            )}

            <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              {invitacionDetalle.lote.aliado_logo_url ? (
                <Image
                  source={{ uri: invitacionDetalle.lote.aliado_logo_url }}
                  style={{ width: 54, height: 54, borderRadius: 27 }}
                  resizeMode="cover"
                />
              ) : (
                <AssocAvatar nombre={invitacionDetalle.lote.aliado_nombre} logoUrl={null} size="lg" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: COLORS.primary, fontWeight: '900', letterSpacing: 0.5 }}>OFRECIDO POR</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginTop: 2 }}>
                  {invitacionDetalle.lote.aliado_nombre}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: `${ESTADO_COLOR[invitacionDetalle.estado]}18` }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: ESTADO_COLOR[invitacionDetalle.estado] }}>
                  {ESTADO_LABEL[invitacionDetalle.estado]}
                </Text>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 14 }}>
                <Text style={{ fontSize: 11, color: COLORS.textLight, textTransform: 'uppercase', fontWeight: '700', marginBottom: 3 }}>Recurso</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark }}>
                  {invitacionDetalle.lote.subcategoria_descripcion || invitacionDetalle.lote.categoria}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginTop: 10 }}>
                  {invitacionDetalle.cantidad_asignada
                    || invitacionDetalle.cantidad_sugerida
                    || invitacionDetalle.lote.cantidad_valor}{' '}
                  {invitacionDetalle.lote.cantidad_unidad}
                </Text>
                {invitacionDetalle.estado === 'invitada' && (
                  <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 5 }}>
                    {invitacionDetalle.lote.divisible === 'no'
                      ? 'Este lote se entrega completo.'
                      : `Disponible: ${invitacionDetalle.cantidad_disponible} ${invitacionDetalle.lote.cantidad_unidad}`}
                  </Text>
                )}
              </View>

              <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 14 }}>
                <Text style={{ fontSize: 11, color: COLORS.textLight, textTransform: 'uppercase', fontWeight: '700', marginBottom: 3 }}>Empaque</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark }}>{invitacionDetalle.lote.tipo_empaque}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textLight, textTransform: 'uppercase', fontWeight: '700', marginTop: 10, marginBottom: 3 }}>Forma de entrega</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark }}>
                  {FORMA_ENTREGA_LABEL[invitacionDetalle.lote.forma_entrega] || invitacionDetalle.lote.forma_entrega}
                </Text>
              </View>

              {(Object.entries(invitacionDetalle.lote.detalle || {}).some(
                ([key, value]) => key !== 'foto_url' && !!DETALLE_LABEL[key] && !!value,
              ) || invitacionDetalle.lote.especies_aplica?.length > 0) && (
                <View style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EFE5D9' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                    <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textDark }}>Características del producto</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {invitacionDetalle.lote.especies_aplica?.length > 0 && (
                      <View style={styles.attributeItem}>
                        <Text style={styles.attributeLabel}>Para</Text>
                        <Text style={styles.attributeValue}>
                          {invitacionDetalle.lote.especies_aplica.map((item) => normalizarValor(item)).join(', ')}
                        </Text>
                      </View>
                    )}
                    {Object.entries(invitacionDetalle.lote.detalle || {})
                      .filter(([key, value]) => key !== 'foto_url' && !!DETALLE_LABEL[key] && !!value)
                      .map(([key, value]) => (
                        <View key={key} style={styles.attributeItem}>
                          <Text style={styles.attributeLabel}>{DETALLE_LABEL[key]}</Text>
                          <Text style={styles.attributeValue}>
                            {key === 'fecha_caducidad'
                              ? formatearFecha(String(value))
                              : normalizarValor(String(value))}
                          </Text>
                        </View>
                      ))}
                  </View>
                </View>
              )}

              {!!invitacionDetalle.lote.descripcion && (
                <View style={{ backgroundColor: '#EAF8FC', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#D2EFF8' }}>
                  <Text style={{ fontSize: 11, color: COLORS.textLight, textTransform: 'uppercase', fontWeight: '700', marginBottom: 3 }}>Descripción</Text>
                  <Text style={{ fontSize: 14, color: COLORS.textDark, lineHeight: 20 }}>{invitacionDetalle.lote.descripcion}</Text>
                </View>
              )}

              {(invitacionDetalle.lote.direccion_entrega || invitacionDetalle.lote.ubicacion_aliado?.calle || coordenadasLote(invitacionDetalle)) && (
                <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <Ionicons name="location-outline" size={18} color={COLORS.primary} />
                    <Text style={{ fontSize: 14, color: COLORS.textDark, fontWeight: '800' }}>Punto de entrega o recolección</Text>
                  </View>
                  {invitacionDetalle.lote.direccion_entrega ? (
                    <Text style={{ fontSize: 13, color: COLORS.textDark, lineHeight: 19 }}>
                      {invitacionDetalle.lote.direccion_entrega}
                    </Text>
                  ) : invitacionDetalle.lote.ubicacion_aliado?.calle ? (
                    <Text style={{ fontSize: 13, color: COLORS.textDark, lineHeight: 19 }}>
                      {[
                        invitacionDetalle.lote.ubicacion_aliado?.calle,
                        invitacionDetalle.lote.ubicacion_aliado?.colonia,
                        invitacionDetalle.lote.ubicacion_aliado?.municipio,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </Text>
                  ) : coordenadasLote(invitacionDetalle) ? (
                    <Text style={{ fontSize: 13, color: COLORS.textDark, lineHeight: 19 }}>
                      Zona indicada en el mapa
                    </Text>
                  ) : null}
                  {!!invitacionDetalle.lote.ubicacion_aliado?.referencia && (
                    <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 6 }}>
                      Referencia: {invitacionDetalle.lote.ubicacion_aliado?.referencia}
                    </Text>
                  )}
                  {coordenadasLote(invitacionDetalle) && (
                    <View style={styles.detailMap}>
                      <LocationPickerMap
                        selectedPosition={coordenadasLote(invitacionDetalle)!}
                        onLocationSelect={() => undefined}
                        readOnly
                      />
                    </View>
                  )}
                </View>
              )}

              <View style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EFE5D9' }}>
                <View style={{ flexDirection: 'row', gap: 18 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attributeLabel}>Invitación recibida</Text>
                    <Text style={styles.attributeValue}>
                      {new Date(invitacionDetalle.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                  {!!invitacionDetalle.lote.vigencia && (
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attributeLabel}>Disponible hasta</Text>
                      <Text style={styles.attributeValue}>{formatearFecha(invitacionDetalle.lote.vigencia)}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {invitacionDetalle.estado === 'invitada' && (
              confirmarRechazo ? (
                <View style={{ marginTop: 20, padding: 14, borderRadius: 14, backgroundColor: `${COLORS.danger}0D` }}>
                  <Text style={{ color: COLORS.textDark, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                    ¿Seguro que quieres rechazar este lote?
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => setConfirmarRechazo(false)}
                      disabled={isSubmitting}
                      style={{ flex: 1, backgroundColor: COLORS.white, paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
                    >
                      <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => rechazar(invitacionDetalle)}
                      disabled={isSubmitting}
                      style={{ flex: 1, backgroundColor: COLORS.danger, paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
                    >
                      {isSubmitting
                        ? <ActivityIndicator color={COLORS.white} />
                        : <Text style={{ color: COLORS.white, fontWeight: '700' }}>Sí, rechazar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  <TouchableOpacity
                    onPress={() => (
                      invitacionDetalle.lote.divisible === 'no'
                        ? aceptarLoteCompleto(invitacionDetalle)
                        : abrirAceptar(invitacionDetalle)
                    )}
                    disabled={isSubmitting || invitacionDetalle.cantidad_disponible <= 0}
                    style={{ flex: 1, backgroundColor: COLORS.success, paddingVertical: 13, borderRadius: 14, alignItems: 'center', opacity: isSubmitting || invitacionDetalle.cantidad_disponible <= 0 ? 0.5 : 1 }}
                  >
                    <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 14 }}>
                      {invitacionDetalle.cantidad_disponible <= 0
                        ? 'Lote asignado'
                        : invitacionDetalle.lote.divisible === 'no'
                          ? 'Aceptar lote completo'
                          : 'Aceptar una parte'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setConfirmarRechazo(true)}
                    disabled={isSubmitting}
                    style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.danger, paddingVertical: 13, borderRadius: 14, alignItems: 'center', opacity: isSubmitting ? 0.7 : 1 }}
                  >
                    <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 14 }}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {invitacionDetalle.estado === 'aceptada' && (
              <View style={{ marginTop: 20 }}>
                <TouchableOpacity
                  onPress={abrirEscaner}
                  style={{ flexDirection: 'row', gap: 6, backgroundColor: COLORS.success, paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="camera-outline" size={17} color={COLORS.white} />
                  <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 13 }}>
                    Escanear código del aliado
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            </View>
          </ScrollView>
        )}
      </AppModal>

      <Modal visible={showAceptarModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 12 }}>
              Aceptar parte del lote
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16, lineHeight: 18 }}>
              ¿Cuánto de este lote pueden recibir? Hay {invitacionAccion?.cantidad_disponible || 0}{' '}
              {invitacionAccion?.lote.cantidad_unidad} disponibles.
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.textDark, marginBottom: 16 }}
              keyboardType="numeric"
              value={cantidadAsignada}
              onChangeText={(v) => setCantidadAsignada(v.replace(/[^0-9.]/g, ''))}
              placeholder="Cantidad"
              placeholderTextColor={COLORS.textLight}
            />
            {!!invitacionAccion && (
              <Text style={{ color: COLORS.textLight, fontSize: 11, marginTop: -10, marginBottom: 16 }}>
                Sugerencia: {invitacionAccion.cantidad_sugerida} {invitacionAccion.lote.cantidad_unidad}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowAceptarModal(false); setInvitacionAccion(null); }}
                disabled={isSubmitting}
                style={{ flex: 1, borderWidth: 1, borderColor: COLORS.textLight, paddingVertical: 12, borderRadius: 12, alignItems: 'center', opacity: isSubmitting ? 0.7 : 1 }}
              >
                <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmarAceptar}
                disabled={isSubmitting || !cantidadAsignada.trim()}
                style={{ flex: 1, backgroundColor: COLORS.success, paddingVertical: 12, borderRadius: 12, alignItems: 'center', opacity: isSubmitting || !cantidadAsignada.trim() ? 0.7 : 1 }}
              >
                {isSubmitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '700' }}>Aceptar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  detailHero: {
    width: '100%',
    height: 230,
    backgroundColor: '#FFF7EC',
  },
  detailHeroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  attributeItem: {
    minWidth: 145,
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: '#FAF7F3',
    borderRadius: 12,
    padding: 11,
  },
  attributeLabel: {
    color: COLORS.textLight,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  attributeValue: {
    color: COLORS.textDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3,
  },
  detailMap: {
    height: 210,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#EADCCA',
  },
});
