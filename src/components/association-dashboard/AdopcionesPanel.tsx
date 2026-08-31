import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { useToast, Toast } from '../Toast';
import { ImageLightbox } from '../common/ImageLightbox';

const COLORS = {
  bg: '#E8CCAD',
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#E74C3C',
  cardBg: '#FAF3EA'
};

const SHADOW_SM = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
};

interface AdopcionIntake {
  id: string;
  estado: 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada' | 'solicitando_informacion';
  nombre_temporal: string | null;
  fotos_propuesta: { foto_url: string; foto_url_expira_at: string }[]; 
  salud_conocida: string;
  temperamento_observado: string;
  motivo_propuesta: string;
  tiempo_custodia_adicional: string | null;
  compatibilidad_observada: any;
  creada_at: string;
  animal: {
    id: string;
    tipo_animal: string;
    tamanio: string;
  };
  voluntario: {
    nombre: string;
    apellido_paterno: string;
  };
}

interface Props {
  visible: boolean;
}

export function AdopcionesPanel({ visible }: Props) {
  const { token } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const { toast, translateY, showToast } = useToast();

  const [propuestas, setPropuestas] = useState<AdopcionIntake[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [seleccionada, setSeleccionada] = useState<AdopcionIntake | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  // Estados para la resolución
  const [accionActiva, setAccionActiva] = useState<'aprobar' | 'rechazar' | 'solicitar_informacion' | null>(null);
  const [motivoResolucion, setMotivoResolucion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cargarPropuestas = useCallback(async () => {
    if (!token || !visible) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/adoption-intake-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPropuestas(res.data.items || res.data || []);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar las propuestas de adopción.' });
    } finally {
      setIsLoading(false);
    }
  }, [token, visible]);

  useEffect(() => {
    cargarPropuestas();
  }, [cargarPropuestas]);

  const abrirDetalle = (propuesta: AdopcionIntake) => {
    setSeleccionada(propuesta);
    setAccionActiva(null);
    setMotivoResolucion('');
    setModalVisible(true);
  };

  const resolverPropuesta = async (decision: 'aprobar' | 'solicitar_informacion' | 'rechazar') => {
    if (!seleccionada) return;
    
    if (decision !== 'aprobar' && motivoResolucion.trim().length < 5) {
      showToast({ type: 'warning', title: 'Faltan datos', message: 'Debes escribir un motivo claro para esta acción.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/adoption-intake-requests/${seleccionada.id}/resolve`,
        {
          decision,
          motivo: motivoResolucion.trim() || 'Aprobado satisfactoriamente',
          idempotency_key: `resolve_${decision}_${seleccionada.id}_${Date.now()}`
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showToast({ 
        type: 'success', 
        title: '¡Resolución guardada!', 
        message: decision === 'aprobar' ? 'El animal ya es elegible para perfil público.' : 'Se notificó al voluntario.' 
      });
      
      setModalVisible(false);
      cargarPropuestas();
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error al resolver', message: error?.response?.data?.detail || 'Intenta nuevamente más tarde.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={{ flex: 1 }}>
      <Toast toast={toast} translateY={translateY} />

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textLight, marginTop: 12 }}>Cargando propuestas...</Text>
        </View>
      ) : propuestas.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(236,128,43,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ionicons name="home-outline" size={31} color={COLORS.primary} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textDark, textAlign: 'center', marginBottom: 8 }}>
            No hay propuestas pendientes
          </Text>
          <Text style={{ fontSize: 13, color: COLORS.textLight, textAlign: 'center', maxWidth: 300 }}>
            Cuando un voluntario proponga que un animal en custodia pase a adopción formal, aparecerá aquí.
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {propuestas.map((prop) => (
            <TouchableOpacity
              key={prop.id}
              activeOpacity={0.8}
              onPress={() => abrirDetalle(prop)}
              style={{
                flexGrow: 1, flexBasis: 280, maxWidth: screenWidth >= 768 ? '48%' : '100%',
                backgroundColor: COLORS.cardBg, borderRadius: 20, padding: 16, ...SHADOW_SM
              }}
            >
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {prop.fotos_propuesta?.[0]?.foto_url ? (
                  <Image source={{ uri: prop.fotos_propuesta[0].foto_url }} style={{ width: 70, height: 70, borderRadius: 14, backgroundColor: '#2E2A26' }} />
                ) : (
                  <View style={{ width: 70, height: 70, borderRadius: 14, backgroundColor: 'rgba(236,128,43,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="paw" size={24} color={COLORS.primary} />
                  </View>
                )}
                
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark }} numberOfLines={1}>
                    {prop.nombre_temporal || 'Sin nombre'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textLight, textTransform: 'capitalize', marginTop: 2 }}>
                    {prop.animal?.tipo_animal || 'Animal'} · {prop.animal?.tamanio || 'Tamaño N/A'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                    <Ionicons name="person-circle-outline" size={14} color={COLORS.accent} />
                    <Text style={{ fontSize: 11, color: COLORS.textDark, fontWeight: '600' }} numberOfLines={1}>
                      Propuesto por {prop.voluntario?.nombre || 'Voluntario'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: COLORS.textLight, marginTop: 4 }}>
                    hace {formatDistanceToNow(new Date(prop.creada_at), { locale: es })}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* MODAL DE DETALLE Y RESOLUCIÓN */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark }}>Revisar propuesta</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16 }}>
                <Ionicons name="close" size={20} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {seleccionada?.fotos_propuesta?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {seleccionada.fotos_propuesta.map((foto, idx) => (
                      <TouchableOpacity key={idx} onPress={() => setFotoAmpliada(foto.foto_url)}>
                        <Image source={{ uri: foto.foto_url }} style={{ width: 140, height: 140, borderRadius: 16, backgroundColor: '#2E2A26' }} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              ) : null}

              <View style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Nombre temporal</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark, marginBottom: 16 }}>{seleccionada?.nombre_temporal || 'No asignado'}</Text>

                <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Salud documentada</Text>
                <Text style={{ fontSize: 14, color: COLORS.textDark, marginBottom: 16, lineHeight: 20 }}>{seleccionada?.salud_conocida}</Text>

                <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Temperamento observado</Text>
                <Text style={{ fontSize: 14, color: COLORS.textDark, marginBottom: 16, lineHeight: 20 }}>{seleccionada?.temperamento_observado}</Text>

                <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Motivo de la propuesta</Text>
                <Text style={{ fontSize: 14, color: COLORS.textDark, marginBottom: 16, lineHeight: 20 }}>{seleccionada?.motivo_propuesta}</Text>

                {seleccionada?.tiempo_custodia_adicional && (
                  <>
                    <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Tiempo de custodia adicional (ofrecido)</Text>
                    <Text style={{ fontSize: 14, color: COLORS.textDark, lineHeight: 20 }}>{seleccionada.tiempo_custodia_adicional}</Text>
                  </>
                )}
              </View>

              {!accionActiva ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => setAccionActiva('aprobar')} style={{ flexGrow: 1, paddingVertical: 14, backgroundColor: COLORS.accent, borderRadius: 16, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.white, fontWeight: '800' }}>Aprobar ingreso</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAccionActiva('solicitar_informacion')} style={{ flexGrow: 1, paddingVertical: 14, backgroundColor: '#E5E7EB', borderRadius: 16, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>Pedir info</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setAccionActiva('rechazar')} style={{ flexGrow: 1, paddingVertical: 14, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.danger, borderRadius: 16, alignItems: 'center' }}>
                    <Text style={{ color: COLORS.danger, fontWeight: '700' }}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ backgroundColor: accionActiva === 'aprobar' ? 'rgba(102,188,180,0.1)' : 'rgba(231,76,60,0.05)', padding: 16, borderRadius: 16, marginTop: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textDark, marginBottom: 8 }}>
                    {accionActiva === 'aprobar' ? 'Confirmar aprobación' : accionActiva === 'solicitar_informacion' ? '¿Qué información falta?' : 'Motivo del rechazo'}
                  </Text>
                  
                  {accionActiva !== 'aprobar' && (
                    <TextInput
                      style={{ backgroundColor: COLORS.white, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#D1D5DB', marginBottom: 12 }}
                      placeholder={accionActiva === 'solicitar_informacion' ? "Ej. Necesito que le tomes una foto de cuerpo completo..." : "Ej. El animal aún necesita tratamiento médico..."}
                      multiline
                      value={motivoResolucion}
                      onChangeText={setMotivoResolucion}
                    />
                  )}

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => setAccionActiva(null)} style={{ flex: 1, paddingVertical: 12, backgroundColor: '#E5E7EB', borderRadius: 12, alignItems: 'center' }}>
                      <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>Volver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => resolverPropuesta(accionActiva)} 
                      disabled={isSubmitting}
                      style={{ flex: 1, paddingVertical: 12, backgroundColor: accionActiva === 'aprobar' ? COLORS.accent : COLORS.danger, borderRadius: 12, alignItems: 'center' }}
                    >
                      {isSubmitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '800' }}>Confirmar</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ImageLightbox
        visible={!!fotoAmpliada}
        fotos={fotoAmpliada ? [fotoAmpliada] : []}
        onClose={() => setFotoAmpliada(null)}
      />
    </View>
  );
}