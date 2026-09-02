import React, { RefObject, useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Brand } from '../../constants/theme';

type TargetRef = RefObject<View | null>;

export interface CoachMarkStep {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  targetRef: TargetRef;
}

interface Props {
  visible: boolean;
  steps: CoachMarkStep[];
  onClose: (completed: boolean) => void;
  onStepChange?: (index: number) => void;
}

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EDGE = 14;
const CARD_MAX_WIDTH = 400;
const CARD_HEIGHT_ESTIMATE = 326;

export function CoachMarksTour({ visible, steps, onClose, onStepChange }: Props) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [target, setTarget] = useState<TargetRect | null>(null);
  const step = steps[stepIndex];

  const measureTarget = useCallback(() => {
    const node = step?.targetRef.current;
    if (!node) {
      setTarget(null);
      return;
    }

    node.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (measuredWidth <= 0 || measuredHeight <= 0) {
        setTarget(null);
        return;
      }

      const padding = 7;
      const safeX = Math.max(EDGE, x - padding);
      const safeRight = Math.min(width - EDGE, x + measuredWidth + padding);
      const safeY = Math.max(EDGE, y - padding);
      const safeBottom = Math.min(height - EDGE, y + measuredHeight + padding);
      setTarget({
        x: safeX,
        y: safeY,
        width: Math.max(44, safeRight - safeX),
        height: Math.max(44, safeBottom - safeY),
      });
    });
  }, [height, step, width]);

  useEffect(() => {
    if (!visible || !step) return;
    onStepChange?.(stepIndex);
    setTarget(null);
    const delay = reduceMotion ? 40 : 380;
    const timer = setTimeout(measureTarget, delay);
    return () => clearTimeout(timer);
  }, [measureTarget, onStepChange, reduceMotion, step, stepIndex, visible]);

  useEffect(() => {
    if (!visible) setStepIndex(0);
  }, [visible]);

  if (!step) return null;

  const isLast = stepIndex === steps.length - 1;
  const cardWidth = Math.min(width - EDGE * 2, CARD_MAX_WIDTH);
  const targetBottom = target ? target.y + target.height : 0;
  const hasRoomBelow = !!target && height - targetBottom > CARD_HEIGHT_ESTIMATE + 28;
  const cardTop = target
    ? hasRoomBelow
      ? Math.min(targetBottom + 18, height - CARD_HEIGHT_ESTIMATE - EDGE)
      : Math.max(EDGE, target.y - CARD_HEIGHT_ESTIMATE - 18)
    : Math.max(EDGE, (height - CARD_HEIGHT_ESTIMATE) / 2);

  const close = (completed: boolean) => {
    AccessibilityInfo.announceForAccessibility(
      completed ? 'Guía de Mi Perfil finalizada' : 'Guía cerrada',
    );
    onClose(completed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => close(false)}
      accessibilityViewIsModal
    >
      <View style={StyleSheet.absoluteFill}>
        {target ? (
          <>
            <BackdropPanel style={{ left: 0, right: 0, top: 0, height: target.y }} />
            <BackdropPanel style={{ left: 0, top: target.y, width: target.x, height: target.height }} />
            <BackdropPanel style={{ left: target.x + target.width, right: 0, top: target.y, height: target.height }} />
            <BackdropPanel style={{ left: 0, right: 0, top: targetBottom, bottom: 0 }} />
            <Animated.View
              entering={reduceMotion ? undefined : FadeIn.duration(220)}
              exiting={reduceMotion ? undefined : FadeOut.duration(140)}
              pointerEvents="none"
              style={[
                styles.focusRing,
                {
                  left: target.x,
                  top: target.y,
                  width: target.width,
                  height: target.height,
                  borderColor: step.accent,
                  shadowColor: step.accent,
                },
              ]}
            />
          </>
        ) : (
          <BackdropPanel style={StyleSheet.absoluteFillObject} />
        )}

        <Animated.View
          key={step.key}
          entering={reduceMotion ? undefined : FadeInDown.duration(300).springify().damping(20)}
          style={[styles.card, { width: cardWidth, top: cardTop }]}
          accessibilityRole="summary"
          accessibilityLabel={`${step.title}. ${step.description}. Paso ${stepIndex + 1} de ${steps.length}`}
        >
          <View style={styles.cardTopRow}>
            <View style={[styles.eyebrow, { backgroundColor: `${step.accent}18` }]}>
              <Ionicons name="paw" size={13} color={step.accent} />
              <Text style={[styles.eyebrowText, { color: step.accent }]}>GUÍA DE MI PERFIL</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar guía"
              hitSlop={10}
              onPress={() => close(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={18} color="#6F6A64" />
            </Pressable>
          </View>

          <View style={[styles.illustration, { backgroundColor: `${step.accent}12` }]}>
            <View style={[styles.iconHalo, { backgroundColor: `${step.accent}22` }]}>
              <Ionicons name={step.icon} size={38} color={step.accent} />
            </View>
            <View style={styles.illustrationLines}>
              <View style={[styles.lineLong, { backgroundColor: `${step.accent}44` }]} />
              <View style={styles.lineMedium} />
              <View style={styles.lineShort} />
            </View>
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>

          <View style={styles.footer}>
            <View style={styles.progressWrap} accessibilityLabel={`Paso ${stepIndex + 1} de ${steps.length}`}>
              <Text style={styles.progressText}>{stepIndex + 1} de {steps.length}</Text>
              <View style={styles.dots}>
                {steps.map((item, index) => (
                  <View
                    key={item.key}
                    style={[
                      styles.dot,
                      index === stepIndex && { width: 20, backgroundColor: step.accent },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.actions}>
              {stepIndex === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => close(true)}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryText}>Omitir</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStepIndex((current) => current - 1)}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryText}>Anterior</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => isLast ? close(true) : setStepIndex((current) => current + 1)}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: step.accent }, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>{isLast ? 'Finalizar' : 'Siguiente'}</Text>
                <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={16} color="#FFF" />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function BackdropPanel({ style }: { style: object }) {
  return (
    <BlurView
      intensity={Platform.OS === 'web' ? 20 : 28}
      tint="dark"
      style={[styles.backdrop, style]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    backgroundColor: 'rgba(17, 20, 18, 0.70)',
  },
  focusRing: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 24,
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 5 },
    elevation: 18,
  },
  card: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#FFFEFC',
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#14110E',
    shadowOpacity: 0.24,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 24,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  eyebrowText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1EFEC', alignItems: 'center', justifyContent: 'center' },
  illustration: { height: 94, borderRadius: 19, marginTop: 14, marginBottom: 15, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  iconHalo: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  illustrationLines: { flex: 1, marginLeft: 18, gap: 9 },
  lineLong: { height: 10, borderRadius: 6, width: '92%' },
  lineMedium: { height: 9, borderRadius: 6, width: '72%', backgroundColor: 'rgba(46,42,38,0.12)' },
  lineShort: { height: 9, borderRadius: 6, width: '48%', backgroundColor: 'rgba(46,42,38,0.08)' },
  title: { fontSize: 21, lineHeight: 26, fontWeight: '900', letterSpacing: -0.45, color: Brand.textDark },
  description: { marginTop: 7, fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#6F6861' },
  footer: { marginTop: 18, gap: 14 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { fontSize: 11, fontWeight: '700', color: '#918981' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: '#DCD7D1' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  secondaryButton: { minHeight: 42, paddingHorizontal: 15, borderRadius: 14, backgroundColor: '#F1EFEC', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#5F5953', fontSize: 13, fontWeight: '800' },
  primaryButton: { minHeight: 42, paddingHorizontal: 17, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  primaryText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
