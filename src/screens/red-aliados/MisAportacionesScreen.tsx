import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { QrDisplayModal } from '../../components/red-aliados/QrDisplayModal';

// Mismos tokens exactos que MisLotesScreen.tsx / MisOfertasProactivasScreen.tsx
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

type Tab = 'pendientes' | 'aceptadas' | 'historial';

const ESTADO_LABEL: Record<string, string> = {
  comprometida: 'Pendiente',
  confirmada: 'Aceptada',
  parcial: 'Aceptada (ajustada)',
  entregada: 'Entregada',
  rechazada: 'Rechazada',
  retirada: 'Retirada',
};

const ESTADO_COLOR: Record<string, string> = {
  comprometida: COLORS.warning,
  confirmada: COLORS.success,
  parcial: COLORS.success,
  entregada: COLORS.success,
  rechazada: COLORS.danger,
  retirada: COLORS.textLight,
};

const ESTADO_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  comprometida: 'time-outline',
  confirmada: 'checkmark-circle-outline',
  parcial: 'checkmark-circle-outline',
  entregada: 'checkmark-done-circle-outline',
  rechazada: 'close-circle-outline',
  retirada: 'arrow-undo-circle-outline',
};

const CATEGORIA_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  alimentos: 'nutrition-outline',
  insumos: 'cube-outline',
  servicios_veterinarios: 'medkit-outline',
  difusion_campanas: 'megaphone-outline',
};

interface Asociacion {
  nombre: string;
  calle: string | null;
  colonia: string | null;
  municipio: string | null;
  referencia: string | null;
  latitud: number | null;
  longitud: number | null;
}

interface Contribucion {
  id: string;
  cantidad_valor: number;
  cantidad_unidad: string;
  estado: string;
  created_at: string;
  detalle: Record<string, any> | null;
  token_usado: boolean;
  necesidades: {
    categoria: string;
    asociaciones: Asociacion | null;
  } | null;
  subcategoria_recurso: {
    descripcion: string;
    categoria_recurso: { descripcion: string } | null;
  } | null;
}

interface Props {
  onClose?: () => void;
  embedded?: boolean;
}

const direccionTexto = (asoc: Asociacion | null): string =>
  asoc ? [asoc.calle, asoc.colonia, asoc.municipio].filter(Boolean).join(', ') : '';

const abrirComoLlegar = (asoc: Asociacion | null) => {
  if (!asoc) return;
  const url =
    asoc.latitud != null && asoc.longitud != null
      ? `https://www.google.com/maps/search/?api=1&query=${asoc.latitud},${asoc.longitud}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionTexto(asoc))}`;
  Linking.openURL(url);
};

const formatearFecha = (valor?: string | null) => {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function MisAportacionesScreen({ onClose, embedded }: Props) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('pendientes');
  const [contribuciones, setContribuciones] = useState<Contribucion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [seleccionada, setSeleccionada] = useState<Contribucion | null>(null);
  const [qrContribucionId, setQrContribucionId] = useState<string | null>(null);

  const cargarContribuciones = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/me/contribuciones?tab=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setContribuciones(res.data);
    } catch {
      setContribuciones([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) cargarContribuciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTab]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'aceptadas', label: 'Aceptadas' },
    { key: 'historial', label: 'Historial' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgWhite }}>
      {!embedded && (
        <View
          style={{
            backgroundColor: COLORS.bgTeal, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22,
            borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFF' }}>Mis aportaciones</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Lo que has ofrecido a las necesidades</Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 18, padding: 7 }}>
              <Ionicons name="close" size={18} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', paddingHorizontal: 18, paddingTop: 16, gap: 8 }}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{
              flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 14,
              backgroundColor: activeTab === tab.key ? COLORS.primary : COLORS.grayLight,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === tab.key ? '#FFF' : COLORS.textLight }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : contribuciones.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="heart-outline" size={48} color={COLORS.textLight} style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark, textAlign: 'center' }}>
            {activeTab === 'pendientes'
              ? 'No tienes aportaciones pendientes de respuesta'
              : activeTab === 'aceptadas'
              ? 'No tienes aportaciones aceptadas todavía'
              : 'Todavía no tienes aportaciones en tu historial'}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 18 }}>
            {contribuciones.map((c) => {
              const categoriaClave = c.necesidades?.categoria || '';
              const titulo = c.subcategoria_recurso?.descripcion
                || c.subcategoria_recurso?.categoria_recurso?.descripcion
                || categoriaClave
                || 'Recurso';
              const estadoColor = ESTADO_COLOR[c.estado] || COLORS.textLight;
              const estadoIcon = ESTADO_ICON[c.estado] || 'ellipse-outline';

              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSeleccionada(c)}
                  activeOpacity={0.78}
                  style={styles.contribCard}
                >
                  <View style={styles.contribCardMedia}>
                    {c.detalle?.foto_url ? (
                      <Image
                        source={{ uri: c.detalle.foto_url }}
                        style={[styles.contribImage, { backgroundColor: COLORS.grayLight }]}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={styles.contribImagePlaceholder}>
                        <Ionicons name={CATEGORIA_ICON[categoriaClave] || 'heart-outline'} size={34} color={COLORS.primary} />
                      </View>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: `${estadoColor}F0` }]}>
                      <Ionicons name={estadoIcon} size={13} color={COLORS.bgWhite} />
                      <Text style={styles.statusBadgeText}>{ESTADO_LABEL[c.estado] || c.estado}</Text>
                    </View>
                  </View>

                  <View style={styles.contribCardBody}>
                    <View style={styles.contribCardHeading}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contribCategory}>
                          {c.subcategoria_recurso?.categoria_recurso?.descripcion || categoriaClave}
                        </Text>
                        <Text style={styles.contribName}>{titulo}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={19} color={COLORS.textLight} />
                    </View>

                    <View style={styles.quantityBox}>
                      <View>
                        <Text style={styles.dataLabel}>Cantidad</Text>
                        <Text style={styles.quantityValue}>
                          {c.cantidad_valor} {c.cantidad_unidad}
                        </Text>
                      </View>
                      <View style={styles.quantityDivider} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dataLabel}>Enviada el</Text>
                        <Text style={styles.presentationValue}>{formatearFecha(c.created_at)}</Text>
                      </View>
                    </View>

                    {activeTab === 'aceptadas' && !c.token_usado && (
                      <View style={styles.cardFooter}>
                        <Ionicons name="qr-code-outline" size={12} color={COLORS.primary} />
                        <Text style={[styles.cardFooterText, { color: COLORS.primary }]}>
                          Toca para ver tu código QR
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={!!seleccionada}
        transparent
        animationType="fade"
        onRequestClose={() => setSeleccionada(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={styles.detailModal}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textDark }}>Detalle de la aportación</Text>
                <Text style={{ color: COLORS.textLight, fontSize: 12, marginTop: 2 }}>Estado y ubicación</Text>
              </View>
              <TouchableOpacity onPress={() => setSeleccionada(null)}>
                <Ionicons name="close" size={22} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {seleccionada && (
                <>
                  <View style={styles.modalResource}>
                    {seleccionada.detalle?.foto_url ? (
                      <Image
                        source={{ uri: seleccionada.detalle.foto_url }}
                        style={[styles.modalResourceImage, { backgroundColor: COLORS.grayLight }]}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.modalResourceImage, styles.modalResourcePlaceholder]}>
                        <Ionicons
                          name={CATEGORIA_ICON[seleccionada.necesidades?.categoria || ''] || 'heart-outline'}
                          size={28}
                          color={COLORS.primary}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalResourceName}>
                        {seleccionada.subcategoria_recurso?.descripcion || seleccionada.necesidades?.categoria}
                      </Text>
                      <Text style={styles.modalResourceQuantity}>
                        {seleccionada.cantidad_valor} {seleccionada.cantidad_unidad}
                      </Text>
                      <Text style={styles.modalResourcePackage}>
                        {seleccionada.subcategoria_recurso?.categoria_recurso?.descripcion || seleccionada.necesidades?.categoria}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modalDataGrid}>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Estado</Text>
                      <Text style={styles.modalDataValue}>{ESTADO_LABEL[seleccionada.estado] || seleccionada.estado}</Text>
                    </View>
                    <View style={styles.modalDataItem}>
                      <Text style={styles.dataLabel}>Enviada el</Text>
                      <Text style={styles.modalDataValue}>{formatearFecha(seleccionada.created_at)}</Text>
                    </View>
                  </View>

                  {(seleccionada.estado === 'confirmada' || seleccionada.estado === 'parcial') && !seleccionada.token_usado && (
                    <TouchableOpacity
                      onPress={() => setQrContribucionId(seleccionada.id)}
                      style={styles.qrButton}
                    >
                      <Ionicons name="qr-code-outline" size={17} color={COLORS.primary} />
                      <Text style={styles.qrButtonText}>Ver mi código QR</Text>
                    </TouchableOpacity>
                  )}

                  {seleccionada.estado === 'entregada' && (
                    <View style={styles.entregadaBanner}>
                      <Ionicons name="checkmark-done-circle" size={18} color={COLORS.success} />
                      <Text style={styles.entregadaText}>Esta aportación ya fue entregada. ¡Gracias por ayudar!</Text>
                    </View>
                  )}

                  {seleccionada.necesidades?.asociaciones && (
                    <>
                      <View style={styles.modalAddress}>
                        <Ionicons name="location-outline" size={17} color={COLORS.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalAddressName}>{seleccionada.necesidades.asociaciones.nombre}</Text>
                          {!!direccionTexto(seleccionada.necesidades.asociaciones) && (
                            <Text style={styles.modalAddressText}>{direccionTexto(seleccionada.necesidades.asociaciones)}</Text>
                          )}
                          {!!seleccionada.necesidades.asociaciones.referencia && (
                            <Text style={styles.modalAddressText}>{seleccionada.necesidades.asociaciones.referencia}</Text>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => abrirComoLlegar(seleccionada.necesidades!.asociaciones)}
                        style={styles.comoLlegarButton}
                      >
                        <Ionicons name="navigate-outline" size={15} color={COLORS.bgTeal} />
                        <Text style={styles.comoLlegarText}>Cómo llegar</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <QrDisplayModal
        visible={!!qrContribucionId}
        contribucionId={qrContribucionId}
        onClose={() => {
          setQrContribucionId(null);
          setSeleccionada(null);
          cargarContribuciones();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contribCard: {
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
  contribCardMedia: { height: 150, position: 'relative', backgroundColor: '#FFF6EA' },
  contribImage: { width: '100%', height: '100%' },
  contribImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  contribCardBody: { padding: 16 },
  contribCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contribCategory: { color: COLORS.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  contribName: { color: COLORS.textDark, fontSize: 17, fontWeight: '900', marginTop: 2 },
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
  qrButton: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
    backgroundColor: COLORS.bgWhite,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qrButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  entregadaBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: `${COLORS.success}12`,
  },
  entregadaText: { flex: 1, color: COLORS.textDark, fontSize: 12, fontWeight: '600' },
  modalAddress: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 13,
    backgroundColor: COLORS.grayLight,
  },
  modalAddressName: { color: COLORS.textDark, fontSize: 13, fontWeight: '800' },
  modalAddressText: { color: COLORS.textLight, fontSize: 12, marginTop: 3 },
  comoLlegarButton: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 8,
  },
  comoLlegarText: { color: COLORS.bgTeal, fontWeight: '700', fontSize: 12 },
});