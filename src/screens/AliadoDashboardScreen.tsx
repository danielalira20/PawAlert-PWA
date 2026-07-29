import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AliadoImpactStats } from '../components/profile/AliadoImpactStats';
import { useAliadoImpact } from '../hooks/useAliadoImpact';
import MisLotesScreen from './red-aliados/MisLotesScreen';
import NotificacionesAliadoScreen from './NotificacionesAliadoScreen';

// Misma paleta que StaffAsignacionScreen.tsx (COLORS/SHADOW_SM), reusada
// literalmente — no se inventa un estilo nuevo para este dashboard.
const COLORS = {
  bg: '#E8CCAD',
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  cardBg: '#FAF3EA',
};

type ActiveTab = 'lotes' | 'notificaciones';

interface Props {
  onClose?: () => void;
  onOpenContribution?: () => void;
}

export default function AliadoDashboardScreen({ onClose, onOpenContribution }: Props) {
  const { impacto, isLoading } = useAliadoImpact(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('lotes');

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
              <Ionicons name="heart" size={24} color={COLORS.white} />
            </View>
            <View>
              <Text style={{ color: COLORS.textLight, fontSize: 14, fontWeight: '500' }}>Panel de</Text>
              <Text style={{ color: COLORS.textDark, fontSize: 22, fontWeight: 'bold' }}>Aliado</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (onClose) onClose();
              else if (router.canGoBack()) router.back();
              else router.replace('/');
            }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={20} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>

        {/* Mismo patrón que StaffAsignacionScreen.tsx: un solo ScrollView
            exterior envuelve impacto + tab bar + contenido de la tab activa
            — sin esto, cuando el impacto completo (con desglose de ofertas/
            aplicaciones) no cabe, la tab bar queda atorada fuera de vista. */}
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 24 }}>
            <AliadoImpactStats impacto={impacto} isLoading={isLoading} />
          </View>

          {/* Punto de entrada a AportacionFormScreen en modo manual (sin
              necesidad_id) — dejó de existir cuando se quitaron los botones
              de LandingScreen al reorganizar la UI. Visible siempre, no
              dentro de una pestaña, porque no es exclusivo de lotes. */}
          <View style={{ paddingHorizontal: 24, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => {
                if (onOpenContribution) {
                  onOpenContribution();
                  return;
                }
                if (onClose) onClose();
                router.push('/red-aliados');
              }}
              style={{ backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
            >
              <Ionicons name="add-circle-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 14 }}>Nueva aportación o lote</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs de navegación — mismo patrón/tokens que StaffAsignacionScreen.tsx */}
          <View style={{ flexDirection: 'row', marginHorizontal: 24, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            {([
              { key: 'lotes', label: 'Mis lotes' },
              { key: 'notificaciones', label: 'Notificaciones' },
            ] as { key: ActiveTab; label: string }[]).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  paddingBottom: 12,
                  marginRight: 24,
                  borderBottomWidth: activeTab === tab.key ? 3 : 0,
                  borderBottomColor: COLORS.primary,
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: activeTab === tab.key ? '800' : '600',
                  color: activeTab === tab.key ? COLORS.primary : COLORS.textLight,
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'lotes' && <MisLotesScreen embedded />}
          {activeTab === 'notificaciones' && <NotificacionesAliadoScreen embedded />}
        </ScrollView>
      </View>
    </View>
  );
}
