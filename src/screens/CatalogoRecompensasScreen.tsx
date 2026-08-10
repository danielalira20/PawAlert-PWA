import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, RefreshControl, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL } from '../constants/api';
import { Brand } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { Recompensa, useRecompensas } from '../hooks/useRecompensas';

export function CatalogoRecompensasScreen({ onClose }: { onClose: () => void }) {
  const { token, user } = useAuth();
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [loading, setLoading] = useState(true);
  const [canjeando, setCanjeando] = useState<string | null>(null);

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

  const handleCanjear = async (recompensa: Recompensa) => {
    if (!token) return Alert.alert('Inicia sesión', 'Debes iniciar sesión para canjear recompensas.');

    const proceed = async () => {
      try {
        setCanjeando(recompensa.id);
        await axios.post(`${API_URL}/recompensas/canjes`, {
          recompensa_id: recompensa.id
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (Platform.OS === 'web') {
          window.alert('¡Éxito! Canje realizado correctamente. Revisa tus canjes activos.');
        } else {
          Alert.alert('¡Éxito!', 'Canje realizado correctamente. Revisa tus canjes activos.');
        }
        fetchCatalogo();
      } catch (error: any) {
        const msg = error.response?.data?.detail || 'Error al procesar el canje';
        if (Platform.OS === 'web') {
          window.alert('Error: ' + msg);
        } else {
          Alert.alert('Error', msg);
        }
      } finally {
        setCanjeando(null);
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Estás seguro que deseas canjear ${recompensa.nombre} por ${recompensa.costo} puntos?`);
      if (confirm) {
        proceed();
      }
    } else {
      Alert.alert(
        'Confirmar canje',
        `¿Estás seguro que deseas canjear ${recompensa.nombre} por ${recompensa.costo} puntos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sí, canjear', style: 'default', onPress: proceed }
        ]
      );
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
                  colors={getColorForLevel(recompensa.nivel)}
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

                  <TouchableOpacity
                    style={[
                      styles.canjearButton,
                      recompensa.unidades_disponibles <= 0 && styles.canjearButtonDisabled
                    ]}
                    activeOpacity={0.8}
                    disabled={recompensa.unidades_disponibles <= 0 || canjeando === recompensa.id}
                    onPress={() => handleCanjear(recompensa)}
                  >
                    {canjeando === recompensa.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.canjearButtonText}>
                          {recompensa.unidades_disponibles > 0 ? 'Canjear' : 'Agotado'}
                        </Text>
                        {recompensa.unidades_disponibles > 0 && (
                          <Ionicons name="arrow-forward" size={16} color="#fff" />
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
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
    justifyContent: 'space-between',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
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
});
