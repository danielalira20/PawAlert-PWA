import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function NetworkStatusBanner() {
  const { isLoggedIn } = useAuth();
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [rendered, setRendered] = useState(!online);
  const progress = useRef(new Animated.Value(online ? 0 : 1)).current;

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) setRendered(true);
    Animated.timing(progress, {
      toValue: online ? 0 : 1,
      duration: online ? 260 : 360,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && online) setRendered(false);
    });
  }, [online, progress]);

  if (!rendered) return null;

  return (
    <Animated.View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          opacity: progress,
          transform: [{
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }),
          }],
        },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={18} color="#FFFFFF" />
      <View style={styles.copy}>
        <Text style={styles.title}>Sin conexión</Text>
        <Text style={styles.message}>
          {isLoggedIn
            ? 'Tu sesión sigue activa. Guardaremos los reportes para enviarlos cuando vuelva internet.'
            : 'Puedes seguir navegando. Para iniciar sesión o consultar datos nuevos, vuelve a conectarte.'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'fixed' as never,
    bottom: 88,
    left: '50%',
    transform: [{ translateX: '-50%' as never }],
    zIndex: 10000,
    width: 'calc(100% - 32px)' as never,
    maxWidth: 620,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#574A3F',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  copy: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  message: { color: '#F8EEE4', fontSize: 11, lineHeight: 15, marginTop: 1 },
});
