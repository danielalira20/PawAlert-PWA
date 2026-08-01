import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';

const MOTIVOS = [
  { key: 'informacion_falsa', label: 'La información parece falsa', icon: 'alert-circle-outline' },
  { key: 'foto_internet', label: 'La fotografía fue tomada de Internet', icon: 'image-outline' },
  { key: 'reporte_repetido', label: 'Es un reporte repetido', icon: 'copy-outline' },
  { key: 'ubicacion_incorrecta', label: 'La ubicación parece incorrecta', icon: 'location-outline' },
  { key: 'animal_no_esta', label: 'El animal no aparece en el lugar', icon: 'paw-outline' },
  { key: 'contenido_inapropiado', label: 'Contenido inapropiado o sensible', icon: 'eye-off-outline' },
  { key: 'posible_fraude', label: 'Posible fraude o solicitud engañosa', icon: 'shield-outline' },
  { key: 'otro', label: 'Otro motivo', icon: 'ellipsis-horizontal-circle-outline' },
] as const;

type Stage = 'menu' | 'motivos' | 'detalle' | 'confirmar' | 'exito' | 'login';

export function ReportContentMenu({
  reportId,
  compact = false,
  onModerated,
}: {
  reportId: string;
  compact?: boolean;
  onModerated?: () => void;
}) {
  const { token, isLoggedIn } = useAuth();
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<Stage>('menu');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [retirarAlCerrar, setRetirarAlCerrar] = useState(false);
  const [triggerHovered, setTriggerHovered] = useState(false);

  const abrir = () => {
    setError('');
    setStage('menu');
    setVisible(true);
  };
  const cerrar = () => {
    if (enviando) return;
    setVisible(false);
    if (retirarAlCerrar) onModerated?.();
    setRetirarAlCerrar(false);
    setMotivo(null);
    setDetalle('');
    setError('');
  };
  const comenzar = () => setStage(isLoggedIn ? 'motivos' : 'login');
  const motivoSeleccionado = MOTIVOS.find((item) => item.key === motivo);

  const enviar = async () => {
    if (!motivo || !token) return;
    setEnviando(true);
    setError('');
    try {
      const response = await axios.post(
        `${API_URL}/reports/${reportId}/denuncias`,
        { motivo, detalle: detalle.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setStage('exito');
      // En la tercera denuncia primero mostramos la confirmación. El marcador
      // se retira cuando la persona cierre este mensaje, no antes.
      setRetirarAlCerrar(response.data?.estado_moderacion === 'en_revision');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'No pudimos enviar el reporte. Inténtalo nuevamente.');
      if (err?.response?.status === 409) setStage('exito');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Pressable
        accessibilityLabel="Reportar publicación"
        accessibilityRole="button"
        onHoverIn={() => setTriggerHovered(true)}
        onHoverOut={() => setTriggerHovered(false)}
        onPress={(event) => {
          event.stopPropagation?.();
          abrir();
        }}
        style={({ pressed }) => {
          const active = pressed || triggerHovered || visible;
          return {
            width: compact ? 28 : 32,
            height: compact ? 28 : 32,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: '#E64A3C',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? '#E64A3C' : '#FFF9F7',
            flexShrink: 0,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          };
        }}
      >
        {({ pressed }) => {
          const active = pressed || triggerHovered || visible;
          return (
            <Ionicons
              name={active ? 'flag' : 'flag-outline'}
              size={compact ? 15 : 17}
              color={active ? '#FFFFFF' : '#E64A3C'}
            />
          );
        }}
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
        <Pressable
          onPress={cerrar}
          style={{ flex: 1, backgroundColor: 'rgba(33,25,19,0.46)', justifyContent: width < 600 ? 'flex-end' : 'center', alignItems: 'center' }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: width < 600 ? '100%' : 480,
              maxHeight: '88%',
              backgroundColor: '#FFFCF9',
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              borderBottomLeftRadius: width < 600 ? 0 : 26,
              borderBottomRightRadius: width < 600 ? 0 : 26,
              padding: 22,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 22,
              elevation: 16,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFF0E5', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={stage === 'exito' ? 'checkmark-circle' : 'flag-outline'} size={22} color={stage === 'exito' ? '#27AE60' : '#EC802B'} />
              </View>
              <TouchableOpacity onPress={cerrar} style={{ padding: 6 }}>
                <Ionicons name="close" size={22} color="#6E5B49" />
              </TouchableOpacity>
            </View>

            {stage === 'menu' && (
              <>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#3F3025', marginBottom: 6 }}>Opciones del reporte</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: '#8D7B6A', marginBottom: 18 }}>Ayúdanos a mantener PawAlert seguro para la comunidad.</Text>
                <TouchableOpacity onPress={comenzar} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: '#FFF4F2' }}>
                  <Ionicons name="flag-outline" size={21} color="#E64A3C" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 15, color: '#C63C32' }}>Reportar publicación</Text>
                    <Text style={{ fontSize: 12, color: '#9A756E', marginTop: 2 }}>La denuncia será confidencial</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#C63C32" />
                </TouchableOpacity>
              </>
            )}

            {stage === 'login' && (
              <>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#3F3025', marginBottom: 8 }}>Inicia sesión para reportar</Text>
                <Text style={{ fontSize: 14, lineHeight: 21, color: '#8D7B6A', marginBottom: 20 }}>Así aseguramos que cada persona solo pueda reportar esta publicación una vez.</Text>
                <TouchableOpacity onPress={() => { cerrar(); router.push('/login'); }} style={{ backgroundColor: '#EC802B', padding: 15, borderRadius: 14, alignItems: 'center' }}>
                  <Text style={{ color: '#FFF', fontWeight: '900' }}>Iniciar sesión</Text>
                </TouchableOpacity>
              </>
            )}

            {stage === 'motivos' && (
              <>
                <Text style={{ fontSize: 21, fontWeight: '900', color: '#3F3025' }}>¿Por qué quieres reportarlo?</Text>
                <Text style={{ fontSize: 13, color: '#8D7B6A', marginTop: 5, marginBottom: 12 }}>Selecciona el motivo que mejor describa el problema.</Text>
                <ScrollView style={{ maxHeight: 390 }} showsVerticalScrollIndicator={false}>
                  {MOTIVOS.map((item) => (
                    <TouchableOpacity key={item.key} onPress={() => { setMotivo(item.key); setStage('detalle'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F0E7DE' }}>
                      <Ionicons name={item.icon as any} size={20} color="#EC802B" />
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#4B392C' }}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={17} color="#B9AA9B" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {stage === 'detalle' && (
              <>
                <Text style={{ fontSize: 21, fontWeight: '900', color: '#3F3025', marginBottom: 5 }}>Cuéntanos un poco más</Text>
                <Text style={{ fontSize: 13, color: '#8D7B6A', marginBottom: 14 }}>Opcional. No incluyas información personal.</Text>
                <TextInput value={detalle} onChangeText={setDetalle} maxLength={500} multiline placeholder="Escribe detalles que ayuden a revisarlo…" placeholderTextColor="#B6A79A" style={{ minHeight: 120, borderWidth: 1.5, borderColor: '#E9DED3', borderRadius: 16, padding: 14, textAlignVertical: 'top', color: '#3F3025', backgroundColor: '#FFF' }} />
                <Text style={{ alignSelf: 'flex-end', fontSize: 11, color: '#A79687', marginTop: 5 }}>{detalle.length}/500</Text>
                <TouchableOpacity onPress={() => setStage('confirmar')} style={{ backgroundColor: '#EC802B', padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 12 }}>
                  <Text style={{ color: '#FFF', fontWeight: '900' }}>Continuar</Text>
                </TouchableOpacity>
              </>
            )}

            {stage === 'confirmar' && (
              <>
                <Text style={{ fontSize: 21, fontWeight: '900', color: '#3F3025', marginBottom: 8 }}>Confirma tu reporte</Text>
                <View style={{ padding: 15, backgroundColor: '#FFF4F2', borderRadius: 15, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#9A756E', fontWeight: '700' }}>MOTIVO</Text>
                  <Text style={{ fontSize: 15, color: '#4B392C', fontWeight: '800', marginTop: 4 }}>{motivoSeleccionado?.label}</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#8D7B6A', lineHeight: 19 }}>Solo puedes reportar este caso una vez. El autor no verá tu identidad.</Text>
                {!!error && <Text style={{ color: '#D6453D', fontWeight: '700', marginTop: 10 }}>{error}</Text>}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <TouchableOpacity disabled={enviando} onPress={() => setStage('detalle')} style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#F3EEE9', alignItems: 'center' }}><Text style={{ fontWeight: '800', color: '#5E4A3A' }}>Volver</Text></TouchableOpacity>
                  <TouchableOpacity disabled={enviando} onPress={enviar} style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#E64A3C', alignItems: 'center' }}>{enviando ? <ActivityIndicator color="#FFF" /> : <Text style={{ fontWeight: '900', color: '#FFF' }}>Enviar reporte</Text>}</TouchableOpacity>
                </View>
              </>
            )}

            {stage === 'exito' && (
              <>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#3F3025', marginBottom: 8 }}>{error ? 'Reporte ya recibido' : 'Gracias por avisarnos'}</Text>
                <Text style={{ fontSize: 14, lineHeight: 21, color: '#8D7B6A', marginBottom: 20 }}>{error || 'Guardamos tu alerta. Si alcanza el umbral o detectamos inconsistencias, el equipo de PawAlert revisará la publicación.'}</Text>
                <TouchableOpacity onPress={cerrar} style={{ backgroundColor: '#EC802B', padding: 15, borderRadius: 14, alignItems: 'center' }}><Text style={{ color: '#FFF', fontWeight: '900' }}>Entendido</Text></TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
