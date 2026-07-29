import React from 'react';
import { useRouter } from 'expo-router';
import AportacionFormScreen from '../screens/red-aliados/AportacionFormScreen'; 

export default function AportacionRoute() {
  const router = useRouter();

  return (
    <AportacionFormScreen
      onClose={() => router.back()}
    />
  );
}