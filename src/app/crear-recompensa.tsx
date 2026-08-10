import { router } from 'expo-router';
import CrearRecompensaScreen from '../screens/red-aliados/CrearRecompensaScreen';

export default function CrearRecompensaRoute() {
  return <CrearRecompensaScreen onClose={() => router.back()} />;
}
