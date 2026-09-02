import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PublicEventsPanel } from '../components/events/discovery/PublicEventsPanel';
import { EventTheme } from '../constants/eventTheme';
import type { EventPublicSummary } from '../types/event';
import { abrirUbicacionEnMaps } from '../utils/eventMapsLink';

export default function EventsScreen() {
  const insets = useSafeAreaInsets();

  const openEventLocation = (event: EventPublicSummary) => {
    abrirUbicacionEnMaps({
      direccion: `${event.municipio}, ${event.estado_ubicacion}, México`,
    });
  };

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === 'web' ? 20 : Math.max(insets.top, 16) },
        ]}
      >
        <View style={styles.headerIcon}>
          <Ionicons name="calendar-outline" size={24} color={EventTheme.colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>AGENDA COMUNITARIA</Text>
          <Text style={styles.title}>Eventos</Text>
          <Text style={styles.subtitle}>
            Encuentra actividades de asociaciones verificadas.
          </Text>
        </View>
      </View>

      <PublicEventsPanel onLocate={openEventLocation} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: EventTheme.colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: EventTheme.colors.surface,
    borderBottomColor: EventTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 18,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: EventTheme.colors.surfaceWarm,
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: EventTheme.colors.primary,
    fontFamily: EventTheme.typography.bold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  title: {
    color: EventTheme.colors.text,
    fontFamily: EventTheme.typography.bold,
    fontSize: 24,
    lineHeight: 29,
  },
  subtitle: {
    color: EventTheme.colors.textMuted,
    fontFamily: EventTheme.typography.regular,
    fontSize: 11,
    lineHeight: 16,
  },
});
