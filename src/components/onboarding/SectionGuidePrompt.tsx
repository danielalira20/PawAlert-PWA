import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutUp, useReducedMotion } from 'react-native-reanimated';
import { Brand } from '../../constants/theme';

interface PromptProps {
  visible: boolean;
  sectionName: string;
  description: string;
  onStart: () => void;
  onDismiss: () => void;
}

export function SectionGuidePrompt({
  visible,
  sectionName,
  description,
  onStart,
  onDismiss,
}: PromptProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(320).springify().damping(20)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.prompt,
        width < 600 ? styles.promptMobile : styles.promptDesktop,
      ]}
    >
      <View style={styles.promptHeader}>
        <View style={styles.promptIcon}>
          <Ionicons name="sparkles" size={19} color={Brand.primary} />
        </View>
        <View style={styles.promptCopy}>
          <Text style={styles.promptEyebrow}>PRIMERA VISITA</Text>
          <Text style={styles.promptTitle}>¿Quieres conocer {sectionName}?</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar invitación a la guía"
          hitSlop={10}
          onPress={onDismiss}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={17} color="#77716B" />
        </Pressable>
      </View>
      <Text style={styles.promptDescription}>{description}</Text>
      <View style={styles.promptActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [styles.laterButton, pressed && styles.pressed]}
        >
          <Text style={styles.laterText}>Ahora no</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
        >
          <Text style={styles.startText}>Ver guía</Text>
          <Ionicons name="arrow-forward" size={15} color="#FFF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

interface HelpButtonProps {
  sectionName: string;
  onPress: () => void;
  inverted?: boolean;
  showUnreadDot?: boolean;
}

export function GuideHelpButton({
  sectionName,
  onPress,
  inverted = false,
  showUnreadDot = false,
}: HelpButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir guía de ${sectionName}`}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.helpButton,
        inverted ? styles.helpButtonInverted : styles.helpButtonLight,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name="help"
        size={19}
        color={inverted ? '#FFFFFF' : Brand.primary}
      />
      {showUnreadDot && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  prompt: {
    position: 'absolute',
    zIndex: 2500,
    backgroundColor: '#FFFEFC',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.10)',
    padding: 16,
    shadowColor: '#2E241C',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  promptDesktop: { width: 354, top: 88, right: 28 },
  promptMobile: { left: 16, right: 16, top: 78 },
  promptHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  promptIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: `${Brand.primary}16`, alignItems: 'center', justifyContent: 'center' },
  promptCopy: { flex: 1 },
  promptEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8, color: Brand.primary },
  promptTitle: { marginTop: 2, fontSize: 16, lineHeight: 20, fontWeight: '900', color: Brand.textDark, letterSpacing: -0.2 },
  closeButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F2F0ED', alignItems: 'center', justifyContent: 'center' },
  promptDescription: { marginTop: 12, fontSize: 13, lineHeight: 19, fontWeight: '500', color: '#716A63' },
  promptActions: { marginTop: 15, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  laterButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 13, backgroundColor: '#F2F0ED', alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 13, fontWeight: '800', color: '#625C56' },
  startButton: { minHeight: 40, paddingHorizontal: 15, borderRadius: 13, backgroundColor: Brand.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: Brand.primary, shadowOpacity: 0.26, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  startText: { fontSize: 13, fontWeight: '900', color: '#FFF' },
  helpButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  helpButtonLight: { backgroundColor: 'rgba(255,254,252,0.94)', borderColor: 'rgba(46,42,38,0.10)', shadowColor: '#2E241C', shadowOpacity: 0.10, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  helpButtonInverted: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.34)' },
  unreadDot: { position: 'absolute', right: -2, top: -2, width: 9, height: 9, borderRadius: 5, backgroundColor: '#F07C2B', borderWidth: 2, borderColor: '#FFF' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
});
