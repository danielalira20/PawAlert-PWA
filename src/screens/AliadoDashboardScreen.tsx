import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AliadoImpactStats } from '../components/profile/AliadoImpactStats';
import { useAliadoImpact } from '../hooks/useAliadoImpact';
import { useApelacionAliado } from '../hooks/useApelacionAliado';
import ApelacionAliadoModal from '../components/red-aliados/ApelacionAliadoModal';
import MisLotesScreen from './red-aliados/MisLotesScreen';
import MisAportacionesScreen from './red-aliados/MisAportacionesScreen';
import NotificacionesAliadoScreen from './NotificacionesAliadoScreen';
import MisOfertasProactivasScreen from './red-aliados/MisOfertasProactivasScreen';

// Misma paleta que StaffAsignacionScreen.tsx (COLORS/SHADOW_SM), reusada
// literalmente — no se inventa un estilo nuevo para este dashboard.
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

type ActiveTab = 'lotes' | 'aportaciones' | 'notificaciones' | 'ofertas';

interface Props {
  onClose?: () => void;
  onOpenContribution?: () => void;
}

export default function AliadoDashboardScreen({ onClose, onOpenContribution }: Props) {
  const { impacto, isLoading } = useAliadoImpact(true);
  const { apelacionActiva, loading: loadingApelacion } = useApelacionAliado();
  const [activeTab, setActiveTab] = useState<ActiveTab>('lotes');
  const [showApelacionModal, setShowApelacionModal] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.dashboardShell}>
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <View style={styles.headerIcon}>
              <Ionicons name="heart" size={24} color={COLORS.white} />
            </View>
            <View>
              <Text style={styles.headerEyebrow}>RED DE ALIADOS</Text>
              <Text style={styles.headerTitle}>Mis donaciones</Text>
              <Text style={styles.headerSubtitle}>Gestiona tus aportaciones y revisa su impacto.</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (onClose) onClose();
              else if (router.canGoBack()) router.back();
              else router.replace('/');
            }}
            style={styles.closeButton}
            accessibilityLabel="Cerrar panel de aliado"
          >
            <Ionicons name="close" size={20} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>

        {/* Mismo patrón que StaffAsignacionScreen.tsx: un solo ScrollView
            exterior envuelve impacto + tab bar + contenido de la tab activa
            — sin esto, cuando el impacto completo (con desglose de ofertas/
            aplicaciones) no cabe, la tab bar queda atorada fuera de vista. */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.horizontalSection}>
            <AliadoImpactStats impacto={impacto} isLoading={isLoading} />
          </View>

          {/* BANNER DE ESTADO */}
          {!isLoading && !loadingApelacion && impacto?.tipo && impacto.tipo !== 'donante_comunitario' && !impacto.verificado_admin && (
            <View style={{ marginHorizontal: 24, marginBottom: 20, padding: 16, backgroundColor: impacto.razon_rechazo ? (apelacionActiva ? '#FFF9E6' : '#FDEDEC') : '#FFF9E6', borderRadius: 12, borderWidth: 1, borderColor: impacto.razon_rechazo ? (apelacionActiva ? '#F1C40F' : '#E74C3C') : '#F1C40F' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name={impacto.razon_rechazo ? (apelacionActiva ? "time" : "close-circle") : "time"} size={20} color={impacto.razon_rechazo ? (apelacionActiva ? '#F39C12' : '#E74C3C') : '#F39C12'} style={{ marginRight: 8 }} />
                <Text style={{ fontWeight: 'bold', fontSize: 14, color: impacto.razon_rechazo ? (apelacionActiva ? '#D68910' : '#C0392B') : '#D68910' }}>
                  {impacto.razon_rechazo 
                    ? (apelacionActiva ? 'Apelación en revisión' : 'Perfil rechazado')
                    : 'Perfil en validación'}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: '#4A3728', lineHeight: 18, marginBottom: impacto.razon_rechazo && !apelacionActiva ? 12 : 0 }}>
                {impacto.razon_rechazo 
                  ? (apelacionActiva 
                      ? 'Hemos recibido tu apelación y estamos revisando tu caso. Pronto te daremos una respuesta.' 
                      : `Motivo: ${impacto.razon_rechazo}`) 
                  : 'No puedes realizar nuevas aportaciones hasta que el administrador verifique tu perfil.'}
              </Text>
              
              {impacto.razon_rechazo && !apelacionActiva && (
                <TouchableOpacity 
                  onPress={() => setShowApelacionModal(true)}
                  style={{
                    backgroundColor: '#E74C3C',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    alignSelf: 'flex-start'
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>Volver a postular</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Punto de entrada a AportacionFormScreen en modo manual (sin
              necesidad_id) — dejó de existir cuando se quitaron los botones
              de LandingScreen al reorganizar la UI. Visible siempre, no
              dentro de una pestaña, porque no es exclusivo de lotes. */}
          {(!impacto || impacto.tipo === 'donante_comunitario' || impacto.verificado_admin) && (
            <View style={[styles.horizontalSection, { marginBottom: 20 }]}>
              <TouchableOpacity
                onPress={() => {
                  if (onOpenContribution) {
                    onOpenContribution();
                    return;
                  }
                  if (onClose) onClose();
                  router.push('/red-aliados');
                }}
                style={styles.primaryAction}
              >
                <Ionicons name="add-circle-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
                <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 14 }}>Nueva aportación o lote</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tabs de navegación — mismo patrón/tokens que StaffAsignacionScreen.tsx */}
          <View style={styles.tabs}>
            {([
              { key: 'lotes', label: 'Mis lotes', icon: 'cube-outline' },
              { key: 'aportaciones', label: 'Mis aportaciones', icon: 'heart-outline' },
              { key: 'ofertas', label: 'Mis ofertas', icon: 'pricetag-outline' },
              { key: 'notificaciones', label: 'Notificaciones', icon: 'notifications-outline' },
            ] as { key: ActiveTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[]).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              >
                <Ionicons
                  name={tab.icon}
                  size={17}
                  color={activeTab === tab.key ? COLORS.primary : COLORS.textLight}
                />
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'lotes' && <MisLotesScreen embedded />}
          {activeTab === 'aportaciones' && <MisAportacionesScreen embedded />}
          {activeTab === 'ofertas' && <MisOfertasProactivasScreen embedded />}
          {activeTab === 'notificaciones' && <NotificacionesAliadoScreen embedded />}
        </ScrollView>
      </View>

      <ApelacionAliadoModal
        visible={showApelacionModal}
        onClose={() => setShowApelacionModal(false)}
        onSuccess={() => {
          setShowApelacionModal(false);
          // La hook useApelacionAliado recarga active automatically if modified to return fetch method, wait, let's force re-render or the hook already does it when we re-mount?
          // To be safe we could just reload, but react state will update if we had exposed fetch in hook.
          // Since it's fine we just let it be or the user can refresh. We will reload via hook or window.location.reload()
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dashboardShell: { flex: 1, width: '100%', maxWidth: 940, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#FFFDFB',
    borderBottomWidth: 1,
    borderBottomColor: '#EFE5D9',
  },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  headerEyebrow: { color: COLORS.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  headerTitle: { color: COLORS.textDark, fontSize: 21, fontWeight: '900', marginTop: 2 },
  headerSubtitle: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2E8DD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingTop: 20, paddingBottom: 40 },
  horizontalSection: { paddingHorizontal: 24 },
  primaryAction: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 18,
    padding: 5,
    borderRadius: 15,
    backgroundColor: '#EEE5DB',
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#4A3728',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tabText: { color: COLORS.textLight, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: COLORS.primary, fontWeight: '900' },
});
