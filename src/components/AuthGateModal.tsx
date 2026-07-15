import { router } from 'expo-router';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { Ionicons } from '@expo/vector-icons';

const C = {
  primary:       '#F5842B',
  primaryLight:  '#F1D5B6',
  secondary:     '#66C5BD',
  accent:        '#F6CE5B',
  neutralLight:  '#E8CCAD',
  text:          '#2E2A26',
  bg:            '#FFFFFF',
  bgSoft:        '#FDF8F4',
  muted:         '#9E8C7E',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  displaySemi: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium:  'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};

interface Props {
  visible: boolean;
  onGuest: () => void;
  onClose: () => void;
}

export default function AuthGateModal({ visible, onGuest, onClose }: Props) {
  const [fontsLoaded] = useFonts({
    Fraunces_800ExtraBold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(46,42,38,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: C.bg, borderRadius: 36, padding: 28, paddingBottom: 36, width: '100%', maxWidth: 400 }}>
          
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 48, height: 6, backgroundColor: C.neutralLight, borderRadius: 3, marginBottom: 24 }} />
            <Ionicons name="paw" size={40} color={C.primary} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 26, fontFamily: F.displayBold, color: C.text, textAlign: 'center', marginBottom: 6, letterSpacing: -0.5 }}>
              ¿Cómo quieres continuar?
            </Text>
            <Text style={{ fontSize: 14, fontFamily: F.bodyMedium, color: C.muted, textAlign: 'center' }}>
              Elige una opción para crear tu reporte
            </Text>
          </View>

          {/* Iniciar sesión */}
          <TouchableOpacity
            onPress={() => { onClose(); router.push('/login'); }}
            style={{ backgroundColor: C.primary, paddingVertical: 18, borderRadius: 30, alignItems: 'center', marginBottom: 12 }}
          >
            <Text style={{ color: C.bg, fontFamily: F.bodySemiBold, fontSize: 16 }}>Iniciar sesión</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: F.bodyMedium, fontSize: 12, marginTop: 2 }}>Ya tengo una cuenta</Text>
          </TouchableOpacity>

          {/* Crear cuenta */}
          <TouchableOpacity
            onPress={() => { onClose(); router.push('/login?tab=register'); }}
            style={{ backgroundColor: C.bg, borderWidth: 2, borderColor: C.primary, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 16 }}
          >
            <Text style={{ color: C.primary, fontFamily: F.bodySemiBold, fontSize: 16 }}>Crear cuenta</Text>
            <Text style={{ color: C.primary, opacity: 0.8, fontFamily: F.bodyMedium, fontSize: 12, marginTop: 2 }}>Registrarme por primera vez</Text>
          </TouchableOpacity>

          {/* Invitado */}
          <TouchableOpacity
            onPress={() => { onClose(); onGuest(); }}
            style={{ backgroundColor: C.bgSoft, borderWidth: 1.5, borderColor: `${C.neutralLight}80`, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 20 }}
          >
            <Text style={{ color: C.text, fontFamily: F.bodySemiBold, fontSize: 16 }}>Continuar como invitado</Text>
            <Text style={{ color: C.muted, fontFamily: F.bodyMedium, fontSize: 12, marginTop: 2 }}>Solo necesito reportar este momento</Text>
          </TouchableOpacity>

          {/* Cancelar */}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ color: C.muted, fontFamily: F.bodySemiBold, fontSize: 15, textDecorationLine: 'underline' }}>Cancelar</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}
