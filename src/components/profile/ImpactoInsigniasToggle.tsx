import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../constants/theme';
import { ReportanteInsigniasCard } from './ReportanteInsigniasCard';
import { VoluntarioInternoInsigniasCard } from './VoluntarioInternoInsigniasCard';

type Tab = 'insignias' | 'impacto';

interface Props {
  // El bloque de Impacto NO se toca -- se pasa como children para que
  // LoggedInProfile.tsx siga renderizando exactamente lo que ya tenía
  // (ReporterImpactStats / ImpactStatsBase), solo que ahora detrás del
  // selector en vez de siempre visible.
  impactoElement: React.ReactNode;
  rol?: string | null;
}

/**
 * Selector estilo píldora, reusando el patrón ya establecido del
 * proyecto (styles.tabs/tabButton/tabButtonActive de
 * AliadoDashboardScreen.tsx / StaffAsignacionScreen.tsx) — mismos
 * tokens, no un componente inventado desde cero.
 */
export function ImpactoInsigniasToggle({ impactoElement, rol }: Props) {
  const [tab, setTab] = useState<Tab>('impacto');

  return (
    <View>
      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setTab('insignias')}
          style={[styles.tabButton, tab === 'insignias' && styles.tabButtonActive]}
        >
          <Ionicons
            name="ribbon"
            size={17}
            color={tab === 'insignias' ? Brand.primary : Brand.textFaint}
          />
          <Text style={[styles.tabText, tab === 'insignias' && styles.tabTextActive]}>
            Insignias
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTab('impacto')}
          style={[styles.tabButton, tab === 'impacto' && styles.tabButtonActive]}
        >
          <Ionicons
            name="bar-chart"
            size={17}
            color={tab === 'impacto' ? Brand.primary : Brand.textFaint}
          />
          <Text style={[styles.tabText, tab === 'impacto' && styles.tabTextActive]}>
            Impacto
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'insignias' ? (
        rol === 'voluntario_interno' ? <VoluntarioInternoInsigniasCard /> : <ReportanteInsigniasCard />
      ) : impactoElement}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: 8,
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
  tabText: {
    color: Brand.textFaint,
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: Brand.primary,
    fontWeight: '900',
  },
});