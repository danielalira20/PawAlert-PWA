import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { router, useFocusEffect } from 'expo-router';
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
import { NearbyCasesMap } from '../components/nearby-cases/NearbyCasesMap';
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

export interface CasoCercano {
  id: string;
  municipio?: string | null;
  colonia?: string | null;
  latitud_aproximada: number;
  longitud_aproximada: number;
  distancia_km: number;
  distancia_precisa_km: number;
  estado_reporte?: string;
  created_at: string;
  asociacion_coordinadora: string;
  animales: Animal[];
  ofrecimiento?: Oferta | null;
}

function etiqueta(valor?: string | null) {
  if (!valor) return 'Sin especificar';
  return valor.replaceAll('_', ' ').replace(/^\w/, (letra) => letra.toUpperCase());
}

function CaseCard({
  caso,
  busy,
  selected,
  onOffer,
  onWithdraw,
}: {
  caso: CasoCercano;
  busy: boolean;
  selected: boolean;
  onOffer: () => void;
  onWithdraw: () => void;
}) {
  const animal = animalMasGrave(caso.animales);
  const foto = animal?.foto_url || animal?.fotos?.[0];
  const ofrecido = Boolean(caso.ofrecimiento);
  const urgente = animal?.condicion === 'grave';

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
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

      <View style={styles.coordinator}>
        <View style={styles.coordinatorIcon}>
          <Ionicons name="business" size={17} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.coordinatorLabel}>Asociación coordinadora</Text>
          <Text style={styles.coordinatorName}>{caso.asociacion_coordinadora}</Text>
        </View>
      </View>

      {/* BLOQUEO DE BOTONES DE ASIGNACIÓN */}
      {caso.asociacion_coordinadora === 'Sin cobertura' || ['procesando', 'revision_manual', 'rechazado'].includes(caso.estado_reporte ?? '') || caso.estado_reporte === 'cerrado' || caso.estado_reporte === 'cancelado_por_reportante' ? (        <Text style={[styles.actionHint, { color: C.danger, fontWeight: '700' }]}>
          Este caso actualmente no puede recibir ofrecimientos.
        </Text>
      ) : ofrecido ? (
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingProposalCount, setPendingProposalCount] = useState(0);

  const load = useCallback(
    async (silent = false) => {
      if (!token || user?.rol !== 'voluntario_externo') {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [response, assignedResponse] = await Promise.all([
          axios.get(`${API_URL}/coverage/cercanos`, { headers }),
          axios
            .get(`${API_URL}/coverage/propuestas/pendientes`, { headers })
            .catch(() => null),
        ]);
        const nextCases = response.data.casos || [];
        const pendingProposals = assignedResponse?.data?.propuestas || [];
        setCases(nextCases);
        setPendingProposalCount(pendingProposals.length);
        setSelectedId((current) =>
          current && nextCases.some((caso: CasoCercano) => caso.id === current)
            ? current
            : nextCases[0]?.id || null,
        );
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
      const response = await axios.post(
        `${API_URL}/coverage/${caseId}/ofrecimientos`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setCases((current) =>
        current.map((caso) =>
          caso.id === caseId
            ? { ...caso, ofrecimiento: response.data }
            : caso,
        ),
      );
      showToast({
        type: 'success',
        title: 'Ofrecimiento enviado',
        message: 'La asociación coordinadora ya puede ver que quieres ayudar.',
      });
    } catch (error: any) {
      const status = error?.response?.status;
      showToast({
        type: 'error',
        title: status === 409 ? 'El caso acaba de cambiar' : 'No pudimos enviar tu ayuda',
        message:
          error?.response?.data?.detail ||
          'Hubo un problema al registrar tu ofrecimiento. Inténtalo nuevamente.',
      });
      if (status === 409) await load(true);
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
      setCases((current) =>
        current.map((caso) =>
          caso.id === caseId ? { ...caso, ofrecimiento: null } : caso,
        ),
      );
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
        <View style={[styles.hero, width >= 900 && styles.heroDesktop]}>
          <View style={styles.header}>
            <View style={styles.eyebrow}>
              <Ionicons name="navigate-circle" size={17} color={C.primary} />
              <Text style={styles.eyebrowText}>OPORTUNIDADES EN TU RADIO</Text>
            </View>
            <Text style={styles.heading}>Tu ayuda puede empezar cerca</Text>
            <Text style={styles.subtitle}>
              Explora reportes coordinados, conoce lo esencial y ofrécete sin quedar asignado
              hasta aceptar una propuesta.
            </Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <View style={[styles.heroStatIcon, { backgroundColor: C.primarySoft }]}>
                <Ionicons name="paw" size={20} color={C.primary} />
              </View>
              <View>
                <Text style={styles.heroStatValue}>{loading ? '—' : cases.length}</Text>
                <Text style={styles.heroStatLabel}>
                  {cases.length === 1 ? 'caso disponible' : 'casos disponibles'}
                </Text>
              </View>
            </View>
            <View style={styles.heroStat}>
              <View style={[styles.heroStatIcon, { backgroundColor: C.accentSoft }]}>
                <Ionicons name="shield-checkmark" size={20} color={C.accent} />
              </View>
              <View>
                <Text style={styles.heroStatValue}>Privado</Text>
                <Text style={styles.heroStatLabel}>hasta tu confirmación</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.privacyBanner}>
          <Ionicons name="eye-off-outline" size={20} color={C.accent} />
          <Text style={styles.privacyText}>
            El mapa muestra zonas aproximadas. La dirección exacta se comparte sólo si aceptas
            una propuesta.
          </Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Actualización automática</Text>
          </View>
        </View>

        {pendingProposalCount > 0 && (
          <View style={styles.proposalNotice}>
            <View style={styles.proposalNoticeIcon}>
              <Ionicons name="notifications" size={22} color={C.primary} />
            </View>
            <View style={styles.proposalNoticeCopy}>
              <Text style={styles.proposalNoticeTitle}>
                {pendingProposalCount === 1
                  ? 'Tienes una propuesta por responder'
                  : `Tienes ${pendingProposalCount} propuestas por responder`}
              </Text>
              <Text style={styles.proposalNoticeText}>
                El caso dejó esta lista porque la asociación te seleccionó. Ya está disponible
                en “Mis casos” para que lo aceptes o rechaces.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir Mis casos"
              onPress={() =>
                router.push({
                  pathname: '/profile',
                  params: { abrirMisCasos: 'true' },
                })
              }
              style={({ pressed }) => [
                styles.proposalNoticeButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.proposalNoticeButtonText}>Ir a Mis casos</Text>
              <Ionicons name="arrow-forward" size={16} color={C.white} />
            </Pressable>
          </View>
        )}

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
          <View style={[styles.explorer, width >= 900 && styles.explorerDesktop]}>
            <View style={[styles.mapPanel, width >= 900 && styles.mapPanelDesktop]}>
              <NearbyCasesMap
                casos={cases.map(c => ({
                  ...c,
                  latitud_aproximada: c.latitud_aproximada + 0.0015,
                  longitud_aproximada: c.longitud_aproximada - 0.0015
                }))}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <View style={styles.mapBadge}>
                <Ionicons name="location" size={14} color={C.primary} />
                <Text style={styles.mapBadgeText}>
                  {cases.length} {cases.length === 1 ? 'zona aproximada' : 'zonas aproximadas'}
                </Text>
              </View>
              <View style={styles.mapTip}>
                <Ionicons name="finger-print-outline" size={16} color={C.text} />
                <Text style={styles.mapTipText}>Toca un pin para identificar su caso</Text>
              </View>
            </View>

            <View style={styles.caseColumn}>
              <View style={styles.sectionHeading}>
                <View>
                  <Text style={styles.sectionTitle}>Disponibles ahora</Text>
                  <Text style={styles.sectionCaption}>Ordenados por cercanía y compatibilidad</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Actualizar casos"
                  onPress={() => void load()}
                  style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
                >
                  <Ionicons name="refresh" size={18} color={C.primary} />
                </Pressable>
              </View>
              <View style={styles.grid}>
                {cases.map((caso) => (
                  <CaseCard
                    key={caso.id}
                    caso={caso}
                    selected={selectedId === caso.id}
                    busy={busyId === caso.id}
                    onOffer={() => void offer(caso.id)}
                    onWithdraw={() => void withdraw(caso.id)}
                  />
                ))}
              </View>
            </View>
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
  contentDesktop: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingTop: 44 },
  hero: { width: '100%', marginBottom: 20, gap: 20 },
  heroDesktop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  header: { flex: 1, width: '100%', maxWidth: 720 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  eyebrowText: { color: C.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  heading: { color: C.text, fontSize: 32, lineHeight: 38, fontWeight: '900', maxWidth: 620 },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 640 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  heroStat: {
    minWidth: 172,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroStatIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatValue: { color: C.text, fontSize: 15, fontWeight: '900' },
  heroStatLabel: { color: C.muted, fontSize: 9, fontWeight: '700', marginTop: 1 },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: C.accentSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#CDEBE7',
  },
  privacyText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  liveText: { color: C.text, fontSize: 9, fontWeight: '800' },
  proposalNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#FFF8EC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F2CF9E',
    padding: 15,
    marginBottom: 18,
    ...shadow,
  },
  proposalNoticeIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proposalNoticeCopy: { flex: 1, minWidth: 210 },
  proposalNoticeTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  proposalNoticeText: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  proposalNoticeButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingHorizontal: 15,
  },
  proposalNoticeButtonText: { color: C.white, fontSize: 11, fontWeight: '900' },
  explorer: { gap: 18 },
  explorerDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: 22 },
  mapPanel: {
    height: 280,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#F4E9D9',
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
    ...shadow,
  },
  mapPanelDesktop: { flex: 1.15, height: 590 },
  mapBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mapBadgeText: { color: C.text, fontSize: 10, fontWeight: '900' },
  mapTip: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapTipText: { color: C.text, fontSize: 10, fontWeight: '700' },
  caseColumn: { flex: 0.85, minWidth: 0 },
  sectionHeading: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
  sectionCaption: { color: C.muted, fontSize: 10, marginTop: 2 },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { gap: 18 },
  card: {
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    width: '100%',
    ...shadow,
  },
  cardSelected: {
    borderColor: C.primary,
    borderWidth: 2,
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
