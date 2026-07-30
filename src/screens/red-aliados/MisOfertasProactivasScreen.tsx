import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

// Mismos tokens exactos que MisLotesScreen.tsx — no se inventa paleta nueva.
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

const CATEGORIA_LABEL: Record<string, string> = {
  alimentos: 'Alimentos',
  insumos: 'Insumos',
  servicios_veterinarios: 'Servicios veterinarios',
  difusion_campanas: 'Difusión y campañas',
};

const CATEGORIA_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  alimentos: 'nutrition-outline',
  insumos: 'cube-outline',
  servicios_veterinarios: 'medkit-outline',
  difusion_campanas: 'megaphone-outline',
};

interface OfertaProactiva {
  id: string;
  categoria: string;
  capacidad_declarada: number;
  capacidad_disponible: number;
  unidad: string;
  activa: boolean;
  created_at: string;
  detalle?: Record<string, string> | null;
  subcategoria_recurso?: { descripcion: string } | null;
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

const estadoOferta = (oferta: OfertaProactiva) => {
  if (!oferta.activa) {
    return { label: 'Pausada', color: COLORS.danger, icon: 'pause-circle-outline' as const };
  }
  return { label: 'Activa', color: COLORS.success, icon: 'checkmark-circle-outline' as const };
};

export default function MisOfertasProactivasScreen({ onClose, embedded }: Props) {
  const { token } = useAuth();
  const [ofertas, setOfertas] = useState<OfertaProactiva[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [ofertaSeleccionada, setOfertaSeleccionada] = useState<OfertaProactiva | null>(null);
  const [confirmarCambioEstado, setConfirmarCambioEstado] = useState(false);
  const [isUpdatingEstado, setIsUpdatingEstado] = useState(false);
  const [estadoError, setEstadoError] = useState('');

  const cargarOfertas = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/ofertas-proactivas/mias`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOfertas(res.data.ofertas || []);
    } catch {
      // silencioso — se muestra la lista vacía
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarOfertas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirOferta = (oferta: OfertaProactiva) => {
    setOfertaSeleccionada(oferta);
    setConfirmarCambioEstado(false);
    setEstadoError('');
  };

  const cambiarEstado = async () => {
    if (!ofertaSeleccionada) return;
    setIsUpdatingEstado(true);
    setEstadoError('');
    try {
      const res = await axios.patch(
        `${API_URL}/red-aliados/ofertas-proactivas/${ofertaSeleccionada.id}/estado`,
        { activa: !ofertaSeleccionada.activa },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOfertas((prev) =>
        prev.map((o) => (o.id === ofertaSeleccionada.id ? { ...o, ...res.data } : o))
      );
      setOfertaSeleccionada((prev) => (prev ? { ...prev, ...res.data } : prev));
      setConfirmarCambioEstado(false);
    } catch (error: any) {
      setEstadoError(
        error?.response?.data?.detail || 'No se pudo actualizar la oferta. Intenta de nuevo.'
      );
    } finally {
      setIsUpdatingEstado(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={embedded ? undefined : { flex: 1, backgroundColor: COLORS.bgWhite }}>
      {ofertas.length === 0 ? (
        <View style={styles.filteredEmpty}>
          <Ionicons name="pricetag-outline" size={34} color={COLORS.textLight} />
          <Text style={styles.filteredEmptyTitle}>Aún no tienes ofertas registradas</Text>
          <Text style={styles.filteredEmptyText}>
            Regístralas desde "Nueva aportación o lote" eligiendo "Dejar mi disponibilidad abierta".
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: embedded ? 0 : 16 }}>
            {ofertas.map((oferta) => {
              const estado = estadoOferta(oferta);
              return (
                <TouchableOpacity
                  key={oferta.id}
                  onPress={() => abrirOferta(oferta)}
                  activeOpacity={0.78}
                  style={styles.ofertaCard}
                >
                  <View style={styles.ofertaCardMedia}>
                    {oferta.detalle?.foto_url ? (
                        <Image
                        source={{ uri: oferta.detalle.foto_url }}
                        style={[styles.ofertaImage, { backgroundColor: COLORS.grayLight }]}
                        resizeMode="contain"
                        />
                    ) : (
                        <View style={styles.ofertaImagePlaceholder}>
                        <Ionicons name={CATEGORIA_ICON[oferta.categoria] || 'pricetag-outline'} size={34} color={COLORS.primary} />
                        </View>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: `${estado.color}F0` }]}>
                        <Ionicons name={estado.icon} size={13} color={COLORS.bgWhite} />
                        <Text style={styles.statusBadgeText}>{estado.label}</Text>
                    </View>
                </View>

                  <View style={styles.ofertaCardBody}>
                    <View style={styles.ofertaCardHeading}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ofertaCategory}>
                          {CATEGORIA_LABEL[oferta.categoria] || oferta.categoria}
                        </Text>
                        <Text style={styles.ofertaName}>
                          {oferta.subcategoria_recurso?.descripcion || CATEGORIA_LABEL[oferta.categoria]}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={19} color={COLORS.textLight} />
                    </View>

                    <View style={styles.quantityBox}>
                      <View>
                        <Text style={styles.dataLabel}>Disponible</Text>
                        <Text style={styles.quantityValue}>
                          {oferta.capacidad_disponible} {oferta.unidad}
                        </Text>
                      </View>
                      <View style={styles.quantityDivider} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dataLabel}>Declarada</Text>
                        <Text style={styles.presentationValue}>
                          {oferta.capacidad_declarada} {oferta.unidad}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      <Ionicons name="time-outline" size={12} color={COLORS.textLight} />
                      <Text style={styles.cardFooterText}>
                        Creada el {formatearFecha(oferta.created_at)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={!!ofertaSeleccionada}
        transparent
        animationType="fade"
        onRequestClose={() => setOfertaSeleccionada(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={styles.detailModal}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textDark }}>Detalle de la oferta</Text>
                <Text style={{ color: COLORS.textLight, fontSize: 12, marginTop: 2 }}>
                  Información y estado
                </Text>
              </View>
              <TouchableOpacity onPress={() => setOfertaSeleccionada(null)}>
                <Ionicons name="close" size={22} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {ofertaSeleccionada && (
                <>
                  {ofertaSeleccionada.detalle?.foto_url ? (
                    <Image
                        source={{ uri: ofertaSeleccionada.detalle.foto_url }}
                        style={[styles.modalResourceImage, { backgroundColor: COLORS.grayLight }]}
                        resizeMode="contain"
                    />
                    ) : (
                    <View style={[styles.modalResourceImage, styles.modalResourcePlaceholder]}>
                        <Ionicons name={CATEGORIA_ICON[ofertaSeleccionada.categoria] || 'pricetag-outline'} size={28} color={COLORS.primary} />
                    </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalResourceName}>
                        {ofertaSeleccionada.subcategoria_recurso?.descripcion ||
                          CATEGORIA_LABEL[ofertaSeleccionada.categoria]}
                      </Text>
                      <Text style={styles.modalResourceQuantity}>
                        {ofertaSeleccionada.capacidad_disponible} / {ofertaSeleccionada.capacidad_declarada}{' '}
                        {ofertaSeleccionada.unidad}
                      </Text>
                      <Text style={styles.modalResourcePackage}>
                        {CATEGORIA_LABEL[ofertaSeleccionada.categoria]}
                      </Text>
                    </View>
               

                  <View style={styles.modalDataGrid}>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Capacidad declarada</Text>
                      <Text style={styles.modalDataValue}>
                        {ofertaSeleccionada.capacidad_declarada} {ofertaSeleccionada.unidad}
                      </Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Capacidad disponible</Text>
                      <Text style={styles.modalDataValue}>
                        {ofertaSeleccionada.capacidad_disponible} {ofertaSeleccionada.unidad}
                      </Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Estado</Text>
                      <Text style={styles.modalDataValue}>
                        {ofertaSeleccionada.activa ? 'Activa' : 'Pausada'}
                      </Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Creada el</Text>
                      <Text style={styles.modalDataValue}>
                        {formatearFecha(ofertaSeleccionada.created_at)}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {ofertaSeleccionada && (
                <View style={styles.statusActions}>
                  {!!estadoError && <Text style={styles.statusError}>{estadoError}</Text>}
                  {confirmarCambioEstado ? (
                    <View style={styles.statusConfirmBox}>
                      <Text style={styles.statusConfirmText}>
                        {ofertaSeleccionada.activa
                          ? 'La oferta dejará de aparecer en cualquier sugerencia o búsqueda, pero conservará su historial.'
                          : 'La oferta volverá a estar disponible para el matching y las asociaciones que busquen ofertas.'}
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
                            !ofertaSeleccionada.activa && { backgroundColor: COLORS.success },
                          ]}
                          onPress={cambiarEstado}
                          disabled={isUpdatingEstado}
                        >
                          {isUpdatingEstado ? (
                            <ActivityIndicator size="small" color={COLORS.bgWhite} />
                          ) : (
                            <Text style={styles.statusConfirmButtonText}>
                              {ofertaSeleccionada.activa ? 'Sí, pausar' : 'Sí, reactivar'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.toggleStatusButton,
                        !ofertaSeleccionada.activa && styles.toggleStatusButtonEnable,
                      ]}
                      onPress={() => setConfirmarCambioEstado(true)}
                    >
                      <Ionicons
                        name={ofertaSeleccionada.activa ? 'pause-circle-outline' : 'play-circle-outline'}
                        size={17}
                        color={ofertaSeleccionada.activa ? COLORS.danger : COLORS.success}
                      />
                      <Text
                        style={[
                          styles.toggleStatusText,
                          !ofertaSeleccionada.activa && { color: COLORS.success },
                        ]}
                      >
                        {ofertaSeleccionada.activa ? 'Pausar oferta' : 'Reactivar oferta'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Estilos: todos copiados de las mismas propiedades de MisLotesScreen.tsx,
// solo renombrados de "lot*" a "oferta*" — sin inventar valores nuevos.
const styles = StyleSheet.create({
  filteredEmpty: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  filteredEmptyTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '800', marginTop: 4 },
  filteredEmptyText: { color: COLORS.textLight, fontSize: 12, textAlign: 'center', marginTop: 3, paddingHorizontal: 20 },
  ofertaCard: {
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
  ofertaCardMedia: { height: 150, position: 'relative', backgroundColor: '#FFF6EA' },
  ofertaImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  ofertaImage: { width: '100%', height: '100%' },
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
  ofertaCardBody: { padding: 16 },
  ofertaCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ofertaCategory: { color: COLORS.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  ofertaName: { color: COLORS.textDark, fontSize: 17, fontWeight: '900', marginTop: 2 },
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