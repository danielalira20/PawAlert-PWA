import { router } from 'expo-router';
import AportacionFormScreen from '../screens/red-aliados/AportacionFormScreen';

export default function RedAliadosRoute() {
  return <AportacionFormScreen onClose={() => router.replace('/')} />;
}
