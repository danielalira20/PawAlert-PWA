import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { router } from 'expo-router';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
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
  estado: 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada' | 'solicitando_informacion' | 'requiere_informacion';
  nombre_temporal: string | null;
  fotos_propuesta: { foto_url: string; foto_url_expira_at: string }[];
  salud_conocida: string;
  temperamento_observado: string;
  motivo_propuesta: string;
  tiempo_custodia_adicional: string | null;
  compatibilidad_observada: any;
  informacion_solicitada?: string | null; 
  respuesta_informacion?: string | null; 
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

// NUEVO: Interfaz para los perfiles formales
interface AdopcionProfile {
  id: string;
  nombre_publico: string | null;
  estado: 'borrador' | 'publicado' | 'pausado' | 'en_proceso' | 'adoptado' | 'retirado' | 'fallecido';
  sexo: string;
  edad_aproximada: string;
  fotos?: { foto_url: string }[];
  actualizado_at: string;
  origen?: string;
  solicitud_ingreso_id?: string | null;
}

interface Props {
  visible: boolean;
  showToast: (options: { type: 'success'|'error'|'warning'|'info', title: string, message: string }) => void; 
  onClose?: () => void;
}

export function AdopcionesPanel({ visible, showToast, onClose }: Props) {
  const { token } = useAuth();
  const { width: screenWidth } = useWindowDimensions();

  const [propuestas, setPropuestas] = useState<AdopcionIntake[]>([]);
  const [perfiles, setPerfiles] = useState<AdopcionProfile[]>([]); // NUEVO: Estado para perfiles
  const [isLoading, setIsLoading] = useState(false);
  
  const [seleccionada, setSeleccionada] = useState<AdopcionIntake | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const [accionActiva, setAccionActiva] = useState<'aprobar' | 'rechazar' | 'solicitar_informacion' | null>(null);
  const [motivoResolucion, setMotivoResolucion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [directIntakeModal, setDirectIntakeModal] = useState(false);
  const [isSubmittingDirect, setIsSubmittingDirect] = useState(false);
  const [fotoDirecta, setFotoDirecta] = useState<string | null>(null);
  const [directForm, setDirectForm] = useState({
    nombre_publico: '',
    sexo: 'desconocido' as 'macho' | 'hembra' | 'desconocido',
    edad_aproximada: 'desconocido' as 'cachorro' | 'joven' | 'adulto' | 'senior' | 'desconocido',
    descripcion: '',
    personalidad: '',
    salud_conocida: '',
  });
  const [directErrors, setDirectErrors] = useState<Record<string, string>>({});

  const cargarDatos = useCallback(async () => {
    if (!token || !visible) return;
    setIsLoading(true);
    try {
      // Cargamos TODO: Propuestas y Perfiles
      const [resPropuestas, resPerfiles] = await Promise.all([
        axios.get(`${API_URL}/associations/me/adoption-intake-requests`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/associations/me/adoptions`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setPropuestas(resPropuestas.data.items || resPropuestas.data || []);
      setPerfiles(resPerfiles.data.items || resPerfiles.data || []);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar los datos de adopción.' });
    } finally {
      setIsLoading(false);
    }
  }, [token, visible]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

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
      cargarDatos(); // Recargar todo para que si se aprobó, aparezca en Perfiles
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error al resolver', message: error?.response?.data?.detail || 'Intenta nuevamente más tarde.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickFotoDirecta = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showToast({ type: 'warning', title: 'Permiso denegado', message: 'Necesitamos acceso a la galería para adjuntar la foto.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) {
      setFotoDirecta(result.assets[0].uri);
    }
  };

  const crearIngresoDirecto = async () => {
    let hasErrors = false;
    if (directForm.nombre_publico.trim().length < 2) { setDirectErrors(p => ({ ...p, nombre_publico: 'Debe tener al menos 2 caracteres' })); hasErrors = true; }
    if (directForm.descripcion.trim().length < 10) { setDirectErrors(p => ({ ...p, descripcion: 'Escribe al menos una descripción breve (10 caracteres)' })); hasErrors = true; }
    if (directForm.personalidad.trim().length < 5) { setDirectErrors(p => ({ ...p, personalidad: 'Describe un poco su personalidad' })); hasErrors = true; }
    if (directForm.salud_conocida.trim().length < 5) { setDirectErrors(p => ({ ...p, salud_conocida: 'Indica el estado de salud' })); hasErrors = true; }
    
    if (hasErrors) {
      showToast({ type: 'warning', title: 'Datos incompletos', message: 'Revisa los campos marcados en rojo.' });
      return;
    }

    setIsSubmittingDirect(true);
    try {
      const payload = {
        datos: {
          nombre_publico: directForm.nombre_publico.trim(),
          sexo: directForm.sexo,
          edad_aproximada: directForm.edad_aproximada,
          descripcion: directForm.descripcion.trim(),
          personalidad: directForm.personalidad.trim(),
          salud_conocida: directForm.salud_conocida.trim(),
        },
        idempotency_key: `direct_intake_${Date.now()}`
      };

      const res = await axios.post(`${API_URL}/associations/me/adoptions`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const profileId = res.data.id || res.data;

      if (fotoDirecta) {
        const formData = new FormData();
        if (Platform.OS === 'web') {
          const blob = await (await fetch(fotoDirecta)).blob();
          formData.append('photo', new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' }));
        } else {
          formData.append('photo', { uri: fotoDirecta, name: `foto_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
        }
        formData.append('idempotency_key', `foto_${Date.now()}`);
        formData.append('orden', '1');

        await axios.post(`${API_URL}/associations/me/adoptions/${profileId}/photos`, formData, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
        });
      }

      showToast({ type: 'success', title: '¡Ingreso directo creado!', message: 'El borrador del perfil ya está disponible en tu panel.' });
      setDirectIntakeModal(false);
      setDirectForm({ nombre_publico: '', sexo: 'desconocido', edad_aproximada: 'desconocido', descripcion: '', personalidad: '', salud_conocida: '' });
      setFotoDirecta(null);
      cargarDatos(); // Refrescamos para ver el nuevo perfil
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'No pudimos crear el ingreso directo.' });
    } finally {
      setIsSubmittingDirect(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 16, color: COLORS.textDark, fontWeight: '800' }}>Solicitudes de ingreso</Text>
        <TouchableOpacity onPress={() => setDirectIntakeModal(true)} style={{ backgroundColor: COLORS.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="add-circle-outline" size={18} color={COLORS.white} style={{ marginRight: 6 }} />
          <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 13 }}>Ingreso directo</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textLight, marginTop: 12 }}>Cargando datos...</Text>
        </View>
      ) : (
        <>
          {/* SECCIÓN 1: PROPUESTAS DE INGRESO */}
          {propuestas.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 30, backgroundColor: COLORS.white, borderRadius: 20, borderWidth: 1, borderColor: '#F0E6D2', marginBottom: 24 }}>
              <Ionicons name="mail-unread-outline" size={28} color={COLORS.textLight} style={{ marginBottom: 8, opacity: 0.6 }} />
              <Text style={{ fontSize: 13, color: COLORS.textLight, textAlign: 'center' }}>No hay solicitudes de voluntarios.</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
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
                        {prop.animal?.tipo_animal || 'Animal'} en resguardo
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

          {/* SECCIÓN 2: PERFILES DE ADOPCIÓN (Borradores, publicados, etc) */}
          <Text style={{ fontSize: 16, color: COLORS.textDark, fontWeight: '800', marginBottom: 16, marginTop: 10 }}>Perfiles de adopción</Text>
          
          {perfiles.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 30, backgroundColor: COLORS.white, borderRadius: 20, borderWidth: 1, borderColor: '#F0E6D2' }}>
              <Ionicons name="paw-outline" size={28} color={COLORS.textLight} style={{ marginBottom: 8, opacity: 0.6 }} />
              <Text style={{ fontSize: 13, color: COLORS.textLight, textAlign: 'center' }}>No tienes perfiles en borrador ni publicados.</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              {perfiles.map((perfil) => (
                <TouchableOpacity
                  key={perfil.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (onClose) onClose();
                    router.push(`/editor-adopcion/${perfil.id}` as any);
                  }} 
                  style={{
                    flexGrow: 1, flexBasis: 280, maxWidth: screenWidth >= 768 ? '48%' : '100%',
                    backgroundColor: COLORS.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F0E6D2'
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {perfil.fotos?.[0]?.foto_url ? (
                      <Image source={{ uri: perfil.fotos[0].foto_url }} style={{ width: 70, height: 70, borderRadius: 14, backgroundColor: '#2E2A26' }} />
                    ) : (
                      <View style={{ width: 70, height: 70, borderRadius: 14, backgroundColor: 'rgba(102,188,180,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="camera-outline" size={24} color={COLORS.accent} />
                      </View>
                    )}
                    
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark, flex: 1 }} numberOfLines={1}>
                          {perfil.nombre_publico || 'Borrador sin nombre'}
                        </Text>
                        <View style={{ backgroundColor: perfil.estado === 'publicado' ? 'rgba(32,150,83,0.1)' : 'rgba(236,128,43,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                          <Text style={{ color: perfil.estado === 'publicado' ? '#209653' : COLORS.primary, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' }}>
                            {perfil.estado.replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                      
                      <Text style={{ fontSize: 13, color: COLORS.textLight, textTransform: 'capitalize', marginTop: 4 }}>
                        {perfil.sexo} · {perfil.edad_aproximada}
                      </Text>
                      
                      {perfil.solicitud_ingreso_id && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                          <Ionicons name="person-circle-outline" size={14} color={COLORS.accent} />
                          <Text style={{ fontSize: 11, color: COLORS.textDark, fontWeight: '600' }} numberOfLines={1}>
                            Propuesto por Voluntario
                          </Text>
                        </View>
                      )}
                      
                      <Text style={{ fontSize: 10, color: COLORS.textLight, marginTop: 10 }}>
                        Actualizado hace {formatDistanceToNow(new Date(perfil.actualizado_at), { locale: es })}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      {/* --- MODAL DE INGRESO DIRECTO --- */}
      <Modal visible={directIntakeModal} transparent animationType="fade" onRequestClose={() => setDirectIntakeModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: COLORS.cardBg, borderRadius: 32, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark }}>Nuevo ingreso directo</Text>
              <TouchableOpacity onPress={() => setDirectIntakeModal(false)} style={{ padding: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16 }}>
                <Ionicons name="close" size={20} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 20, lineHeight: 18 }}>
                Crea el expediente de un animal que rescataste o recibiste directamente, sin pasar por la propuesta de un voluntario externo.
              </Text>

              <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Nombre del animal</Text>
              <TextInput
                style={{ backgroundColor: COLORS.white, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: directErrors.nombre_publico ? COLORS.danger : '#D1D5DB', marginBottom: directErrors.nombre_publico ? 4 : 12 }}
                value={directForm.nombre_publico}
                onChangeText={(val) => {
                  setDirectForm({ ...directForm, nombre_publico: val });
                  setDirectErrors({ ...directErrors, nombre_publico: val.trim().length < 2 ? 'Debe tener al menos 2 caracteres' : '' });
                }}
                placeholder="Ej. Max"
              />
              {directErrors.nombre_publico ? <Text style={{ color: COLORS.danger, fontSize: 10, marginBottom: 12, fontWeight: '700' }}>{directErrors.nombre_publico}</Text> : null}

              <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Sexo</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {(['macho', 'hembra', 'desconocido'] as const).map(opcion => (
                  <TouchableOpacity key={opcion} onPress={() => setDirectForm({ ...directForm, sexo: opcion })} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: directForm.sexo === opcion ? COLORS.primary : '#D1D5DB', backgroundColor: directForm.sexo === opcion ? 'rgba(236,128,43,0.1)' : COLORS.white, alignItems: 'center' }}>
                    <Text style={{ color: directForm.sexo === opcion ? COLORS.primary : COLORS.textDark, fontWeight: directForm.sexo === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Edad aproximada</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {(['cachorro', 'joven', 'adulto', 'senior', 'desconocido'] as const).map(opcion => (
                  <TouchableOpacity key={opcion} onPress={() => setDirectForm({ ...directForm, edad_aproximada: opcion })} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: directForm.edad_aproximada === opcion ? COLORS.primary : '#D1D5DB', backgroundColor: directForm.edad_aproximada === opcion ? 'rgba(236,128,43,0.1)' : COLORS.white, alignItems: 'center' }}>
                    <Text style={{ color: directForm.edad_aproximada === opcion ? COLORS.primary : COLORS.textDark, fontWeight: directForm.edad_aproximada === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Descripción y rescate</Text>
              <TextInput
                style={{ backgroundColor: COLORS.white, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: directErrors.descripcion ? COLORS.danger : '#D1D5DB', marginBottom: directErrors.descripcion ? 4 : 12 }}
                value={directForm.descripcion}
                onChangeText={(val) => {
                  setDirectForm({ ...directForm, descripcion: val });
                  setDirectErrors({ ...directErrors, descripcion: val.trim().length < 10 ? 'Escribe al menos una breve descripción' : '' });
                }}
                placeholder="¿Cómo llegó a la asociación y cuál es su historia?"
                multiline
              />
              {directErrors.descripcion ? <Text style={{ color: COLORS.danger, fontSize: 10, marginBottom: 12, fontWeight: '700' }}>{directErrors.descripcion}</Text> : null}

              <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Personalidad</Text>
              <TextInput
                style={{ backgroundColor: COLORS.white, borderRadius: 12, padding: 12, minHeight: 70, textAlignVertical: 'top', borderWidth: 1, borderColor: directErrors.personalidad ? COLORS.danger : '#D1D5DB', marginBottom: directErrors.personalidad ? 4 : 12 }}
                value={directForm.personalidad}
                onChangeText={(val) => {
                  setDirectForm({ ...directForm, personalidad: val });
                  setDirectErrors({ ...directErrors, personalidad: val.trim().length < 5 ? 'Describe brevemente su temperamento' : '' });
                }}
                placeholder="Ej. Es muy juguetón y convive bien con gatos."
                multiline
              />
              {directErrors.personalidad ? <Text style={{ color: COLORS.danger, fontSize: 10, marginBottom: 12, fontWeight: '700' }}>{directErrors.personalidad}</Text> : null}

              <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Salud conocida</Text>
              <TextInput
                style={{ backgroundColor: COLORS.white, borderRadius: 12, padding: 12, minHeight: 70, textAlignVertical: 'top', borderWidth: 1, borderColor: directErrors.salud_conocida ? COLORS.danger : '#D1D5DB', marginBottom: directErrors.salud_conocida ? 4 : 12 }}
                value={directForm.salud_conocida}
                onChangeText={(val) => {
                  setDirectForm({ ...directForm, salud_conocida: val });
                  setDirectErrors({ ...directErrors, salud_conocida: val.trim().length < 5 ? 'Indica el estado de salud general' : '' });
                }}
                placeholder="Ej. Sano, desparasitado, pendiente de vacunas."
                multiline
              />
              {directErrors.salud_conocida ? <Text style={{ color: COLORS.danger, fontSize: 10, marginBottom: 12, fontWeight: '700' }}>{directErrors.salud_conocida}</Text> : null}

              <Text style={{ fontSize: 12, color: COLORS.textLight, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 }}>Fotografía principal (Opcional)</Text>
              <TouchableOpacity onPress={handlePickFotoDirecta} style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: fotoDirecta ? COLORS.primary : '#E5E7EB', borderStyle: fotoDirecta ? 'solid' : 'dashed', marginBottom: 20 }}>
                {fotoDirecta ? (
                  <Text style={{ color: COLORS.primary, fontWeight: '800' }}><Ionicons name="checkmark-circle" size={16} /> Foto adjuntada</Text>
                ) : (
                  <Text style={{ color: COLORS.textLight, fontWeight: '700' }}><Ionicons name="camera" size={16} /> Subir desde galería</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={crearIngresoDirecto} 
                disabled={isSubmittingDirect}
                style={{ backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center' }}
              >
                {isSubmittingDirect ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15 }}>Guardar ingreso directo</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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

                {seleccionada?.informacion_solicitada && (
                  <>
                    <Text style={{ fontSize: 12, color: COLORS.accent, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4, marginTop: 16 }}>Tu solicitud de información</Text>
                    <Text style={{ fontSize: 14, color: COLORS.textDark, lineHeight: 20 }}>{seleccionada.informacion_solicitada}</Text>
                  </>
                )}

                {seleccionada?.respuesta_informacion && (
                  <>
                    <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4, marginTop: 16 }}>Respuesta del hogar temporal</Text>
                    <Text style={{ fontSize: 14, color: COLORS.textDark, lineHeight: 20 }}>{seleccionada.respuesta_informacion}</Text>
                  </>
                )}
              </View>
              
              {seleccionada?.estado === 'requiere_informacion' || seleccionada?.estado === 'solicitando_informacion' ? (
                <View style={{ backgroundColor: '#F3F4F6', padding: 16, borderRadius: 16, marginTop: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: COLORS.textLight, fontWeight: '700', textAlign: 'center' }}>
                    Esperando respuesta del voluntario...
                  </Text>
                </View>
              ) : !accionActiva ? (
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