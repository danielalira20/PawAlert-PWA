import React from 'react';
import { Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Brand } from '../../constants/theme';

interface Props {
  variant: 'aprobar' | 'rechazar' | 'secundario';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  // Solo aplica a variant="rechazar": lo vuelve sólido (en vez de tenue)
  // cuando la acción ya está lista para confirmarse — ej. cuando ya se
  // escribió el motivo de rechazo obligatorio.
  enfatizado?: boolean;
}

export function AdminActionButton({
  variant,
  label,
  icon,
  onPress,
  disabled,
  loading,
  enfatizado,
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => {
    if (disabled || loading) return;
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const esAprobar = variant === 'aprobar';
  const esSecundario = variant === 'secundario';
  const rechazarActivo = variant === 'rechazar' && enfatizado;

  return (
    <Animated.View style={[styles.flexOne, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[styles.base, (disabled || loading) && styles.disabled]}
      >
        {esAprobar ? (
          <LinearGradient
            colors={[Brand.secondary, '#4FA69D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fill}
          >
            <ButtonContent icon={icon} label={label} loading={loading} color="#fff" />
          </LinearGradient>
        ) : esSecundario ? (
          <View style={[styles.fill, styles.secundario]}>
            <ButtonContent
              icon={icon}
              label={label}
              loading={loading}
              color={Brand.textLight}
            />
          </View>
        ) : (
          <View style={[styles.fill, rechazarActivo ? styles.rechazarActivo : styles.rechazarTenue]}>
            <ButtonContent
              icon={icon}
              label={label}
              loading={loading}
              color={rechazarActivo ? '#fff' : Brand.danger}
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function ButtonContent({
  icon,
  label,
  loading,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  color: string;
}) {
  if (loading) return <ActivityIndicator color={color} />;
  return (
    <>
      <View
        style={[
          styles.iconBubble,
          { backgroundColor: color === '#fff' ? 'rgba(255,255,255,0.25)' : `${color}1A` },
        ]}
      >
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  base: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  disabled: { opacity: 0.5 },
  fill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  rechazarTenue: {
    backgroundColor: 'rgba(217,64,37,0.08)',
    borderWidth: 1.5,
    borderColor: Brand.danger,
  },
  secundario: {
    backgroundColor: '#F7F4F0',
    borderWidth: 1.5,
    borderColor: '#E4D3B8',
  },
  rechazarActivo: { backgroundColor: Brand.danger },
  iconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
});