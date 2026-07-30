import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../constants/api';

// Mismos tokens que AliadoDashboardScreen.tsx / StaffAsignacionScreen.tsx
const COLORS = {
  bg: '#F8F3ED',
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  cardBg: '#FAF3EA',
};

interface OfertaProactiva {
  id: string;
  categoria: string;
  capacidad_declarada: number;
  capacidad_disponible: number;
  unidad: string;
  activa: boolean;
  created_at: string;
  subcategoria_recurso?: { descripcion: string } | null;
}

interface Props {
  embedded?: boolean;
}

const CATEGORIA_LABEL: Record<string, string> = {
  alimentos: 'Alimentos',
  insumos: 'Insumos',
  servicios_veterinarios: 'Servicios veterinarios',
  difusion_campanas: 'Difusión y campañas',
};

export default function MisOfertasProactivasScreen({ embedded }: Props) {
  const { token } = useAuth();
  const [ofertas, setOfertas] = useState<OfertaProactiva[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ofertaSeleccionada, setOfertaSeleccionada] = useState<OfertaProactiva | null>(null);
  const [isUpdatingEstado, setIsUpdatingEstado] = useState(false);
  const [estadoError, setEstadoError] = useState<string | null>(null);

  const cargarOfertas = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/red-aliados/ofertas-proactivas/mias`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOfertas(res.data.ofertas || []);
    } catch (error) {
      console.error('Error cargando ofertas proactivas', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    cargarOfertas();
  }, [cargarOfertas]);

  const confirmarCambioEstado = async (oferta: OfertaProactiva) => {
    setIsUpdatingEstado(true);
    setEstadoError(null);
    try {
      const res = await axios.patch(
        `${API_URL}/red-aliados/ofertas-proactivas/${oferta.id}/estado`,
        { activa: !oferta.activa },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOfertas((prev) => prev.map((o) => (o.id === oferta.id ? { ...o, ...res.data } : o)));
      setOfertaSeleccionada(null);
    } catch (error: any) {
      setEstadoError(
        error?.response?.data?.detail || 'No se pudo actualizar la oferta. Intenta de nuevo.'
      );
    } finally {
      setIsUpdatingEstado(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { alignItems: 'center', paddingVertical: 40 }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {ofertas.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="pricetag-outline" size={32} color={COLORS.textLight} />
          <Text style={styles.emptyText}>Aún no tienes ofertas proactivas registradas.</Text>
        </View>
      ) : (
        ofertas.map((oferta) => (
          <View key={oferta.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {oferta.subcategoria_recurso?.descripcion || CATEGORIA_LABEL[oferta.categoria] || oferta.categoria}
              </Text>
              <View style={[styles.badge, oferta.activa ? styles.badgeActiva : styles.badgePausada]}>
                <Text style={[styles.badgeText, { color: oferta.activa ? '#0F6E56' : COLORS.textLight }]}>
                  {oferta.activa ? 'Activa' : 'Pausada'}
                </Text>
              </View>
            </View>
            <Text style={styles.cardSubtitle}>{CATEGORIA_LABEL[oferta.categoria] || oferta.categoria}</Text>
            <Text style={styles.cardCapacidad}>
              {oferta.capacidad_disponible} / {oferta.capacidad_declarada} {oferta.unidad} disponibles
            </Text>
            <TouchableOpacity
              onPress={() => setOfertaSeleccionada(oferta)}
              style={[styles.actionButton, oferta.activa ? styles.actionButtonPause : styles.actionButtonReactivate]}
            >
              <Text style={[styles.actionButtonText, !oferta.activa && { color: COLORS.white }]}>
                {oferta.activa ? 'Pausar oferta' : 'Reactivar oferta'}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Modal visible={!!ofertaSeleccionada} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {ofertaSeleccionada?.activa ? '¿Pausar esta oferta?' : '¿Reactivar esta oferta?'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {ofertaSeleccionada?.activa
                ? 'Mientras esté pausada, no aparecerá en ninguna sugerencia ni búsqueda de asociaciones.'
                : 'Volverá a estar disponible para el matching y las asociaciones que busquen ofertas.'}
            </Text>
            {estadoError && <Text style={styles.errorText}>{estadoError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setOfertaSeleccionada(null)}
                style={styles.modalButtonSecondary}
                disabled={isUpdatingEstado}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => ofertaSeleccionada && confirmarCambioEstado(ofertaSeleccionada)}
                style={styles.modalButtonPrimary}
                disabled={isUpdatingEstado}
              >
                {isUpdatingEstado ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>
                    {ofertaSeleccionada?.activa ? 'Sí, pausar' : 'Sí, reactivar'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, gap: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: COLORS.textLight, fontSize: 13, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFE5D9',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '800' },
  cardSubtitle: { color: COLORS.textLight, fontSize: 12, marginTop: 2 },
  cardCapacidad: { color: COLORS.textDark, fontSize: 13, fontWeight: '700', marginTop: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeActiva: { backgroundColor: '#E1F5EE' },
  badgePausada: { backgroundColor: '#EEE5DB' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  actionButton: { marginTop: 12, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionButtonPause: { backgroundColor: '#F2E8DD' },
  actionButtonReactivate: { backgroundColor: COLORS.primary },
  actionButtonText: { color: COLORS.textDark, fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.white, borderRadius: 20, padding: 22, width: '100%', maxWidth: 400 },
  modalTitle: { color: COLORS.textDark, fontSize: 17, fontWeight: '900' },
  modalSubtitle: { color: COLORS.textLight, fontSize: 13, marginTop: 8, lineHeight: 18 },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 10 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalButtonSecondary: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#F2E8DD', alignItems: 'center', justifyContent: 'center' },
  modalButtonSecondaryText: { color: COLORS.textDark, fontSize: 13, fontWeight: '700' },
  modalButtonPrimary: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  modalButtonPrimaryText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
});