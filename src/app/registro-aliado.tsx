import React from 'react';
import RegistroAliadoLocalScreen from '../screens/red-aliados/RegistroAliadoLocalScreen';

import { useLocalSearchParams } from 'expo-router';

export default function RegistroAliadoRoute() {
  const params = useLocalSearchParams();
  const initialTipo = params.tipo ? String(params.tipo) : 'aliado_local';

  return <RegistroAliadoLocalScreen initialTipoAliado={initialTipo} />;
}
