import React from 'react';
import { useRouter } from 'expo-router';
import DonanteComunitarioFormScreen from '../screens/red-aliados/DonanteComunitarioFormScreen';

export default function RegistroComunitarioRoute() {
  const router = useRouter();

  return (
    <DonanteComunitarioFormScreen
      onClose={() => router.back()}
    />
  );
}