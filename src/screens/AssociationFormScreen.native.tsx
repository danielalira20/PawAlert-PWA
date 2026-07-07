import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Toast, useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';
import { validarPassword } from '../utils/validators';

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

type TipoAnimal = 'perro' | 'gato' | 'ave' | 'otro';
interface AsociacionFoto { id: string; foto_url: string; descripcion: string; orden: number; }
interface Props { onClose?: () => void; }

export default function AssociationFormScreen({ onClose }: Props) {
  const { setSession } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [nombre, setNombre] = useState('');
  const [nombreResponsable, setNombreResponsable] = useState('');
  const [apellidoResponsable, setApellidoResponsable] = useState('');
  const [acercaDe, setAcercaDe] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [diasSeleccionados, setDiasSeleccionados] = useState<string[]>([]);
  const [horaApertura, setHoraApertura] = useState('');
  const [horaCierre, setHoraCierre] = useState('');
  const [tiposAnimales, setTiposAnimales] = useState<TipoAnimal[]>([]);

  const [pinLocation, setPinLocation] = useState<{ latitud: number; longitud: number }>({ latitud: 19.0414, longitud: -98.2063 });
  const [ubicacionConfirmada, setUbicacionConfirmada] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [calle, setCalle] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [referencia, setReferencia] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [direccionConfirmada, setDireccionConfirmada] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [radioKm, setRadioKm] = useState('');
  const [fotos, setFotos] = useState<AsociacionFoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [campoHorarioActivo, setCampoHorarioActivo] = useState<'apertura' | 'cierre' | null>(null);
  const [showSubmitError, setShowSubmitError] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const [subcategoriaOtro, setSubcategoriaOtro] = useState<string | null>(null);
  const [especieDescripcionOtro, setEspecieDescripcionOtro] = useState('');

  useEffect(() => {
    const hasErrors = Object.values(errors).some(e => e !== '');
    if (!hasErrors) setShowSubmitError(false);
  }, [errors]);

  const hasUnsavedChanges = () => {
    return nombre.trim() !== '' || nombreResponsable.trim() !== '' || telefono.trim() !== '' || tiposAnimales.length > 0 || fotos.length > 0;
  };

  const handleCloseRequest = () => {
    if (hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      if (onClose) onClose();
    }
  };

  const handleNombreChange = (val: string) => {
    setNombre(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, nombre: 'El nombre de la asociación es obligatorio.' }));
    else setErrors(prev => ({ ...prev, nombre: '' }));
  };

  const handleNombreResponsableChange = (val: string) => {
    setNombreResponsable(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, nombreResponsable: 'El nombre del responsable es obligatorio.' }));
    else if (/\d/.test(val)) setErrors(prev => ({ ...prev, nombreResponsable: 'El nombre no debe contener números.' }));
    else setErrors(prev => ({ ...prev, nombreResponsable: '' }));
  };

  const handleApellidoResponsableChange = (val: string) => {
    setApellidoResponsable(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, apellidoResponsable: 'El apellido del responsable es obligatorio.' }));
    else if (/\d/.test(val)) setErrors(prev => ({ ...prev, apellidoResponsable: 'El apellido no debe contener números.' }));
    else setErrors(prev => ({ ...prev, apellidoResponsable: '' }));
  };

  const handleTelefonoChange = (val: string) => {
    setTelefono(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono de contacto es obligatorio.' }));
    } else if (/[a-zA-Z]/.test(val)) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono no puede contener letras.' }));
    } else if (!/^\d{10}$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono debe tener exactamente 10 dígitos numéricos.' }));
    } else {
      setErrors(prev => ({ ...prev, telefono: '' }));
    }
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, email: 'El correo electrónico es obligatorio.' }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, email: 'Ingresa un correo electrónico válido.' }));
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, password: 'La contraseña es obligatoria.' }));
    } else {
      const resultadoPassword = validarPassword(val);
      if (!resultadoPassword.valido) {
        setErrors(prev => ({ ...prev, password: resultadoPassword.mensaje }));
      } else {
        setErrors(prev => ({ ...prev, password: '' }));
      }
    }
    if (password2 && val !== password2) {
      setErrors(prev => ({ ...prev, password2: 'Las contraseñas no coinciden.' }));
    } else if (password2 && val === password2) {
      setErrors(prev => ({ ...prev, password2: '' }));
    }
  };

  const handlePassword2Change = (val: string) => {
    setPassword2(val);
    if (val !== password) {
      setErrors(prev => ({ ...prev, password2: 'Las contraseñas no coinciden.' }));
    } else {
      setErrors(prev => ({ ...prev, password2: '' }));
    }
  };

  const handleRadioKmChange = (val: string) => {
    setRadioKm(val);
    const radVal = parseInt(val, 10);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, radioKm: 'El radio de cobertura es obligatorio.' }));
    } else if (isNaN(radVal) || radVal <= 0) {
      setErrors(prev => ({ ...prev, radioKm: 'Ingresa un número válido mayor a 0.' }));
    } else {
      setErrors(prev => ({ ...prev, radioKm: '' }));
    }
  };

  const formatHour = (h: number): string => {
    const period = h < 12 ? 'AM' : 'PM';
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:00 ${period}`;
  };

  const HORAS_DISPONIBLES = Array.from({ length: 24 }, (_, h) => formatHour(h));

  const handleSeleccionarHora = (hora: string) => {
    if (campoHorarioActivo === 'apertura') setHoraApertura(hora);
    if (campoHorarioActivo === 'cierre') setHoraCierre(hora);
    setCampoHorarioActivo(null);
  };

  const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const toggleDia = (dia: string) => {
    if (diasSeleccionados.includes(dia)) {
      setDiasSeleccionados(diasSeleccionados.filter((d) => d !== dia));
    } else {
      setDiasSeleccionados([...diasSeleccionados, dia]);
    }
  };

  const formatearHorario = (): string => {
    if (diasSeleccionados.length === 0 || !horaApertura.trim() || !horaCierre.trim()) return '';
    const ordenados = DIAS_ORDEN.filter((d) => diasSeleccionados.includes(d));
    let textoDias: string;
    if (ordenados.length === 7) {
      textoDias = 'Todos los días';
    } else {
      const indices = ordenados.map((d) => DIAS_ORDEN.indexOf(d));
      const esConsecutivo = indices.length > 1 && indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
      textoDias = esConsecutivo ? `${ordenados[0]} a ${ordenados[ordenados.length - 1]}` : ordenados.join(', ');
    }
    return `${textoDias} de ${horaApertura.trim()} a ${horaCierre.trim()}`;
  };

  const toggleTipoAnimal = (tipo: TipoAnimal) => {
    if (tiposAnimales.includes(tipo)) {
      setTiposAnimales(tiposAnimales.filter((t) => t !== tipo));
      if (tipo === 'otro') {
        setSubcategoriaOtro(null);
        setEspecieDescripcionOtro('');
        setErrors((prev) => { const { subcategoriaOtro, especieDescripcionOtro, ...rest } = prev; return rest; });
      }
    } else {
      setTiposAnimales([...tiposAnimales, tipo]);
    }
    setErrors((prev) => ({ ...prev, tiposAnimales: '' }));
  };

  const handlePickLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) { showToast({ type: 'warning', title: 'Permiso denegado', message: 'Necesitamos acceso a tu galería.' }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setLogoUrl(result.assets[0].uri);
  };

  const handleTakeLogo = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) { showToast({ type: 'warning', title: 'Permiso denegado', message: 'Necesitamos acceso a tu cámara.' }); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setLogoUrl(result.assets[0].uri);
  };

  const showLogoOptions = () => {
    Alert.alert('Logo de la asociación', '¿Qué deseas hacer?', [{ text: 'Tomar Foto', onPress: handleTakeLogo }, { text: 'Elegir de Galería', onPress: handlePickLogo }, { text: 'Cancelar', style: 'cancel' }]);
  };

  const captureFoto = async (fromCamera: boolean) => {
    const requestPermission = fromCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const permissionResult = await requestPermission();
    if (!permissionResult.granted) { showToast({ type: 'warning', title: 'Permiso denegado', message: 'Necesitamos los permisos.' }); return; }
    const launchMethod = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launchMethod({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });

    if (!result.canceled) {
      const newFoto: AsociacionFoto = { id: Math.random().toString(36).substring(2, 9), foto_url: result.assets[0].uri, descripcion: '', orden: fotos.length + 1 };
      setFotos([...fotos, newFoto]);
    }
  };

  const handleAddFoto = async () => {
    Alert.alert('Agregar Foto', '¿Qué deseas hacer?', [{ text: 'Tomar Foto', onPress: () => captureFoto(true) }, { text: 'Elegir de Galería', onPress: () => captureFoto(false) }, { text: 'Cancelar', style: 'cancel' }]);
  };

  const handleUpdateFotoDesc = (id: string, text: string) => setFotos(fotos.map(f => f.id === id ? { ...f, descripcion: text } : f));
  const handleDeleteFoto = (id: string) => setFotos(fotos.filter(f => f.id !== id));

  useEffect(() => {
    if (searchQuery.trim().length < 4) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: searchQuery, format: 'json', addressdetails: 1, limit: 6, countrycodes: 'mx' },
        });
        setSearchResults(res.data);
      } catch { setSearchResults([]); } finally { setIsSearching(false); }
    }, 600);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon, format: 'json', addressdetails: 1 },
      });
      const address = res.data.address || {};
      setCalle([address.house_number, address.road].filter(Boolean).join(' '));
      setColonia(address.suburb || address.neighbourhood || address.colonia || '');
      setMunicipio(address.city || address.town || address.municipality || address.county || '');
      setDireccionConfirmada(res.data.display_name || '');
    } catch {}
  };

  const handlePinLocationSelect = (latitud: number, longitud: number) => {
    setPinLocation({ latitud, longitud });
    setUbicacionConfirmada(true);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
    reverseGeocode(latitud, longitud);
  };

  const handleSelectSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const address = result.address || {};
    setPinLocation({ latitud: lat, longitud: lon });
    setUbicacionConfirmada(true);
    setCalle([address.house_number, address.road].filter(Boolean).join(' '));
    setColonia(address.suburb || address.neighbourhood || address.colonia || '');
    setMunicipio(address.city || address.town || address.municipality || address.county || '');
    setDireccionConfirmada(result.display_name);
    setSearchQuery('');
    setSearchResults([]);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const currentLocation = await Location.getCurrentPositionAsync({});
          setPinLocation({ latitud: currentLocation.coords.latitude, longitud: currentLocation.coords.longitude });
          reverseGeocode(currentLocation.coords.latitude, currentLocation.coords.longitude);
        }
      } catch {}
    })();
  }, []);

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { showToast({ type: 'warning', title: 'GPS Denegado', message: 'Ajusta el pin manualmente.' }); setIsLoadingGps(false); return; }
      let currentLocation = await Location.getCurrentPositionAsync({});
      const lat = currentLocation.coords.latitude;
      const lon = currentLocation.coords.longitude;
      setPinLocation({ latitud: lat, longitud: lon });
      setUbicacionConfirmada(true);
      setErrors((prev) => ({ ...prev, ubicacion: '' }));
      reverseGeocode(lat, lon);
    } catch (error) {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos obtener tu ubicación.' });
    } finally {
      setIsLoadingGps(false);
    }
  };

  const handleResetForm = () => {
    setNombre(''); setNombreResponsable(''); setApellidoResponsable(''); setAcercaDe(''); setLogoUrl('');
    setTelefono(''); setEmail(''); setPassword(''); setPassword2(''); setDiasSeleccionados([]); setHoraApertura(''); setHoraCierre(''); setTiposAnimales([]);
    setCalle(''); setColonia(''); setMunicipio(''); setReferencia(''); setRadioKm('');
    setPinLocation({ latitud: 19.0414, longitud: -98.2063 }); setUbicacionConfirmada(false);
    setSearchQuery(''); setDireccionConfirmada(''); setFotos([]); setErrors({});
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!nombre.trim()) newErrors.nombre = 'Obligatorio.';
    if (!nombreResponsable.trim()) newErrors.nombreResponsable = 'Obligatorio.';
    if (!apellidoResponsable.trim()) newErrors.apellidoResponsable = 'Obligatorio.';
    if (!telefono.trim()) { newErrors.telefono = 'Obligatorio.'; } else if (!/^\d{10}$/.test(telefono.trim())) { newErrors.telefono = '10 dígitos numéricos.'; }
    if (!email.trim()) { newErrors.email = 'Obligatorio.'; } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { newErrors.email = 'Correo inválido.'; }
    if (!password.trim()) { newErrors.password = 'Obligatorio.'; } else {
      const resultadoPassword = validarPassword(password);
      if (!resultadoPassword.valido) newErrors.password = resultadoPassword.mensaje;
    }
    if (password !== password2) { newErrors.password2 = 'Las contraseñas no coinciden.'; }
    if (tiposAnimales.length === 0) newErrors.tiposAnimales = 'Selecciona al menos un tipo de animal.';
    if (tiposAnimales.includes('otro')) {
      if (!subcategoriaOtro) newErrors.subcategoriaOtro = 'Selecciona la categoría.';
      if (subcategoriaOtro === 'Otro' && !especieDescripcionOtro.trim()) newErrors.especieDescripcionOtro = 'Describe la especie.';
    }
    const radVal = parseInt(radioKm, 10);
    if (!radioKm.trim()) { newErrors.radioKm = 'Obligatorio.'; } else if (isNaN(radVal) || radVal <= 0) { newErrors.radioKm = 'Mayor a 0.'; }
    if (!ubicacionConfirmada) { newErrors.ubicacion = 'Ubica la asociación en el mapa.'; }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { setShowSubmitError(true); return; }
    setShowSubmitError(false);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('nombre', nombre.trim());
      formData.append('nombre_responsable', nombreResponsable.trim());
      formData.append('apellido_responsable', apellidoResponsable.trim());
      formData.append('contacto_telefono', telefono.trim());
      formData.append('contacto_email', email.trim());
      formData.append('password', password);

      const finalTiposAnimales: string[] = tiposAnimales.filter((t) => t !== 'otro');
      if (tiposAnimales.includes('otro')) {
        if (subcategoriaOtro === 'Otro') finalTiposAnimales.push(especieDescripcionOtro.trim().toLowerCase());
        else if (subcategoriaOtro) finalTiposAnimales.push(subcategoriaOtro.toLowerCase());
      }
      formData.append('tipos_animales', JSON.stringify(finalTiposAnimales));

      formData.append('latitud', String(pinLocation.latitud));
      formData.append('longitud', String(pinLocation.longitud));
      formData.append('radio_km', radioKm);
      if (acercaDe.trim()) formData.append('acerca_de', acercaDe.trim());
      const horario = formatearHorario();
      if (horario) formData.append('horario_atencion', horario);
      if (calle.trim()) formData.append('calle', calle.trim());
      if (colonia.trim()) formData.append('colonia', colonia.trim());
      if (municipio.trim()) formData.append('municipio', municipio.trim());
      if (referencia.trim()) formData.append('referencia', referencia.trim());

      if (logoUrl) formData.append('logo', { uri: logoUrl, name: `logo_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
      fotos.forEach((f) => formData.append('fotos', { uri: f.foto_url, name: `foto_${Date.now()}.jpg`, type: 'image/jpeg' } as any));

      if (fotos.length > 0) {
        formData.append('fotos_descripciones', JSON.stringify(fotos.map(f => f.descripcion || null)));
        formData.append('fotos_ordenes', JSON.stringify(fotos.map(f => f.orden)));
      }

      const response = await axios.post(`${API_URL}/associations`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

      await setSession(response.data.usuario, response.data.access_token);
      showToast({ type: 'success', title: '¡Registro exitoso!', message: response.data.mensaje || 'Tu solicitud ha sido registrada.' });
      handleResetForm();
      if (onClose) onClose();
      router.replace('/association-status' as any);
    } catch (error: any) {
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido';
      showToast({ type: 'error', title: 'Error', message: mensaje });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgTeal, justifyContent: 'center', alignItems: 'center' }}>
      <Toast toast={toast} translateY={translateY} />

      <View style={{ width: '100%', flex: 1, backgroundColor: COLORS.bgTeal, overflow: 'hidden' }}>
        
        {/* CORRECCIÓN: Ajustamos los zIndex y aplicamos pointerEvents="none" a la imagen */}
        <View style={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 50, position: 'relative', zIndex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 36, fontWeight: '900', color: COLORS.bgWhite, textShadowColor: 'rgba(0,0,0,0.1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }}>¡Hola!</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9 }}>Qué gusto verte por aquí.</Text>
            </View>
            <View style={{ alignItems: 'flex-end', zIndex: 20, elevation: 10 }}>
              {onClose && (
                <TouchableOpacity onPress={handleCloseRequest} style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 20, zIndex: 30 }}>
                  <Ionicons name="close" size={24} color={COLORS.bgWhite} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Image 
            pointerEvents="none"
            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png' }} 
            style={{ width: 120, height: 120, position: 'absolute', bottom: -10, right: 30, zIndex: -1 }}
            resizeMode="contain"
          />
        </View>

        <View style={{ flex: 1, backgroundColor: COLORS.bgWhite, borderTopLeftRadius: 40, borderTopRightRadius: 40, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 20, zIndex: 2, elevation: 5 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 16 }}>Datos de la Asociación</Text>
              <Input label="Nombre de la Asociación" placeholder="Ej. Huellitas de Amor A.C." value={nombre} onChangeText={handleNombreChange} error={errors.nombre} required />
              <View style={{ flexDirection: 'column' }}>
                 <View style={{ flex: 1 }}><Input label="Nombre(s) del Responsable" placeholder="Ej. Juan" value={nombreResponsable} onChangeText={handleNombreResponsableChange} error={errors.nombreResponsable} required /></View>
                 <View style={{ flex: 1 }}><Input label="Apellido del Responsable" placeholder="Ej. Pérez" value={apellidoResponsable} onChangeText={handleApellidoResponsableChange} error={errors.apellidoResponsable} required /></View>
              </View>
              <Input label="Acerca de la Asociación (Opcional)" placeholder="Describe la misión o actividades..." value={acercaDe} onChangeText={setAcercaDe} multiline maxLength={300} style={{ height: 80, textAlignVertical: 'top' }} />
              <Text style={{ textAlign: 'right', color: COLORS.textLight, fontSize: 12, marginTop: -10, marginBottom: 16 }}>{acercaDe.length}/300</Text>

              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Logo de la Asociación (Opcional)</Text>
              {logoUrl ? (
                <View style={{ alignSelf: 'flex-start', position: 'relative' }}>
                  <Image source={{ uri: logoUrl }} style={{ width: 100, height: 100, borderRadius: 30 }} />
                  <TouchableOpacity onPress={() => setLogoUrl('')} style={{ position: 'absolute', top: -10, right: -10, backgroundColor: COLORS.bgWhite, padding: 6, borderRadius: 20, elevation: 2 }}>
                    <Ionicons name="trash" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={showLogoOptions} style={{ backgroundColor: COLORS.grayLight, height: 100, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="camera" size={24} color={COLORS.textLight} />
                  <Text style={{ color: COLORS.textLight, fontWeight: '600', marginTop: 4 }}>Subir logo</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 }}>Datos de Contacto</Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16 }}>Con este correo y contraseña iniciarás sesión.</Text>
              <Input label="Teléfono" placeholder="Ej. 2221234567" value={telefono} onChangeText={handleTelefonoChange} error={errors.telefono} keyboardType="numeric" maxLength={10} required />
              <Input label="Correo Electrónico" placeholder="Ej. contacto@asociacion.org" value={email} onChangeText={handleEmailChange} error={errors.email} keyboardType="email-address" autoCapitalize="none" required />
              <View style={{ flexDirection: 'column' }}>
                 <View style={{ flex: 1 }}><Input label="Contraseña" placeholder="8+ caracteres" value={password} onChangeText={handlePasswordChange} error={errors.password} secureTextEntry required /></View>
                 <View style={{ flex: 1 }}><Input label="Confirmar Contraseña" placeholder="Repite tu contraseña" value={password2} onChangeText={handlePassword2Change} error={errors.password2} secureTextEntry required /></View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 16 }}>Operación y Animales</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Horario de Atención (Opcional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {DIAS_ORDEN.map((dia) => {
                  const isSelected = diasSeleccionados.includes(dia);
                  return (
                    <TouchableOpacity key={dia} onPress={() => toggleDia(dia)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: isSelected ? COLORS.bgTeal : COLORS.grayLight }}>
                      <Text style={{ fontWeight: '700', fontSize: 13, color: isSelected ? COLORS.bgWhite : COLORS.textLight }}>{dia.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4, fontWeight: '700' }}>Apertura</Text>
                  <TouchableOpacity onPress={() => setCampoHorarioActivo('apertura')} style={{ backgroundColor: COLORS.grayLight, borderRadius: 16, padding: 16 }}>
                    <Text style={{ color: horaApertura ? COLORS.textDark : COLORS.textLight, fontWeight: '600' }}>{horaApertura || '00:00 AM'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4, fontWeight: '700' }}>Cierre</Text>
                  <TouchableOpacity onPress={() => setCampoHorarioActivo('cierre')} style={{ backgroundColor: COLORS.grayLight, borderRadius: 16, padding: 16 }}>
                    <Text style={{ color: horaCierre ? COLORS.textDark : COLORS.textLight, fontWeight: '600' }}>{horaCierre || '00:00 PM'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Tipos de animales que rescatan <Text style={{ color: COLORS.danger }}>*</Text></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {([{ id: 'perro', label: 'Perros' }, { id: 'gato', label: 'Gatos' }, { id: 'ave', label: 'Aves' }, { id: 'otro', label: 'Otros' }] as const).map((t) => {
                  const isSelected = tiposAnimales.includes(t.id);
                  return (
                    <TouchableOpacity key={t.id} onPress={() => toggleTipoAnimal(t.id)} style={{ flex: 1, minWidth: '45%', paddingVertical: 14, borderRadius: 20, backgroundColor: isSelected ? COLORS.primary : COLORS.grayLight, borderWidth: errors.tiposAnimales ? 1 : 0, borderColor: COLORS.danger }}>
                      <Text style={{ textAlign: 'center', fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.bgWhite : COLORS.textLight }}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {errors.tiposAnimales && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 4 }}>{errors.tiposAnimales}</Text>}

              {tiposAnimales.includes('otro') && (
                <View style={{ marginTop: 16, backgroundColor: COLORS.grayLight, padding: 16, borderRadius: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Categoría adicional <Text style={{ color: COLORS.danger }}>*</Text></Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {['Reptil', 'Roedor', 'Fauna silvestre', 'Otro'].map((subcat) => (
                      <TouchableOpacity key={subcat} onPress={() => { setSubcategoriaOtro(subcat); setErrors(prev => ({ ...prev, subcategoriaOtro: '' })); }} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: subcategoriaOtro === subcat ? COLORS.secondary : COLORS.bgWhite }}>
                        <Text style={{ fontWeight: '700', fontSize: 12, color: subcategoriaOtro === subcat ? COLORS.textDark : COLORS.textLight }}>{subcat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {errors.subcategoriaOtro && <Text style={{ color: COLORS.danger, fontSize: 12 }}>{errors.subcategoriaOtro}</Text>}

                  {subcategoriaOtro === 'Otro' && (
                    <Input label="Describe la especie *" placeholder="Ej. Tlacuache, caballo..." value={especieDescripcionOtro} onChangeText={(val) => { setEspecieDescripcionOtro(val); if (val.trim()) setErrors(prev => ({ ...prev, especieDescripcionOtro: '' })); }} error={errors.especieDescripcionOtro} />
                  )}
                </View>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 24 }} />

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 }}>Ubicación Física <Text style={{ color: COLORS.danger }}>*</Text></Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16 }}>Ajusta el pin en el mapa para mayor precisión.</Text>

              <Input placeholder="Buscar dirección (Ej. Zócalo, Puebla)" value={searchQuery} onChangeText={setSearchQuery} />
              {isSearching && <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: -8, marginBottom: 10 }}>Buscando...</Text>}
              {searchResults.length > 0 && (
                <View style={{ backgroundColor: COLORS.bgWhite, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, marginTop: -10, marginBottom: 16, overflow: 'hidden' }}>
                  {searchResults.map((result, idx) => (
                    <TouchableOpacity key={idx} onPress={() => handleSelectSearchResult(result)} style={{ padding: 14, borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1, borderBottomColor: COLORS.grayLight }}>
                      <Text style={{ fontSize: 13, color: COLORS.textDark }}>{result.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity onPress={handleGetLocation} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="location" size={18} color={COLORS.bgTeal} />
                <Text style={{ fontSize: 14, color: COLORS.bgTeal, fontWeight: '700', marginLeft: 4 }}>
                  {isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}
                </Text>
              </TouchableOpacity>

              <View style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 8, borderWidth: errors.ubicacion ? 2 : 0, borderColor: COLORS.danger }}>
                <LocationPickerMap selectedPosition={pinLocation} onLocationSelect={handlePinLocationSelect} />
              </View>
              {errors.ubicacion && <Text style={{ color: COLORS.danger, fontSize: 12, marginBottom: 8 }}>{errors.ubicacion}</Text>}

              {direccionConfirmada !== '' && (
                <View style={{ backgroundColor: 'rgba(102, 188, 180, 0.1)', padding: 12, borderRadius: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, color: COLORS.textDark }}>Selección: <Text style={{ fontWeight: '700' }}>{direccionConfirmada}</Text></Text>
                </View>
              )}

              <Input label="Calle y número" placeholder="Ej. Av. Reforma 123" value={calle} onChangeText={setCalle} />
              <View style={{ flexDirection: 'column' }}>
                 <View style={{ flex: 1 }}><Input label="Colonia" placeholder="Ej. Centro Histórico" value={colonia} onChangeText={setColonia} /></View>
                 <View style={{ flex: 1 }}><Input label="Municipio / Ciudad" placeholder="Ej. Puebla" value={municipio} onChangeText={setMunicipio} /></View>
              </View>
              <Input label="Referencia (Opcional)" placeholder="Ej. Casa azul" value={referencia} onChangeText={setReferencia} />
              
              <Input label="Radio de Cobertura de Rescate (KM)" placeholder="Ej. 15" value={radioKm} onChangeText={handleRadioKmChange} error={errors.radioKm} keyboardType="numeric" required />
            </View>

            <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 24 }} />

            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 }}>Fotos (Opcional)</Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 16 }}>Sube hasta 3 fotos de tus instalaciones o rescates.</Text>
              
              {fotos.map((f, index) => (
                <View key={f.id} style={{ flexDirection: 'row', gap: 16, backgroundColor: COLORS.grayLight, padding: 12, borderRadius: 20, marginBottom: 12, alignItems: 'center' }}>
                  <Image source={{ uri: f.foto_url }} style={{ width: 70, height: 70, borderRadius: 12 }} />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <TextInput placeholder="Añade una descripción..." value={f.descripcion} onChangeText={(text) => handleUpdateFotoDesc(f.id, text)} style={{ fontSize: 13, color: COLORS.textDark, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 4, marginBottom: 8 }} />
                    <TouchableOpacity onPress={() => handleDeleteFoto(f.id)}><Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 12 }}>Eliminar foto</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              
              <TouchableOpacity onPress={handleAddFoto} style={{ padding: 16, backgroundColor: 'rgba(236, 128, 43, 0.1)', borderRadius: 20, alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, borderStyle: 'dashed' }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}><Ionicons name="camera" size={16}/> Agregar foto</Text>
              </TouchableOpacity>
            </View>

            {showSubmitError && <Text style={{ color: COLORS.danger, textAlign: 'center', marginBottom: 12, fontWeight: '700', fontSize: 14 }}>Faltan campos por revisar arriba.</Text>}
            
            <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting} style={{ backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, alignItems: 'center', elevation: 2 }}>
              {isSubmitting ? <ActivityIndicator color={COLORS.bgWhite} /> : <Text style={{ color: COLORS.bgWhite, fontWeight: '900', fontSize: 18 }}>Terminar Registro</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      <Modal visible={campoHorarioActivo !== null} transparent animationType="fade" onRequestClose={() => setCampoHorarioActivo(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' }}>
          <View style={{ backgroundColor: COLORS.bgWhite, width: '100%', maxWidth: 500, borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 32, maxHeight: '70%' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 20 }}>
              {campoHorarioActivo === 'apertura' ? 'Hora de apertura' : 'Hora de cierre'}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {HORAS_DISPONIBLES.map((hora) => (
                <TouchableOpacity key={hora} onPress={() => handleSeleccionarHora(hora)} style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight }}>
                  <Text style={{ fontSize: 16, color: COLORS.textDark, textAlign: 'center', fontWeight: '500' }}>{hora}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setCampoHorarioActivo(null)} style={{ alignItems: 'center', marginTop: 20, backgroundColor: COLORS.grayLight, padding: 16, borderRadius: 20 }}>
              <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCloseConfirm} transparent animationType="fade" onRequestClose={() => setShowCloseConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: COLORS.bgWhite, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 12 }}>¿Seguro que deseas salir?</Text>
            <Text style={{ fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>Los datos ingresados se perderán y tendrás que empezar tu registro de nuevo.</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setShowCloseConfirm(false)} style={{ flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.grayLight, alignItems: 'center' }}>
                <Text style={{ color: COLORS.textDark, fontWeight: '700' }}>Me quedo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowCloseConfirm(false); if (onClose) onClose(); }} style={{ flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.danger, alignItems: 'center' }}>
                <Text style={{ color: COLORS.bgWhite, fontWeight: '700' }}>Sí, salir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}