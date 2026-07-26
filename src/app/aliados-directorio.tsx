import { router } from 'expo-router';
import DirectorioAliadosScreen from '../screens/red-aliados/DirectorioAliadosScreen';

export default function AliadosDirectorioRoute() {
  return <DirectorioAliadosScreen onClose={() => router.back()} />;
}
