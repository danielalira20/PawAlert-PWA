import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../Toast';
import { QrDisplayModal } from '../red-aliados/QrDisplayModal';
import { EscanearQrModal } from '../red-aliados/EscanearQrModal';

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
  created_at: string;
  lote: {
    id: string;
    categoria: string;
    subcategoria_descripcion: string | null;
    cantidad_valor: number;
    cantidad_unidad: string;
    tipo_empaque: string;
    forma_entrega: string;
    descripcion: string | null;
    aliado_nombre: string;
  };
}

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
  const [qrInvitacionId, setQrInvitacionId] = useState<string | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);

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
    setCantidadAsignada(String(invitacion.lote.cantidad_valor));
    setShowAceptarModal(true);
  };

  const confirmarAceptar = async () => {
    if (!token || !invitacionAccion) return;
    setIsSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/red-aliados/invitaciones/${invitacionAccion.id}/responder`,
        { aceptar: true, cantidad_asignada: Number(cantidadAsignada) || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ title: '¡Listo!', message: 'Aceptaste tu parte del lote', type: 'success' });
      setShowAceptarModal(false);
      setInvitacionAccion(null);
      cargarInvitaciones();
    } catch (err: any) {
      showToast({ title: 'Error', message: err?.response?.data?.detail || 'No pudimos aceptar la invitación', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
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
      cargarInvitaciones();
    } catch (err: any) {
      showToast({ title: 'Error', message: err?.response?.data?.detail || 'No pudimos rechazar la invitación', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
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
            <View
              key={inv.id}
              style={{
                backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 12,
                borderLeftWidth: 4, borderLeftColor: ESTADO_COLOR[inv.estado],
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textDark, marginBottom: 4 }}>
                    {inv.lote.aliado_nombre}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textDark, marginBottom: 6 }}>
                    {inv.lote.subcategoria_descripcion || inv.lote.categoria} — {inv.cantidad_asignada || inv.lote.cantidad_valor} {inv.lote.cantidad_unidad}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 2 }}>
                    Empaque: {inv.lote.tipo_empaque}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textLight }}>
                    {FORMA_ENTREGA_LABEL[inv.lote.forma_entrega] || inv.lote.forma_entrega}
                  </Text>
                  {!!inv.lote.descripcion && (
                    <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 6, fontStyle: 'italic' }}>
                      "{inv.lote.descripcion}"
                    </Text>
                  )}
                </View>
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: `${ESTADO_COLOR[inv.estado]}18` }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: ESTADO_COLOR[inv.estado] }}>{ESTADO_LABEL[inv.estado]}</Text>
                </View>
              </View>

              {inv.estado === 'invitada' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => abrirAceptar(inv)}
                    disabled={isSubmitting}
                    style={{ flex: 1, backgroundColor: COLORS.success, paddingVertical: 10, borderRadius: 12, alignItems: 'center', opacity: isSubmitting ? 0.7 : 1 }}
                  >
                    <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 12 }}>Aceptar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => rechazar(inv)}
                    disabled={isSubmitting}
                    style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.danger, paddingVertical: 10, borderRadius: 12, alignItems: 'center', opacity: isSubmitting ? 0.7 : 1 }}
                  >
                    <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 12 }}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {inv.estado === 'aceptada' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => setQrInvitacionId(inv.id)}
                    style={{ flex: 1, flexDirection: 'row', gap: 6, backgroundColor: COLORS.cardBg, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="qr-code-outline" size={16} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>Ver mi código</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowScanModal(true)}
                    style={{ flex: 1, flexDirection: 'row', gap: 6, backgroundColor: COLORS.success, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="camera-outline" size={16} color={COLORS.white} />
                    <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 12 }}>Escanear</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      <QrDisplayModal visible={!!qrInvitacionId} invitacionId={qrInvitacionId} onClose={() => setQrInvitacionId(null)} />
      <EscanearQrModal visible={showScanModal} onClose={() => setShowScanModal(false)} onConfirmado={cargarInvitaciones} />

      <Modal visible={showAceptarModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 12 }}>
              Aceptar parte del lote
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16, lineHeight: 18 }}>
              ¿Cuánto de este lote pueden recibir? Puedes ajustar la cantidad si no es el total.
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.textDark, marginBottom: 16 }}
              keyboardType="numeric"
              value={cantidadAsignada}
              onChangeText={(v) => setCantidadAsignada(v.replace(/[^0-9.]/g, ''))}
              placeholder="Cantidad"
              placeholderTextColor={COLORS.textLight}
            />
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
