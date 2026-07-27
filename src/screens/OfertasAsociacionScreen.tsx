import React, { useState, useEffect } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, 
  Platform, Modal, TextInput 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import { useFonts, Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { API_URL } from '../constants/api'; 
import { useAuth } from '../context/AuthContext';
import { useToast, Toast } from '../components/Toast'; 

// ─── DESIGN TOKENS ───
const C = {
  primary: '#F5842B',
  primaryLight: '#F1D5B6',
  secondary: '#66C5BD',
  accent: '#F6CE5B',
  neutralLight: '#E8CCAD',
  text: '#2E2A26',
  bg: '#FFFFFF',
  bgSoft: '#FDF8F4',
  muted: '#9E8C7E',
  danger: '#E85D4B',
  success: '#2ECC71',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};

const isWeb = Platform.OS === 'web';

interface Oferta {
  id: string;
  cantidad_valor: number;
  cantidad_unidad: string;
  estado: string;
  created_at: string;
  detalle: any;
  necesidades?: {
    categoria: string;
  } | null;
  subcategoria_recurso?: {
    clave: string;
    descripcion: string;
    categoria_recurso?: { clave: string; descripcion: string } | null;
  } | null;
  usuarios: {
    id: string;
    nombre: string;
    apellido_paterno: string;
    telefono: string;
    email: string;
    perfil_apoyo?: any[] | any | null;
  };
}

export default function OfertasAsociacionScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  
  const [fontsLoaded] = useFonts({ Fraunces_800ExtraBold, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });
  
  const [activeTab, setActiveTab] = useState<'pendientes' | 'historial'>('pendientes');
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerificando, setIsVerificando] = useState<string | null>(null);
  
  // Estados para el Modal de Ajuste
  const [ofertaParaAjustar, setOfertaParaAjustar] = useState<Oferta | null>(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchOfertas = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/ofertas?tab=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOfertas(res.data);
    } catch (error) {
      console.error("Error al cargar ofertas:", error);
      showToast({ type: 'error', title: 'Error', message: 'No se pudieron cargar las ofertas.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchOfertas();
  }, [token, activeTab]);

  const resolverOferta = async (id: string, accion: 'aceptar' | 'rechazar' | 'ajustar', cantidad_ajustada?: number) => {
    setIsSubmitting(true);
    try {
      await axios.patch(
        `${API_URL}/associations/me/ofertas/${id}/resolver`,
        { accion, cantidad_ajustada },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      showToast({ 
        type: 'success', 
        title: 'Oferta resuelta', 
        message: `La oferta ha sido ${accion === 'ajustar' ? 'ajustada y aceptada' : accion} exitosamente.` 
      });
      
      setOfertaParaAjustar(null);
      setNuevaCantidad('');
      fetchOfertas(); // Recargar la lista
    } catch (error) {
      console.error("Error al resolver oferta:", error);
      showToast({ type: 'error', title: 'Error', message: 'Ocurrió un problema al procesar tu solicitud.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const verificarAliado = async (usuarioId: string) => {
    setIsVerificando(usuarioId);
    try {
      await axios.patch(
        `${API_URL}/associations/me/aliados/usuario/${usuarioId}/verificar`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showToast({ type: 'success', title: 'Verificado', message: 'Se ha otorgado el sello de aliado verificado.' });
      fetchOfertas();
    } catch (error: any) {
      console.error("Error al verificar aliado:", error);
      const msg = error.response?.data?.detail || 'No se pudo otorgar el sello.';
      showToast({ type: 'error', title: 'Error', message: msg });
    } finally {
      setIsVerificando(null);
    }
  };

  const renderOferta = ({ item }: { item: Oferta }) => {
    const aliadoNombre = `${item.usuarios?.nombre || 'Aliado'} ${item.usuarios?.apellido_paterno || ''}`.trim();
    const tiempo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: es });

    return (
      <View style={{
        backgroundColor: C.bg, borderRadius: 24, padding: 24, marginBottom: 16,
        borderWidth: 1, borderColor: `${C.neutralLight}50`,
      }}>
        
        {/* Header Card: Aliado y Tiempo */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${C.secondary}15`, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Ionicons name="person-outline" size={18} color={C.secondary} />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontFamily: F.bodySemiBold, color: C.text }} numberOfLines={1}>
                {aliadoNombre}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: F.bodyRegular, color: C.muted }}>
                ofrece
              </Text>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
            <Ionicons name="time-outline" size={12} color={C.primary} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 11, fontFamily: F.bodySemiBold, color: C.primary }}>hace {tiempo}</Text>
          </View>
        </View>

        {/* Contenido principal */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="gift-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 16, fontFamily: F.displayBold, color: C.text }}>
              {item.subcategoria_recurso?.categoria_recurso?.descripcion || item.necesidades?.categoria || 'Recurso'}
            </Text>
          </View>
          
          <Text style={{ fontSize: 14, fontFamily: F.bodySemiBold, color: C.text, marginBottom: 4 }}>
            Cantidad: <Text style={{ color: C.secondary }}>{item.cantidad_valor} {item.cantidad_unidad}</Text>
          </Text>
          
          {item.detalle?.notas && (
            <Text style={{ fontSize: 13, fontFamily: F.bodyRegular, color: C.muted, lineHeight: 20 }}>
              "{item.detalle.notas}"
            </Text>
          )}
        </View>

        {/* Footer Card: Botones */}
        {activeTab === 'pendientes' ? (
          <View style={{ flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: `${C.neutralLight}40`, paddingTop: 16 }}>
            <TouchableOpacity 
              onPress={() => resolverOferta(item.id, 'aceptar')}
              style={{ flex: 1, backgroundColor: C.primary, paddingVertical: 12, borderRadius: 100, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontFamily: F.bodySemiBold, fontSize: 13 }}>Aceptar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => setOfertaParaAjustar(item)}
              style={{ flex: 1, backgroundColor: C.secondary, paddingVertical: 12, borderRadius: 100, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            >
              <Ionicons name="create-outline" size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontFamily: F.bodySemiBold, fontSize: 13 }}>Ajustar</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => resolverOferta(item.id, 'rechazar')}
              style={{ backgroundColor: C.bgSoft, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 100, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${C.danger}40` }}
            >
              <Ionicons name="close" size={18} color={C.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: `${C.neutralLight}40`, paddingTop: 16, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.bodyMedium, color: C.muted, marginBottom: 12 }}>
              Estado: <Text style={{ color: item.estado === 'confirmada' ? C.success : C.primary, fontFamily: F.bodySemiBold }}>{item.estado.toUpperCase()}</Text>
            </Text>
            
            {(() => {
              const p_array = Array.isArray(item.usuarios?.perfil_apoyo) ? item.usuarios.perfil_apoyo : [];
              const perfil = p_array.length > 0 ? p_array[0] : item.usuarios?.perfil_apoyo;
              if (!perfil) return null;
              
              if (perfil.aliado_verificado_por) {
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.success}20`, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 }}>
                    <Ionicons name="checkmark-circle" size={18} color={C.success} style={{ marginRight: 6 }} />
                    <Text style={{ color: C.success, fontFamily: F.bodySemiBold, fontSize: 13 }}>Aliado Verificado</Text>
                  </View>
                );
              } else {
                return (
                  <TouchableOpacity 
                    onPress={() => verificarAliado(item.usuarios.id)}
                    disabled={isVerificando === item.usuarios.id}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100, opacity: isVerificando === item.usuarios.id ? 0.7 : 1 }}
                  >
                    {isVerificando === item.usuarios.id ? (
                      <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
                    ) : (
                      <Ionicons name="star" size={16} color="#FFF" style={{ marginRight: 6 }} />
                    )}
                    <Text style={{ color: '#FFF', fontFamily: F.bodySemiBold, fontSize: 13 }}>Otorgar Sello de Verificado</Text>
                  </TouchableOpacity>
                );
              }
            })()}
          </View>
        )}

      </View>
    );
  };

  if (!fontsLoaded) return null;

  return (
    <>
      <Modal visible={true} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Toast toast={toast} translateY={translateY} />
          
          <View style={{ 
            width: '100%', maxWidth: 1000, maxHeight: '90%', flexShrink: 1,
            backgroundColor: C.bgSoft, borderRadius: 32, overflow: 'hidden',
            ...(isWeb ? { boxShadow: '0 20px 60px rgba(0,0,0,0.25)' } : { elevation: 15 }) as any
          }}>
            
            {/* ── HEADER MODAL ── */}
            <View style={{
              backgroundColor: C.bg, paddingHorizontal: 24, paddingVertical: 20,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              borderBottomWidth: 1, borderBottomColor: `${C.neutralLight}40`,
              zIndex: 10
            }}>
              <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: C.text }}>
                Ofertas de <Text style={{ color: C.primary }}>ayuda</Text>
              </Text>
              <TouchableOpacity 
                onPress={() => router.back()} 
                hitSlop={10}
                style={{ position: 'absolute', right: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: C.bgSoft, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              {/* ── BANNER EXPLICATIVO ── */}
              <View style={{ paddingHorizontal: 32, paddingTop: 32, paddingBottom: 16 }}>
                <Text style={{ fontSize: 26, fontFamily: F.displayBold, color: C.text, marginBottom: 8, letterSpacing: -0.5 }}>
                  Aportaciones de la comunidad
                </Text>
                <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.muted, lineHeight: 22 }}>
                  Revisa y gestiona las ofertas de ayuda que los aliados han hecho para tus necesidades activas.
                </Text>
              </View>

              {/* ── TABS ── */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 32, marginBottom: 16 }}>
                <TouchableOpacity 
                  onPress={() => setActiveTab('pendientes')}
                  style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === 'pendientes' ? C.primary : 'transparent' }}
                >
                  <Text style={{ fontFamily: F.bodySemiBold, color: activeTab === 'pendientes' ? C.primary : C.muted }}>Pendientes</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setActiveTab('historial')}
                  style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === 'historial' ? C.primary : 'transparent' }}
                >
                  <Text style={{ fontFamily: F.bodySemiBold, color: activeTab === 'historial' ? C.primary : C.muted }}>Historial</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1, paddingHorizontal: 32 }}>
                {isLoading ? (
                  <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={C.primary} />
                    <Text style={{ marginTop: 16, fontFamily: F.bodyMedium, color: C.muted }}>Buscando ofertas...</Text>
                  </View>
                ) : ofertas.length === 0 ? (
                  <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                    <Ionicons name={activeTab === 'pendientes' ? "gift-outline" : "time-outline"} size={48} color={C.neutralLight} style={{ marginBottom: 16 }} />
                    <Text style={{ fontSize: 16, fontFamily: F.bodySemiBold, color: C.text }}>Sin ofertas {activeTab === 'pendientes' ? 'pendientes' : 'en el historial'}</Text>
                    <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.muted, textAlign: 'center', marginTop: 8 }}>
                      {activeTab === 'pendientes' ? 'Las nuevas contribuciones aparecerán aquí.' : 'Aquí aparecerán las contribuciones que hayas aceptado.'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={ofertas}
                    keyExtractor={(item) => item.id}
                    renderItem={renderOferta}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 40 }}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal para Ajustar Cantidad (Sub-modal) ── */}
      <Modal visible={!!ofertaParaAjustar} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: C.bg, borderRadius: 32, padding: 32, ...(isWeb ? { boxShadow: '0 20px 60px rgba(0,0,0,0.2)' } : { elevation: 10 }) as any }}>
            <Text style={{ fontSize: 18, fontFamily: F.displayBold, color: C.text, marginBottom: 8 }}>
              Ajustar cantidad
            </Text>
            <Text style={{ fontSize: 13, fontFamily: F.bodyRegular, color: C.muted, marginBottom: 20 }}>
              El aliado ofreció {ofertaParaAjustar?.cantidad_valor} {ofertaParaAjustar?.cantidad_unidad}. ¿Cuánto necesitas recibir realmente?
            </Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.neutralLight, borderRadius: 16, paddingHorizontal: 16, marginBottom: 24, backgroundColor: C.bgSoft }}>
              <TextInput 
                style={{ flex: 1, height: 56, fontFamily: F.bodySemiBold, fontSize: 16, color: C.text }}
                keyboardType="numeric"
                placeholder="Ej. 5"
                value={nuevaCantidad}
                onChangeText={(val) => setNuevaCantidad(val.replace(/[^0-9.]/g, ''))}
              />
              <Text style={{ fontFamily: F.bodySemiBold, color: C.muted, marginLeft: 8 }}>
                {ofertaParaAjustar?.cantidad_unidad}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                onPress={() => { setOfertaParaAjustar(null); setNuevaCantidad(''); }}
                style={{ flex: 1, backgroundColor: C.bgSoft, paddingVertical: 14, borderRadius: 100, alignItems: 'center' }}
              >
                <Text style={{ color: C.text, fontFamily: F.bodySemiBold }}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                disabled={isSubmitting || !nuevaCantidad}
                onPress={() => resolverOferta(ofertaParaAjustar!.id, 'ajustar', Number(nuevaCantidad))}
                style={{ flex: 1, backgroundColor: C.primary, paddingVertical: 14, borderRadius: 100, alignItems: 'center', opacity: (!nuevaCantidad || isSubmitting) ? 0.6 : 1 }}
              >
                {isSubmitting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ color: '#FFF', fontFamily: F.bodySemiBold }}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}