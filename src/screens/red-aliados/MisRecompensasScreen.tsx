import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

// Mismos tokens exactos que MisOfertasProactivasScreen.tsx / MisLotesScreen.tsx
const COLORS = {
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

const NIVEL_LABEL: Record<string, string> = { pequena: 'Pequeña', mediana: 'Mediana', grande: 'Grande' };
const TIPO_LABEL: Record<string, string> = { descuento: 'Descuento', producto: 'Producto', servicio: 'Servicio' };

const ESTADO_INFO: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  borrador: { label: 'Borrador', color: COLORS.textLight, icon: 'document-text-outline' },
  activa: { label: 'Activa', color: COLORS.success, icon: 'checkmark-circle-outline' },
  pausada: { label: 'Pausada', color: COLORS.warning, icon: 'pause-circle-outline' },
  agotada: { label: 'Agotada', color: COLORS.danger, icon: 'alert-circle-outline' },
  vencida: { label: 'Vencida', color: COLORS.danger, icon: 'time-outline' },
  archivada: { label: 'Archivada', color: COLORS.textLight, icon: 'archive-outline' },
};

// Solo estos 4 estados tiene sentido filtrar desde el panel (spec de
// Persona 4: "Mostrar: Activas, Pausadas, Agotadas, Vencidas") — borrador y
// archivada siguen viéndose en "Todas", pero no tienen chip propio.
const FILTROS: { key: string; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'activa', label: 'Activas' },
  { key: 'pausada', label: 'Pausadas' },
  { key: 'agotada', label: 'Agotadas' },
  { key: 'vencida', label: 'Vencidas' },
];

// accion -> qué estado habilita el botón y el texto de confirmación.
const ACCIONES: Record<string, { desde: string[]; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; confirmacion: string }> = {
  publicar: {
    desde: ['borrador'],
    label: 'Publicar',
    icon: 'cloud-upload-outline',
    color: COLORS.success,
    confirmacion: 'La recompensa quedará visible en el catálogo para que la comunidad la canjee.',
  },
  pausar: {
    desde: ['activa'],
    label: 'Pausar',
    icon: 'pause-circle-outline',
    color: COLORS.warning,
    confirmacion: 'Dejará de aparecer en el catálogo, pero los códigos ya emitidos conservan sus condiciones.',
  },
  reactivar: {
    desde: ['pausada'],
    label: 'Reactivar',
    icon: 'play-circle-outline',
    color: COLORS.success,
    confirmacion: 'Volverá a estar disponible en el catálogo mientras tenga inventario.',
  },
  archivar: {
    desde: ['borrador', 'activa', 'pausada', 'agotada', 'vencida'],
    label: 'Archivar',
    icon: 'archive-outline',
    color: COLORS.danger,
    confirmacion: 'Se retira permanentemente del catálogo. Su historial y canjes ya emitidos se conservan.',
  },
};

interface Recompensa {
  id: string;
  tipo: string;
  categoria: string;
  subcategoria: string | null;
  nombre: string;
  descripcion: string;
  nivel: string;
  costo: number;
  unidades_totales: number;
  unidades_disponibles: number;
  inicio: string;
  vencimiento: string;
  sucursal_lugar: string | null;
  horario: string | null;
  forma_entrega: string;
  condiciones: string | null;
  estado: string;
  creado_at: string;
  canjes_confirmados: number;
  personas_beneficiadas: number;
}

interface Props {
  onClose?: () => void;
  embedded?: boolean;
}

const formatearFecha = (valor?: string | null) => {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function MisRecompensasScreen({ onClose, embedded }: Props) {
  const { token } = useAuth();
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtro, setFiltro] = useState('');

  const [seleccionada, setSeleccionada] = useState<Recompensa | null>(null);
  const [accionPendiente, setAccionPendiente] = useState<string | null>(null);
  const [isActualizando, setIsActualizando] = useState(false);
  const [accionError, setAccionError] = useState('');
  const [codigoCanje, setCodigoCanje] = useState('');

  const cargarRecompensas = async (estado: string) => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/recompensas/mias`, {
        params: estado ? { estado } : undefined,
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecompensas(res.data || []);
    } catch {
      // silencioso — se muestra la lista vacía, igual que el resto de red-aliados
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarRecompensas(filtro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const tieneActivas = recompensas.some((r) => r.estado === 'activa');

  const abrirDetalle = (recompensa: Recompensa) => {
    setSeleccionada(recompensa);
    setAccionPendiente(null);
    setAccionError('');
  };

  const ejecutarAccion = async (accion: string) => {
    if (!seleccionada) return;
    setIsActualizando(true);
    setAccionError('');
    try {
      const res = await axios.patch(
        `${API_URL}/recompensas/${seleccionada.id}/estado`,
        { accion },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRecompensas((prev) => prev.map((r) => (r.id === seleccionada.id ? res.data : r)));
      setSeleccionada(res.data);
      setAccionPendiente(null);
    } catch (error: any) {
      setAccionError(error?.response?.data?.detail || 'No se pudo actualizar la recompensa. Intenta de nuevo.');
    } finally {
      setIsActualizando(false);
    }
  };

  const confirmarCodigo = async () => {
    if (!codigoCanje.trim()) return;
    setIsActualizando(true);
    setAccionError('');
    try {
      await axios.post(`${API_URL}/recompensas/canjes/confirmar`, { codigo: codigoCanje.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCodigoCanje('');
      await cargarRecompensas(filtro);
      setSeleccionada(null);
    } catch (error: any) {
      setAccionError(error?.response?.data?.detail || 'No se pudo confirmar el código.');
    } finally {
      setIsActualizando(false);
    }
  };

  const accionesDisponibles = seleccionada
    ? Object.entries(ACCIONES).filter(([, def]) => def.desde.includes(seleccionada.estado))
    : [];

  return (
    <View style={embedded ? undefined : { flex: 1, backgroundColor: COLORS.bgWhite }}>
      {tieneActivas && (
        <View style={styles.beneficiosTag}>
          <Ionicons name="gift-outline" size={14} color={COLORS.success} />
          <Text style={styles.beneficiosTagText}>Ofrece beneficios — visible en el directorio público</Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosRow} contentContainerStyle={{ gap: 8 }}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFiltro(f.key)}
            style={[styles.filtroChip, filtro === f.key && styles.filtroChipActivo]}
          >
            <Text style={[styles.filtroChipText, filtro === f.key && styles.filtroChipTextActivo]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : recompensas.length === 0 ? (
        <View style={styles.filteredEmpty}>
          <Ionicons name="gift-outline" size={34} color={COLORS.textLight} />
          <Text style={styles.filteredEmptyTitle}>Aún no tienes recompensas</Text>
          <Text style={styles.filteredEmptyText}>Créalas desde "Crear recompensa" en tu panel.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: embedded ? 0 : 16 }}>
            {recompensas.map((recompensa) => {
              const estado = ESTADO_INFO[recompensa.estado];
              return (
                <TouchableOpacity
                  key={recompensa.id}
                  onPress={() => abrirDetalle(recompensa)}
                  activeOpacity={0.78}
                  style={styles.card}
                >
                  <View style={styles.cardHeading}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTipo}>{TIPO_LABEL[recompensa.tipo] || recompensa.tipo}</Text>
                      <Text style={styles.cardNombre}>{recompensa.nombre}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${estado.color}1A` }]}>
                      <Ionicons name={estado.icon} size={12} color={estado.color} />
                      <Text style={[styles.statusBadgeText, { color: estado.color }]}>{estado.label}</Text>
                    </View>
                  </View>

                  <View style={styles.quantityBox}>
                    <View>
                      <Text style={styles.dataLabel}>Unidades</Text>
                      <Text style={styles.quantityValue}>
                        {recompensa.unidades_disponibles} / {recompensa.unidades_totales}
                      </Text>
                    </View>
                    <View style={styles.quantityDivider} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dataLabel}>Costo</Text>
                      <Text style={styles.presentationValue}>{recompensa.costo} pts · {NIVEL_LABEL[recompensa.nivel]}</Text>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <Ionicons name="calendar-outline" size={12} color={COLORS.textLight} />
                    <Text style={styles.cardFooterText}>Vence el {formatearFecha(recompensa.vencimiento)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Modal visible={!!seleccionada} transparent animationType="fade" onRequestClose={() => setSeleccionada(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={styles.detailModal}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textDark }}>{seleccionada?.nombre}</Text>
                <Text style={{ color: COLORS.textLight, fontSize: 12, marginTop: 2 }}>
                  {seleccionada ? TIPO_LABEL[seleccionada.tipo] : ''} · {seleccionada ? NIVEL_LABEL[seleccionada.nivel] : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSeleccionada(null)}>
                <Ionicons name="close" size={22} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {seleccionada && (
                <>
                  <Text style={styles.modalDescripcion}>{seleccionada.descripcion}</Text>

                  <View style={styles.modalDataGrid}>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Unidades disponibles</Text>
                      <Text style={styles.modalDataValue}>
                        {seleccionada.unidades_disponibles} / {seleccionada.unidades_totales}
                      </Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Costo</Text>
                      <Text style={styles.modalDataValue}>{seleccionada.costo} pts</Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Vigencia</Text>
                      <Text style={styles.modalDataValue}>
                        {formatearFecha(seleccionada.inicio)} – {formatearFecha(seleccionada.vencimiento)}
                      </Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Estado</Text>
                      <Text style={styles.modalDataValue}>{ESTADO_INFO[seleccionada.estado]?.label}</Text>
                    </View>
                    {seleccionada.sucursal_lugar ? (
                      <View style={styles.modalDataItem}>
                        <Text style={styles.dataLabel}>Lugar</Text>
                        <Text style={styles.modalDataValue}>{seleccionada.sucursal_lugar}</Text>
                      </View>
                    ) : null}
                    {seleccionada.horario ? (
                      <View style={styles.modalDataItem}>
                        <Text style={styles.dataLabel}>Horario</Text>
                        <Text style={styles.modalDataValue}>{seleccionada.horario}</Text>
                      </View>
                    ) : null}
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Entrega</Text>
                      <Text style={styles.modalDataValue}>{seleccionada.forma_entrega}</Text>
                    </View>
                  </View>

                  <View style={styles.statusConfirmBox}>
                    <Text style={styles.dataLabel}>Confirmar código de canje</Text>
                    <TextInput
                      value={codigoCanje}
                      onChangeText={setCodigoCanje}
                      autoCapitalize="characters"
                      placeholder="Ej. A1B2C3D4E5F6"
                      style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, marginTop: 8 }}
                    />
                    <TouchableOpacity
                      style={[styles.statusConfirmButton, { backgroundColor: COLORS.success, marginTop: 8 }]}
                      onPress={confirmarCodigo}
                      disabled={isActualizando || !codigoCanje.trim()}
                    >
                      <Text style={styles.statusConfirmButtonText}>Confirmar canje</Text>
                    </TouchableOpacity>
                  </View>

                  {seleccionada.condiciones ? (
                    <Text style={styles.modalCondiciones}>Condiciones: {seleccionada.condiciones}</Text>
                  ) : null}

                  <View style={styles.modalDataGrid}>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Canjes confirmados</Text>
                      <Text style={styles.modalDataValue}>{seleccionada.canjes_confirmados ?? 0}</Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Personas beneficiadas</Text>
                      <Text style={styles.modalDataValue}>{seleccionada.personas_beneficiadas ?? 0}</Text>
                    </View>
                  </View>

                  <View style={styles.statusActions}>
                    {!!accionError && <Text style={styles.statusError}>{accionError}</Text>}
                    {accionPendiente ? (
                      <View style={styles.statusConfirmBox}>
                        <Text style={styles.statusConfirmText}>{ACCIONES[accionPendiente].confirmacion}</Text>
                        <View style={styles.statusConfirmButtons}>
                          <TouchableOpacity
                            style={styles.statusCancelButton}
                            onPress={() => setAccionPendiente(null)}
                            disabled={isActualizando}
                          >
                            <Text style={styles.statusCancelText}>Cancelar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.statusConfirmButton, { backgroundColor: ACCIONES[accionPendiente].color }]}
                            onPress={() => ejecutarAccion(accionPendiente)}
                            disabled={isActualizando}
                          >
                            {isActualizando ? (
                              <ActivityIndicator size="small" color={COLORS.bgWhite} />
                            ) : (
                              <Text style={styles.statusConfirmButtonText}>Sí, {ACCIONES[accionPendiente].label.toLowerCase()}</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {accionesDisponibles.map(([accion, def]) => (
                          <TouchableOpacity
                            key={accion}
                            style={[styles.toggleStatusButton, { borderColor: `${def.color}55` }]}
                            onPress={() => setAccionPendiente(accion)}
                          >
                            <Ionicons name={def.icon} size={17} color={def.color} />
                            <Text style={[styles.toggleStatusText, { color: def.color }]}>{def.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Estilos: mismos valores exactos que MisOfertasProactivasScreen.tsx.
const styles = StyleSheet.create({
  beneficiosTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: `${COLORS.success}1A`,
    marginBottom: 12,
  },
  beneficiosTagText: { color: COLORS.success, fontSize: 11, fontWeight: '800' },
  filtrosRow: { marginBottom: 14 },
  filtroChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: COLORS.grayLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filtroChipActivo: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filtroChipText: { color: COLORS.textDark, fontSize: 12, fontWeight: '700' },
  filtroChipTextActivo: { color: COLORS.bgWhite },
  filteredEmpty: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  filteredEmptyTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '800', marginTop: 4 },
  filteredEmptyText: { color: COLORS.textLight, fontSize: 12, textAlign: 'center', marginTop: 3, paddingHorizontal: 20 },
  card: {
    flex: 1,
    minWidth: 320,
    maxWidth: 500,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
    padding: 16,
    shadowColor: '#4A3728',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTipo: { color: COLORS.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  cardNombre: { color: COLORS.textDark, fontSize: 17, fontWeight: '900', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
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
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cardFooterText: { color: COLORS.textLight, fontSize: 10, fontWeight: '700' },
  detailModal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '86%',
    padding: 22,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
  },
  modalDescripcion: { color: COLORS.textDark, fontSize: 13, lineHeight: 19 },
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
  modalCondiciones: { color: COLORS.textLight, fontSize: 11, lineHeight: 17, marginTop: 12 },
  statusActions: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
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
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  toggleStatusText: { fontSize: 12, fontWeight: '800' },
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
  statusConfirmButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  statusConfirmButtonText: { color: COLORS.bgWhite, fontSize: 11, fontWeight: '800' },
});
