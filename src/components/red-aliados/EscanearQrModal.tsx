import React, { useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

// FRONT16 — escanea el QR de BACK07 y confirma la recepción del lote.
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
  onClose: () => void;
  onConfirmado: () => void;
}

export function EscanearQrModal({ visible, onClose, onConfirmado }: Props) {
  const { token } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [escaneado, setEscaneado] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const reiniciar = () => {
    setEscaneado(false);
    setResultado(null);
  };

  const cerrar = () => {
    reiniciar();
    onClose();
  };

  const handleScan = async (data: string) => {
    if (escaneado) return;
    setEscaneado(true);
    setIsConfirming(true);
    try {
      await axios.post(
        `${API_URL}/red-aliados/qr/confirmar`,
        { token: data },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResultado({ ok: true, mensaje: 'Recepción confirmada correctamente.' });
      onConfirmado();
    } catch (err: any) {
      setResultado({ ok: false, mensaje: err?.response?.data?.detail || 'No pudimos confirmar la recepción.' });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{ backgroundColor: COLORS.white, borderRadius: 24, padding: 24, width: '100%', maxWidth: 380, alignItems: 'center' }}>
          <TouchableOpacity onPress={cerrar} style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
            <Ionicons name="close" size={22} color={COLORS.textLight} />
          </TouchableOpacity>

          <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 16 }}>
            Escanear código
          </Text>

          {!permission ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 40 }} />
          ) : !permission.granted ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Ionicons name="camera-outline" size={40} color={COLORS.textLight} style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 13, color: COLORS.textLight, textAlign: 'center', marginBottom: 16 }}>
                Necesitamos acceso a tu cámara para escanear el código.
              </Text>
              <TouchableOpacity
                onPress={requestPermission}
                style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 }}
              >
                <Text style={{ color: COLORS.white, fontWeight: '700' }}>Dar permiso</Text>
              </TouchableOpacity>
            </View>
          ) : resultado ? (
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <Ionicons
                name={resultado.ok ? 'checkmark-circle' : 'alert-circle'}
                size={56}
                color={resultado.ok ? COLORS.success : COLORS.danger}
              />
              <Text style={{ marginTop: 12, fontWeight: '700', color: resultado.ok ? COLORS.success : COLORS.danger, textAlign: 'center' }}>
                {resultado.mensaje}
              </Text>
              {!resultado.ok && (
                <TouchableOpacity
                  onPress={reiniciar}
                  style={{ marginTop: 16, backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '700' }}>Intentar de nuevo</Text>
                </TouchableOpacity>
              )}
              {resultado.ok && (
                <TouchableOpacity
                  onPress={cerrar}
                  style={{ marginTop: 16, backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 }}
                >
                  <Text style={{ color: COLORS.white, fontWeight: '700' }}>Cerrar</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={{ width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={isConfirming ? undefined : (result) => handleScan(result.data)}
              />
              {isConfirming && (
                <View style={{ ...({} as any), position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                  <ActivityIndicator color={COLORS.white} size="large" />
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
