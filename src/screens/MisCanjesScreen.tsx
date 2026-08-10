import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import QRCode from 'react-native-qrcode-svg';
import { API_URL } from '../constants/api';
import { Brand } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface RecompensaInfo {
  nombre: string;
  nivel: string;
  sucursal_lugar?: string;
  propietario_id: string;
}

export interface Canje {
  id: string;
  recompensa_id: string;
  beneficiario_id: string;
  codigo: string;
  estado: string;
  condiciones_snapshot?: string;
  forma_entrega_snapshot: string;
  costo_snapshot: number;
  emitido_at: string;
  confirmado_at?: string;
  fecha_expiracion?: string;
  recompensas?: RecompensaInfo;
}

export function MisCanjesScreen({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCanjes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/recompensas/canjes/mis-canjes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCanjes(res.data);
    } catch (error) {
      console.error('Error al cargar canjes:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchCanjes();
      }
    }, [fetchCanjes, token])
  );

  const activos = canjes.filter(c => c.estado === 'emitido');
  const historico = canjes.filter(c => c.estado !== 'emitido');

  // Countdown en tiempo real — se actualiza cada minuto
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(intervalo);
  }, []);

  const calcularTiempoRestante = (fechaExpiracion: string | undefined): string => {
    if (!fechaExpiracion) return 'Sin expiración';
    const expira = new Date(fechaExpiracion);
    const diffMs = expira.getTime() - ahora.getTime();
    if (diffMs <= 0) return 'Expirado';
    const horas = Math.floor(diffMs / (1000 * 60 * 60));
    const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (horas >= 24) {
      const dias = Math.floor(horas / 24);
      return `${dias}d ${horas % 24}h restantes`;
    }
    return `${horas}h ${minutos}m restantes`;
  };

  const renderBadgeEstado = (estado: string) => {
    let color = Brand.textFaint;
    let label = 'Desconocido';
    
    switch(estado) {
      case 'confirmado': color = '#10B981'; label = 'Canjeado'; break;
      case 'expirado': color = Brand.danger; label = 'Expirado'; break;
      case 'cancelado': color = Brand.textMuted; label = 'Cancelado'; break;
      case 'reembolsado': color = Brand.primary; label = 'Reembolsado'; break;
    }
    
    return (
      <View style={[styles.badgeEstado, { backgroundColor: color + '20' }]}>
        <Text style={[styles.badgeEstadoText, { color }]}>{label}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Ionicons name="close" size={24} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Mis Canjes</Text>
          <Text style={styles.headerSubtitle}>Tus recompensas y códigos activos</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCanjes} tintColor={Brand.primary} />}
      >
        {activos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CÓDIGOS ACTIVOS</Text>
            <View style={styles.grid}>
              {activos.map(canje => (
                <View key={canje.id} style={[styles.card, styles.cardActivo]}>
                  <View style={styles.qrContainer}>
                    <QRCode
                      value={canje.codigo}
                      size={180}
                      color={Brand.textDark}
                      backgroundColor="transparent"
                    />
                    <Text style={styles.codigoCanje}>{canje.codigo}</Text>
                  </View>
                  
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{canje.recompensas?.nombre}</Text>
                    <Text style={styles.cardInfo}>Costo: {canje.costo_snapshot} pts</Text>
                    
                    {canje.fecha_expiracion && (
                      <View style={styles.expiracionBox}>
                        <Ionicons name="time-outline" size={16} color={Brand.danger} />
                        <Text style={styles.expiracionText}>
                          ⏱ {calcularTiempoRestante(canje.fecha_expiracion)}
                        </Text>
                      </View>
                    )}
                    
                    <View style={styles.instruccionesBox}>
                      <Ionicons name="information-circle-outline" size={18} color={Brand.primary} />
                      <Text style={styles.instruccionesText}>
                        Muestra este código QR al patrocinador para recibir tu recompensa.
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.section, activos.length > 0 && { marginTop: 32 }]}>
          <Text style={styles.sectionTitle}>HISTORIAL DE CANJES</Text>
          {historico.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={Brand.textFaint} />
              <Text style={styles.emptyText}>No tienes canjes previos.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {historico.map(canje => (
                <View key={canje.id} style={styles.historicoCard}>
                  <View style={styles.historicoHeader}>
                    <Text style={styles.historicoTitle} numberOfLines={1}>
                      {canje.recompensas?.nombre || 'Recompensa'}
                    </Text>
                    {renderBadgeEstado(canje.estado)}
                  </View>
                  
                  <View style={styles.historicoRow}>
                    <Ionicons name="calendar-outline" size={16} color={Brand.textMuted} />
                    <Text style={styles.historicoDate}>
                      {format(parseISO(canje.emitido_at), "dd MMM yyyy", { locale: es })}
                    </Text>
                    <View style={styles.dot} />
                    <Ionicons name="star-outline" size={16} color={Brand.textMuted} />
                    <Text style={styles.historicoDate}>{canje.costo_snapshot} pts</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  section: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  card: {
    flexGrow: 1,
    flexBasis: 300,
    maxWidth: 450,
    backgroundColor: Brand.cardWarm,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  cardActivo: {
    borderWidth: 2,
    borderColor: Brand.primary + '40',
  },
  qrContainer: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  codigoCanje: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 4,
    color: Brand.textDark,
  },
  cardContent: {
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.textDark,
    marginBottom: 4,
  },
  cardInfo: {
    fontSize: 14,
    color: Brand.textMuted,
    fontWeight: '600',
    marginBottom: 16,
  },
  expiracionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.danger + '10',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  expiracionText: {
    color: Brand.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  instruccionesBox: {
    flexDirection: 'row',
    backgroundColor: Brand.primary + '10',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  instruccionesText: {
    flex: 1,
    color: Brand.primaryDark,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  list: {
    gap: 12,
  },
  historicoCard: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 16,
    padding: 16,
  },
  historicoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historicoTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textDark,
    marginRight: 12,
  },
  badgeEstado: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeEstadoText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  historicoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historicoDate: {
    fontSize: 13,
    color: Brand.textMuted,
    fontWeight: '500',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.textFaint,
    marginHorizontal: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: Brand.textFaint,
    fontWeight: '500',
  },
});
