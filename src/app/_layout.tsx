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

  if (!fontsLoaded) return null;

  return (
     <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="association-status" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="association" />
        <Stack.Screen name="capacidades-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="red-aliados" options={{ presentation: 'modal' }} />
        <Stack.Screen name="aliados-directorio" options={{ presentation: 'modal' }} />
        <Stack.Screen name="lote-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="mis-lotes" options={{ presentation: 'modal' }} />
        <Stack.Screen name="staff-asignacion" />
        <Stack.Screen name="forgot-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="completar-cuenta" options={{ presentation: 'modal' }} />
        <Stack.Screen name="capacidades" options={{ presentation: 'transparentModal', headerShown: false }} />
        <Stack.Screen name="crear-necesidad" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="como-ayudar" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="notificaciones-aliado" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
        <Stack.Screen name="ofertas-asociacion" options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }} />
      </Stack>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}
