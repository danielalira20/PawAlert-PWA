import { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

interface ToastState {
  type: ToastType;
  title: string;
  message?: string;
}

const COLORS: Record<ToastType, string> = {
  error:   '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  info:    '#3B82F6',
};

const ICONS: Record<ToastType, string> = {
  error:   '✕',
  success: '✓',
  warning: '⚠',
  info:    'ℹ',
};

interface ToastProps {
  toast: ToastState | null;
  translateY: Animated.Value;
}

export function Toast({ toast, translateY }: ToastProps) {
  if (!toast) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: COLORS[toast.type], transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.icon}>{ICONS[toast.type]}</Text>
      <View style={styles.content}>
        <Text style={styles.title}>{toast.title}</Text>
        {toast.message ? <Text style={styles.message}>{toast.message}</Text> : null}
      </View>
    </Animated.View>
  );
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (state: ToastState, duration = 3000) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setToast(state);
      translateY.setValue(-120);

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 8,
      }).start();

      timeoutRef.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -120,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setToast(null));
      }, duration);
    },
    [translateY],
  );

  return { toast, translateY, showToast };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  icon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  message: {
    color: '#fff',
    fontSize: 13,
    marginTop: 2,
    opacity: 0.9,
  },
});
