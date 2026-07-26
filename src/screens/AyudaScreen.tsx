import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Animated,
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { API_URL } from '../constants/api';
import * as Location from 'expo-location';

// ─── DESIGN TOKENS ──────────────────────────────────
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
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};

const isWeb = Platform.OS === 'web';

// ─── TIPOS ──────────────────────────────────────────────────────────
type CategoriaRecurso = 'Todas' | 'Alimentos' | 'Insumos Médicos' | 'Servicios Veterinarios' | 'Difusión' | 'Transporte' | 'Hogar Temporal';
type FiltroZona = 'Cualquiera' | 'Menos de 5 km' | 'Menos de 10 km' | 'Menos de 20 km';

interface NecesidadPublica {
  id: string;
  asociacion_nombre: string;
  categoria: CategoriaRecurso;
  subcategoria_nombre?: string;
  urgencia?: 'Baja' | 'Media' | 'Alta';
  cantidad?: string;
  detalle?: string;
  distancia_km: number;
  creado_hace: string;
}

const CATEGORIAS: { id: CategoriaRecurso; icono: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'Todas', icono: 'apps-outline' },
  { id: 'Alimentos', icono: 'nutrition-outline' },
  { id: 'Insumos Médicos', icono: 'medkit-outline' },
  { id: 'Servicios Veterinarios', icono: 'pulse-outline' },
  { id: 'Hogar Temporal', icono: 'home-outline' },
  { id: 'Transporte', icono: 'car-outline' },
  { id: 'Difusión', icono: 'megaphone-outline' },
];

const ZONAS: FiltroZona[] = ['Cualquiera', 'Menos de 5 km', 'Menos de 10 km', 'Menos de 20 km'];

// ─── BOTÓN ANIMADO ──────────────────────────────────────────────────────────
function AnimatedButton({ onPress, style, children }: { onPress: () => void; style?: any; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 40 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start()}
        activeOpacity={1}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── PANTALLA PRINCIPAL ─────────────────────────────────────────────────────
export default function HowToHelpScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Fraunces_800ExtraBold, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold });

  // ─── ESTADOS ───
  const [necesidades, setNecesidades] = useState<NecesidadPublica[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaRecurso>('Todas');
  const [zonaActiva, setZonaActiva] = useState<FiltroZona>('Cualquiera');
  
  // Nuevo estado para guardar la necesidad que el usuario seleccionó
  const [selectedNecesidad, setSelectedNecesidad] = useState<NecesidadPublica | null>(null);

  // ─── FUNCIÓN PARA CALCULAR DISTANCIA REAL (Haversine) ───
  const calcularDistanciaKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  };

  // ─── FETCH A BD REAL CON GPS ───
  useEffect(() => {
    const cargarNecesidadesPublicas = async () => {
      setIsLoading(true);
      try {
        let userLat = null;
        let userLon = null;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({});
            userLat = location.coords.latitude;
            userLon = location.coords.longitude;
          }
        } catch (error) {
          console.warn("No se pudo obtener la ubicación:", error);
        }

        const res = await axios.get(`${API_URL}/red-aliados/necesidades/publicas`);
        
        const mapeoNecesidades = res.data.map((item: any) => {
          const cantidadStr = item.cantidad_valor && item.cantidad_unidad 
            ? `${item.cantidad_valor} ${item.cantidad_unidad}` 
            : null;

          const mapeoUrgencia: Record<string, string> = {
            'critico': 'Alta',
            'urgente': 'Media',
            'no_urgente': 'Baja'
          };

          let distanciaCalculada = 0;
          const asocLat = item.asociaciones?.latitud;
          const asocLon = item.asociaciones?.longitud;

          if (userLat && userLon && asocLat && asocLon) {
            distanciaCalculada = calcularDistanciaKm(userLat, userLon, asocLat, asocLon);
          }

          return {
            id: item.id,
            asociacion_nombre: item.asociaciones?.nombre || 'Asociación',
            categoria: item.categoria,
            subcategoria_nombre: item.subcategoria_recurso?.nombre || null,
            urgencia: item.urgencia ? mapeoUrgencia[item.urgencia] : null,
            cantidad: cantidadStr,
            detalle: item.detalle?.notas || null,
            distancia_km: distanciaCalculada, 
            creado_hace: `hace ${formatDistanceToNow(new Date(item.created_at), { locale: es })}`
          };
        });

        mapeoNecesidades.sort((a: NecesidadPublica, b: NecesidadPublica) => a.distancia_km - b.distancia_km);
        
        setNecesidades(mapeoNecesidades);
      } catch (error) {
        console.error("Error al cargar necesidades públicas:", error);
      } finally {
        setIsLoading(false);
      }
    };

    cargarNecesidadesPublicas();
  }, []);

  // ─── APLICAR FILTROS ───
  const necesidadesFiltradas = necesidades.filter((item) => {
    if (categoriaActiva !== 'Todas' && item.categoria !== categoriaActiva) return false;
    
    if (zonaActiva === 'Menos de 5 km' && item.distancia_km > 5) return false;
    if (zonaActiva === 'Menos de 10 km' && item.distancia_km > 10) return false;
    if (zonaActiva === 'Menos de 20 km' && item.distancia_km > 20) return false;
    
    return true;
  });

  const getUrgencyColor = (urgencia?: string) => {
    switch (urgencia) {
      case 'Alta': return C.danger;
      case 'Media': return C.accent;
      case 'Baja': return C.secondary;
      default: return C.muted;
    }
  };

  if (!fontsLoaded) return null;

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        
        {/* ── CONTENEDOR TIPO MODAL ── */}
        <View style={{ 
          width: '100%', maxWidth: 1000, maxHeight: '90%', 
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
            <TouchableOpacity 
              onPress={() => router.back()} 
              hitSlop={10}
              style={{ position: 'absolute', left: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: C.bgSoft, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={20} color={C.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: C.text }}>
              Cómo <Text style={{ color: C.primary }}>ayudar</Text>
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            
            {/* ── BANNER EXPLICATIVO ── */}
            <View style={{ paddingHorizontal: 32, paddingTop: 32, paddingBottom: 16 }}>
              <Text style={{ fontSize: 26, fontFamily: F.displayBold, color: C.text, marginBottom: 8, letterSpacing: -0.5 }}>
                Descubre dónde se necesita tu apoyo hoy
              </Text>
              <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.muted, lineHeight: 22 }}>
                Las asociaciones locales publican aquí los recursos y servicios que necesitan para seguir salvando vidas. 
                Filtra por zona y categoría para encontrar la mejor forma de sumar tu granito de arena.
              </Text>
            </View>

            {/* ── FILTROS: ZONA ── */}
            <View style={{ paddingHorizontal: 32, marginBottom: 20 }}>
              <Text style={{ fontSize: 13, fontFamily: F.bodySemiBold, color: C.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Ubicación
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {ZONAS.map((zona) => (
                  <TouchableOpacity
                    key={zona}
                    onPress={() => setZonaActiva(zona)}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
                      backgroundColor: zonaActiva === zona ? C.text : C.bg,
                      borderWidth: 1, borderColor: zonaActiva === zona ? C.text : C.neutralLight,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: F.bodyMedium, color: zonaActiva === zona ? '#FFF' : C.text }}>
                      {zona}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* ── FILTROS: CATEGORÍA ── */}
            <View style={{ paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: `${C.neutralLight}60`, marginBottom: 24 }}>
              <Text style={{ paddingHorizontal: 32, fontSize: 13, fontFamily: F.bodySemiBold, color: C.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Tipo de ayuda
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 32 }}>
                {CATEGORIAS.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setCategoriaActiva(cat.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16,
                      backgroundColor: categoriaActiva === cat.id ? `${C.primary}15` : C.bg,
                      borderWidth: 1, borderColor: categoriaActiva === cat.id ? C.primary : C.neutralLight,
                    }}
                  >
                    <Ionicons name={cat.icono} size={16} color={categoriaActiva === cat.id ? C.primary : C.muted} />
                    <Text style={{ fontSize: 13, fontFamily: F.bodySemiBold, color: categoriaActiva === cat.id ? C.primary : C.muted }}>
                      {cat.id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* ── LISTADO DE NECESIDADES ── */}
            <View style={{ paddingHorizontal: 32 }}>
              {isLoading ? (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text style={{ marginTop: 16, fontFamily: F.bodyMedium, color: C.muted }}>Buscando necesidades activas...</Text>
                </View>
              ) : necesidadesFiltradas.length === 0 ? (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                  <Ionicons name="search-outline" size={48} color={C.neutralLight} style={{ marginBottom: 16 }} />
                  <Text style={{ fontSize: 16, fontFamily: F.bodySemiBold, color: C.text }}>No encontramos resultados</Text>
                  <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.muted, textAlign: 'center', marginTop: 8 }}>
                    Intenta ajustar los filtros de zona o categoría.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  {necesidadesFiltradas.map((item) => {
                    const iconoCat = CATEGORIAS.find(c => c.id === item.categoria)?.icono || 'apps-outline';
                    
                    return (
                      <View key={item.id} style={{
                        backgroundColor: C.bg, borderRadius: 24, padding: 24,
                        borderWidth: 1, borderColor: `${C.neutralLight}50`,
                      }}>
                        
                        {/* Header Card: Asociación y Distancia */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${C.secondary}15`, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                              <Ionicons name="business-outline" size={18} color={C.secondary} />
                            </View>
                            <View>
                              <Text style={{ fontSize: 14, fontFamily: F.bodySemiBold, color: C.text }} numberOfLines={1}>
                                {item.asociacion_nombre}
                              </Text>
                              <Text style={{ fontSize: 11, fontFamily: F.bodyRegular, color: C.muted }}>
                                {item.creado_hace}
                              </Text>
                            </View>
                          </View>
                          
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                            <Ionicons name="location" size={12} color={C.primary} style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontFamily: F.bodySemiBold, color: C.primary }}>a {item.distancia_km} km</Text>
                          </View>
                        </View>

                        {/* Contenido principal */}
                        <View style={{ marginBottom: 20 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <Ionicons name={iconoCat} size={18} color={C.text} style={{ marginRight: 8 }} />
                            <Text style={{ fontSize: 16, fontFamily: F.displayBold, color: C.text }}>
                              {item.subcategoria_nombre || item.categoria}
                            </Text>
                          </View>
                          
                          {item.cantidad && (
                            <Text style={{ fontSize: 14, fontFamily: F.bodySemiBold, color: C.text, marginBottom: 4 }}>
                              Cantidad: <Text style={{ color: C.secondary }}>{item.cantidad}</Text>
                            </Text>
                          )}
                          
                          {item.detalle && (
                            <Text style={{ fontSize: 13, fontFamily: F.bodyRegular, color: C.muted, lineHeight: 20 }}>
                              {item.detalle}
                            </Text>
                          )}
                        </View>

                        {/* Footer Card: Urgencia y Botón CTA */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: `${C.neutralLight}40`, paddingTop: 16 }}>
                          {item.urgencia ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getUrgencyColor(item.urgencia), marginRight: 6 }} />
                              <Text style={{ fontSize: 12, fontFamily: F.bodySemiBold, color: C.text }}>
                                Urgencia {item.urgencia}
                              </Text>
                            </View>
                          ) : <View />}

                          <AnimatedButton onPress={() => setSelectedNecesidad(item)}>
                            <View style={{
                              backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100,
                              flexDirection: 'row', alignItems: 'center', gap: 6
                            }}>
                              <Text style={{ color: '#FFF', fontSize: 13, fontFamily: F.bodySemiBold }}>Ofrecer ayuda</Text>
                              <Ionicons name="arrow-forward" size={14} color="#FFF" />
                            </View>
                          </AnimatedButton>
                        </View>

                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

        </View>

      </View>

      {/* ── MODAL DE AUTORIZACIÓN (Muestra los detalles de la necesidad seleccionada) ── */}
      <Modal visible={!!selectedNecesidad} transparent animationType="fade" onRequestClose={() => setSelectedNecesidad(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.bg, borderRadius: 32, padding: 32, width: '100%', maxWidth: 500, ...(isWeb ? { boxShadow: '0 20px 60px rgba(0,0,0,0.2)' } : { elevation: 10 }) as any }}>
            
            {/* Botón Cerrar (X) */}
            <TouchableOpacity 
              onPress={() => setSelectedNecesidad(null)} 
              style={{ position: 'absolute', top: 16, right: 16, padding: 8, zIndex: 10 }}
            >
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>

            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${C.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 20, alignSelf: 'center' }}>
              <Ionicons name="heart" size={28} color={C.primary} />
            </View>
            
            {/* DETALLES DE LA NECESIDAD */}
            {selectedNecesidad && (
              <View style={{ backgroundColor: C.bgSoft, padding: 20, borderRadius: 20, marginBottom: 28, borderWidth: 1, borderColor: `${C.neutralLight}60` }}>
                <Text style={{ fontSize: 13, fontFamily: F.bodySemiBold, color: C.muted, marginBottom: 4 }}>
                  Estás apoyando a: <Text style={{ color: C.text }}>{selectedNecesidad.asociacion_nombre}</Text>
                </Text>
                <Text style={{ fontSize: 18, fontFamily: F.displayBold, color: C.primary, marginBottom: 12 }}>
                  {selectedNecesidad.subcategoria_nombre || selectedNecesidad.categoria}
                </Text>
                
                {selectedNecesidad.cantidad && (
                  <Text style={{ fontSize: 13, fontFamily: F.bodyMedium, color: C.text, marginBottom: 6 }}>
                    <Text style={{ fontFamily: F.bodySemiBold }}>Cantidad solicitada: </Text>{selectedNecesidad.cantidad}
                  </Text>
                )}
                {selectedNecesidad.detalle && (
                  <Text style={{ fontSize: 13, fontFamily: F.bodyRegular, color: C.text, lineHeight: 20 }}>
                    {selectedNecesidad.detalle}
                  </Text>
                )}
              </View>
            )}

            <Text style={{ fontSize: 20, fontFamily: F.displayBold, color: C.text, textAlign: 'center', marginBottom: 8 }}>
              ¿Quieres ayudar?
            </Text>
            <Text style={{ fontSize: 14, fontFamily: F.bodyRegular, color: C.muted, textAlign: 'center', marginBottom: 28, lineHeight: 22 }}>
              Inicia sesión o regístrate como aliado de PawAlert para coordinar la entrega de forma segura.
            </Text>

            <Text style={{ fontSize: 13, fontFamily: F.bodySemiBold, color: C.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
              ¿Cómo quieres colaborar?
            </Text>

            {/* BOTONES DE COLABORACIÓN */}
            <View style={{ width: '100%', gap: 12 }}>
              
              {/* Botón: Aliado institucional */}
              <AnimatedButton onPress={() => { setSelectedNecesidad(null); router.push('/login'); }}>
                <View style={{ backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="business" size={18} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFF', fontSize: 15, fontFamily: F.bodySemiBold, marginBottom: 2 }}>Aliado institucional / local</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: F.bodyRegular }}>Empresas, veterinarias o negocios</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#FFF" />
                </View>
              </AnimatedButton>
              
              {/* Botón: Aliado comunitario */}
              <AnimatedButton onPress={() => { setSelectedNecesidad(null); router.push('/login'); }}>
                <View style={{ backgroundColor: C.secondary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={18} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFF', fontSize: 15, fontFamily: F.bodySemiBold, marginBottom: 2 }}>Aliado comunitario</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontFamily: F.bodyRegular }}>Personas que desean donar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#FFF" />
                </View>
              </AnimatedButton>

            </View>

          </View>
        </View>
      </Modal>

    </Modal>
  );
}