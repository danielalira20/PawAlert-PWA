import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { QrDisplayModal } from '../../components/red-aliados/QrDisplayModal';
import LocationPickerMap from '../LocationPickerMap';

const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  border: '#F0E6D6',
  cardBg: '#FFFFFF',
  grayLight: '#F3F4F6',
  success: '#27AE60',
  warning: '#F39C12',
  danger: '#E74C3C',
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

interface Lote {
  id: string;
  categoria: string;
  subcategoria_descripcion: string | null;
  especies_aplica: string[];
  cantidad_valor: number;
  cantidad_unidad: string;
  tipo_empaque: string;
  divisible: string;
  max_asociaciones: number;
  forma_entrega: string;
  descripcion: string | null;
  fecha_disponibilidad: string | null;
  vigencia: string | null;
  lugar_entrega: string | null;
  direccion_entrega: string | null;
  direccion_detalle: Record<string, string>;
  detalle: Record<string, string>;
  activo: boolean;
  deshabilitado_at: string | null;
  created_at: string;
  asociaciones_invitadas: number;
  asociaciones_cupo_ocupado: number;
  asociaciones_aceptadas: number;
}

interface InvitacionLote {
  id: string;
  estado: string;
  cantidad_asignada: number | null;
  asociacion_nombre: string | null;
}

interface AsociacionCompatible {
  id: string;
  nombre: string;
  distancia_km: number;
}

type FiltroLote = 'todos' | 'activos' | 'asignados' | 'deshabilitados';

const FILTROS: { value: FiltroLote; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'asignados', label: 'Asignados' },
  { value: 'deshabilitados', label: 'Deshabilitados' },
];

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

const estadoLote = (lote: Lote) => {
  if (!lote.activo) {
    return { label: 'Deshabilitado', color: COLORS.danger, icon: 'pause-circle-outline' as const };
  }
  if (lote.asociaciones_aceptadas > 0) {
    return { label: 'Asignado', color: COLORS.success, icon: 'checkmark-circle-outline' as const };
  }
  if (lote.asociaciones_invitadas > 0) {
    return { label: 'Esperando respuesta', color: COLORS.warning, icon: 'time-outline' as const };
  }
  return { label: 'Activo · sin invitaciones', color: COLORS.primary, icon: 'radio-button-on-outline' as const };
};

const coordenadasLote = (lugarEntrega?: string | null) => {
  if (!lugarEntrega) return null;
  const [latitudTexto, longitudTexto] = lugarEntrega.split(',');
  const latitud = Number(latitudTexto);
  const longitud = Number(longitudTexto);
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
  return { latitud, longitud };
};

interface Props {
  onClose?: () => void;
  // Modo embebido (dentro de AliadoDashboardScreen, como tab) — oculta el
  // banner de header propio, que ahí sería redundante. La ruta standalone
  // /mis-lotes no pasa este prop, así que se queda exactamente igual.
  embedded?: boolean;
}

export default function MisLotesScreen({ onClose, embedded }: Props) {
  const { token } = useAuth();
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [loteSeleccionado, setLoteSeleccionado] = useState<Lote | null>(null);
  const [invitaciones, setInvitaciones] = useState<InvitacionLote[]>([]);
  const [isLoadingInvitaciones, setIsLoadingInvitaciones] = useState(false);

  const [qrInvitacionId, setQrInvitacionId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroLote>('todos');
  const [confirmarCambioEstado, setConfirmarCambioEstado] = useState(false);
  const [isUpdatingEstado, setIsUpdatingEstado] = useState(false);
  const [estadoError, setEstadoError] = useState('');
  const [mostrarInvitar, setMostrarInvitar] = useState(false);
  const [asociacionesCompatibles, setAsociacionesCompatibles] = useState<AsociacionCompatible[]>([]);
  const [asociacionesSeleccionadas, setAsociacionesSeleccionadas] = useState<string[]>([]);
  const [isLoadingAsociaciones, setIsLoadingAsociaciones] = useState(false);
  const [isInvitando, setIsInvitando] = useState(false);
  const [invitacionError, setInvitacionError] = useState('');

  const cargarLotes = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/lotes/mios`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLotes(res.data);
    } catch {
      // silencioso — se muestra la lista vacía
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarLotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirLote = async (lote: Lote) => {
    setLoteSeleccionado(lote);
    setConfirmarCambioEstado(false);
    setEstadoError('');
    setMostrarInvitar(false);
    setAsociacionesCompatibles([]);
    setAsociacionesSeleccionadas([]);
    setInvitacionError('');
    setIsLoadingInvitaciones(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/lotes/${lote.id}/invitaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInvitaciones(res.data);
    } catch {
      setInvitaciones([]);
    } finally {
      setIsLoadingInvitaciones(false);
    }
  };

  const abrirSelectorAsociaciones = async () => {
    if (!loteSeleccionado) return;
    setMostrarInvitar(true);
    setIsLoadingAsociaciones(true);
    setInvitacionError('');
    setAsociacionesSeleccionadas([]);
    try {
      const res = await axios.get(
        `${API_URL}/red-aliados/lotes/${loteSeleccionado.id}/asociaciones-compatibles`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setAsociacionesCompatibles(res.data);
    } catch (error: any) {
      setAsociacionesCompatibles([]);
      setInvitacionError(error?.response?.data?.detail || 'No pudimos cargar asociaciones compatibles.');
    } finally {
      setIsLoadingAsociaciones(false);
    }
  };

  const toggleAsociacion = (asociacionId: string) => {
    if (!loteSeleccionado) return;
    const cupoRestante = loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado;
    setInvitacionError('');
    setAsociacionesSeleccionadas((actuales) => {
      if (actuales.includes(asociacionId)) {
        return actuales.filter((id) => id !== asociacionId);
      }
      if (loteSeleccionado.divisible === 'no') return [asociacionId];
      if (actuales.length >= cupoRestante) {
        setInvitacionError(`Solo puedes seleccionar ${cupoRestante} asociación(es) más.`);
        return actuales;
      }
      return [...actuales, asociacionId];
    });
  };

  const invitarAsociaciones = async () => {
    if (!loteSeleccionado || asociacionesSeleccionadas.length === 0) return;
    const cupoRestante = loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado;
    if (asociacionesSeleccionadas.length !== cupoRestante) {
      setInvitacionError(
        cupoRestante === 1
          ? 'Selecciona la asociación que recibirá el lote.'
          : `Selecciona exactamente ${cupoRestante} asociaciones.`,
      );
      return;
    }
    setIsInvitando(true);
    setInvitacionError('');
    try {
      await axios.post(
        `${API_URL}/red-aliados/lotes/${loteSeleccionado.id}/invitar`,
        { asociacion_ids: asociacionesSeleccionadas },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const invitacionesRes = await axios.get(
        `${API_URL}/red-aliados/lotes/${loteSeleccionado.id}/invitaciones`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setInvitaciones(invitacionesRes.data);
      const totalInvitaciones = invitacionesRes.data.length;
      const cupoOcupado = invitacionesRes.data.filter(
        (invitacion: InvitacionLote) => invitacion.estado !== 'rechazada',
      ).length;
      const totalAceptadas = invitacionesRes.data.filter(
        (invitacion: InvitacionLote) => ['aceptada', 'confirmada'].includes(invitacion.estado),
      ).length;
      const actualizado = {
        ...loteSeleccionado,
        asociaciones_invitadas: totalInvitaciones,
        asociaciones_cupo_ocupado: cupoOcupado,
        asociaciones_aceptadas: totalAceptadas,
      };
      setLoteSeleccionado(actualizado);
      setLotes((actuales) => actuales.map((lote) => (lote.id === actualizado.id ? actualizado : lote)));
      setMostrarInvitar(false);
      setAsociacionesSeleccionadas([]);
      setAsociacionesCompatibles([]);
    } catch (error: any) {
      setInvitacionError(error?.response?.data?.detail || 'No pudimos enviar las invitaciones.');
    } finally {
      setIsInvitando(false);
    }
  };

  const abrirQr = (invitacionId: string) => {
    // Sustituye el detalle por el QR para evitar dos modales y dos botones
    // de cierre superpuestos.
    setLoteSeleccionado(null);
    setTimeout(() => setQrInvitacionId(invitacionId), 120);
  };

  const lotesFiltrados = lotes.filter((lote) => {
    if (filtro === 'deshabilitados') return !lote.activo;
    if (filtro === 'asignados') return lote.asociaciones_aceptadas > 0;
    if (filtro === 'activos') return lote.activo;
    return true;
  });

  const cambiarEstado = async () => {
    if (!loteSeleccionado) return;
    const siguienteActivo = !loteSeleccionado.activo;
    setIsUpdatingEstado(true);
    setEstadoError('');
    try {
      const res = await axios.patch(
        `${API_URL}/red-aliados/lotes/${loteSeleccionado.id}/estado`,
        { activo: siguienteActivo },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const actualizado = {
        ...loteSeleccionado,
        activo: res.data.activo,
        deshabilitado_at: res.data.deshabilitado_at,
      };
      setLotes((actuales) => actuales.map((lote) => (lote.id === actualizado.id ? actualizado : lote)));
      setLoteSeleccionado(actualizado);
      setConfirmarCambioEstado(false);
    } catch (error: any) {
      setEstadoError(error?.response?.data?.detail || 'No pudimos actualizar el estado del lote.');
    } finally {
      setIsUpdatingEstado(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgWhite }}>
      {!embedded && (
        <View style={{
          backgroundColor: COLORS.bgTeal, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22,
          borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFF' }}>Mis lotes</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Lotes que has registrado</Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 18, padding: 7 }}>
              <Ionicons name="close" size={18} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : lotes.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="cube-outline" size={48} color={COLORS.textLight} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark, textAlign: 'center' }}>
            Todavía no has registrado ningún lote
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.listIntro}>
            <View>
              <Text style={styles.listTitle}>Tus aportaciones registradas</Text>
              <Text style={styles.listSubtitle}>
                Consulta el recurso, sus invitaciones y el estado de entrega.
              </Text>
            </View>
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>{lotes.length}</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filtersRow}>
              {FILTROS.map((opcion) => (
                <TouchableOpacity
                  key={opcion.value}
                  onPress={() => setFiltro(opcion.value)}
                  style={[styles.filterButton, filtro === opcion.value && styles.filterButtonActive]}
                >
                  <Text style={[styles.filterText, filtro === opcion.value && styles.filterTextActive]}>
                    {opcion.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {lotesFiltrados.length === 0 ? (
            <View style={styles.filteredEmpty}>
              <Ionicons name="file-tray-outline" size={34} color={COLORS.textLight} />
              <Text style={styles.filteredEmptyTitle}>No hay lotes en este filtro</Text>
              <Text style={styles.filteredEmptyText}>Prueba con otra categoría de estado.</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {lotesFiltrados.map((lote) => {
                const estado = estadoLote(lote);
              const fotoUrl = lote.detalle?.foto_url;
              const marca = normalizarValor(lote.detalle?.marca);
              const especie = lote.especies_aplica?.length
                ? lote.especies_aplica.map((valor) => normalizarValor(valor)).filter(Boolean).join(' y ')
                : null;
              const caducidad = formatearFecha(lote.detalle?.fecha_caducidad);
              return (
                <TouchableOpacity
                  key={lote.id}
                  onPress={() => abrirLote(lote)}
                  activeOpacity={0.78}
                  style={styles.lotCard}
                >
                  <View style={styles.lotCardMedia}>
                    {fotoUrl ? (
                      <Image 
                        source={{ uri: fotoUrl }} 
                        style={[styles.lotImage, { backgroundColor: COLORS.grayLight }]} 
                        resizeMode="contain" 
                      />
                    ) : (
                      <View style={styles.lotImagePlaceholder}>
                        <Ionicons name="cube-outline" size={34} color={COLORS.primary} />
                        <Text style={styles.lotImagePlaceholderText}>Sin fotografía</Text>
                      </View>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: `${estado.color}F0` }]}>
                      <Ionicons name={estado.icon} size={13} color={COLORS.bgWhite} />
                      <Text style={styles.statusBadgeText}>{estado.label}</Text>
                    </View>
                  </View>

                  <View style={styles.lotCardBody}>
                    <View style={styles.lotCardHeading}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lotCategory}>{lote.categoria}</Text>
                        <Text style={styles.lotName}>
                          {lote.subcategoria_descripcion || lote.categoria}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={19} color={COLORS.textLight} />
                    </View>

                    <View style={styles.quantityBox}>
                      <View>
                        <Text style={styles.dataLabel}>Cantidad</Text>
                        <Text style={styles.quantityValue}>
                          {lote.cantidad_valor} {lote.cantidad_unidad}
                        </Text>
                      </View>
                      <View style={styles.quantityDivider} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dataLabel}>Presentación</Text>
                        <Text style={styles.presentationValue} numberOfLines={2}>
                          {lote.tipo_empaque}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailsChips}>
                      {marca && (
                        <View style={styles.detailChip}>
                          <Ionicons name="pricetag-outline" size={13} color={COLORS.textLight} />
                          <Text style={styles.detailChipText}>{marca}</Text>
                        </View>
                      )}
                      {especie && (
                        <View style={styles.detailChip}>
                          <Ionicons name="paw-outline" size={13} color={COLORS.textLight} />
                          <Text style={styles.detailChipText}>{especie}</Text>
                        </View>
                      )}
                      {caducidad && (
                        <View style={styles.detailChip}>
                          <Ionicons name="calendar-outline" size={13} color={COLORS.textLight} />
                          <Text style={styles.detailChipText}>{caducidad}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={styles.cardFooterText}>
                        {lote.asociaciones_invitadas} invitada{lote.asociaciones_invitadas !== 1 ? 's' : ''}
                      </Text>
                      <View style={styles.footerDot} />
                      <Text style={[styles.cardFooterText, lote.asociaciones_aceptadas > 0 && { color: COLORS.success }]}>
                        {lote.asociaciones_aceptadas} aceptada{lote.asociaciones_aceptadas !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={!!loteSeleccionado} transparent animationType="fade" onRequestClose={() => setLoteSeleccionado(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={styles.detailModal}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textDark }}>Detalle del lote</Text>
                <Text style={{ color: COLORS.textLight, fontSize: 12, marginTop: 2 }}>
                  Información e invitaciones
                </Text>
              </View>
              <TouchableOpacity onPress={() => setLoteSeleccionado(null)}>
                <Ionicons name="close" size={22} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {loteSeleccionado && (
                <>
                  <View style={styles.modalResource}>
                    {loteSeleccionado.detalle?.foto_url ? (
                      <Image
                        source={{ uri: loteSeleccionado.detalle.foto_url }}
                        style={[styles.modalResourceImage, { backgroundColor: COLORS.grayLight }]}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.modalResourceImage, styles.modalResourcePlaceholder]}>
                        <Ionicons name="cube-outline" size={28} color={COLORS.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalResourceName}>
                        {loteSeleccionado.subcategoria_descripcion || loteSeleccionado.categoria}
                      </Text>
                      <Text style={styles.modalResourceQuantity}>
                        {loteSeleccionado.cantidad_valor} {loteSeleccionado.cantidad_unidad}
                      </Text>
                      <Text style={styles.modalResourcePackage}>{loteSeleccionado.tipo_empaque}</Text>
                    </View>
                  </View>

                  <View style={styles.modalDataGrid}>
                    {Object.entries(loteSeleccionado.detalle || {})
                      .filter(([key, value]) => DETALLE_LABEL[key] && key !== 'foto_url' && !!value)
                      .map(([key, value]) => (
                        <View key={key} style={styles.modalDataItem}>
                          <Text style={styles.dataLabel}>{DETALLE_LABEL[key]}</Text>
                          <Text style={styles.modalDataValue}>{normalizarValor(value) || '—'}</Text>
                        </View>
                      ))}
                    {loteSeleccionado.fecha_disponibilidad && (
                      <View style={styles.modalDataItem}>
                        <Text style={styles.dataLabel}>Disponible desde</Text>
                        <Text style={styles.modalDataValue}>
                          {formatearFecha(loteSeleccionado.fecha_disponibilidad)}
                        </Text>
                      </View>
                    )}
                    {loteSeleccionado.vigencia && (
                      <View style={styles.modalDataItem}>
                        <Text style={styles.dataLabel}>Disponible hasta</Text>
                        <Text style={styles.modalDataValue}>{formatearFecha(loteSeleccionado.vigencia)}</Text>
                      </View>
                    )}
                  </View>

                  {!!loteSeleccionado.direccion_entrega && (
                    <View style={styles.modalAddress}>
                      <Ionicons name="location-outline" size={17} color={COLORS.primary} />
                      <Text style={styles.modalAddressText}>{loteSeleccionado.direccion_entrega}</Text>
                    </View>
                  )}

                  {coordenadasLote(loteSeleccionado.lugar_entrega) && (
                    <View style={styles.modalMap}>
                      <LocationPickerMap
                        selectedPosition={coordenadasLote(loteSeleccionado.lugar_entrega)}
                        onLocationSelect={() => undefined}
                        readOnly
                      />
                    </View>
                  )}

                  <View style={styles.invitationsHeading}>
                    <Text style={styles.invitationsTitle}>Invitaciones</Text>
                    <Text style={styles.allocationSummary}>
                      {invitaciones
                        .filter((inv) => ['aceptada', 'confirmada'].includes(inv.estado))
                        .reduce((total, inv) => total + Number(inv.cantidad_asignada || 0), 0)}{' '}
                      de {loteSeleccionado.cantidad_valor} {loteSeleccionado.cantidad_unidad} asignados
                    </Text>
                  </View>
                </>
              )}

              {isLoadingInvitaciones ? (
                <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 30 }} />
              ) : invitaciones.length === 0 ? (
                <Text style={{ color: COLORS.textLight, fontSize: 13, textAlign: 'center', marginVertical: 20 }}>
                  Todavía no has invitado a ninguna asociación.
                </Text>
              ) : (
                invitaciones.map((inv) => (
                  <View key={inv.id} style={{ backgroundColor: COLORS.grayLight, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark }}>
                        {inv.asociacion_nombre || 'Asociación'}
                      </Text>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: `${ESTADO_COLOR[inv.estado]}18` }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: ESTADO_COLOR[inv.estado] }}>{ESTADO_LABEL[inv.estado]}</Text>
                      </View>
                    </View>
                    {inv.estado === 'aceptada' && (
                      <View style={{ marginTop: 10 }}>
                        {!!inv.cantidad_asignada && (
                          <Text style={styles.invitationAmount}>
                            Parte aceptada: {inv.cantidad_asignada} {loteSeleccionado?.cantidad_unidad}
                          </Text>
                        )}
                        <TouchableOpacity
                          onPress={() => abrirQr(inv.id)}
                          style={{ flexDirection: 'row', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Ionicons name="qr-code-outline" size={15} color={COLORS.bgWhite} />
                          <Text style={{ color: COLORS.bgWhite, fontWeight: '700', fontSize: 12 }}>
                            Mostrar código de entrega
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {inv.estado === 'confirmada' && !!inv.cantidad_asignada && (
                      <Text style={styles.invitationAmount}>
                        Recibido: {inv.cantidad_asignada} {loteSeleccionado?.cantidad_unidad}
                      </Text>
                    )}
                  </View>
                ))
              )}

              {loteSeleccionado?.activo
                && loteSeleccionado.asociaciones_cupo_ocupado < loteSeleccionado.max_asociaciones
                && (
                  <View style={styles.inviteMoreSection}>
                    {!mostrarInvitar ? (
                      <TouchableOpacity style={styles.inviteMoreButton} onPress={abrirSelectorAsociaciones}>
                        <Ionicons name="person-add-outline" size={16} color={COLORS.primary} />
                        <Text style={styles.inviteMoreButtonText}>Invitar asociaciones</Text>
                        <Text style={styles.inviteSlotsText}>
                          {loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado} lugar(es)
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.inviteSelector}>
                        <View style={styles.inviteSelectorHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.inviteSelectorTitle}>
                              {loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado === 1
                                ? 'Escoge tu asociación'
                                : `Escoge tus ${loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado} asociaciones`}
                            </Text>
                            <Text style={styles.inviteSelectorSubtitle}>
                              Selecciona exactamente {loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado}.
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              setMostrarInvitar(false);
                              setInvitacionError('');
                            }}
                          >
                            <Ionicons name="close" size={19} color={COLORS.textLight} />
                          </TouchableOpacity>
                        </View>

                        {isLoadingAsociaciones ? (
                          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
                        ) : asociacionesCompatibles.length === 0 ? (
                          <Text style={styles.inviteEmptyText}>
                            No hay nuevas asociaciones compatibles disponibles.
                          </Text>
                        ) : (
                          asociacionesCompatibles.map((asociacion) => {
                            const seleccionada = asociacionesSeleccionadas.includes(asociacion.id);
                            return (
                              <TouchableOpacity
                                key={asociacion.id}
                                style={[styles.associationOption, seleccionada && styles.associationOptionSelected]}
                                onPress={() => toggleAsociacion(asociacion.id)}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.associationName}>{asociacion.nombre}</Text>
                                  <Text style={styles.associationDistance}>
                                    {Number(asociacion.distancia_km).toFixed(1)} km
                                  </Text>
                                </View>
                                <Ionicons
                                  name={seleccionada ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={21}
                                  color={seleccionada ? COLORS.primary : COLORS.textLight}
                                />
                              </TouchableOpacity>
                            );
                          })
                        )}

                        {!!invitacionError && <Text style={styles.inviteError}>{invitacionError}</Text>}
                        {asociacionesCompatibles.length > 0 && (
                          <TouchableOpacity
                            style={[
                              styles.sendInvitesButton,
                              (
                                asociacionesSeleccionadas.length
                                  !== loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado
                                || isInvitando
                              ) && { opacity: 0.5 },
                            ]}
                            onPress={invitarAsociaciones}
                            disabled={
                              asociacionesSeleccionadas.length
                                !== loteSeleccionado.max_asociaciones - loteSeleccionado.asociaciones_cupo_ocupado
                              || isInvitando
                            }
                          >
                            {isInvitando
                              ? <ActivityIndicator size="small" color={COLORS.bgWhite} />
                              : (
                                <Text style={styles.sendInvitesText}>
                                  Enviar invitación{asociacionesSeleccionadas.length !== 1 ? 'es' : ''} ({asociacionesSeleccionadas.length})
                                </Text>
                              )}
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                )}

              {loteSeleccionado && (
                <View style={styles.statusActions}>
                  {!!estadoError && <Text style={styles.statusError}>{estadoError}</Text>}
                  {confirmarCambioEstado ? (
                    <View style={styles.statusConfirmBox}>
                      <Text style={styles.statusConfirmText}>
                        {loteSeleccionado.activo
                          ? 'El lote dejará de aparecer como disponible, pero conservará todo su historial.'
                          : 'El lote volverá a estar disponible para nuevas invitaciones.'}
                      </Text>
                      <View style={styles.statusConfirmButtons}>
                        <TouchableOpacity
                          style={styles.statusCancelButton}
                          onPress={() => setConfirmarCambioEstado(false)}
                          disabled={isUpdatingEstado}
                        >
                          <Text style={styles.statusCancelText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.statusConfirmButton,
                            !loteSeleccionado.activo && { backgroundColor: COLORS.success },
                          ]}
                          onPress={cambiarEstado}
                          disabled={isUpdatingEstado}
                        >
                          {isUpdatingEstado ? (
                            <ActivityIndicator size="small" color={COLORS.bgWhite} />
                          ) : (
                            <Text style={styles.statusConfirmButtonText}>
                              {loteSeleccionado.activo ? 'Sí, deshabilitar' : 'Sí, reactivar'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.toggleStatusButton,
                        !loteSeleccionado.activo && styles.toggleStatusButtonEnable,
                      ]}
                      onPress={() => setConfirmarCambioEstado(true)}
                    >
                      <Ionicons
                        name={loteSeleccionado.activo ? 'pause-circle-outline' : 'play-circle-outline'}
                        size={17}
                        color={loteSeleccionado.activo ? COLORS.danger : COLORS.success}
                      />
                      <Text
                        style={[
                          styles.toggleStatusText,
                          !loteSeleccionado.activo && { color: COLORS.success },
                        ]}
                      >
                        {loteSeleccionado.activo ? 'Deshabilitar lote' : 'Reactivar lote'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <QrDisplayModal visible={!!qrInvitacionId} invitacionId={qrInvitacionId} onClose={() => setQrInvitacionId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 18, paddingBottom: 34, gap: 14 },
  listIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  listTitle: { color: COLORS.textDark, fontSize: 18, fontWeight: '900' },
  listSubtitle: { color: COLORS.textLight, fontSize: 12, lineHeight: 18, marginTop: 3 },
  totalBadge: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${COLORS.primary}18`,
  },
  totalBadgeText: { color: COLORS.primary, fontSize: 14, fontWeight: '900' },
  filtersRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.grayLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { color: COLORS.textLight, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: COLORS.bgWhite },
  filteredEmpty: {
    alignItems: 'center',
    paddingVertical: 44,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: '#FFFCF8',
  },
  filteredEmptyTitle: { color: COLORS.textDark, fontSize: 14, fontWeight: '800', marginTop: 10 },
  filteredEmptyText: { color: COLORS.textLight, fontSize: 12, marginTop: 3 },
  lotCard: {
    flex: 1,
    minWidth: 320,
    maxWidth: 500,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
    shadowColor: '#4A3728',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  lotCardMedia: { height: 150, position: 'relative', backgroundColor: '#FFF6EA' },
  lotImage: { width: '100%', height: '100%' },
  lotImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  lotImagePlaceholderText: { color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  statusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  statusBadgeText: { color: COLORS.bgWhite, fontSize: 10, fontWeight: '800' },
  lotCardBody: { padding: 16 },
  lotCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lotCategory: { color: COLORS.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  lotName: { color: COLORS.textDark, fontSize: 17, fontWeight: '900', marginTop: 2 },
  quantityBox: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FAF7F3',
  },
  dataLabel: { color: COLORS.textLight, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  quantityValue: { color: COLORS.textDark, fontSize: 16, fontWeight: '900', marginTop: 3 },
  quantityDivider: { width: 1, backgroundColor: COLORS.border },
  presentationValue: { color: COLORS.textDark, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 3 },
  detailsChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: COLORS.grayLight,
  },
  detailChipText: { color: COLORS.textLight, fontSize: 10, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cardFooterText: { color: COLORS.textLight, fontSize: 10, fontWeight: '700' },
  footerDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.textLight },
  detailModal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '86%',
    padding: 22,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
  },
  modalResource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFF8EF',
  },
  modalResourceImage: { width: 86, height: 86, borderRadius: 13 },
  modalResourcePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9E8D4' },
  modalResourceName: { color: COLORS.textDark, fontSize: 16, fontWeight: '900' },
  modalResourceQuantity: { color: COLORS.primary, fontSize: 14, fontWeight: '900', marginTop: 5 },
  modalResourcePackage: { color: COLORS.textLight, fontSize: 11, lineHeight: 16, marginTop: 2 },
  modalDataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  modalDataItem: {
    minWidth: '46%',
    flexGrow: 1,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: COLORS.bgWhite,
  },
  modalDataValue: { color: COLORS.textDark, fontSize: 12, fontWeight: '700', marginTop: 3 },
  modalAddress: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 13,
    backgroundColor: `${COLORS.primary}0D`,
  },
  modalAddressText: { flex: 1, color: COLORS.textDark, fontSize: 11, lineHeight: 17 },
  modalMap: { marginTop: 10, overflow: 'hidden', borderRadius: 14 },
  invitationsHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 20,
    marginBottom: 10,
  },
  invitationsTitle: { color: COLORS.textDark, fontSize: 14, fontWeight: '900' },
  allocationSummary: { flex: 1, color: COLORS.textLight, fontSize: 9, textAlign: 'right' },
  invitationAmount: { color: COLORS.textLight, fontSize: 10, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  inviteMoreSection: { marginTop: 4 },
  inviteMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 12,
    borderWidth: 1,
    borderColor: `${COLORS.primary}55`,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}08`,
  },
  inviteMoreButtonText: { flex: 1, color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  inviteSlotsText: { color: COLORS.textLight, fontSize: 10, fontWeight: '700' },
  inviteSelector: {
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: '#FFFCF8',
  },
  inviteSelectorHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  inviteSelectorTitle: { color: COLORS.textDark, fontSize: 13, fontWeight: '900' },
  inviteSelectorSubtitle: { color: COLORS.textLight, fontSize: 10, marginTop: 2 },
  associationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: COLORS.bgWhite,
  },
  associationOptionSelected: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}0D` },
  associationName: { color: COLORS.textDark, fontSize: 12, fontWeight: '800' },
  associationDistance: { color: COLORS.textLight, fontSize: 10, marginTop: 2 },
  inviteEmptyText: { color: COLORS.textLight, fontSize: 11, textAlign: 'center', paddingVertical: 18 },
  inviteError: {
    color: COLORS.danger,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
    padding: 8,
    borderRadius: 9,
    backgroundColor: `${COLORS.danger}0D`,
  },
  sendInvitesButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginTop: 9,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  sendInvitesText: { color: COLORS.bgWhite, fontSize: 11, fontWeight: '800' },
  statusActions: { marginTop: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
  statusError: {
    color: COLORS.danger,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: `${COLORS.danger}0D`,
  },
  toggleStatusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: `${COLORS.danger}55`,
    borderRadius: 12,
  },
  toggleStatusButtonEnable: { borderColor: `${COLORS.success}55` },
  toggleStatusText: { color: COLORS.danger, fontSize: 12, fontWeight: '800' },
  statusConfirmBox: { padding: 12, borderRadius: 13, backgroundColor: COLORS.grayLight },
  statusConfirmText: { color: COLORS.textDark, fontSize: 11, lineHeight: 17 },
  statusConfirmButtons: { flexDirection: 'row', gap: 8, marginTop: 11 },
  statusCancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bgWhite,
  },
  statusCancelText: { color: COLORS.textDark, fontSize: 11, fontWeight: '700' },
  statusConfirmButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
  },
  statusConfirmButtonText: { color: COLORS.bgWhite, fontSize: 11, fontWeight: '800' },
});
