import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Brand } from '../../constants/theme';

interface Props {
  nombre: string;
  apellidoPaterno?: string;
  rolLabel?: string;
  turnoLabel?: string;
  notificacionesCount?: number;
  onPressNotificaciones?: () => void;
}

export function StaffHeader({
  nombre,
  apellidoPaterno = '',
  rolLabel = 'Rescatista',
  turnoLabel,
  notificacionesCount = 0,
  onPressNotificaciones,
}: Props) {
  const iniciales = `${nombre?.[0] ?? ''}${apellidoPaterno?.[0] ?? ''}`.toUpperCase();

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={styles.container}>
      <View style={styles.left}>
        <LinearGradient
          colors={[Brand.primary, Brand.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{iniciales || '?'}</Text>
        </LinearGradient>

        <View>
          <Text style={styles.greeting}>Hola de nuevo,</Text>
          <Text style={styles.name} numberOfLines={1}>
            {nombre} {apellidoPaterno}
          </Text>
          <Text style={styles.role}>
            {rolLabel}
            {turnoLabel ? ` · ${turnoLabel}` : ''}
          </Text>
        </View>
      </View>

{/*
      <TouchableOpacity
        onPress={onPressNotificaciones}
        activeOpacity={0.75}
        style={styles.bellButton}
      >
        <Ionicons name="notifications-outline" size={21} color={Brand.textDark} />
        {notificacionesCount > 0 && (
          <Animated.View
            entering={ZoomIn.delay(400).springify().damping(14)}
            style={styles.badge}
          >
            <Text style={styles.badgeText}>{notificacionesCount}</Text>
          </Animated.View>
        )}
      </TouchableOpacity>
      */}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  greeting: { fontSize: 12, color: Brand.textFaint, fontWeight: '600' },
  name: { fontSize: 20, fontWeight: '900', color: Brand.textDark, marginTop: 1 },
  role: { fontSize: 11, color: Brand.textMuted, fontWeight: '600', marginTop: 1 },
  bellButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Brand.cardWarm,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.11,
    shadowRadius: 8,
    elevation: 3,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Brand.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
});