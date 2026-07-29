import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { QrDisplayModal } from '../../components/red-aliados/QrDisplayModal';
import { EscanearQrModal } from '../../components/red-aliados/EscanearQrModal';

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
  created_at: string;
  asociaciones_invitadas: number;
  asociaciones_aceptadas: number;
}

interface InvitacionLote {
  id: string;
  estado: string;
  cantidad_asignada: number | null;
  asociacion_nombre: string | null;
}

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
  const [showScanModal, setShowScanModal] = useState(false);

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
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
          {lotes.map((l) => (
            <TouchableOpacity
              key={l.id}
              onPress={() => abrirLote(l)}
              style={{ backgroundColor: COLORS.cardBg, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.border }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark }}>
                {l.subcategoria_descripcion || l.categoria}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight, marginTop: 2 }}>
                {l.cantidad_valor} {l.cantidad_unidad} · {l.tipo_empaque}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={{ backgroundColor: `${COLORS.primary}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>
                    {l.asociaciones_invitadas} invitada{l.asociaciones_invitadas !== 1 ? 's' : ''} en total
                  </Text>
                </View>
                <View style={{ backgroundColor: `${COLORS.success}15`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.success }}>
                    {l.asociaciones_aceptadas} aceptada{l.asociaciones_aceptadas !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!loteSeleccionado} transparent animationType="fade" onRequestClose={() => setLoteSeleccionado(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: COLORS.bgWhite, borderRadius: 22, padding: 22, width: '100%', maxWidth: 440, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textDark }}>Invitaciones</Text>
              <TouchableOpacity onPress={() => setLoteSeleccionado(null)}>
                <Ionicons name="close" size={22} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            {isLoadingInvitaciones ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 30 }} />
            ) : invitaciones.length === 0 ? (
              <Text style={{ color: COLORS.textLight, fontSize: 13, textAlign: 'center', marginVertical: 20 }}>
                Todavía no has invitado a ninguna asociación.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {invitaciones.map((inv) => (
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
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TouchableOpacity
                          onPress={() => setQrInvitacionId(inv.id)}
                          style={{ flex: 1, flexDirection: 'row', gap: 6, backgroundColor: COLORS.bgWhite, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}
                        >
                          <Ionicons name="qr-code-outline" size={14} color={COLORS.primary} />
                          <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 11 }}>Ver mi código</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setShowScanModal(true)}
                          style={{ flex: 1, flexDirection: 'row', gap: 6, backgroundColor: COLORS.success, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Ionicons name="camera-outline" size={14} color="#FFF" />
                          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 11 }}>Escanear</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <QrDisplayModal visible={!!qrInvitacionId} invitacionId={qrInvitacionId} onClose={() => setQrInvitacionId(null)} />
      <EscanearQrModal
        visible={showScanModal}
        onClose={() => setShowScanModal(false)}
        onConfirmado={() => {
          if (loteSeleccionado) abrirLote(loteSeleccionado);
          cargarLotes();
        }}
      />
    </View>
  );
}
