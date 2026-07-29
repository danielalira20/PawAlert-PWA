import { router } from 'expo-router';
import AportacionFormScreen from '../screens/red-aliados/AportacionFormScreen';

export default function RedAliadosRoute() {
  // El formulario se abre desde el Panel de Aliado. Al salir, no basta con
  // regresar a la pestaña Perfil: también hay que restaurar ese panel.
  const closeForm = () => router.replace('/profile?abrirPanelAliado=true' as any);

  return <AportacionFormScreen onClose={closeForm} />;
}
