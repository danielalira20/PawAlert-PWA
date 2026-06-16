import { router } from 'expo-router';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  visible: boolean;
  onGuest: () => void;
  onClose: () => void;
}

export default function AuthGateModal({ visible, onGuest, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 44 }}>

          <Text style={{ fontSize: 20, fontWeight: '700', color: '#2C3E50', textAlign: 'center', marginBottom: 6 }}>
            ¿Cómo quieres continuar?
          </Text>
          <Text style={{ fontSize: 14, color: '#7F8C8D', textAlign: 'center', marginBottom: 28 }}>
            Elige una opción para crear tu reporte
          </Text>

          {/* Iniciar sesión */}
          <TouchableOpacity
            onPress={() => { onClose(); router.push('/login'); }}
            style={{ backgroundColor: '#3498DB', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Iniciar sesión</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>Ya tengo una cuenta</Text>
          </TouchableOpacity>

          {/* Crear cuenta */}
          <TouchableOpacity
            onPress={() => { onClose(); router.push('/login?tab=register'); }}
            style={{ backgroundColor: '#27AE60', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Crear cuenta</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>Registrarme por primera vez</Text>
          </TouchableOpacity>

          {/* Invitado */}
          <TouchableOpacity
            onPress={() => { onClose(); onGuest(); }}
            style={{ borderWidth: 1.5, borderColor: '#BDC3C7', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 }}
          >
            <Text style={{ color: '#2C3E50', fontWeight: '700', fontSize: 16 }}>Continuar como invitado</Text>
            <Text style={{ color: '#7F8C8D', fontSize: 12, marginTop: 2 }}>Solo necesito reportar este momento</Text>
          </TouchableOpacity>

          {/* Cancelar */}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center' }}>
            <Text style={{ color: '#95A5A6', fontSize: 14 }}>Cancelar</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}
