import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import '../../global.css';
import { AuthProvider } from '../context/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NetworkStatusBanner from '../components/NetworkStatusBanner';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {
      // La aplicación continúa con red aunque el navegador no permita PWA.
    });
    const syncWhenOnline = () => {
      import('../services/offlineReportQueue')
        .then(({ retryPendingReports }) => retryPendingReports())
        .catch(() => undefined);
    };
    window.addEventListener('online', syncWhenOnline);
    if (navigator.onLine) syncWhenOnline();
    return () => window.removeEventListener('online', syncWhenOnline);
  }, []);

  if (!fontsLoaded) return null;

  return (
     <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <NetworkStatusBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="association-status" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="association" />
        <Stack.Screen name="capacidades-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="red-aliados" options={{ presentation: 'modal' }} />
        <Stack.Screen name="aliados-directorio" options={{ presentation: 'modal' }} />
        <Stack.Screen name="mis-lotes" options={{ presentation: 'modal' }} />
        <Stack.Screen name="registro-aliado" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="staff-asignacion" />
        <Stack.Screen name="forgot-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="completar-cuenta" options={{ presentation: 'modal' }} />
        <Stack.Screen name="confirmacion-permanencia" />
        <Stack.Screen name="registrar-avistamiento" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="capacidades" options={{ presentation: 'transparentModal', headerShown: false }} />
        <Stack.Screen name="crear-necesidad" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="como-ayudar" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="notificaciones-aliado" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="notificaciones" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="pendientes-sincronizacion" />
        <Stack.Screen name="ofertas-asociacion" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="registro-comunitario" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="aportacion" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
      </Stack>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}
