import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Toast, useToast } from '../components/Toast';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Animal, animalMasGrave, totalAnimales } from '../types/reporte';

const C = {
  background: '#FAF3EA',
  warm: '#E8CCAD',
  primary: '#EC802B',
  primarySoft: '#FFF0E4',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  accentSoft: '#E8F7F5',
  text: '#4A3728',
  muted: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  border: '#EADAC9',
};

interface Oferta {
  id: string;
  estado: 'vigente' | 'seleccionado';
  ofrecido_at: string;
}

interface CasoCercano {
  id: string;
  municipio?: string | null;
  colonia?: string | null;
  latitud_aproximada: number;
  longitud_aproximada: number;
  distancia_km: number;
  distancia_precisa_km: number;
  created_at: string;
  asociacion_coordinadora: string;
  animales: Animal[];
  ofrecimiento?: Oferta | null;
}

function etiqueta(valor?: string | null) {
  if (!valor) return 'Sin especificar';
  return valor.replaceAll('_', ' ').replace(/^\w/, (letra) => letra.toUpperCase());
}

function ApproximatePin({ caso }: { caso: CasoCercano }) {
  return (
    <View style={styles.mapPreview} accessible accessibilityLabel="Zona aproximada del reporte">
      <View style={[styles.mapLine, { top: '32%' }]} />
      <View style={[styles.mapLine, { top: '67%' }]} />
      <View style={[styles.mapLineVertical, { left: '28%' }]} />
      <View style={[styles.mapLineVertical, { left: '72%' }]} />
      <View style={styles.pinHalo}>
        <View style={styles.pin}>
          <Ionicons name="paw" size={18} color={C.white} />
        </View>
      </View>
      <View style={styles.mapPrivacy}>
        <Ionicons name="shield-checkmark" size={13} color={C.accent} />
        <Text style={styles.mapPrivacyText}>Ubicación aproximada</Text>
      </View>
      <Text style={styles.coordinates}>
        {caso.latitud_aproximada.toFixed(3)}, {caso.longitud_aproximada.toFixed(3)}
      </Text>
    </View>
  );
}

function CaseCard({
  caso,
  busy,
  onOffer,
  onWithdraw,
}: {
  caso: CasoCercano;
  busy: boolean;
  onOffer: () => void;
  onWithdraw: () => void;
}) {
  const animal = animalMasGrave(caso.animales);
  const foto = animal?.foto_url || animal?.fotos?.[0];
  const ofrecido = Boolean(caso.ofrecimiento);
  const urgente = animal?.condicion === 'grave';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.folio}>
          <Ionicons name="radio-button-on" size={12} color={C.accent} />
          <Text style={styles.folioText}>Caso {caso.id.slice(0, 8).toUpperCase()}</Text>
        </View>
        <Text style={styles.timeText}>
          {formatDistanceToNow(new Date(caso.created_at), { addSuffix: true, locale: es })}
        </Text>
      </View>

      <View style={styles.caseHero}>
        {foto ? (
          <Image source={{ uri: foto }} style={styles.animalPhoto} />
        ) : (
          <View style={styles.animalPlaceholder}>
            <Ionicons
              name={animal?.tipo_animal === 'gato' ? 'logo-octocat' : 'paw'}
              size={34}
              color={C.primary}
            />
          </View>
        )}
        <View style={styles.caseHeroCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.caseTitle}>
              {etiqueta(animal?.tipo_animal)} · {etiqueta(animal?.tamanio)}
            </Text>
            {urgente && (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentText}>Urgente</Text>
              </View>
            )}
          </View>
          <Text style={styles.condition}>
            Condición {etiqueta(animal?.condicion).toLowerCase()}
            {totalAnimales(caso.animales) > 1
              ? ` · ${totalAnimales(caso.animales)} animales`
              : ''}
          </Text>
          <View style={styles.distanceRow}>
            <Ionicons name="navigate" size={15} color={C.accent} />
            <Text style={styles.distanceText}>
              A unos {caso.distancia_km} km · {caso.colonia || caso.municipio || 'Tu zona'}
            </Text>
          </View>
        </View>
      </View>

      <ApproximatePin caso={caso} />

      <View style={styles.coordinator}>
        <View style={styles.coordinatorIcon}>
          <Ionicons name="business" size={17} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.coordinatorLabel}>Asociación coordinadora</Text>
          <Text style={styles.coordinatorName}>{caso.asociacion_coordinadora}</Text>
        </View>
      </View>

      {ofrecido ? (
        <View style={styles.offeredActions}>
          <View style={styles.offeredState}>
            <Ionicons name="checkmark-circle" size={20} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.offeredTitle}>Ya te ofreciste</Text>
              <Text style={styles.offeredCaption}>
                La asociación revisará tu perfil. El caso todavía no está asignado.
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retirar mi ofrecimiento"
            disabled={busy || caso.ofrecimiento?.estado === 'seleccionado'}
            onPress={onWithdraw}
            style={({ pressed }) => [
              styles.withdrawButton,
              pressed && styles.pressed,
              caso.ofrecimiento?.estado === 'seleccionado' && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={C.muted} />
            ) : (
              <Text style={styles.withdrawText}>
                {caso.ofrecimiento?.estado === 'seleccionado'
                  ? 'Propuesta en revisión'
                  : 'Retirar ofrecimiento'}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.actionHint}>
            Ofrecerte no reserva ni te asigna el caso. La asociación coordinadora elige a quién
            enviar la propuesta.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quiero ayudar en el caso ${caso.id.slice(0, 8)}`}
            disabled={busy}
            onPress={onOffer}
            style={({ pressed }) => [
              styles.offerButton,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <>
                <Ionicons name="hand-left" size={19} color={C.white} />
                <Text style={styles.offerButtonText}>Quiero ayudar</Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

export default function NearbyCasesScreen() {
  const { token, user } = useAuth();
  const { width } = useWindowDimensions();
  const { toast, translateY, showToast } = useToast();
  const [cases, setCases] = useState<CasoCercano[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!token || user?.rol !== 'voluntario_externo') {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/coverage/cercanos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCases(response.data.casos || []);
      } catch (error: any) {
        setCases([]);
        showToast({
          type: 'error',
          title: 'No pudimos mostrar los casos',
          message:
            error?.response?.data?.detail ||
            'Revisa tu disponibilidad, ubicación y verificación.',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast, token, user?.rol],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      const interval = setInterval(() => {
        void load(true);
      }, 10000);
      return () => clearInterval(interval);
    }, [load]),
  );

  const offer = async (caseId: string) => {
    setBusyId(caseId);
    try {
      await axios.post(
        `${API_URL}/coverage/${caseId}/ofrecimientos`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await load(true);
      showToast({
        type: 'success',
        title: 'Ofrecimiento enviado',
        message: 'La asociación coordinadora ya puede ver que quieres ayudar.',
      });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'El caso cambió',
        message: error?.response?.data?.detail || 'Actualiza la lista e inténtalo nuevamente.',
      });
      await load(true);
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (caseId: string) => {
    setBusyId(caseId);
    try {
      await axios.delete(`${API_URL}/coverage/${caseId}/ofrecimientos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await load(true);
      showToast({
        type: 'info',
        title: 'Ofrecimiento retirado',
        message: 'Ya no aparecerás entre las personas interesadas en este caso.',
      });
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No se pudo retirar',
        message: error?.response?.data?.detail || 'La propuesta ya está siendo revisada.',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (user?.rol !== 'voluntario_externo') {
    return (
      <View style={styles.centerState}>
        <Ionicons name="shield-outline" size={46} color={C.muted} />
        <Text style={styles.emptyTitle}>Acceso para voluntariado externo</Text>
        <Text style={styles.emptyText}>
          Los casos cercanos se habilitan al contar con verificación externa activa de nivel 2.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={C.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
        contentContainerStyle={[
          styles.content,
          width >= 900 && styles.contentDesktop,
        ]}
      >
        <View style={styles.header}>
          <View style={styles.eyebrow}>
            <Ionicons name="location" size={15} color={C.primary} />
            <Text style={styles.eyebrowText}>OPORTUNIDADES EN TU RADIO</Text>
          </View>
          <Text style={styles.heading}>Casos cerca de mí</Text>
          <Text style={styles.subtitle}>
            Consulta reportes coordinados y ofrece tu ayuda sin comprometerte hasta recibir y
            confirmar una propuesta.
          </Text>
          <View style={styles.privacyBanner}>
            <Ionicons name="eye-off-outline" size={20} color={C.accent} />
            <Text style={styles.privacyText}>
              Protegemos la ubicación exacta hasta que la asociación confirme tu participación.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.loadingText}>Buscando casos compatibles contigo…</Text>
          </View>
        ) : cases.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="paw" size={34} color={C.primary} />
            </View>
            <Text style={styles.emptyTitle}>Todo tranquilo en tu radio</Text>
            <Text style={styles.emptyText}>
              No hay casos abiertos que coincidan con tu disponibilidad, capacidad y perfil por
              ahora. Desliza hacia abajo para actualizar.
            </Text>
          </View>
        ) : (
          <View style={[styles.grid, width >= 900 && styles.gridDesktop]}>
            {cases.map((caso) => (
              <CaseCard
                key={caso.id}
                caso={caso}
                busy={busyId === caso.id}
                onOffer={() => void offer(caso.id)}
                onWithdraw={() => void withdraw(caso.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <Toast toast={toast} translateY={translateY} />
    </View>
  );
}

const shadow = Platform.select({
  web: { boxShadow: '0 12px 34px rgba(74, 55, 40, 0.10)' } as any,
  default: {
    shadowColor: '#4A3728',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 18, paddingTop: 28, paddingBottom: 118 },
  contentDesktop: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingTop: 44 },
  header: { width: '100%', maxWidth: 720, marginBottom: 24 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  eyebrowText: { color: C.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  heading: { color: C.text, fontSize: 30, lineHeight: 36, fontWeight: '900' },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 640 },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.accentSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#CDEBE7',
  },
  privacyText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  grid: { gap: 18 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  card: {
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    width: '100%',
    maxWidth: 540,
    ...shadow,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  folio: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folioText: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  timeText: { color: C.muted, fontSize: 11, fontWeight: '600' },
  caseHero: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 15 },
  animalPhoto: { width: 72, height: 72, borderRadius: 18, backgroundColor: C.primarySoft },
  animalPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseHeroCopy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  caseTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
  urgentBadge: {
    backgroundColor: '#FDEAE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  urgentText: { color: C.danger, fontSize: 10, fontWeight: '900' },
  condition: { color: C.muted, fontSize: 12, marginTop: 4 },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  distanceText: { flex: 1, color: C.accent, fontSize: 12, fontWeight: '800' },
  mapPreview: {
    height: 126,
    backgroundColor: '#F4E9D9',
    borderRadius: 18,
    marginTop: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: C.border,
  },
  mapLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#FFFFFFAA' },
  mapLineVertical: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#FFFFFFAA' },
  pinHalo: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 54,
    height: 54,
    marginLeft: -27,
    marginTop: -27,
    borderRadius: 27,
    backgroundColor: 'rgba(236,128,43,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: C.white,
  },
  mapPrivacy: {
    position: 'absolute',
    left: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  mapPrivacyText: { color: C.text, fontSize: 10, fontWeight: '800' },
  coordinates: {
    position: 'absolute',
    right: 9,
    bottom: 8,
    color: C.muted,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '700',
  },
  coordinator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1E7DC',
  },
  coordinatorIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coordinatorLabel: { color: C.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  coordinatorName: { color: C.text, fontSize: 12, fontWeight: '800', marginTop: 2 },
  actionHint: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 13 },
  offerButton: {
    minHeight: 48,
    backgroundColor: C.primary,
    borderRadius: 17,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  offerButtonText: { color: C.white, fontSize: 14, fontWeight: '900' },
  offeredActions: { marginTop: 13 },
  offeredState: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  offeredTitle: { color: C.accent, fontSize: 13, fontWeight: '900' },
  offeredCaption: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  withdrawButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: 8 },
  withdrawText: { color: C.muted, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  loadingWrap: { alignItems: 'center', paddingVertical: 72 },
  loadingText: { color: C.muted, fontSize: 13, marginTop: 13, fontWeight: '600' },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 28,
    paddingVertical: 42,
    maxWidth: 540,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: C.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 400 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    padding: 28,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
