import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../constants/api';
import { Brand } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
export interface Recompensa {
  id: string;
  nombre: string;
  descripcion: string;
  nivel: string;
  costo: number;
  unidades_disponibles: number;
  nombre_patrocinador: string;
  tipo: string;
  categoria: string;
  sucursal_lugar?: string;
  estado: string;
  fecha_expiracion: string;
  condiciones?: string;
  horario?: string;
  vencimiento?: string;
}
import { useMiReputacion } from '../hooks/useMiReputacion';

export function CatalogoRecompensasScreen({
  onClose,
  onCanjeExitoso,
}: {
  onClose: () => void;
  onCanjeExitoso?: () => void;
}) {
  const { token, user } = useAuth();
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [loading, setLoading] = useState(true);
  const [canjeando, setCanjeando] = useState<string | null>(null);

  const isRolValido = user?.rol === 'reportante' || user?.rol === 'voluntario_interno' || user?.rol === 'voluntario_externo';
  const { saldo } = useMiReputacion(user?.rol || '', isRolValido);


  // Estados para modales
  const [recompensaConfirmacion, setRecompensaConfirmacion] = useState<Recompensa | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const fetchCatalogo = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/recompensas/catalogo`);
      setRecompensas(res.data);
    } catch (error) {
      console.error('Error al cargar catálogo:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCatalogo();
    }, [fetchCatalogo])
  );

  const handleIntentarCanje = (recompensa: Recompensa) => {
    if (!token) {
      setMensajeError('Debes iniciar sesión para canjear recompensas.');
      return;
    }
    setRecompensaConfirmacion(recompensa);
  };

  const ejecutarCanje = async () => {
    if (!recompensaConfirmacion || !token) return;

    const recompensaId = recompensaConfirmacion.id;
    setRecompensaConfirmacion(null);
    setCanjeando(recompensaId);

    try {
      await axios.post(`${API_URL}/recompensas/canjes`, {
        recompensa_id: recompensaId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensajeExito('Canje realizado correctamente. Revisa tus canjes activos.');
      onCanjeExitoso?.();
      fetchCatalogo();
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Error al procesar el canje';
      setMensajeError(msg);
    } finally {
      setCanjeando(null);
    }
  };

  const getIconForType = (tipo: string) => {
    switch (tipo) {
      case 'producto': return 'cube';
      case 'descuento': return 'pricetag';
      case 'servicio': return 'cut';
      default: return 'gift';
    }
  };

  const getColorForLevel = (nivel: string) => {
    switch (nivel) {
      case 'pequena': return ['#4CAF50', '#2E7D32']; // Verde
      case 'mediana': return ['#2196F3', '#1565C0']; // Azul
      case 'grande': return ['#9C27B0', '#6A1B9A'];  // Morado
      default: return [Brand.primary, Brand.primaryDark];
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Catálogo de Recompensas</Text>
          <Text style={styles.headerSubtitle}>Canjea tus puntos por increíbles beneficios</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCatalogo} tintColor={Brand.primary} />}
      >
        {recompensas.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="sad-outline" size={64} color={Brand.textFaint} />
            <Text style={styles.emptyText}>No hay recompensas disponibles en este momento.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {recompensas.map(recompensa => (
              <View key={recompensa.id} style={styles.card}>
                <LinearGradient
                  colors={getColorForLevel(recompensa.nivel) as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardImagePlaceholder}
                >
                  <Ionicons name={getIconForType(recompensa.tipo) as any} size={48} color="#fff" style={{ opacity: 0.9 }} />
                  <View style={styles.costBadge}>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text style={styles.costText}>{recompensa.costo}</Text>
                  </View>
                </LinearGradient>

                <View style={styles.cardContent}>
                  <View style={styles.tagsRow}>
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{recompensa.tipo.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.stockText}>
                      {recompensa.unidades_disponibles} disponibles
                    </Text>
                  </View>

                  <Text style={styles.cardTitle} numberOfLines={2}>{recompensa.nombre}</Text>
                  <Text style={styles.cardSponsor} numberOfLines={1}>Por: {recompensa.nombre_patrocinador}</Text>
                  <Text style={styles.cardDesc} numberOfLines={3}>{recompensa.descripcion}</Text>

                  {(() => {
                    if (!isRolValido) return null; // No mostrar si no es rol válido
                    
                    const puntosSuficientes = saldo ? saldo.saldo_disponible >= recompensa.costo : false;
                    const isAgotado = recompensa.unidades_disponibles <= 0;
                    const isDisabled = isAgotado || !puntosSuficientes || canjeando === recompensa.id;
                    
                    return (
                      <TouchableOpacity
                        style={[
                          styles.canjearButton,
                          isDisabled && styles.canjearButtonDisabled
                        ]}
                        activeOpacity={0.8}
                        disabled={isDisabled}
                        onPress={() => handleIntentarCanje(recompensa)}
                      >
                        {canjeando === recompensa.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Text style={styles.canjearButtonText}>
                              {isAgotado ? 'Agotado' : puntosSuficientes ? 'Canjear' : 'Puntos insuficientes'}
                            </Text>
                            {!isAgotado && puntosSuficientes && (
                              <Ionicons name="arrow-forward" size={16} color="#fff" />
                            )}
                            {!isAgotado && !puntosSuficientes && (
                              <Ionicons name="lock-closed" size={16} color="#fff" style={{ marginLeft: 4 }} />
                            )}
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal Confirmación */}
      <Modal visible={recompensaConfirmacion !== null} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setRecompensaConfirmacion(null)}>
          <Pressable style={styles.modalTarjeta} onPress={() => { }}>
            <Ionicons name="help-circle" size={56} color={Brand.primary} style={styles.modalIcon} />
            <Text style={styles.modalNombre}>Confirmar canje</Text>
            <Text style={styles.modalDescripcion}>
              ¿Estás seguro que deseas canjear <Text style={{ fontWeight: '800', color: Brand.textDark }}>{recompensaConfirmacion?.nombre}</Text> por <Text style={{ fontWeight: '800', color: '#F59E0B' }}>{recompensaConfirmacion?.costo} puntos</Text>?
            </Text>

            {/* Detalles de la recompensa antes de confirmar */}
            {recompensaConfirmacion?.condiciones ? (
              <View style={styles.modalDetalle}>
                <Ionicons name="document-text-outline" size={14} color={Brand.textMuted} />
                <Text style={styles.modalDetalleTexto}>{recompensaConfirmacion.condiciones}</Text>
              </View>
            ) : null}
            {recompensaConfirmacion?.horario ? (
              <View style={styles.modalDetalle}>
                <Ionicons name="time-outline" size={14} color={Brand.textMuted} />
                <Text style={styles.modalDetalleTexto}>{recompensaConfirmacion.horario}</Text>
              </View>
            ) : null}
            {recompensaConfirmacion?.sucursal_lugar ? (
              <View style={styles.modalDetalle}>
                <Ionicons name="location-outline" size={14} color={Brand.textMuted} />
                <Text style={styles.modalDetalleTexto}>{recompensaConfirmacion.sucursal_lugar}</Text>
              </View>
            ) : null}
            {recompensaConfirmacion?.vencimiento ? (
              <View style={styles.modalDetalle}>
                <Ionicons name="calendar-outline" size={14} color={Brand.textMuted} />
                <Text style={styles.modalDetalleTexto}>Válido hasta: {recompensaConfirmacion.vencimiento}</Text>
              </View>
            ) : null}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setRecompensaConfirmacion(null)}>
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonConfirm} onPress={ejecutarCanje}>
                <Text style={styles.modalButtonConfirmText}>Sí, canjear</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal Éxito */}
      <Modal visible={mensajeExito !== null} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setMensajeExito(null)}>
          <Pressable style={styles.modalTarjeta} onPress={() => { }}>
            <Ionicons name="checkmark-circle" size={56} color="#10B981" style={styles.modalIcon} />
            <Text style={[styles.modalNombre, { color: '#10B981' }]}>¡Éxito!</Text>
            <Text style={styles.modalDescripcion}>{mensajeExito}</Text>
            <TouchableOpacity style={[styles.modalButtonConfirm, { backgroundColor: '#10B981', width: '100%', marginTop: 20 }]} onPress={() => setMensajeExito(null)}>
              <Text style={styles.modalButtonConfirmText}>Entendido</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal Error */}
      <Modal visible={mensajeError !== null} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setMensajeError(null)}>
          <Pressable style={styles.modalTarjeta} onPress={() => { }}>
            <Ionicons name="close-circle" size={56} color={Brand.danger} style={styles.modalIcon} />
            <Text style={[styles.modalNombre, { color: Brand.danger }]}>¡Ups! Algo salió mal</Text>
            <Text style={styles.modalDescripcion}>{mensajeError}</Text>
            <TouchableOpacity style={[styles.modalButtonConfirm, { backgroundColor: Brand.danger, width: '100%', marginTop: 20 }]} onPress={() => setMensajeError(null)}>
              <Text style={styles.modalButtonConfirmText}>Cerrar</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: Brand.cardWarm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    backgroundColor: '#F5F5F5',
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
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'flex-start',
  },
  card: {
    flexGrow: 1,
    flexBasis: 300,
    maxWidth: 400,
    backgroundColor: Brand.cardWarm,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 8,
  },
  cardImagePlaceholder: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  costBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(10px)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  costText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  cardContent: {
    padding: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.primary,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.textDark,
    marginBottom: 4,
    lineHeight: 24,
  },
  cardSponsor: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.secondary,
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 14,
    color: Brand.textMuted,
    lineHeight: 20,
    marginBottom: 20,
  },
  canjearButton: {
    backgroundColor: Brand.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  canjearButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  canjearButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    color: Brand.textFaint,
    textAlign: 'center',
    maxWidth: 250,
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
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonCancelText: {
    color: Brand.textFaint,
    fontWeight: '800',
    fontSize: 14,
  },
  modalButtonConfirm: {
    flex: 1,
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
  modalDetalle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    width: '100%',
  },
  modalDetalleTexto: {
    flex: 1,
    fontSize: 12,
    color: Brand.textMuted,
    lineHeight: 16,
  },
});
