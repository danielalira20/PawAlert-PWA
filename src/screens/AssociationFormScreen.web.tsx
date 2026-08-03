import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Toast, useToast } from '../components/Toast';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';
import { validarPassword } from '../utils/validators';
import AssociationStatusScreen from './AssociationStatusScreen';

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

// Breakpoints y máximos de ancho
const DESKTOP_BREAKPOINT = 900;
const FORM_MAX_WIDTH = 750;

type TipoAnimal = 'perro' | 'gato' | 'ave' | 'otro';
interface AsociacionFoto { id: string; foto_url: string; descripcion: string; orden: number; }
interface Props { onClose?: () => void; }

const PASO_NOMBRES = ['Datos Generales', 'Operación y Animales', 'Ubicación y Fotos'];
const TOTAL_PASOS = 3;

export default function AssociationFormScreen({ onClose }: Props) {
  const { setSession } = useAuth();
  const { toast, translateY, showToast } = useToast();

  // ─── Navegación por pasos ───
  const [paso, setPaso] = useState(1);

  // ─── Estado de Formulario ───
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
  const [subcategoriaOtro, setSubcategoriaOtro] = useState<string | null>(null);
  const [customTipos, setCustomTipos] = useState<string[]>([]);
  const [customTipoInput, setCustomTipoInput] = useState('');

  const [pinLocation, setPinLocation] = useState<{ latitud: number; longitud: number }>({ latitud: 19.0414, longitud: -98.2063 });
  const [ubicacionConfirmada, setUbicacionConfirmada] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [estado, setEstado] = useState('');
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
  const [registroExitoso, setRegistroExitoso] = useState(false);

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

  const handleSiguiente = () => {
    let valido = false;
    if (paso === 1) valido = validarPaso1();
    if (paso === 2) valido = validarPaso2();

    if (valido) {
      setErrors({});
      setShowSubmitError(false);
      setPaso(paso + 1);
    } else {
      setShowSubmitError(true);
    }
  };

  const handleAnterior = () => {
    setErrors({});
    setShowSubmitError(false);
    if (paso === 1) {
      handleCloseRequest();
    } else {
      setPaso(paso - 1);
    }
  };

  // ─── Validaciones por paso ───
  const validarPaso1 = () => {
    const newErrors: { [key: string]: string } = {};
    if (!nombre.trim()) {
      newErrors.nombre = 'Obligatorio.';
    } else if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(nombre)) {
      newErrors.nombre = 'Debe contener al menos una letra.';
    }

    if (acercaDe.trim() && !/[a-zñáéíóú]/.test(acercaDe)) {
      newErrors.acercaDe = 'Debe contener al menos una letra minúscula.';
    }

    if (!nombreResponsable.trim()) newErrors.nombreResponsable = 'Obligatorio.';
    if (!apellidoResponsable.trim()) newErrors.apellidoResponsable = 'Obligatorio.';
    if (!telefono.trim()) { newErrors.telefono = 'Obligatorio.'; } else if (!/^\d{10}$/.test(telefono.trim())) { newErrors.telefono = '10 dígitos numéricos.'; }
    if (!email.trim()) { newErrors.email = 'Obligatorio.'; } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { newErrors.email = 'Correo inválido.'; }
    if (!password.trim()) { newErrors.password = 'Obligatorio.'; } else {
      const resultadoPassword = validarPassword(password);
      if (!resultadoPassword.valido) newErrors.password = resultadoPassword.mensaje;
    }
    if (password !== password2) { newErrors.password2 = 'Las contraseñas no coinciden.'; }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso2 = () => {
    const newErrors: { [key: string]: string } = {};
    if (tiposAnimales.length === 0) newErrors.tiposAnimales = 'Selecciona al menos un tipo de animal.';
    if (tiposAnimales.includes('otro')) {
      if (!subcategoriaOtro) newErrors.subcategoriaOtro = 'Selecciona la categoría.';
      if (subcategoriaOtro === 'Otro' && customTipos.length === 0) newErrors.customTipos = 'Agrega al menos un tipo.';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso3 = () => {
    const newErrors: { [key: string]: string } = {};
    const radVal = parseInt(radioKm, 10);
    if (!radioKm.trim()) { newErrors.radioKm = 'Obligatorio.'; } else if (isNaN(radVal) || radVal <= 0) { newErrors.radioKm = 'Mayor a 0.'; }
    if (!ubicacionConfirmada) { newErrors.ubicacion = 'Ubica la asociación en el mapa.'; }
    
    const soloLetrasRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    if (calle.trim() && !soloLetrasRegex.test(calle)) newErrors.calle = 'Solo se permiten letras y espacios.';
    if (colonia.trim() && !soloLetrasRegex.test(colonia)) newErrors.colonia = 'Solo se permiten letras y espacios.';
    if (municipio.trim() && !soloLetrasRegex.test(municipio)) newErrors.municipio = 'Solo se permiten letras y espacios.';
    if (estado.trim() && !soloLetrasRegex.test(estado)) newErrors.estado = 'Solo se permiten letras y espacios.';

    const alfanumericoRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]+$/;
    if (referencia.trim() && !alfanumericoRegex.test(referencia)) newErrors.referencia = 'Solo se permiten letras y números.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Handlers de Inputs con Validación en Tiempo Real ───
  const handleNombreChange = (val: string) => {
    setNombre(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, nombre: 'El nombre de la asociación es obligatorio.' }));
    } else if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(val)) {
      setErrors(prev => ({ ...prev, nombre: 'Debe contener al menos una letra.' }));
    } else {
      setErrors(prev => ({ ...prev, nombre: '' }));
    }
  };

  const handleAcercaDeChange = (val: string) => {
    setAcercaDe(val);
    if (val.trim() && !/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(val)) {
      setErrors(prev => ({ ...prev, acercaDe: 'Debe contener al menos una letra.' }));
    } else {
      setErrors(prev => ({ ...prev, acercaDe: '' }));
    }
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
      setErrors(prev => ({ ...prev, telefono: 'El teléfono es obligatorio.' }));
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
      setErrors(prev => ({ ...prev, email: 'El correo es obligatorio.' }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, email: 'Correo inválido.' }));
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (!val) {
      setErrors(prev => ({ ...prev, password: 'La contraseña es obligatoria.' }));
    } else {
      const resultado = validarPassword(val);
      if (!resultado.valido) {
        setErrors(prev => ({ ...prev, password: resultado.mensaje }));
      } else {
        setErrors(prev => ({ ...prev, password: '' }));
      }
    }
    
    // Validación cruzada en tiempo real
    if (password2 && val !== password2) {
      setErrors(prev => ({ ...prev, password2: 'Las contraseñas no coinciden.' }));
    } else if (password2) {
      setErrors(prev => ({ ...prev, password2: '' }));
    }
  };

  const handlePassword2Change = (val: string) => {
    setPassword2(val);
    if (password && val !== password) {
      setErrors(prev => ({ ...prev, password2: 'Las contraseñas no coinciden.' }));
    } else {
      setErrors(prev => ({ ...prev, password2: '' }));
    }
  };

  const handleCalleChange = (val: string) => {
    setCalle(val);
    if (val.trim() && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(val)) {
      setErrors(prev => ({ ...prev, calle: 'Solo se permiten letras y espacios.' }));
    } else {
      setErrors(prev => ({ ...prev, calle: '' }));
    }
  };

  const handleColoniaChange = (val: string) => {
    setColonia(val);
    if (val.trim() && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(val)) {
      setErrors(prev => ({ ...prev, colonia: 'Solo se permiten letras y espacios.' }));
    } else {
      setErrors(prev => ({ ...prev, colonia: '' }));
    }
  };

  const handleMunicipioChange = (val: string) => {
    setMunicipio(val);
    if (val.trim() && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(val)) {
      setErrors(prev => ({ ...prev, municipio: 'Solo se permiten letras y espacios.' }));
    } else {
      setErrors(prev => ({ ...prev, municipio: '' }));
    }
  };

  const handleEstadoChange = (val: string) => {
    setEstado(val);
    if (val.trim() && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(val)) {
      setErrors(prev => ({ ...prev, estado: 'Solo se permiten letras y espacios.' }));
    } else {
      setErrors(prev => ({ ...prev, estado: '' }));
    }
  };

  const handleReferenciaChange = (val: string) => {
    setReferencia(val);
    if (val.trim() && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]+$/.test(val)) {
      setErrors(prev => ({ ...prev, referencia: 'Solo se permiten letras y números.' }));
    } else {
      setErrors(prev => ({ ...prev, referencia: '' }));
    }
  };

  const handleRadioKmChange = (val: string) => {
    const cleaned = val.replace(/\D/g, '');
    setRadioKm(cleaned);
    const radVal = parseInt(cleaned, 10);
    if (!cleaned) {
      setErrors(prev => ({ ...prev, radioKm: 'El radio es obligatorio.' }));
    } else if (isNaN(radVal) || radVal <= 0) {
      setErrors(prev => ({ ...prev, radioKm: 'Debe ser mayor a 0.' }));
    } else {
      setErrors(prev => ({ ...prev, radioKm: '' }));
    }
  };

  // ─── Manejo de Multimedia ───
  const handlePickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) setLogoUrl(result.assets[0].uri);
  };

  const captureFoto = async () => {
    if (fotos.length >= 3) { showToast({ type: 'error', title: 'Límite alcanzado', message: 'Máximo 3 fotos' }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) setFotos([...fotos, { id: Date.now().toString(), foto_url: result.assets[0].uri, descripcion: '', orden: fotos.length + 1 }]);
  };

  const handleUpdateFotoDesc = (id: string, desc: string) => setFotos(fotos.map((f) => f.id === id ? { ...f, descripcion: desc } : f));
  const handleDeleteFoto = (id: string) => setFotos(fotos.filter((f) => f.id !== id).map((f, i) => ({ ...f, orden: i + 1 })));

  // ─── Horarios y Animales ───
  const HORAS_DISPONIBLES = Array.from({ length: 48 }, (_, i) => {
    const horas = Math.floor(i / 2);
    const minutos = i % 2 === 0 ? '00' : '30';
    const ampm = horas < 12 ? 'AM' : 'PM';
    const h = horas === 0 ? 12 : horas > 12 ? horas - 12 : horas;
    return `${String(h).padStart(2, '0')}:${minutos} ${ampm}`;
  });

  const formatearHorario = () => {
    if (!diasSeleccionados.length) return null;
    return `${diasSeleccionados.join(',')}|${horaApertura}|${horaCierre}`;
  };

  const handleSeleccionarHora = (hora: string) => {
    if (campoHorarioActivo === 'apertura') setHoraApertura(hora);
    else setHoraCierre(hora);
    setCampoHorarioActivo(null);
  };

  const toggleDia = (dia: string) => setDiasSeleccionados(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  const toggleTipoAnimal = (tipo: TipoAnimal) => setTiposAnimales(prev => prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]);
  const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // ─── Mapas y Ubicación ───
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon, format: 'json', addressdetails: 1 },
      });
      const address = res.data.address || {};
      setCalle(address.road || address.pedestrian || address.square || address.footway || address.path || '');
      setNumero(address.house_number || '');
      setColonia(address.suburb || address.neighbourhood || address.colonia || address.city_district || address.quarter || address.residential || address.village || address.hamlet || address.borough || '');
      setMunicipio(address.city || address.town || address.municipality || address.county || '');
      setEstado(address.state || '');
      setDireccionConfirmada(res.data.display_name || '');
    } catch (error) {
      console.error('Error al obtener la dirección:', error);
    }
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
    setCalle(address.road || address.pedestrian || address.square || address.footway || address.path || result.name || '');
    setNumero(address.house_number || '');
    setColonia(address.suburb || address.neighbourhood || address.colonia || address.city_district || address.quarter || address.residential || address.village || address.hamlet || address.borough || '');
    setMunicipio(address.city || address.town || address.municipality || address.county || '');
    setEstado(address.state || '');
    setDireccionConfirmada(result.display_name);
    setSearchQuery('');
    setSearchResults([]);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
  };

  useEffect(() => {
    if (searchQuery.trim().length < 4) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: searchQuery + ', Puebla, México', format: 'json', addressdetails: 1, limit: 5 },
        });
        setSearchResults(res.data);
      } catch (error) { setSearchResults([]); } finally { setIsSearching(false); }
    }, 600);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

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
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setPinLocation({ latitud: lat, longitud: lon });
          setUbicacionConfirmada(true);
          setErrors((prev) => ({ ...prev, ubicacion: '' }));
          reverseGeocode(lat, lon);
          setIsLoadingGps(false);
        },
        (error) => {
          setIsLoadingGps(false);
          showToast({ type: 'error', title: 'Error', message: 'Verifica tu GPS.' });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
      return;
    }
    setIsLoadingGps(false);
  };

  // ─── Envío Final ───
  const handleSubmit = async () => {
    if (!validarPaso3()) { setShowSubmitError(true); return; }
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
        if (subcategoriaOtro === 'Otro') finalTiposAnimales.push(...customTipos.map(t => t.trim().toLowerCase()));
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
      if (numero.trim()) formData.append('numero', numero.trim());
      if (colonia.trim()) formData.append('colonia', colonia.trim());
      if (municipio.trim()) formData.append('municipio', municipio.trim());
      if (estado.trim()) formData.append('estado', estado.trim());
      if (referencia.trim()) formData.append('referencia', referencia.trim());

      if (logoUrl) {
        const res = await fetch(logoUrl);
        const blob = await res.blob();
        formData.append('logo', blob, `logo_${Date.now()}.jpg`);
      }
      for (const f of fotos) {
        const res = await fetch(f.foto_url);
        const blob = await res.blob();
        formData.append('fotos', blob, `foto_${f.id}_${Date.now()}.jpg`);
      }

      if (fotos.length > 0) {
        formData.append('fotos_descripciones', JSON.stringify(fotos.map(f => f.descripcion || null)));
        formData.append('fotos_ordenes', JSON.stringify(fotos.map(f => f.orden)));
      }

      const response = await axios.post(`${API_URL}/associations`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

      await setSession(response.data.usuario, response.data.access_token, response.data.refresh_token);
      setRegistroExitoso(true);
    } catch (error: any) {
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido';
      showToast({ type: 'error', title: 'Error', message: mensaje });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Renders de los Pasos ───
  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: 10 }}>
        <TouchableOpacity onPress={handleAnterior} style={styles.headerBackButton}>
          <Feather name="chevron-left" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Registro de Asociación</Text>
          <Text style={styles.headerSubtitle}>
            Paso {paso} de {TOTAL_PASOS}: {PASO_NOMBRES[paso - 1]}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={handleCloseRequest} style={styles.closeButton}>
            <Feather name="x" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
      {/* Barra de progreso */}
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, marginTop: 18, zIndex: 10 }}>
        <View style={{ height: 4, backgroundColor: COLORS.secondary, borderRadius: 2, width: `${(paso / TOTAL_PASOS) * 100}%` }} />
      </View>
      <Image source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png' }} style={styles.decorationImage} resizeMode="contain" />
    </View>
  );

  const renderPaso1 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Datos de la Asociación */}
      <FormSection title="Datos de la Asociación">
        <Input label="Nombre de la Asociación" placeholder="Ej. Huellitas de Amor A.C." value={nombre} onChangeText={handleNombreChange} error={errors.nombre} required />
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}>
            <Input label="Nombre(s) del Responsable" placeholder="Ej. Juan" value={nombreResponsable} onChangeText={handleNombreResponsableChange} error={errors.nombreResponsable} required />
          </View>
          <View style={styles.halfWidth}>
            <Input label="Apellido del Responsable" placeholder="Ej. Pérez" value={apellidoResponsable} onChangeText={handleApellidoResponsableChange} error={errors.apellidoResponsable} required />
          </View>
        </View>
        <Input label="Acerca de la Asociación (Opcional)" placeholder="Describe la misión o actividades..." value={acercaDe} onChangeText={handleAcercaDeChange} error={errors.acercaDe} multiline maxLength={300} style={{ height: 80, textAlignVertical: 'top', outlineStyle: 'none' } as any} />
        <Text style={styles.charCounter}>{acercaDe.length}/300</Text>

        <Text style={styles.sectionLabel}>Logo de la Asociación (Opcional)</Text>
        {logoUrl ? (
          <View style={styles.logoPreview}>
            <Image source={{ uri: logoUrl }} style={styles.logoImage} />
            <TouchableOpacity onPress={() => setLogoUrl('')} style={styles.logoDeleteButton}>
              <Ionicons name="trash" size={16} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handlePickLogo} style={styles.uploadButton}>
            <Ionicons name="cloud-upload" size={24} color={COLORS.textLight} />
            <Text style={styles.uploadText}>Subir logo</Text>
          </TouchableOpacity>
        )}
      </FormSection>
      <Divider />
      {/* Datos de Contacto */}
      <FormSection title="Datos de Contacto" subtitle="Con este correo y contraseña iniciarás sesión.">
        <Input label="Teléfono" placeholder="Ej. 2221234567" value={telefono} onChangeText={handleTelefonoChange} error={errors.telefono} keyboardType="numeric" maxLength={10} required />
        <Input label="Correo Electrónico" placeholder="Ej. contacto@asociacion.org" value={email} onChangeText={handleEmailChange} error={errors.email} keyboardType="email-address" autoCapitalize="none" required />
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}>
            <Input label="Contraseña" placeholder="8+ caracteres" value={password} onChangeText={handlePasswordChange} error={errors.password} secureTextEntry required />
          </View>
          <View style={styles.halfWidth}>
            <Input label="Confirmar Contraseña" placeholder="Repite tu contraseña" value={password2} onChangeText={handlePassword2Change} error={errors.password2} secureTextEntry required />
          </View>
        </View>
      </FormSection>

      {showSubmitError && <Text style={styles.submitError}>Faltan campos por revisar arriba.</Text>}
      <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Siguiente →</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPaso2 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Operación y Animales */}
      <FormSection title="Operación y Animales">
        <Text style={styles.sectionLabel}>Horario de Atención (Opcional)</Text>
        <View style={styles.daysContainer}>
          {DIAS_ORDEN.map((dia) => {
            const isSelected = diasSeleccionados.includes(dia);
            return (
              <TouchableOpacity key={dia} onPress={() => toggleDia(dia)} style={[styles.dayChip, { backgroundColor: isSelected ? COLORS.bgTeal : COLORS.grayLight }]}>
                <Text style={[styles.dayChipText, { color: isSelected ? COLORS.bgWhite : COLORS.textLight }]}>{dia.slice(0, 3)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.timeContainer}>
          <View style={styles.halfWidth}>
            <Text style={styles.timeLabel}>Apertura</Text>
            <TouchableOpacity onPress={() => setCampoHorarioActivo('apertura')} style={styles.timeButton}>
              <Text style={[styles.timeButtonText, { color: horaApertura ? COLORS.textDark : COLORS.textLight }]}>{horaApertura || '00:00 AM'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.halfWidth}>
            <Text style={styles.timeLabel}>Cierre</Text>
            <TouchableOpacity onPress={() => setCampoHorarioActivo('cierre')} style={styles.timeButton}>
              <Text style={[styles.timeButtonText, { color: horaCierre ? COLORS.textDark : COLORS.textLight }]}>{horaCierre || '00:00 PM'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.animalLabel]}>
          Tipos de animales que rescatan <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.animalChips}>
          {([{ id: 'perro', label: 'Perros' }, { id: 'gato', label: 'Gatos' }, { id: 'ave', label: 'Aves' }, { id: 'otro', label: 'Otros' }] as const).map((t) => {
            const isSelected = tiposAnimales.includes(t.id);
            return (
              <TouchableOpacity 
                key={t.id} onPress={() => toggleTipoAnimal(t.id)} 
                style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.primary : COLORS.grayLight, borderWidth: errors.tiposAnimales ? 1 : 0, borderColor: COLORS.danger }]}
              >
                <Text style={{ textAlign: 'center', fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.bgWhite : COLORS.textLight }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.tiposAnimales && <Text style={styles.errorText}>{errors.tiposAnimales}</Text>}

        {tiposAnimales.includes('otro') && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionLabel}>Selecciona o describe el tipo de animal</Text>
            <View style={styles.animalChips}>
              {['Reptil', 'Equino', 'Exótico', 'Otro'].map((opcion) => {
                const isSelected = subcategoriaOtro === opcion;
                return (
                  <TouchableOpacity key={opcion} onPress={() => setSubcategoriaOtro(opcion)} style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}>
                    <Text style={{ textAlign: 'center', fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{opcion}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.subcategoriaOtro && <Text style={styles.errorText}>{errors.subcategoriaOtro}</Text>}
            {subcategoriaOtro === 'Otro' && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.sectionLabel, { marginBottom: 4 }]}>Describe el tipo *</Text>
                <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 8 }}>(Presiona "Enter" en tu teclado para añadir el tipo)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: customTipos.length > 0 ? 12 : 0 }}>
                  {customTipos.map((tipo, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                      <Text style={{ color: COLORS.bgWhite, fontWeight: '600', fontSize: 12, marginRight: 6 }}>{tipo}</Text>
                      <TouchableOpacity onPress={() => setCustomTipos(prev => prev.filter((_, i) => i !== idx))}>
                        <Ionicons name="close-circle" size={16} color={COLORS.bgWhite} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <Input
                  placeholder="Ej. Tlacuache, caballo..."
                  value={customTipoInput}
                  onChangeText={setCustomTipoInput}
                  error={errors.customTipos}
                  onSubmitEditing={() => {
                    if (customTipoInput.trim()) {
                      setCustomTipos(prev => [...prev, customTipoInput.trim()]);
                      setCustomTipoInput('');
                      setErrors(prev => ({ ...prev, customTipos: '' }));
                    }
                  }}
                  blurOnSubmit={false}
                />
              </View>
            )}
          </View>
        )}
      </FormSection>

      {showSubmitError && <Text style={styles.submitError}>Faltan campos por revisar arriba.</Text>}
      <TouchableOpacity onPress={handleSiguiente} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Siguiente →</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPaso3 = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Ubicación Física */}
      <FormSection title="Ubicación Física" subtitle="Ajusta el pin en el mapa para mayor precisión.">
        <Input placeholder="Buscar dirección (Ej. Zócalo, Puebla)" value={searchQuery} onChangeText={setSearchQuery} />
        {isSearching && <Text style={styles.searchingText}>Buscando...</Text>}
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((result, idx) => (
              <TouchableOpacity key={idx} onPress={() => handleSelectSearchResult(result)} style={[styles.searchResult, { borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1 }]}>
                <Text style={styles.searchResultText}>{result.display_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity onPress={handleGetLocation} style={styles.locationButton}>
          <Ionicons name="location" size={18} color={COLORS.bgTeal} />
          <Text style={styles.locationButtonText}>{isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}</Text>
        </TouchableOpacity>

        <View style={[styles.mapContainer, { borderWidth: errors.ubicacion ? 2 : 0, borderColor: COLORS.danger }]}>
          <LocationPickerMap selectedPosition={pinLocation} onLocationSelect={handlePinLocationSelect} />
        </View>
        {errors.ubicacion && <Text style={styles.errorText}>{errors.ubicacion}</Text>}

        {direccionConfirmada !== '' && (
          <View style={styles.directionConfirm}>
            <Text style={styles.directionConfirmText}>Selección: <Text style={{ fontWeight: '700' }}>{direccionConfirmada}</Text></Text>
          </View>
        )}

        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><Input label="Calle" placeholder="Ej. Av. Reforma" value={calle} onChangeText={handleCalleChange} error={errors.calle} /></View>
          <View style={styles.halfWidth}><Input label="Número" placeholder="Ej. 123" value={numero} onChangeText={setNumero} /></View>
        </View>
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><Input label="Colonia" placeholder="Ej. Centro Histórico" value={colonia} onChangeText={handleColoniaChange} error={errors.colonia} /></View>
          <View style={styles.halfWidth}><Input label="Municipio / Ciudad" placeholder="Ej. Puebla" value={municipio} onChangeText={handleMunicipioChange} error={errors.municipio} /></View>
        </View>
        <View style={styles.rowContainer}>
          <View style={styles.halfWidth}><Input label="Estado" placeholder="Ej. Puebla" value={estado} onChangeText={handleEstadoChange} error={errors.estado} /></View>
          <View style={styles.halfWidth}><Input label="Referencia (Opcional)" placeholder="Ej. Casa azul" value={referencia} onChangeText={handleReferenciaChange} error={errors.referencia} /></View>
        </View>

        <Input label="Radio de Cobertura de Rescate (KM)" placeholder="Ej. 15" value={radioKm} onChangeText={handleRadioKmChange} error={errors.radioKm} keyboardType="numeric" required />
      </FormSection>

      <Divider />

      {/* Fotos */}
      <FormSection title="Fotos (Opcional)" subtitle="Sube hasta 3 fotos de tus instalaciones o rescates.">
        {fotos.map((f) => (
          <View key={f.id} style={styles.fotoItem}>
            <Image source={{ uri: f.foto_url }} style={styles.fotoImage} />
            <View style={styles.fotoContent}>
              <TextInput placeholder="Añade una descripción..." value={f.descripcion} onChangeText={(text) => handleUpdateFotoDesc(f.id, text)} style={[styles.fotoInput, { outlineStyle: 'none' }] as any} />
              <TouchableOpacity onPress={() => handleDeleteFoto(f.id)}><Text style={styles.fotoDelete}>Eliminar foto</Text></TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity onPress={captureFoto} style={styles.addPhotoButton}>
          <Text style={styles.addPhotoText}><Ionicons name="images" size={16}/> Agregar foto</Text>
        </TouchableOpacity>
      </FormSection>

      {showSubmitError && <Text style={styles.submitError}>Faltan campos por revisar arriba.</Text>}
      <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting} style={[styles.submitButton, { opacity: isSubmitting ? 0.7 : 1 }]}>
        {isSubmitting ? <ActivityIndicator color={COLORS.bgWhite} /> : <Text style={styles.submitButtonText}>Terminar Registro</Text>}
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={[styles.outerContainer, { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any]}>
      <Toast toast={toast} translateY={translateY} />

      {registroExitoso ? (
         <AssociationStatusScreen onClose={onClose} standalone={false} />
      ) : (
        <>
          <View style={[styles.centeredContent]}>
            <View style={styles.cardContainer}>
              {renderHeader()}
              
              <View style={styles.bodySection}>
                {paso === 1 && renderPaso1()}
                {paso === 2 && renderPaso2()}
                {paso === 3 && renderPaso3()}
              </View>
            </View>
          </View>

          {/* Modal de horarios */}
          <Modal visible={campoHorarioActivo !== null} transparent animationType="fade" onRequestClose={() => setCampoHorarioActivo(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{campoHorarioActivo === 'apertura' ? 'Hora de apertura' : 'Hora de cierre'}</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
                  {HORAS_DISPONIBLES.map((hora) => (
                    <TouchableOpacity key={hora} onPress={() => handleSeleccionarHora(hora)} style={styles.horaOption}>
                      <Text style={styles.horaText}>{hora}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity onPress={() => setCampoHorarioActivo(null)} style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modal de confirmación de salida */}
          <Modal visible={showCloseConfirm} transparent animationType="fade" onRequestClose={() => setShowCloseConfirm(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.confirmModal}>
                <Text style={styles.confirmTitle}>¿Seguro que deseas salir?</Text>
                <Text style={styles.confirmMessage}>Los datos ingresados se perderán y tendrás que empezar tu registro de nuevo.</Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity onPress={() => setShowCloseConfirm(false)} style={styles.confirmButtonCancel}>
                    <Text style={styles.confirmButtonCancelText}>Me quedo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowCloseConfirm(false); if (onClose) onClose(); }} style={styles.confirmButtonExit}>
                    <Text style={styles.confirmButtonExitText}>Sí, salir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

// ── Componentes internos ──────

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.formSection}>
      <Text style={styles.formSectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.formSectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ── Estilos ────────────────────────────────

const styles = StyleSheet.create({
  outerContainer: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  centeredContent: { width: '100%', maxWidth: FORM_MAX_WIDTH, maxHeight: '90%', alignSelf: 'center' },
  cardContainer: {
    flex: 1, backgroundColor: COLORS.bgWhite, borderRadius: 32, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 15,
    flexDirection: 'column',
  },
  headerSection: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32, backgroundColor: COLORS.bgTeal, position: 'relative', zIndex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.bgWhite },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9, marginTop: 4 },
  
  headerBackButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', 
    alignItems: 'center', justifyContent: 'center', marginRight: 12 
  },
  closeButton: { backgroundColor: 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 20 },
  decorationImage: { width: 120, height: 120, position: 'absolute', bottom: -10, right: 30, zIndex: 0 },
  bodySection: { flex: 1, backgroundColor: COLORS.bgWhite, borderTopLeftRadius: 40, borderTopRightRadius: 40, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20, zIndex: 2 },
  scrollContent: { paddingBottom: 40 },
  formSection: { marginBottom: 24 },
  formSectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 },
  formSectionSubtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: 16 },
  rowContainer: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  halfWidth: { flex: 1 },
  charCounter: { textAlign: 'right', color: COLORS.textLight, fontSize: 12, marginTop: -10, marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 },
  logoPreview: { alignSelf: 'flex-start', position: 'relative', marginBottom: 16 },
  logoImage: { width: 100, height: 100, borderRadius: 30 },
  logoDeleteButton: { position: 'absolute', top: -10, right: -10, backgroundColor: COLORS.bgWhite, padding: 6, borderRadius: 20 },
  uploadButton: { backgroundColor: COLORS.grayLight, height: 100, width: 150, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  uploadText: { color: COLORS.textLight, fontWeight: '600', marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },
  daysContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  dayChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  dayChipText: { fontWeight: '700', fontSize: 13 },
  timeContainer: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  timeLabel: { fontSize: 12, color: COLORS.textLight, marginBottom: 4, fontWeight: '700' },
  timeButton: { backgroundColor: COLORS.grayLight, borderRadius: 16, padding: 16 },
  timeButtonText: { fontWeight: '600' },
  animalLabel: { marginTop: 24 },
  required: { color: COLORS.danger },
  animalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  animalChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 4, marginBottom: 16 },
  searchingText: { fontSize: 12, color: COLORS.textLight, marginTop: -8, marginBottom: 10 },
  searchResults: { backgroundColor: COLORS.bgWhite, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, marginTop: -10, marginBottom: 16, overflow: 'hidden' },
  searchResult: { padding: 14, borderBottomColor: COLORS.grayLight },
  searchResultText: { fontSize: 13, color: COLORS.textDark },
  locationButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  locationButtonText: { fontSize: 14, color: COLORS.bgTeal, fontWeight: '700', marginLeft: 4 },
  mapContainer: { borderRadius: 24, overflow: 'hidden', marginBottom: 8 },
  directionConfirm: { backgroundColor: 'rgba(102, 188, 180, 0.1)', padding: 12, borderRadius: 12, marginBottom: 16 },
  directionConfirmText: { fontSize: 13, color: COLORS.textDark },
  fotoItem: { flexDirection: 'row', gap: 16, backgroundColor: COLORS.grayLight, padding: 12, borderRadius: 20, marginBottom: 12, alignItems: 'center' },
  fotoImage: { width: 70, height: 70, borderRadius: 12 },
  fotoContent: { flex: 1, justifyContent: 'center' },
  fotoInput: { fontSize: 13, color: COLORS.textDark, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 4, marginBottom: 8 },
  fotoDelete: { color: COLORS.danger, fontWeight: '700', fontSize: 12 },
  addPhotoButton: { padding: 16, width: 200, backgroundColor: 'rgba(236, 128, 43, 0.1)', borderRadius: 20, alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, borderStyle: 'dashed' },
  addPhotoText: { color: COLORS.primary, fontWeight: '700' },
  submitError: { color: COLORS.danger, textAlign: 'center', marginBottom: 12, fontWeight: '700', fontSize: 14 },
  submitButton: { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, alignItems: 'center', marginBottom: 16 },
  submitButtonText: { color: COLORS.bgWhite, fontWeight: '900', fontSize: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: COLORS.bgWhite, width: '100%', maxWidth: 400, borderRadius: 24, padding: 32, maxHeight: '60%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 20 },
  modalScroll: { marginBottom: 16 },
  horaOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  horaText: { fontSize: 16, color: COLORS.textDark, textAlign: 'center', fontWeight: '500' },
  modalCancel: { alignItems: 'center', marginTop: 20, backgroundColor: COLORS.grayLight, padding: 16, borderRadius: 20 },
  modalCancelText: { color: COLORS.textDark, fontWeight: '700' },
  confirmModal: { backgroundColor: COLORS.bgWhite, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 12 },
  confirmMessage: { fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  confirmButtons: { flexDirection: 'row', gap: 12 },
  confirmButtonCancel: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.grayLight, alignItems: 'center' },
  confirmButtonCancelText: { color: COLORS.textDark, fontWeight: '700' },
  confirmButtonExit: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.danger, alignItems: 'center' },
  confirmButtonExitText: { color: COLORS.bgWhite, fontWeight: '700' },
});
