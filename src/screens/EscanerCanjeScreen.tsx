import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { Brand } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

export function EscanerCanjeScreen({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Estados para modales
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Brand.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.containerCenter}>
        <Ionicons name="camera-outline" size={64} color={Brand.textMuted} />
        <Text style={styles.permissionText}>Necesitamos acceso a tu cámara para escanear Códigos QR.</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Otorgar Permiso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      await axios.post(`${API_URL}/recompensas/canjes/confirmar`, {
        codigo: data
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensajeExito('¡Canje confirmado! Se ha registrado exitosamente la entrega de la recompensa. Los puntos han sido deducidos del voluntario de forma permanente.');
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Error al procesar el código.';
      setMensajeError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVolverAEscanear = () => {
    setMensajeExito(null);
    setMensajeError(null);
    setScanned(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="close" size={24} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Escanear Canje</Text>
          <Text style={styles.headerSubtitle}>Lee el código del voluntario</Text>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        {!scanned && !loading && (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
          />
        )}
        
        {/* Overlay para guiar el escaneo */}
        {!scanned && (
          <View style={styles.overlayScanner}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerText}>Apunta la cámara al Código QR del voluntario para confirmar la entrega</Text>
          </View>
        )}

        {loading && (
          <View style={[StyleSheet.absoluteFillObject, styles.loadingOverlay]}>
            <ActivityIndicator size="large" color={Brand.primary} />
            <Text style={styles.loadingText}>Procesando canje...</Text>
          </View>
        )}
      </View>

      {/* Modal Éxito */}
      <Modal visible={mensajeExito !== null} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={handleVolverAEscanear}>
          <Pressable style={styles.modalTarjeta} onPress={() => {}}>
            <Ionicons name="checkmark-circle" size={56} color="#10B981" style={styles.modalIcon} />
            <Text style={[styles.modalNombre, { color: '#10B981' }]}>¡Éxito!</Text>
            <Text style={styles.modalDescripcion}>{mensajeExito}</Text>
            <TouchableOpacity style={[styles.modalButtonConfirm, { backgroundColor: '#10B981', width: '100%', marginTop: 20 }]} onPress={handleVolverAEscanear}>
              <Text style={styles.modalButtonConfirmText}>Escanear Otro</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal Error */}
      <Modal visible={mensajeError !== null} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={handleVolverAEscanear}>
          <Pressable style={styles.modalTarjeta} onPress={() => {}}>
            <Ionicons name="close-circle" size={56} color={Brand.danger} style={styles.modalIcon} />
            <Text style={[styles.modalNombre, { color: Brand.danger }]}>¡Error de Validación!</Text>
            <Text style={styles.modalDescripcion}>{mensajeError}</Text>
            <TouchableOpacity style={[styles.modalButtonConfirm, { backgroundColor: Brand.danger, width: '100%', marginTop: 20 }]} onPress={handleVolverAEscanear}>
              <Text style={styles.modalButtonConfirmText}>Intentar de Nuevo</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.backgroundWarm,
  },
  containerCenter: {
    flex: 1,
    backgroundColor: Brand.backgroundWarm,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: Brand.cardWarm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Brand.textDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 2,
  },
  permissionText: {
    fontSize: 16,
    color: Brand.textDark,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    fontWeight: '500',
  },
  permissionBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  permissionBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  cancelBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: Brand.textMuted,
    fontSize: 16,
    fontWeight: '800',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  overlayScanner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: Brand.primary,
    backgroundColor: 'transparent',
    borderRadius: 24,
  },
  scannerText: {
    color: '#FFF',
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 40,
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  loadingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 42, 38, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalTarjeta: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalNombre: {
    fontSize: 20,
    fontWeight: '900',
    color: Brand.primary,
    textAlign: 'center',
  },
  modalDescripcion: {
    fontSize: 14,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  modalButtonConfirm: {
    backgroundColor: Brand.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
