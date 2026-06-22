import { Stack } from 'expo-router';
import '../../global.css';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="association-status" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="association" />
      </Stack>
    </AuthProvider>
  );
}
