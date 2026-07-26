import { router } from 'expo-router';
import MisLotesScreen from '../screens/red-aliados/MisLotesScreen';

export default function MisLotesRoute() {
  return <MisLotesScreen onClose={() => router.back()} />;
}
