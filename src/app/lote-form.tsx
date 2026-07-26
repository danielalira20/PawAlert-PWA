import { router } from 'expo-router';
import LoteFormScreen from '../screens/red-aliados/LoteFormScreen';

export default function LoteFormRoute() {
  return <LoteFormScreen onClose={() => router.back()} />;
}
