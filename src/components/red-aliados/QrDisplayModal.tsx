import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

// BACK07 — el token ya vive en la fila de lote_asociaciones (default
// gen_random_uuid()); este modal solo lo pide y lo dibuja como QR.
const COLORS = {
  primary: '#EC802B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  success: '#27AE60',
};

interface Props {
  visible: boolean;
  invitacionId: string | null;
  onClose: () => void;
}

interface QrData {
  token: string;
  token_usado: boolean;
  token_expira_at: string | null;
}

export function QrDisplayModal({ visible, invitacionId, onClose }: Props) {
  const { token } = useAuth();
  const [qr, setQr] = useState<QrData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !invitacionId) return;
    setIsLoading(true);
    setError(null);
    axios
      .get(`${API_URL}/red-aliados/invitaciones/${invitacionId}/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setQr(res.data))
      .catch((err) => setError(err?.response?.data?.detail || 'No pudimos cargar el código QR'))
      .finally(() => setIsLoading(false));
  }, [visible, invitacionId]);

  const vencido = qr?.token_expira_at ? new Date(qr.token_expira_at) < new Date() : false;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{ backgroundColor: COLORS.white, borderRadius: 24, padding: 28, width: '100%', maxWidth: 360, alignItems: 'center' }}>
          <TouchableOpacity onPress={onClose} style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
            <Ionicons name="close" size={22} color={COLORS.textLight} />
          </TouchableOpacity>

          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 }}>
            Código de recepción
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 20, textAlign: 'center' }}>
            Muestra este código al hacer la entrega — la otra parte lo escanea para confirmar.
          </Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
          ) : error ? (
            <Text style={{ color: COLORS.danger, fontSize: 13, textAlign: 'center', marginVertical: 20 }}>{error}</Text>
          ) : qr ? (
            <>
              {qr.token_usado ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
                  <Text style={{ marginTop: 12, fontWeight: '700', color: COLORS.textDark }}>Ya se confirmó la recepción</Text>
                </View>
              ) : vencido ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <Ionicons name="time-outline" size={56} color={COLORS.danger} />
                  <Text style={{ marginTop: 12, fontWeight: '700', color: COLORS.danger }}>Este código ya venció</Text>
                </View>
              ) : (
                <>
                  <View style={{ padding: 16, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#F0E6D6' }}>
                    <QRCode value={qr.token} size={200} color={COLORS.textDark} backgroundColor={COLORS.white} />
                  </View>
                  {qr.token_expira_at && (
                    <Text style={{ marginTop: 16, fontSize: 12, color: COLORS.textLight }}>
                      Válido hasta {new Date(qr.token_expira_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  )}
                </>
              )}
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
