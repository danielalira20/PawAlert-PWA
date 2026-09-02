import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../../components/Toast';
import { Input } from '../../components/ui/Input';
import { downloadAdoptionPoster, getAdoptionPosterAssets, shareAdoptionPoster } from '../../utils/adoptionPoster';

const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  grayLight: '#F3F4F6',
  border: '#E5E7EB'
};

const FORM_MAX_WIDTH = 750;
const PASO_NOMBRES = ['Datos Básicos', 'Estado Médico', 'Fotografías', 'Requisitos', 'Publicar'];
const TOTAL_PASOS = 5;

export default function AdoptionProfileEditorScreen() {
  const { id } = useLocalSearchParams();
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [paso, setPaso] = useState(1);
  const [perfil, setPerfil] = useState<any>(null);
  
  // --- NUEVO: Estado para validaciones en tiempo real ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Estados (Paso 1)
  const [nombrePublico, setNombrePublico] = useState('');
  const [zonaGeneral, setZonaGeneral] = useState('');
  const [selectedTipoAnimal, setSelectedTipoAnimal] = useState('');
  const [selectedTamanio, setSelectedTamanio] = useState('');
  const [sexo, setSexo] = useState('desconocido');
  const [edad, setEdad] = useState('desconocido');
  const [descripcion, setDescripcion] = useState('');
  const [personalidad, setPersonalidad] = useState('');
  
  const [tiposAnimales, setTiposAnimales] = useState<any[]>([]);
  const [tamanios, setTamanios] = useState<any[]>([]);

  useEffect(() => {
    cargarCatalogos();
    cargarPerfil();
  }, [id]);

 const cargarCatalogos = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [resAnimales, resTamanios] = await Promise.all([
        axios.get(`${API_URL}/catalogos/tipos-animales`, config), 
        axios.get(`${API_URL}/catalogos/tamanios`, config)     
      ]);
      setTiposAnimales(resAnimales.data || []);
      setTamanios(resTamanios.data || []);
    } catch (error: any) {
      console.log('Error catálogos:', error.response?.data || error.message);
    }
  };

  // Estados Médicos (Paso 2)
  const [salud, setSalud] = useState('');
  const [tratamientos, setTratamientos] = useState('');
  const [necesidades, setNecesidades] = useState('');
  const [vacunas, setVacunas] = useState('desconocido');
  const [esterilizacion, setEsterilizacion] = useState('desconocido');

  // Fotos (Paso 3)
  const [fotos, setFotos] = useState<any[]>([]);
  
  // Requisitos y Guardado (Paso 4 y 5)
  const [requisitos, setRequisitos] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [revisionMedicaConfirmada, setRevisionMedicaConfirmada] = useState(false);
  const [revisionJuridicaConfirmada, setRevisionJuridicaConfirmada] = useState(false);
  const [perfilPublicado, setPerfilPublicado] = useState<any>(null);
  const [posterAction, setPosterAction] = useState<'share' | 'download' | null>(null);

  const handlePosterPublicado = async (action: 'share' | 'download') => {
    if (!perfilPublicado) return;
    setPosterAction(action);
    try {
      const assets = getAdoptionPosterAssets();
      if (action === 'share') {
        const result = await shareAdoptionPoster(perfilPublicado, assets);
        showToast({ type: 'success', title: result === 'shared' ? 'Ficha compartida' : 'Ficha descargada', message: result === 'shared' ? 'Gracias por ayudarle a encontrar hogar.' : 'La imagen quedó lista en tus descargas.' });
      } else {
        await downloadAdoptionPoster(perfilPublicado, assets);
        showToast({ type: 'success', title: 'Ficha descargada', message: 'Ya puedes publicarla en tus redes sociales.' });
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') showToast({ type: 'error', title: 'No pudimos crear la ficha', message: error?.message || 'Intenta nuevamente.' });
    } finally {
      setPosterAction(null);
    }
  };

  const captureFoto = async () => {
    if (fotos.length >= 8) {
      showToast({ type: 'warning', title: 'Límite alcanzado', message: 'Máximo 8 fotos permitidas.' });
      return;
    }
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;
    
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) {
      setFotos([...fotos, { id: Date.now().toString(), foto_url: result.assets[0].uri, orden: fotos.length + 1 }]);
      setErrors(prev => ({ ...prev, foto: '' })); // Limpia error de foto al subir una
    }
  };

  const handleDeleteFoto = (id: string) => {
    setFotos(fotos.filter((f) => f.id !== id).map((f, i) => ({ ...f, orden: i + 1 })));
  };

  const handleMoveFoto = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === fotos.length - 1) return;
    const nuevasFotos = [...fotos];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = nuevasFotos[index];
    nuevasFotos[index] = nuevasFotos[swapIndex];
    nuevasFotos[swapIndex] = temp;
    setFotos(nuevasFotos.map((f, i) => ({ ...f, orden: i + 1 })));
  };

  const cargarPerfil = async () => {
    if (!token || !id) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/associations/me/adoptions/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data;
      setPerfil(data);
      setNombrePublico(data.nombre_publico || '');
      setZonaGeneral(data.zona_general || '');
      setSelectedTipoAnimal(data.tipo_animal_id || '');
      setSelectedTamanio(data.tamanio_id || '');
      setSexo(data.sexo || 'desconocido');
      setEdad(data.edad_aproximada || 'desconocido');
      setDescripcion(data.descripcion || '');
      setPersonalidad(data.personalidad || '');
      setSalud(data.salud_conocida || '');
      setTratamientos(data.tratamientos || '');
      setNecesidades(data.necesidades_especiales || '');
      setVacunas(data.vacunacion_estado || 'desconocido');
      setEsterilizacion(data.esterilizacion_estado || 'desconocido');
      setFotos(data.fotos || []); 
      setRequisitos(data.requisitos_adicionales || '');
    } catch (error) {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos cargar el expediente.' });
      setTimeout(() => router.back(), 2000);
    } finally {
      setIsLoading(false);
    }
  };

  // --- FUNCIONES DE VALIDACIÓN ---
  const validarPaso1 = () => {
    const newErrors: Record<string, string> = {};
    if (!nombrePublico.trim()) newErrors.nombre = 'Este campo es obligatorio.';
    if (!zonaGeneral.trim()) newErrors.zona = 'La zona es obligatoria.';
    if (!selectedTipoAnimal) newErrors.tipo = 'Selecciona una especie.';
    if (!selectedTamanio) newErrors.tamanio = 'Selecciona un tamaño.';
    if (!descripcion.trim()) newErrors.descripcion = 'La historia es obligatoria.';
    if (!personalidad.trim()) newErrors.personalidad = 'La personalidad es obligatoria.';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso2 = () => {
    const newErrors: Record<string, string> = {};
    if (!salud.trim()) newErrors.salud = 'Debes indicar el estado de salud general.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso3 = () => {
    const newErrors: Record<string, string> = {};
    if (fotos.length === 0) {
      newErrors.foto = 'Sube al menos 1 fotografía para la portada.';
      setErrors(newErrors);
      showToast({ type: 'warning', title: 'Faltan fotos', message: 'Debes subir al menos 1 fotografía.' });
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSiguiente = () => {
    let valido = false;
    if (paso === 1) valido = validarPaso1();
    else if (paso === 2) valido = validarPaso2();
    else if (paso === 3) valido = validarPaso3();
    else valido = true; // Paso 4 no tiene campos obligatorios

    if (valido && paso < TOTAL_PASOS) {
      setPaso(paso + 1);
    }
  };

  const handleAnterior = () => {
    if (paso === 1) router.back();
    else setPaso(paso - 1);
  };

  const handleGuardarPerfil = async (publicar = false) => {
    // Barrido final de seguridad antes de publicar
    if (publicar) {
      if (!validarPaso1() || !validarPaso2() || !validarPaso3()) {
        showToast({ type: 'error', title: 'Campos incompletos', message: 'Revisa los pasos anteriores, faltan campos obligatorios.' });
        return;
      }
      if (!revisionMedicaConfirmada || !revisionJuridicaConfirmada) {
        showToast({ type: 'warning', title: 'Requisito pendiente', message: 'Debes confirmar ambas revisiones antes de publicar.' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const payloadData = {
        nombre_publico: nombrePublico.trim(),
        zona_general: zonaGeneral.trim(),
        tipo_animal_id: selectedTipoAnimal, 
        tamanio_id: selectedTamanio,
        sexo,
        edad_aproximada: edad,
        descripcion: descripcion.trim(),
        personalidad: personalidad.trim(),
        salud_conocida: salud.trim(),
        tratamientos: tratamientos.trim() || null,
        necesidades_especiales: necesidades.trim() || null,
        vacunacion_estado: vacunas,
        esterilizacion_estado: esterilizacion,
      };

      // 1. Guardamos el borrador (Textos y datos básicos)
      await axios.patch(`${API_URL}/associations/me/adoptions/${id}`, {
        datos: payloadData,
        idempotency_key: `update_${id}_${Date.now()}`
      }, { headers: { Authorization: `Bearer ${token}` } });

      // 2. Subimos y APROBAMOS las fotos
      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        let photoId = foto.id;

        if (!foto.id.includes('-')) {
          const formData = new FormData();
          
          if (Platform.OS === 'web') {
            const res = await fetch(foto.foto_url);
            const blob = await res.blob();
            formData.append('photo', blob, `foto_${Date.now()}.jpg`);
          } else {
            formData.append('photo', { uri: foto.foto_url, name: `foto_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
          }
          
          formData.append('orden', String(foto.orden));
          formData.append('idempotency_key', `photo_${id}_${Date.now()}_${i}`);

          const resUpload = await axios.post(`${API_URL}/associations/me/adoptions/${id}/photos`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              Authorization: `Bearer ${token}`
            }
          });
          photoId = resUpload.data.id; 
        }

        if (publicar) {
          try {
            await axios.post(`${API_URL}/associations/me/adoptions/${id}/photos/${photoId}/review`, {
              aprobada: true,
              idempotency_key: `review_${photoId}_${Date.now()}_${i}`
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch (err) {
            console.log("Aviso al aprobar foto:", err);
          }
        }
      }

      // 3. ¡Publicamos el perfil!
      if (publicar) {
        await axios.post(`${API_URL}/associations/me/adoptions/${id}/publish`, {
          revision_medica_confirmada: true,
          revision_juridica_confirmada: true,
          idempotency_key: `publish_${id}_${Date.now()}`
        }, { headers: { Authorization: `Bearer ${token}` } });
        try {
          const publishedResponse = await axios.get(`${API_URL}/adoptions/${id}`);
          setPerfilPublicado(publishedResponse.data);
        } catch {
          setPerfilPublicado({
            ...perfil,
            id,
            nombre_publico: nombrePublico,
            zona_general: zonaGeneral,
            sexo,
            edad_aproximada: edad,
            descripcion,
            personalidad,
            salud_conocida: salud,
            fotos,
            tamanio: { descripcion: tamanios.find(item => item.id === selectedTamanio)?.descripcion },
          });
        }
      }

      showToast({ type: 'success', title: '¡Éxito!', message: publicar ? 'El perfil ha sido publicado.' : 'Borrador guardado.' });
      if (!publicar) setTimeout(() => { if (router.canGoBack()) router.back(); }, 1500);
      
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const errMsg = Array.isArray(detail) 
        ? `Campo '${detail[0].loc[detail[0].loc.length - 1]}': ${detail[0].msg}` 
        : (typeof detail === 'string' ? detail : null);
        
      showToast({ type: 'error', title: 'Error del servidor', message: errMsg || 'Hubo un problema al guardar el expediente.' });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Renders ───
  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: 10 }}>
        <TouchableOpacity onPress={handleAnterior} style={styles.headerBackButton}>
          <Feather name="chevron-left" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Expediente de Adopción</Text>
          <Text style={styles.headerSubtitle}>Paso {paso} de {TOTAL_PASOS}: {PASO_NOMBRES[paso - 1]}</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Feather name="x" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, marginTop: 18, zIndex: 10 }}>
        <View style={{ height: 4, backgroundColor: COLORS.secondary, borderRadius: 2, width: `${(paso / TOTAL_PASOS) * 100}%` }} />
      </View>
      <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png' }} style={styles.decorationImage} resizeMode="contain" />
    </View>
  );

  const renderPaso1 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>Datos Públicos del Animal</Text>
        <Text style={styles.formSectionSubtitle}>Esta información será visible en la galería de adopciones.</Text>
        
        <Input label="Nombre Público" placeholder="Ej. Max" value={nombrePublico} onChangeText={(v) => { setNombrePublico(v); setErrors(prev => ({...prev, nombre: ''})) }} error={errors.nombre} required />
        <Input label="Zona General (Ciudad, Estado)" placeholder="Ej. Puebla, Pue." value={zonaGeneral} onChangeText={(v) => { setZonaGeneral(v); setErrors(prev => ({...prev, zona: ''})) }} error={errors.zona} required />
        
        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8, marginTop: 8 }}>Especie *</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: errors.tipo ? 4 : 16 }}>
          {tiposAnimales.map(tipo => (
            <TouchableOpacity key={tipo.id} onPress={() => { setSelectedTipoAnimal(tipo.id); setErrors(prev => ({...prev, tipo: ''})) }} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: selectedTipoAnimal === tipo.id ? COLORS.primary : (errors.tipo ? COLORS.danger : '#D1D5DB'), backgroundColor: selectedTipoAnimal === tipo.id ? 'rgba(236,128,43,0.1)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: selectedTipoAnimal === tipo.id ? COLORS.primary : COLORS.textDark, fontWeight: selectedTipoAnimal === tipo.id ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{tipo.descripcion}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.tipo && <Text style={{ color: COLORS.danger, fontSize: 12, marginBottom: 16 }}>{errors.tipo}</Text>}

        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Tamaño *</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: errors.tamanio ? 4 : 16 }}>
          {tamanios.map(tamanio => (
            <TouchableOpacity key={tamanio.id} onPress={() => { setSelectedTamanio(tamanio.id); setErrors(prev => ({...prev, tamanio: ''})) }} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: selectedTamanio === tamanio.id ? COLORS.primary : (errors.tamanio ? COLORS.danger : '#D1D5DB'), backgroundColor: selectedTamanio === tamanio.id ? 'rgba(236,128,43,0.1)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: selectedTamanio === tamanio.id ? COLORS.primary : COLORS.textDark, fontWeight: selectedTamanio === tamanio.id ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{tamanio.descripcion}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.tamanio && <Text style={{ color: COLORS.danger, fontSize: 12, marginBottom: 16 }}>{errors.tamanio}</Text>}

        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Sexo</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {(['macho', 'hembra', 'desconocido'] as const).map(opcion => (
            <TouchableOpacity key={opcion} onPress={() => setSexo(opcion)} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: sexo === opcion ? COLORS.primary : '#D1D5DB', backgroundColor: sexo === opcion ? 'rgba(236,128,43,0.1)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: sexo === opcion ? COLORS.primary : COLORS.textDark, fontWeight: sexo === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Edad aproximada</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {(['cachorro', 'joven', 'adulto', 'senior', 'desconocido'] as const).map(opcion => (
            <TouchableOpacity key={opcion} onPress={() => setEdad(opcion)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: edad === opcion ? COLORS.primary : '#D1D5DB', backgroundColor: edad === opcion ? 'rgba(236,128,43,0.1)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: edad === opcion ? COLORS.primary : COLORS.textDark, fontWeight: edad === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input label="Historia y Descripción" placeholder="¿Cómo llegó a la asociación?" value={descripcion} onChangeText={(v) => { setDescripcion(v); setErrors(prev => ({...prev, descripcion: ''})) }} error={errors.descripcion} multiline style={{ height: 90, textAlignVertical: 'top' } as any} required />
        <Input label="Personalidad" placeholder="Ej. Es muy tranquilo y cariñoso." value={personalidad} onChangeText={(v) => { setPersonalidad(v); setErrors(prev => ({...prev, personalidad: ''})) }} error={errors.personalidad} multiline style={{ height: 70, textAlignVertical: 'top' } as any} required />
      </View>
    </ScrollView>
  );

  const renderPaso2 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>Estado Médico</Text>
        <Text style={styles.formSectionSubtitle}>Transparencia sobre la salud actual del animal.</Text>
        
        <Input label="Salud General" placeholder="Ej. Sano, en tratamiento..." value={salud} onChangeText={(v) => { setSalud(v); setErrors(prev => ({...prev, salud: ''})) }} error={errors.salud} multiline style={{ height: 70, textAlignVertical: 'top' } as any} required />
        <Input label="Tratamientos Activos (Opcional)" placeholder="Ej. Requiere curaciones diarias." value={tratamientos} onChangeText={setTratamientos} multiline style={{ height: 70, textAlignVertical: 'top' } as any} />
        <Input label="Necesidades Especiales (Opcional)" placeholder="Ej. Dieta especial, usa silla de ruedas." value={necesidades} onChangeText={setNecesidades} multiline style={{ height: 70, textAlignVertical: 'top' } as any} />

        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8, marginTop: 8 }}>Estado de Vacunación</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {(['completo', 'parcial', 'pendiente', 'no_aplica', 'desconocido'] as const).map(opcion => (
            <TouchableOpacity key={opcion} onPress={() => setVacunas(opcion)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: vacunas === opcion ? COLORS.secondary : '#D1D5DB', backgroundColor: vacunas === opcion ? 'rgba(237,197,91,0.15)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: vacunas === opcion ? COLORS.textDark : COLORS.textLight, fontWeight: vacunas === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion.replace('_', ' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Estado de Esterilización</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {(['completo', 'pendiente', 'no_aplica', 'desconocido'] as const).map(opcion => (
            <TouchableOpacity key={opcion} onPress={() => setEsterilizacion(opcion)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: esterilizacion === opcion ? COLORS.secondary : '#D1D5DB', backgroundColor: esterilizacion === opcion ? 'rgba(237,197,91,0.15)' : COLORS.bgWhite, alignItems: 'center' }}>
              <Text style={{ color: esterilizacion === opcion ? COLORS.textDark : COLORS.textLight, fontWeight: esterilizacion === opcion ? '800' : '600', textTransform: 'capitalize', fontSize: 12 }}>{opcion.replace('_', ' ')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const renderPaso3 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>Fotografías del Animal</Text>
        <Text style={styles.formSectionSubtitle}>Sube hasta 8 fotos claras. La primera será la foto de portada en la galería.</Text>

        {fotos.map((f, index) => (
          <View key={f.id} style={{ flexDirection: 'row', gap: 16, backgroundColor: COLORS.grayLight, padding: 12, borderRadius: 20, marginBottom: 12, alignItems: 'center' }}>
            <Image source={{ uri: f.foto_url }} style={{ width: 70, height: 70, borderRadius: 12, backgroundColor: '#2E2A26' }} />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 }}>
                {index === 0 ? 'Foto de Portada' : `Foto ${index + 1}`}
              </Text>
              <TouchableOpacity onPress={() => handleDeleteFoto(f.id)}>
                <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 12 }}>Eliminar foto</Text>
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: 'center', gap: 6, paddingRight: 4 }}>
              {index > 0 ? (
                <TouchableOpacity onPress={() => handleMoveFoto(index, 'up')} style={{ backgroundColor: COLORS.bgWhite, padding: 6, borderRadius: 8, elevation: 1 }}>
                  <Ionicons name="chevron-up" size={18} color={COLORS.textDark} />
                </TouchableOpacity>
              ) : <View style={{ height: 30 }} />}
              {index < fotos.length - 1 ? (
                <TouchableOpacity onPress={() => handleMoveFoto(index, 'down')} style={{ backgroundColor: COLORS.bgWhite, padding: 6, borderRadius: 8, elevation: 1 }}>
                  <Ionicons name="chevron-down" size={18} color={COLORS.textDark} />
                </TouchableOpacity>
              ) : <View style={{ height: 30 }} />}
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={captureFoto} style={{ padding: 16, backgroundColor: 'rgba(236, 128, 43, 0.1)', borderRadius: 20, alignItems: 'center', borderWidth: 2, borderColor: errors.foto ? COLORS.danger : COLORS.primary, borderStyle: 'dashed', marginTop: 8 }}>
          <Text style={{ color: errors.foto ? COLORS.danger : COLORS.primary, fontWeight: '700' }}><Ionicons name="camera" size={16}/> Agregar foto</Text>
        </TouchableOpacity>
        {errors.foto && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 8 }}>{errors.foto}</Text>}
      </View>
    </ScrollView>
  );

  const renderPaso4 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>Requisitos Específicos</Text>
        <Text style={styles.formSectionSubtitle}>PawAlert ya solicita INE y cuestionario base. ¿Hay algo más que este animal necesite?</Text>
        <Input label="Requisitos Adicionales (Opcional)" placeholder="Ej. Barda de más de 2 metros..." value={requisitos} onChangeText={setRequisitos} multiline style={{ height: 120, textAlignVertical: 'top' } as any} />
      </View>
    </ScrollView>
  );

  const renderPaso5 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>Revisión Final</Text>
        <Text style={styles.formSectionSubtitle}>Revisa que todo esté correcto antes de abrir las puertas a una nueva familia.</Text>
        
        <View style={{ backgroundColor: COLORS.grayLight, padding: 20, borderRadius: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark, marginBottom: 12 }}>Resumen del Perfil</Text>
          <Text style={{ color: COLORS.textDark, marginBottom: 4 }}>• <Text style={{ fontWeight: '700' }}>Nombre:</Text> {nombrePublico || 'Sin asignar'}</Text>
          <Text style={{ color: COLORS.textDark, marginBottom: 4 }}>• <Text style={{ fontWeight: '700' }}>Sexo:</Text> {sexo}</Text>
          <Text style={{ color: COLORS.textDark, marginBottom: 4 }}>• <Text style={{ fontWeight: '700' }}>Edad:</Text> {edad}</Text>
          <Text style={{ color: COLORS.textDark, marginBottom: 4 }}>• <Text style={{ fontWeight: '700' }}>Fotos adjuntas:</Text> {fotos.length}</Text>
        </View>

        <TouchableOpacity activeOpacity={0.8} onPress={() => setRevisionMedicaConfirmada(!revisionMedicaConfirmada)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgWhite, padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: revisionMedicaConfirmada ? COLORS.primary : COLORS.border, marginBottom: 12 }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: revisionMedicaConfirmada ? COLORS.primary : COLORS.textLight, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: revisionMedicaConfirmada ? COLORS.primary : 'transparent' }}>
            {revisionMedicaConfirmada && <Ionicons name="checkmark" size={16} color={COLORS.bgWhite} />}
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: COLORS.textDark, fontWeight: revisionMedicaConfirmada ? '700' : '500' }}>Confirmo que este animal cuenta con valoración médica registrada y está en condiciones de iniciar un proceso de adopción.</Text>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} onPress={() => setRevisionJuridicaConfirmada(!revisionJuridicaConfirmada)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgWhite, padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: revisionJuridicaConfirmada ? COLORS.primary : COLORS.border, marginBottom: 24 }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: revisionJuridicaConfirmada ? COLORS.primary : COLORS.textLight, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: revisionJuridicaConfirmada ? COLORS.primary : 'transparent' }}>
            {revisionJuridicaConfirmada && <Ionicons name="checkmark" size={16} color={COLORS.bgWhite} />}
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: COLORS.textDark, fontWeight: revisionJuridicaConfirmada ? '700' : '500' }}>Confirmo que el animal está fuera de peligro, no existe disputa de propiedad ni búsqueda activa de un posible tutor.</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={() => handleGuardarPerfil(false)} disabled={isSaving} style={{ flex: 1, paddingVertical: 16, backgroundColor: COLORS.bgWhite, borderWidth: 2, borderColor: COLORS.primary, borderRadius: 20, alignItems: 'center' }}>
            <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Guardar Borrador</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleGuardarPerfil(true)} disabled={isSaving} style={{ flex: 1, paddingVertical: 16, backgroundColor: COLORS.primary, borderRadius: 20, alignItems: 'center', opacity: (!revisionMedicaConfirmada || !revisionJuridicaConfirmada) ? 0.6 : 1 }}>
            {isSaving ? <ActivityIndicator color={COLORS.bgWhite} /> : <Text style={{ color: COLORS.bgWhite, fontWeight: '800' }}>¡Publicar Perfil!</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  if (isLoading) {
    return (
      <View style={styles.outerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.bgWhite, marginTop: 12, fontWeight: '700' }}>Cargando expediente...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.outerContainer, { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any]}>
      <Toast toast={toast} translateY={translateY} />

      <Modal visible={!!perfilPublicado} transparent animationType="fade" onRequestClose={() => setPerfilPublicado(null)}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}><Ionicons name="checkmark" size={34} color="#FFFFFF" /></View>
            <Text style={styles.successTitle}>¡Perfil publicado!</Text>
            <Text style={styles.successText}>La adopción ya es visible. Aprovecha este momento para difundir una ficha vertical lista para historias y redes sociales.</Text>
            <View style={styles.successActions}>
              <TouchableOpacity style={styles.successPrimary} onPress={() => handlePosterPublicado('share')} disabled={!!posterAction}>
                {posterAction === 'share' ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="share-social-outline" size={19} color="#FFFFFF" /><Text style={styles.successPrimaryText}>Compartir ficha</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.successSecondary} onPress={() => handlePosterPublicado('download')} disabled={!!posterAction}>
                {posterAction === 'download' ? <ActivityIndicator color={COLORS.primary} /> : <><Ionicons name="download-outline" size={19} color={COLORS.primary} /><Text style={styles.successSecondaryText}>Descargar</Text></>}
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => { setPerfilPublicado(null); if (router.canGoBack()) router.back(); }} style={{ padding: 12 }}>
              <Text style={{ color: COLORS.textLight, fontWeight: '700' }}>Volver al panel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      <View style={styles.centeredContent}>
        <View style={styles.cardContainer}>
          {renderHeader()}

          <View style={styles.bodySection}>
            {paso === 1 && renderPaso1()}
            {paso === 2 && renderPaso2()}
            {paso === 3 && renderPaso3()}
            {paso === 4 && renderPaso4()}
            {paso === 5 && renderPaso5()}
            
            {paso < TOTAL_PASOS && (
              <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}>
                <Text style={styles.submitButtonText}>Siguiente →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: 'rgba(38,30,24,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  centeredContent: { width: '100%', maxWidth: FORM_MAX_WIDTH, maxHeight: '95%', alignSelf: 'center' }, 
  cardContainer: { backgroundColor: COLORS.bgWhite, borderRadius: 32, overflow: 'hidden', flexShrink: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 15 },
  headerSection: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32, backgroundColor: COLORS.bgTeal, position: 'relative', zIndex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.bgWhite },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9, marginTop: 4 },
  headerBackButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  closeButton: { backgroundColor: 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 20 },
  decorationImage: { width: 120, height: 120, position: 'absolute', bottom: -10, right: 30, zIndex: 0 },
  bodySection: { backgroundColor: COLORS.bgWhite, borderTopLeftRadius: 40, borderTopRightRadius: 40, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20, zIndex: 2, flexShrink: 1 }, 
  scrollContent: { paddingBottom: 40 },
  formSection: { marginBottom: 24 },
  formSectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 },
  formSectionSubtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: 16 },
  submitButton: { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, alignItems: 'center', marginTop: 16 },
  submitButtonText: { color: COLORS.bgWhite, fontWeight: '900', fontSize: 16 },
  successOverlay: { flex: 1, backgroundColor: 'rgba(38,30,24,.72)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  successCard: { width: '100%', maxWidth: 470, backgroundColor: COLORS.bgWhite, borderRadius: 28, padding: 28, alignItems: 'center' },
  successIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.bgTeal, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { fontSize: 25, fontWeight: '900', color: COLORS.textDark, marginBottom: 8 },
  successText: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', lineHeight: 21, marginBottom: 22 },
  successActions: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 8 },
  successPrimary: { flex: 1, minHeight: 52, backgroundColor: COLORS.primary, borderRadius: 16, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  successPrimaryText: { color: '#FFFFFF', fontWeight: '800' },
  successSecondary: { flex: 1, minHeight: 52, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 16, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  successSecondaryText: { color: COLORS.primary, fontWeight: '800' }
});
