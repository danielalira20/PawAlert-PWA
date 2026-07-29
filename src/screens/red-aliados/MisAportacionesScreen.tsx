import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { QrDisplayModal } from '../../components/red-aliados/QrDisplayModal';

// Misma paleta que MisLotesScreen.tsx (archivo hermano en el mismo
// dashboard) — reusada tal cual, no la de OfertasAsociacionScreen.tsx.
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
  // Modo embebido (dentro de AliadoDashboardScreen, como tab) — mismo
  // criterio que MisLotesScreen.tsx: oculta el banner de header propio.
  embedded?: boolean;
}

// Mismo patrón que SeguimientoAliadoCard.tsx (staff-dashboard) /
// AportacionFormScreen.tsx para "Cómo llegar" — se duplica la función
// local en vez de importar entre archivos, mismo criterio ya usado ahí.
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

export default function MisAportacionesScreen({ onClose, embedded }: Props) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('pendientes');
  const [contribuciones, setContribuciones] = useState<Contribucion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [qrContribucionId, setQrContribucionId] = useState<string | null>(null);

  const cargarContribuciones = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/red-aliados/me/contribuciones?tab=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setContribuciones(res.data);
    } catch {
      // silencioso — se muestra la lista vacía, mismo criterio que MisLotesScreen.tsx
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
          {contribuciones.map((c) => {
            const asociacion = c.necesidades?.asociaciones || null;
            const titulo = c.subcategoria_recurso?.descripcion
              || c.subcategoria_recurso?.categoria_recurso?.descripcion
              || c.necesidades?.categoria
              || 'Recurso';

            return (
              <View
                key={c.id}
                style={{ backgroundColor: COLORS.cardBg, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.border }}
              >
                {c.detalle?.foto_url && (
                  <Image
                    source={{ uri: c.detalle.foto_url }}
                    style={{ width: '100%', height: 140, borderRadius: 14, marginBottom: 12 }}
                    resizeMode="cover"
                  />
                )}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark, flex: 1, paddingRight: 8 }}>
                    {titulo}
                  </Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: `${ESTADO_COLOR[c.estado] || COLORS.textLight}18` }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: ESTADO_COLOR[c.estado] || COLORS.textLight }}>
                      {ESTADO_LABEL[c.estado] || c.estado.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 4 }}>
                  {c.cantidad_valor} {c.cantidad_unidad}
                </Text>

                {activeTab === 'aceptadas' && (
                  <View style={{ marginTop: 14, gap: 10 }}>
                    {!c.token_usado && (
                      <TouchableOpacity
                        onPress={() => setQrContribucionId(c.id)}
                        style={{ flexDirection: 'row', gap: 6, backgroundColor: COLORS.bgWhite, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}
                      >
                        <Ionicons name="qr-code-outline" size={16} color={COLORS.primary} />
                        <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>Ver mi código QR</Text>
                      </TouchableOpacity>
                    )}

                    {asociacion && (
                      <View style={{ backgroundColor: COLORS.grayLight, borderRadius: 12, padding: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textDark }}>{asociacion.nombre}</Text>
                        {direccionTexto(asociacion) ? (
                          <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>{direccionTexto(asociacion)}</Text>
                        ) : null}
                        {asociacion.referencia ? (
                          <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 2 }}>{asociacion.referencia}</Text>
                        ) : null}
                        <TouchableOpacity
                          onPress={() => abrirComoLlegar(asociacion)}
                          style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 }}
                        >
                          <Ionicons name="navigate-outline" size={14} color={COLORS.bgTeal} />
                          <Text style={{ color: COLORS.bgTeal, fontWeight: '700', fontSize: 12 }}>Cómo llegar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <QrDisplayModal
        visible={!!qrContribucionId}
        contribucionId={qrContribucionId}
        onClose={() => {
          setQrContribucionId(null);
          cargarContribuciones();
        }}
      />
    </View>
  );
}
