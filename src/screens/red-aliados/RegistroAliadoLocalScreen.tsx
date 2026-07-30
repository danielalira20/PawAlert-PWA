import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/Toast';
import axios from 'axios';
import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import LocationPickerMap from '../LocationPickerMap';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';

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

interface Props {
  onClose?: () => void;
  initialTipoAliado?: string;
}

export default function RegistroAliadoLocalScreen({ onClose, initialTipoAliado }: Props) {
  const { login, refreshUser } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [paso, setPaso] = useState(1);
  const [tipoAliado, setTipoAliado] = useState(initialTipoAliado || 'aliado_local');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [formaColaboracion, setFormaColaboracion] = useState('Donaciones ocasionales');
  const [logistica, setLogistica] = useState('Puedo entregar');
  
  const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const [diasSeleccionados, setDiasSeleccionados] = useState<string[]>([]);
  const [horaApertura, setHoraApertura] = useState('');
  const [horaCierre, setHoraCierre] = useState('');
  const [campoHorarioActivo, setCampoHorarioActivo] = useState<'apertura' | 'cierre' | null>(null);

  const [logoFile, setLogoFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [descripcion, setDescripcion] = useState('');

  const [medicoResponsable, setMedicoResponsable] = useState('');
  const [cedulaProfesional, setCedulaProfesional] = useState('');
  const [documentoFile, setDocumentoFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [tipoDocumentoOtro, setTipoDocumentoOtro] = useState('');
  const [requiereCita, setRequiereCita] = useState(false);
  const [nivelesUrgencia, setNivelesUrgencia] = useState<string[]>([]);
  const [especiesAtendidas, setEspeciesAtendidas] = useState<string[]>([]);

  const [tipoApoyoDifusion, setTipoApoyoDifusion] = useState<string[]>([]);
  const [areaServicio, setAreaServicio] = useState('');
  const [areaServicioOtro, setAreaServicioOtro] = useState('');
  const [nombreContactoCampana, setNombreContactoCampana] = useState('');
  const [cargoContactoCampana, setCargoContactoCampana] = useState('');

  const [tipoEstablecimiento, setTipoEstablecimiento] = useState('');
  const [otroEstablecimiento, setOtroEstablecimiento] = useState('');

  const [razonSocial, setRazonSocial] = useState('');
  const [tipoInstitucion, setTipoInstitucion] = useState('');
  const [otroInstitucion, setOtroInstitucion] = useState('');
  const [nombreRepresentante, setNombreRepresentante] = useState('');
  const [cargoRepresentante, setCargoRepresentante] = useState('');
  const [rfc, setRfc] = useState('');

  const [categorias, setCategorias] = useState<string[]>([]);
  const [subcategorias, setSubcategorias] = useState<string[]>([]);
  const [subcategoriasData, setSubcategoriasData] = useState<any[]>([]);
  const [categoriasData, setCategoriasData] = useState<{ id: string; clave: string; descripcion: string }[]>([]);

  // Location states
  const [latitud, setLatitud] = useState<number | null>(null);
  const [longitud, setLongitud] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [direccionConfirmada, setDireccionConfirmada] = useState('');

  const [calleNombre, setCalleNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [estadoUbicacion, setEstadoUbicacion] = useState('');
  const [referencia, setReferencia] = useState('');

  const [radio, setRadio] = useState<number>(5);
  const [disponibilidad, setDisponibilidad] = useState('disponible');
  const [visibilidad, setVisibilidad] = useState('mostrar mi nombre');

  const [checkMural, setCheckMural] = useState(false);
  const [checkReglas, setCheckReglas] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitError, setShowSubmitError] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [registroExitoso, setRegistroExitoso] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [emailConflict, setEmailConflict] = useState(false);
  const [phoneConflict, setPhoneConflict] = useState(false);

  // ─── Obtener categorías y subcategorías ───
  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        const res = await axios.get(`${API_URL}/red-aliados/categorias`);
        setCategoriasData(res.data);
      } catch (err) {
        console.warn('Error fetching categorias:', err);
      }
    };
    fetchCategorias();

    const fetchSubcategorias = async () => {
      try {
        const res = await axios.get(`${API_URL}/catalogos/recursos/subcategorias`);
        setSubcategoriasData(res.data);
      } catch (err) {
        console.warn('Error fetching subcategorias:', err);
      }
    };
    fetchSubcategorias();
  }, []);

  // ─── Búsqueda Nominatim ───
  useEffect(() => {
    if (searchQuery.trim().length < 4) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: searchQuery, format: 'json', addressdetails: 1, limit: 6, countrycodes: 'mx' },
        });
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 600);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // ─── Geocodificación inversa ───
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon, format: 'json', addressdetails: 1 },
      });
      const address = res.data.address || {};
      setCalleNombre(address.road || address.pedestrian || address.square || address.footway || address.path || '');
      setNumero(address.house_number || '');
      setColonia(address.suburb || address.neighbourhood || address.colonia || address.city_district || address.quarter || address.residential || address.village || address.hamlet || address.borough || '');
      setMunicipio(address.city || address.town || address.municipality || address.county || '');
      setEstadoUbicacion(address.state || '');
      setDireccionConfirmada(res.data.display_name || '');
    } catch {
      // Ignorar error si no se puede reverse-geocodificar
    }
  };

  const handleGeocodeManualFields = async () => {
    const calleCompleta = [calleNombre, numero].filter((p) => p.trim()).join(' ');
    const query = [calleCompleta, colonia, municipio].filter((p) => p.trim()).join(', ');
    if (!query.trim()) return;
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: query, format: 'json', addressdetails: 1, limit: 1, countrycodes: 'mx' },
      });
      if (res.data && res.data.length > 0) {
        const result = res.data[0];
        const address = result.address || {};
        setLatitud(parseFloat(result.lat));
        setLongitud(parseFloat(result.lon));
        setEstadoUbicacion(address.state || '');
        setDireccionConfirmada(result.display_name);
      } else {
        showToast({ type: 'warning', title: 'Sin resultados', message: 'No se encontró la dirección, ajusta el pin.' });
      }
    } catch {
      // Error silencioso
    }
  };

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', title: 'GPS Denegado', message: 'Ajusta el pin directamente en el mapa para indicar la ubicación.' });
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLatitud(currentLocation.coords.latitude);
      setLongitud(currentLocation.coords.longitude);
      reverseGeocode(currentLocation.coords.latitude, currentLocation.coords.longitude);
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos obtener tu ubicación' });
    } finally {
      setIsLoadingGps(false);
    }
  };

  const handleSelectSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setLatitud(lat);
    setLongitud(lon);
    setSearchQuery(result.display_name);
    setDireccionConfirmada(result.display_name);
    setSearchResults([]);
  };

  const handlePinLocationSelect = (lat: number, lng: number) => {
    setLatitud(lat);
    setLongitud(lng);
    reverseGeocode(lat, lng);
  };

  const toggleArray = (val: string, arr: string[], setArr: (a: string[]) => void, fieldName: string) => {
    setErrors(prev => ({ ...prev, [fieldName]: '' }));
    if (arr.includes(val)) setArr(arr.filter(x => x !== val));
    else setArr([...arr, val]);
  };

  const handleCloseRequest = () => setShowCloseConfirm(true);

  // ─── VALIDADORES EN TIEMPO REAL ───
  const handleEmailChange = (val: string) => {
    const lowered = val.toLowerCase();
    setEmail(lowered);
    if (!lowered.trim()) {
      setErrors(prev => ({ ...prev, email: 'El correo es obligatorio.' }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowered.trim())) {
      setErrors(prev => ({ ...prev, email: 'Correo inválido.' }));
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  };

  const handleEmailBlur = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    try {
      const res = await axios.get(`${API_URL}/auth/email-existe?email=${encodeURIComponent(email.trim())}`);
      if (res.data.existe_cuenta) {
        setEmailConflict(true);
      }
    } catch (err) {
      console.warn("Error checking email", err);
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (!val) {
      setErrors(prev => ({ ...prev, password: 'La contraseña es obligatoria.' }));
    } else if (val.length < 6) {
      setErrors(prev => ({ ...prev, password: 'Mínimo 6 caracteres.' }));
    } else if (!/[a-z]/.test(val) || !/[A-Z]/.test(val)) {
      setErrors(prev => ({ ...prev, password: 'Debe contener al menos 1 minúscula y 1 mayúscula.' }));
    } else {
      setErrors(prev => ({ ...prev, password: '' }));
      if (passwordConfirm && val !== passwordConfirm) {
        setErrors(prev => ({ ...prev, passwordConfirm: 'Las contraseñas no coinciden.' }));
      } else {
        setErrors(prev => ({ ...prev, passwordConfirm: '' }));
      }
    }
  };

  const handlePasswordConfirmChange = (val: string) => {
    setPasswordConfirm(val);
    if (val !== password) {
      setErrors(prev => ({ ...prev, passwordConfirm: 'Las contraseñas no coinciden.' }));
    } else {
      setErrors(prev => ({ ...prev, passwordConfirm: '' }));
    }
  };

  const handleTelefonoChange = (val: string) => {
    setTelefono(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono es obligatorio.' }));
    } else if (/[a-zA-Z]/.test(val)) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono no puede contener letras.' }));
    } else if (!/^\d{10}$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, telefono: 'Debe tener exactamente 10 dígitos numéricos.' }));
    } else {
      setErrors(prev => ({ ...prev, telefono: '' }));
    }
  };

  const handleTelefonoBlur = async () => {
    if (!telefono || !/^\d{10}$/.test(telefono.trim())) return;
    try {
      const res = await axios.get(`${API_URL}/auth/telefono-existe?telefono=${encodeURIComponent(telefono.trim())}`);
      if (res.data.existe_cuenta) {
        setPhoneConflict(true);
      }
    } catch (err) {
      console.warn("Error checking telefono", err);
    }
  };

  const handleNombreContactoChange = (val: string) => {
    setNombreContacto(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, nombreContacto: 'Obligatorio.' }));
    } else if (/\d/.test(val)) {
      setErrors(prev => ({ ...prev, nombreContacto: 'No debe contener números.' }));
    } else {
      setErrors(prev => ({ ...prev, nombreContacto: '' }));
    }
  };

  const handleNombreRepresentanteChange = (val: string) => {
    setNombreRepresentante(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, nombreRepresentante: 'Obligatorio.' }));
    } else if (/\d/.test(val)) {
      setErrors(prev => ({ ...prev, nombreRepresentante: 'No debe contener números.' }));
    } else {
      setErrors(prev => ({ ...prev, nombreRepresentante: '' }));
    }
  };

  const handleCedulaProfesionalChange = (val: string) => {
    setCedulaProfesional(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, cedulaProfesional: 'Obligatorio.' }));
    } else if (/[a-zA-Z]/.test(val)) {
      setErrors(prev => ({ ...prev, cedulaProfesional: 'No debe contener letras.' }));
    } else if (!/^\d{7,8}$/.test(val)) {
      setErrors(prev => ({ ...prev, cedulaProfesional: 'Debe contener entre 7 y 8 dígitos numéricos.' }));
    } else {
      setErrors(prev => ({ ...prev, cedulaProfesional: '' }));
    }
  };

  const handleMedicoResponsableChange = (val: string) => {
    setMedicoResponsable(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, medicoResponsable: 'Obligatorio.' }));
    } else if (/\d/.test(val)) {
      setErrors(prev => ({ ...prev, medicoResponsable: 'No debe contener números.' }));
    } else {
      setErrors(prev => ({ ...prev, medicoResponsable: '' }));
    }
  };

  const handleNombreContactoCampanaChange = (val: string) => {
    setNombreContactoCampana(val);
    if (val.trim() && /\d/.test(val)) {
      setErrors(prev => ({ ...prev, nombreContactoCampana: 'No debe contener números.' }));
    } else {
      setErrors(prev => ({ ...prev, nombreContactoCampana: '' }));
    }
  };

  const handleRfcChange = (val: string) => {
    const uppercaseVal = val.toUpperCase().slice(0, 13);
    setRfc(uppercaseVal);
  };

  const handlePickDocumento = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setDocumentoFile(result.assets[0]);
      }
    } catch (err) {
      console.warn("Error picking document", err);
    }
  };

  const handlePickLogo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setLogoFile(result.assets[0]);
      }
    } catch (err) {
      console.warn("Error picking logo", err);
    }
  };

  const toggleDia = (dia: string) => {
    setDiasSeleccionados(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const formatearHorario = () => {
    if (diasSeleccionados.length === 0) return '';
    return `${diasSeleccionados.join(', ')} de ${horaApertura || '00:00 AM'} a ${horaCierre || '00:00 PM'}`;
  };

  // ─── LÓGICA WIZARD (MULTI-PASO) ───
  const validarPaso1 = () => {
    const newErrors: any = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Obligatorio. Correo válido.';
    if (!password.trim() || password.length < 6) newErrors.password = 'Mínimo 6 caracteres.';
    if (password !== passwordConfirm) newErrors.passwordConfirm = 'Las contraseñas no coinciden.';
    if (!telefono.trim() || telefono.length !== 10 || /[a-zA-Z]/.test(telefono)) newErrors.telefono = 'Debe tener 10 dígitos numéricos.';
    if (!nombreContacto.trim()) newErrors.nombreContacto = 'Obligatorio.';
    else if (/\d/.test(nombreContacto)) newErrors.nombreContacto = 'No debe contener números.';
    if (!nombreNegocio.trim()) newErrors.nombreNegocio = 'Obligatorio.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }
    return true;
  };

  const validarPaso2 = () => {
    const newErrors: any = {};
    if (tipoAliado === 'aliado_local') {
      if (!tipoEstablecimiento) newErrors.tipoEstablecimiento = 'Selecciona un tipo.';
      if (tipoEstablecimiento === 'Otro' && !otroEstablecimiento) newErrors.otroEstablecimiento = 'Especifica el establecimiento.';

      if (tipoEstablecimiento === 'Veterinaria') {
        if (!medicoResponsable) newErrors.medicoResponsable = 'Obligatorio.';
        if (!cedulaProfesional) {
          newErrors.cedulaProfesional = 'Obligatorio.';
        } else if (!/^\d{7,8}$/.test(cedulaProfesional)) {
          newErrors.cedulaProfesional = 'Debe contener entre 7 y 8 dígitos numéricos.';
        }
      }
    } else {
      if (!razonSocial) newErrors.razonSocial = 'Obligatorio.';
      if (!tipoInstitucion) newErrors.tipoInstitucion = 'Selecciona una institución.';
      if (tipoInstitucion === 'Otro' && !otroInstitucion) newErrors.otroInstitucion = 'Especifica la institución.';
      if (!nombreRepresentante) newErrors.nombreRepresentante = 'Obligatorio.';
      else if (/\d/.test(nombreRepresentante)) newErrors.nombreRepresentante = 'No debe contener números.';
      if (!cargoRepresentante) newErrors.cargoRepresentante = 'Obligatorio.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }
    return true;
  };

  const validarPaso3 = () => {
    let newErrors: any = {};
    if (categorias.length === 0) {
      newErrors.categorias = 'Selecciona al menos una categoría.';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }
    return true;
  };

  const handleSiguiente = () => {
    let valido = false;
    if (paso === 1) valido = validarPaso1();
    else if (paso === 2) valido = validarPaso2();
    else if (paso === 3) valido = validarPaso3();
    else if (paso === 4) valido = true; // Paso 4 no require validación estricta por ahora

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

  const handleGuardar = async () => {
    let newErrors: any = {};
    if (!checkReglas) {
      newErrors.reglas = 'Debes aceptar las reglas de entrega.';
    }
    if (!telefono) {
      newErrors.telefono = 'Ingresa un teléfono de contacto.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setShowSubmitError(true);
      return;
    }

    setIsSubmitting(true);
    setShowSubmitError(false);
    try {
      // 1. Register User
      const [nombre, ...apellidos] = nombreContacto.trim().split(' ');
      const apellido_paterno = apellidos.length > 0 ? apellidos[0] : '';
      const apellido_materno = apellidos.length > 1 ? apellidos.slice(1).join(' ') : undefined;

      try {
        await axios.post(`${API_URL}/auth/register`, {
          email,
          password,
          nombre: nombre || nombreNegocio,
          apellido_paterno: apellido_paterno || '-',
          apellido_materno,
          telefono,
          rol_esperado: tipoAliado,
        });
      } catch (err: any) {
        if (err.response?.status !== 409) {
          throw err;
        }
        // Si es 409 (Conflict), la cuenta ya existe. Ignoramos el error y tratamos de hacer login en el paso 2.
      }

      // 2. Login to get token
      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        email,
        password
      });
      const newToken = loginRes.data.access_token;

      // Update AuthContext seamlessly if login method allows, or just use the token directly
      await login(email, password);

      // 3. Create Direct Profile
      const payload = {
        tipo: tipoAliado,
        categorias,
        subcategorias,
        latitud,
        longitud,
        radio_km: radio,
        disponibilidad: 'disponible',
        preferencia_visibilidad: visibilidad,

        // Base
        nombre_negocio: nombreNegocio,
        forma_colaboracion: formaColaboracion,
        logistica,
        horario_contacto: formatearHorario(),
        descripcion,
        acepta_terminos: checkReglas,

        // Veterinaria
        medico_responsable: medicoResponsable,
        cedula_profesional: cedulaProfesional,
        requiere_cita: requiereCita,
        niveles_urgencia_atendida: nivelesUrgencia,
        especies_atendidas: especiesAtendidas,

        // Difusion
        tipo_apoyo_difusion: tipoApoyoDifusion,
        area_servicio_profesional: areaServicio === 'Otro' ? areaServicioOtro : areaServicio,
        nombre_contacto_campana: nombreContactoCampana,
        cargo_contacto_campana: cargoContactoCampana,

        // Aliado Local
        tipo_establecimiento: tipoEstablecimiento === 'Otro' ? otroEstablecimiento : tipoEstablecimiento,

        // Institucional
        razon_social: razonSocial,
        tipo_institucion: tipoInstitucion === 'Otro' ? otroInstitucion : tipoInstitucion,
        nombre_representante: nombreRepresentante,
        cargo_representante: cargoRepresentante,
        rfc,
        tipo_documento_verificacion: tipoDocumento === 'Otro' ? tipoDocumentoOtro : tipoDocumento
      };

      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      
      if (documentoFile) {
        if (typeof window !== 'undefined' && typeof File !== 'undefined') {
          const res = await fetch(documentoFile.uri);
          const blob = await res.blob();
          formData.append('documento', blob, documentoFile.name);
        } else {
          formData.append('documento', {
            uri: documentoFile.uri,
            name: documentoFile.name,
            type: documentoFile.mimeType || 'application/pdf',
          } as any);
        }
      }

      if (logoFile) {
        if (typeof window !== 'undefined' && typeof File !== 'undefined') {
          const res = await fetch(logoFile.uri);
          const blob = await res.blob();
          formData.append('logo', blob, logoFile.name);
        } else {
          formData.append('logo', {
            uri: logoFile.uri,
            name: logoFile.name,
            type: logoFile.mimeType || 'image/jpeg',
          } as any);
        }
      }

      await axios.post(`${API_URL}/perfiles-apoyo/registro-directo`, formData, {
        headers: { 
          Authorization: `Bearer ${newToken}`
        }
      });

      await refreshUser();
      setRegistroExitoso(true);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'Error al guardar.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCheckbox = (label: string, checked: boolean, onPress: (v: boolean) => void) => (
    <TouchableOpacity onPress={() => onPress(!checked)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: checked ? COLORS.primary : COLORS.border, backgroundColor: checked ? COLORS.primary : COLORS.bgWhite, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        {checked && <Ionicons name="checkmark" size={16} color={COLORS.bgWhite} />}
      </View>
      <Text style={{ flex: 1, fontSize: 14, color: COLORS.textDark, lineHeight: 20 }}>{label}</Text>
    </TouchableOpacity>
  );

  const HORAS_DISPONIBLES = [
    '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM',
    '08:00 PM', '09:00 PM', '10:00 PM', '11:00 PM', '12:00 AM', 'Abierto 24hrs'
  ];

  return (
    <View style={styles.outerContainer}>
      {registroExitoso ? (
        <View style={[styles.centeredContent, { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.cardContainer, { padding: 32, alignItems: 'center' }]}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.bgTeal} style={{ marginBottom: 16 }} />
            <Text style={{ fontSize: 24, fontWeight: '700', color: COLORS.textDark, marginBottom: 8, textAlign: 'center' }}>¡Registro Exitoso!</Text>
            <Text style={{ fontSize: 16, color: COLORS.textLight, textAlign: 'center', marginBottom: 24 }}>Bienvenido a la Red de Aliados. Tu perfil ha sido creado.</Text>
            <TouchableOpacity onPress={() => { if (onClose) onClose(); router.push({ pathname: '/profile', params: { abrirPanelAliado: 'true' } } as any); }} style={{ backgroundColor: COLORS.bgTeal, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 24 }}>
              <Text style={{ color: COLORS.bgWhite, fontWeight: '700', fontSize: 16 }}>Ir a mi perfil</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <View style={styles.centeredContent}>
        <View style={styles.cardContainer}>
          <View style={styles.headerSection}>
            <TouchableOpacity onPress={handleCloseRequest} style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, ...styles.closeButton }}>
              <Ionicons name="close" size={24} color={COLORS.bgWhite} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Red de Aliados</Text>
          </View>

          <View style={styles.bodySection}>
            <View style={{ height: 6, backgroundColor: COLORS.grayLight, width: '100%', marginBottom: 16, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', backgroundColor: COLORS.primary, width: `${(paso / 5) * 100}%`, borderRadius: 3 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

              {/* ====== PASO 1 ====== */}
              {paso === 1 && (
                <>
                  <FormSection title={tipoAliado === 'aliado_local' ? 'Datos de la Cuenta (Aliado Local)' : 'Datos de la Cuenta (Patrocinador Institucional)'}>
                    <View style={{ marginBottom: 12 }}>
                      <Input label="Correo Electrónico *" placeholder="email@ejemplo.com" value={email} onChangeText={handleEmailChange} onBlur={handleEmailBlur} keyboardType="email-address" autoCapitalize="none" />
                      {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      <Input label="Contraseña *" placeholder="Mínimo 6 caracteres" value={password} onChangeText={handlePasswordChange} secureTextEntry={true} />
                      {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      <Input label="Confirmar Contraseña *" placeholder="Repite tu contraseña" value={passwordConfirm} onChangeText={handlePasswordConfirmChange} secureTextEntry={true} />
                      {errors.passwordConfirm && <Text style={styles.errorText}>{errors.passwordConfirm}</Text>}
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      <Input label="Teléfono de contacto *" placeholder="10 dígitos" value={telefono} onChangeText={handleTelefonoChange} onBlur={handleTelefonoBlur} keyboardType="phone-pad" maxLength={10} />
                      {errors.telefono && <Text style={styles.errorText}>{errors.telefono}</Text>}
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      <Input label="Nombre de contacto *" placeholder="Tu nombre completo" value={nombreContacto} onChangeText={handleNombreContactoChange} />
                      {errors.nombreContacto && <Text style={styles.errorText}>{errors.nombreContacto}</Text>}
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      <Input label={tipoAliado === 'aliado_local' ? 'Nombre del negocio/clínica *' : 'Nombre de la institución *'} placeholder="Nombre público" value={nombreNegocio} onChangeText={(v) => { setNombreNegocio(v); setErrors(p => ({ ...p, nombreNegocio: '' })) }} />
                      {errors.nombreNegocio && <Text style={styles.errorText}>{errors.nombreNegocio}</Text>}
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Logo (Imagen Opcional):</Text>
                      <TouchableOpacity onPress={handlePickLogo} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.grayLight, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border }}>
                        <Ionicons name="image-outline" size={24} color={COLORS.textDark} style={{ marginRight: 8 }} />
                        <Text style={{ flex: 1, color: logoFile ? COLORS.textDark : COLORS.textLight, fontSize: 14 }}>
                          {logoFile ? logoFile.name : 'Seleccionar logo (Opcional)'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </FormSection>
                </>
              )}

              {/* ====== PASO 2 ====== */}
              {paso === 2 && (
                <>
                  {/* === CAMPOS INSTITUCIONALES === */}
                  {tipoAliado === 'patrocinador_institucional' && (
                    <FormSection title="Datos de la Institución">
                      <View style={{ marginBottom: 12 }}>
                        <Input label="Razón Social *" placeholder="Ej. Empresa S.A. de C.V." value={razonSocial} onChangeText={(v) => { setRazonSocial(v); setErrors(p => ({ ...p, razonSocial: '' })) }} />
                        {errors.razonSocial && <Text style={styles.errorText}>{errors.razonSocial}</Text>}
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Input label="RFC" placeholder="R.F.C. (Opcional)" value={rfc} onChangeText={handleRfcChange} maxLength={13} autoCapitalize="characters" />
                      </View>

                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginTop: 12, marginBottom: 8 }}>Tipo de institución: *</Text>
                      <View style={styles.animalChips}>
                        {['Empresa', 'Fundación', 'Organización civil', 'Gobierno', 'Institución educativa', 'Otro'].map(tipo => (
                          <TouchableOpacity key={tipo} style={[styles.animalChip, { backgroundColor: tipoInstitucion === tipo ? COLORS.secondary : COLORS.grayLight }]} onPress={() => { setTipoInstitucion(tipo); setErrors(p => ({ ...p, tipoInstitucion: '' })) }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: tipoInstitucion === tipo ? COLORS.textDark : COLORS.textLight }}>{tipo}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {errors.tipoInstitucion && <Text style={styles.errorText}>{errors.tipoInstitucion}</Text>}

                      {tipoInstitucion === 'Otro' && (
                        <View style={{ marginTop: 12 }}>
                          <Input label="Especificar otra institución *" placeholder="Ej. Cooperativa" value={otroInstitucion} onChangeText={(v) => { setOtroInstitucion(v); setErrors(p => ({ ...p, otroInstitucion: '' })) }} />
                          {errors.otroInstitucion && <Text style={styles.errorText}>{errors.otroInstitucion}</Text>}
                        </View>
                      )}

                      <View style={{ marginBottom: 12, marginTop: 12 }}>
                        <Input label="Nombre del representante *" placeholder="Ej. Juan Pérez" value={nombreRepresentante} onChangeText={handleNombreRepresentanteChange} />
                        {errors.nombreRepresentante && <Text style={styles.errorText}>{errors.nombreRepresentante}</Text>}
                      </View>

                      <View style={{ marginBottom: 12 }}>
                        <Input label="Cargo del representante *" placeholder="Ej. Director General" value={cargoRepresentante} onChangeText={(v) => { setCargoRepresentante(v); setErrors(p => ({ ...p, cargoRepresentante: '' })) }} />
                        {errors.cargoRepresentante && <Text style={styles.errorText}>{errors.cargoRepresentante}</Text>}
                      </View>

                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Tipo de Documento:</Text>
                        <View style={styles.animalChips}>
                          {['INE', 'Comprobante de domicilio o establecimiento', 'Otro'].map(tipo => (
                            <TouchableOpacity key={tipo} style={[styles.animalChip, { backgroundColor: tipoDocumento === tipo ? COLORS.secondary : COLORS.grayLight }]} onPress={() => setTipoDocumento(tipo)}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: tipoDocumento === tipo ? COLORS.textDark : COLORS.textLight }}>{tipo}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {tipoDocumento === 'Otro' && (
                          <View style={{ marginTop: 8, marginBottom: 12 }}>
                            <Input label="Especificar tipo de documento" placeholder="Ej. Acta constitutiva" value={tipoDocumentoOtro} onChangeText={setTipoDocumentoOtro} />
                          </View>
                        )}
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginTop: 8, marginBottom: 8 }}>Documento de existencia/identificación (PDF o Imagen):</Text>
                        <TouchableOpacity onPress={handlePickDocumento} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.grayLight, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border }}>
                          <Ionicons name="document-text-outline" size={24} color={COLORS.textDark} style={{ marginRight: 8 }} />
                          <Text style={{ flex: 1, color: documentoFile ? COLORS.textDark : COLORS.textLight, fontSize: 14 }}>
                            {documentoFile ? documentoFile.name : 'Seleccionar archivo (Opcional)'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </FormSection>
                  )}

                  {/* === CAMPOS ALIADO LOCAL === */}
                  {tipoAliado === 'aliado_local' && (
                    <FormSection title="Tipo de establecimiento">
                      <View style={styles.animalChips}>
                        {['Veterinaria', 'Tienda de mascotas', 'Transporte', 'Otro'].map(tipo => (
                          <TouchableOpacity key={tipo} style={[styles.animalChip, { backgroundColor: tipoEstablecimiento === tipo ? COLORS.secondary : COLORS.grayLight }]} onPress={() => { setTipoEstablecimiento(tipo); setErrors(p => ({ ...p, tipoEstablecimiento: '' })) }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: tipoEstablecimiento === tipo ? COLORS.textDark : COLORS.textLight }}>{tipo}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {errors.tipoEstablecimiento && <Text style={styles.errorText}>{errors.tipoEstablecimiento}</Text>}

                      {tipoEstablecimiento === 'Otro' && (
                        <View style={{ marginTop: 12 }}>
                          <Input label="Especificar otro establecimiento *" placeholder="Ej. Estética canina" value={otroEstablecimiento} onChangeText={(v) => { setOtroEstablecimiento(v); setErrors(p => ({ ...p, otroEstablecimiento: '' })) }} />
                          {errors.otroEstablecimiento && <Text style={styles.errorText}>{errors.otroEstablecimiento}</Text>}
                        </View>
                      )}
                    </FormSection>
                  )}

                  {/* === CAMPOS VETERINARIA === */}
                  {tipoAliado === 'aliado_local' && tipoEstablecimiento === 'Veterinaria' && (
                    <FormSection title="Servicios Veterinarios" subtitle="Detalles de tu práctica profesional">
                      <View style={{ marginBottom: 12 }}>
                        <Input label="Médico Responsable *" placeholder="Nombre del Médico" value={medicoResponsable} onChangeText={handleMedicoResponsableChange} />
                        {errors.medicoResponsable && <Text style={styles.errorText}>{errors.medicoResponsable}</Text>}
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Input label="Cédula Profesional *" placeholder="Núm. de Cédula" value={cedulaProfesional} onChangeText={handleCedulaProfesionalChange} />
                        {errors.cedulaProfesional && <Text style={styles.errorText}>{errors.cedulaProfesional}</Text>}
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Tipo de Documento:</Text>
                        <View style={styles.animalChips}>
                          {['INE', 'Comprobante de domicilio o establecimiento', 'Otro'].map(tipo => (
                            <TouchableOpacity key={tipo} style={[styles.animalChip, { backgroundColor: tipoDocumento === tipo ? COLORS.secondary : COLORS.grayLight }]} onPress={() => setTipoDocumento(tipo)}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: tipoDocumento === tipo ? COLORS.textDark : COLORS.textLight }}>{tipo}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {tipoDocumento === 'Otro' && (
                          <View style={{ marginTop: 8, marginBottom: 12 }}>
                            <Input label="Especificar tipo de documento" placeholder="Ej. Acta constitutiva" value={tipoDocumentoOtro} onChangeText={setTipoDocumentoOtro} />
                          </View>
                        )}
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginTop: 8, marginBottom: 8 }}>Documento de verificación (PDF o Imagen):</Text>
                        <TouchableOpacity onPress={handlePickDocumento} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.grayLight, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border }}>
                          <Ionicons name="document-text-outline" size={24} color={COLORS.textDark} style={{ marginRight: 8 }} />
                          <Text style={{ flex: 1, color: documentoFile ? COLORS.textDark : COLORS.textLight, fontSize: 14 }}>
                            {documentoFile ? documentoFile.name : 'Seleccionar archivo (Opcional)'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {renderCheckbox('¿Requiere cita previa?', requiereCita, setRequiereCita)}
                    </FormSection>
                  )}
                </>
              )}

              {/* ====== PASO 3 ====== */}
              {paso === 3 && (
                <>
                  <FormSection title="¿Qué puedes donar?" subtitle="Selecciona lo que podrías aportar (no es un compromiso fijo).">
                    <View style={styles.animalChips}>
                      {categoriasData.map((cat) => {
                        const isSelected = categorias.includes(cat.clave);
                        return (
                          <TouchableOpacity
                            key={cat.clave}
                            style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}
                            onPress={() => toggleArray(cat.clave, categorias, setCategorias, 'categorias')}
                          >
                            <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>{cat.descripcion}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {errors.categorias && <Text style={styles.errorText}>{errors.categorias}</Text>}

                    {/* Subcategorías dinámicas */}
                    {categorias.map(clave => {
                      const subs = subcategoriasData.filter(s => s.categoria_clave === clave);
                      if (subs.length === 0) return null;

                      const catLabel = categoriasData.find(c => c.clave === clave)?.descripcion || clave;

                      return (
                        <View key={`subs-${clave}`} style={{ marginTop: 8, marginBottom: 12, backgroundColor: COLORS.grayLight, padding: 14, borderRadius: 16 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 10 }}>
                            Especifíca qué tipo de {catLabel.toLowerCase()} (Opcional):
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {subs.map(sub => {
                              const isSubSelected = subcategorias.includes(sub.clave);
                              return (
                                <TouchableOpacity
                                  key={sub.clave}
                                  style={{
                                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
                                    backgroundColor: isSubSelected ? COLORS.primary : COLORS.bgWhite,
                                    borderWidth: 1, borderColor: isSubSelected ? COLORS.primary : COLORS.border
                                  }}
                                  onPress={() => toggleArray(sub.clave, subcategorias, setSubcategorias, 'subcategorias')}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: isSubSelected ? COLORS.bgWhite : COLORS.textDark }}>
                                    {sub.descripcion}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </FormSection>
                </>
              )}

              {/* === CAMPOS SERVICIOS VETERINARIOS === */}
              {paso === 3 && categorias.includes('servicios_veterinarios') && (
                <>
                  <FormSection title="Detalles de Servicios Veterinarios">
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Especies Atendidas:</Text>
                    <View style={styles.animalChips}>
                      {['Perros', 'Gatos', 'Exóticos', 'Aves', 'Fauna Silvestre'].map(esp => (
                        <TouchableOpacity key={esp} style={[styles.animalChip, { backgroundColor: especiesAtendidas.includes(esp) ? COLORS.secondary : COLORS.grayLight }]} onPress={() => toggleArray(esp, especiesAtendidas, setEspeciesAtendidas, 'especies')}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: especiesAtendidas.includes(esp) ? COLORS.textDark : COLORS.textLight }}>{esp}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginTop: 12, marginBottom: 8 }}>Niveles de Urgencia Atendida:</Text>
                    <View style={styles.animalChips}>
                      {[
                        { label: 'Rojo (Emergencia)', clave: 'critico' },
                        { label: 'Amarillo (Urgencia)', clave: 'urgente' },
                        { label: 'Verde (Consulta)', clave: 'no_urgente' },
                      ].map(urg => (
                        <TouchableOpacity key={urg.clave} style={[styles.animalChip, { backgroundColor: nivelesUrgencia.includes(urg.clave) ? '#E74C3C' : COLORS.grayLight }]} onPress={() => toggleArray(urg.clave, nivelesUrgencia, setNivelesUrgencia, 'urgencia')}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: nivelesUrgencia.includes(urg.clave) ? '#FFF' : COLORS.textLight }}>{urg.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </FormSection>
                  <Divider />
                </>
              )}

              {/* === CAMPOS DIFUSIÓN === */}
              {paso === 3 && categorias.includes('difusion_campanas') && (
                <>
                  <FormSection title="Apoyo de Difusión">
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Tipo de apoyo:</Text>
                    <View style={styles.animalChips}>
                      {['Jornada de vacunación', 'Esterilización', 'Adopción', 'Espacio para evento', 'Publicidad', 'Servicio profesional o tecnológico'].map(apoyo => (
                        <TouchableOpacity key={apoyo} style={[styles.animalChip, { backgroundColor: tipoApoyoDifusion.includes(apoyo) ? COLORS.secondary : COLORS.grayLight }]} onPress={() => toggleArray(apoyo, tipoApoyoDifusion, setTipoApoyoDifusion, 'apoyo_difusion')}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: tipoApoyoDifusion.includes(apoyo) ? COLORS.textDark : COLORS.textLight }}>{apoyo}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {tipoApoyoDifusion.includes('Servicio profesional o tecnológico') && (
                      <>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginTop: 12, marginBottom: 8 }}>Área de servicio profesional:</Text>
                        <View style={styles.animalChips}>
                          {['Tecnología e Ingeniería', 'Marketing y Comunicación', 'Diseño', 'Legal', 'Salud', 'Educación', 'Otro'].map(area => (
                            <TouchableOpacity key={area} style={[styles.animalChip, { backgroundColor: areaServicio === area ? COLORS.secondary : COLORS.grayLight }]} onPress={() => setAreaServicio(area)}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: areaServicio === area ? COLORS.textDark : COLORS.textLight }}>{area}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {areaServicio === 'Otro' && (
                          <View style={{ marginBottom: 12, marginTop: 4 }}>
                            <Input label="Especificar área de servicio" placeholder="Ej. Arquitectura" value={areaServicioOtro} onChangeText={setAreaServicioOtro} />
                          </View>
                        )}
                      </>
                    )}

                    <View style={{ marginBottom: 12, marginTop: 12 }}>
                      <Input label="Nombre del responsable de campaña *" placeholder="Ej. Juan Pérez" value={nombreContactoCampana} onChangeText={handleNombreContactoCampanaChange} />
                      {errors.nombreContactoCampana && <Text style={styles.errorText}>{errors.nombreContactoCampana}</Text>}
                    </View>
                    <View style={{ marginBottom: 12 }}>
                      <Input label="Cargo del responsable de campaña *" placeholder="Ej. Gerente de Marketing" value={cargoContactoCampana} onChangeText={setCargoContactoCampana} />
                    </View>
                  </FormSection>
                  <Divider />
                </>
              )}

              {/* ====== PASO 4 ====== */}
              {paso === 4 && (
                <>
                  <FormSection title="Zona de donación / operación" subtitle="Ubicación donde realizas operaciones (Opcional).">
                    <Input placeholder="Buscar dirección, ej. Avenida Reforma, Puebla" value={searchQuery} onChangeText={setSearchQuery} />
                    {isSearching && <Text style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>Buscando...</Text>}

                    {searchResults.length > 0 && (
                      <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, marginTop: 4, marginBottom: 4 }}>
                        {searchResults.map((result, idx) => (
                          <TouchableOpacity key={idx} onPress={() => handleSelectSearchResult(result)} style={{ padding: 12, borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1, borderBottomColor: '#ECF0F1' }}>
                            <Text style={{ fontSize: 13, color: COLORS.textDark }}>{result.display_name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <TouchableOpacity onPress={handleGetLocation} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
                      <Feather name="map-pin" size={14} color={COLORS.bgTeal} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 13, color: COLORS.bgTeal, fontWeight: '600' }}>
                        {isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}
                      </Text>
                    </TouchableOpacity>

                    <Text style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 8 }}>O ajusta directamente arrastrando el pin en el mapa:</Text>
                    <View style={styles.mapContainer}>
                      <LocationPickerMap
                        selectedPosition={latitud && longitud ? { latitud, longitud } : undefined}
                        onLocationSelect={handlePinLocationSelect}
                      />
                    </View>

                    {direccionConfirmada !== '' && (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EAF6FF', padding: 10, borderRadius: 8, marginTop: 8 }}>
                        <Feather name="map-pin" size={14} color={COLORS.textDark} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={{ fontSize: 12, color: COLORS.textDark, flex: 1 }}>
                          Ubicación seleccionada: <Text style={{ fontWeight: '600' }}>{direccionConfirmada}</Text>
                        </Text>
                      </View>
                    )}

                    <View style={{ marginTop: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 2 }}>
                          <Input label="Calle" placeholder="Ej. Francisco I. Madero" value={calleNombre} onChangeText={setCalleNombre} maxLength={100} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Input label="Número" placeholder="Ej. 2912" value={numero} onChangeText={setNumero} keyboardType="numeric" maxLength={10} />
                        </View>
                      </View>
                      <Input label="Colonia" placeholder="Ej. Viveros" value={colonia} onChangeText={setColonia} maxLength={50} />
                      <Input label="Municipio" placeholder="Ej. Puebla" value={municipio} onChangeText={setMunicipio} maxLength={50} />
                      <Input label="Estado" placeholder="Ej. Puebla" value={estadoUbicacion} onChangeText={setEstadoUbicacion} maxLength={50} />
                      <TouchableOpacity onPress={handleGeocodeManualFields} style={{ flexDirection: 'row', alignItems: 'center', marginTop: -8, marginBottom: 8 }}>
                        <Feather name="refresh-cw" size={13} color={COLORS.bgTeal} style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, color: COLORS.bgTeal, fontWeight: '600' }}>Mover el pin a esta dirección</Text>
                      </TouchableOpacity>
                      <View>
                        <Input label="Referencia (Opcional)" placeholder="Ej. Frente a la tienda de abarrotes..." value={referencia} onChangeText={setReferencia} maxLength={150} />
                        <Text style={{ textAlign: 'right', color: COLORS.textLight, fontSize: 12, marginTop: -12, marginBottom: 8 }}>{referencia.length}/150</Text>
                      </View>
                    </View>
                  </FormSection>

                  <Divider />

                  <FormSection title="Forma de colaboración" subtitle="Define si estás abierto a donar en este momento o prefieres pausar.">
                    <View style={styles.animalChips}>
                      {[
                        { id: 'Donaciones ocasionales', label: 'Ocasionales' },
                        { id: 'Capacidad recurrente', label: 'Recurrente' },
                        { id: 'Ambas', label: 'Ambas' }
                      ].map((opt) => {
                        const isSelected = formaColaboracion === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}
                            onPress={() => setFormaColaboracion(opt.id)}
                          >
                            <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </FormSection>

                  <Divider />

                  <FormSection title="Logística general" subtitle="¿Cómo realizas o recibes las donaciones?">
                    <View style={styles.animalChips}>
                      {[
                        { id: 'Puedo entregar', label: 'Puedo entregar' },
                        { id: 'Requiere recolección', label: 'Requieren recolectar' },
                        { id: 'Ambas', label: 'Ambas' }
                      ].map((opt) => {
                        const isSelected = logistica === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}
                            onPress={() => setLogistica(opt.id)}
                          >
                            <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </FormSection>
                </>
              )}

              {/* ====== PASO 5 ====== */}
              {paso === 5 && (
                <>
                  <FormSection title="Detalles del Perfil Público">
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
                    
                    <View style={{ marginBottom: 12 }}>
                      <Input label="Descripción pública (Opcional)" placeholder="Cuéntanos un poco sobre ti o tu negocio" value={descripcion} onChangeText={setDescripcion} />
                    </View>
                  </FormSection>

                  <Divider />

                  <FormSection title="Preferencia de visibilidad" subtitle="Elige cómo quieres que tu nombre aparezca públicamente.">
                    <View style={styles.animalChips}>
                      {[
                        { id: 'mostrar mi nombre', label: 'Mostrar mi nombre' },
                        { id: 'mostrar solo mi nombre de usuario', label: 'Solo mi alias' },
                        { id: 'donar anónimamente', label: 'Donar anónimamente' }
                      ].map((opt) => {
                        const isSelected = visibilidad === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.animalChip, { backgroundColor: isSelected ? COLORS.secondary : COLORS.grayLight }]}
                            onPress={() => setVisibilidad(opt.id)}
                          >
                            <Text style={{ fontWeight: '700', fontSize: 14, color: isSelected ? COLORS.textDark : COLORS.textLight }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {visibilidad !== 'donar anónimamente' && (
                      <View style={{ marginTop: 8 }}>
                        {renderCheckbox('Doy mi consentimiento para aparecer en el mural de impacto (reconocimiento público).', checkMural, setCheckMural)}
                      </View>
                    )}
                  </FormSection>

                  <Divider />
                  <FormSection title="Reglas y Condiciones">
                    {renderCheckbox('Acepto las reglas de entrega por mi seguridad y la del rescatista.', checkReglas, (v) => { setCheckReglas(v); setErrors(prev => ({ ...prev, reglas: '' })) })}
                    {errors.reglas && <Text style={styles.errorText}>{errors.reglas}</Text>}
                  </FormSection>
                </>
              )}

              {showSubmitError && <Text style={styles.submitError}>Revisa los campos en rojo arriba para continuar.</Text>}

              <View style={styles.stepNavigationRow}>
                <TouchableOpacity onPress={handleAnterior} style={[styles.navBtn, styles.navBtnSec]}>
                  <Text style={styles.navBtnSecText}>{paso === 1 ? 'Cancelar' : 'Atrás'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={paso === 5 ? handleGuardar : handleSiguiente} style={[styles.navBtn, styles.navBtnPri]}>
                  <Text style={styles.navBtnPriText}>
                    {paso === 5 ? (isSubmitting ? 'Guardando...' : 'Activar perfil') : 'Siguiente'}
                  </Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>

      {/* MODAL CONFLICTO CORREO */}
      <Modal visible={emailConflict} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>Correo en uso</Text>
            <Text style={styles.confirmMessage}>Detectamos que ya tienes una cuenta registrada con este correo electrónico.</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmButtonCancel} onPress={() => { setEmailConflict(false); handleCloseRequest(); router.push('/profile?abrirLogin=true' as any); }}>
                <Text style={styles.confirmButtonCancelText}>Iniciar sesión</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButtonExit} onPress={() => { setEmailConflict(false); setEmail(''); }}>
                <Text style={styles.confirmButtonExitText}>Usar otro</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CONFLICTO TELÉFONO */}
      <Modal visible={phoneConflict} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>Teléfono en uso</Text>
            <Text style={styles.confirmMessage}>Detectamos que ya tienes una cuenta registrada con este número de teléfono.</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmButtonCancel} onPress={() => { setPhoneConflict(false); handleCloseRequest(); router.push('/profile?abrirLogin=true' as any); }}>
                <Text style={styles.confirmButtonCancelText}>Iniciar sesión</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButtonExit} onPress={() => { setPhoneConflict(false); setTelefono(''); }}>
                <Text style={styles.confirmButtonExitText}>Usar otro</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

          <Modal visible={showCloseConfirm} transparent animationType="fade" onRequestClose={() => setShowCloseConfirm(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.confirmModal}>
                <Text style={styles.confirmTitle}>¿Seguro que deseas salir?</Text>
                <Text style={styles.confirmMessage}>Los datos ingresados se perderán.</Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity onPress={() => setShowCloseConfirm(false)} style={styles.confirmButtonCancel}>
                    <Text style={styles.confirmButtonCancelText}>Me quedo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowCloseConfirm(false); if (onClose) { onClose(); } else { router.back(); } }} style={styles.confirmButtonExit}>
                    <Text style={styles.confirmButtonExitText}>Sí, salir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Modal de horarios */}
          <Modal visible={campoHorarioActivo !== null} transparent animationType="fade" onRequestClose={() => setCampoHorarioActivo(null)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{campoHorarioActivo === 'apertura' ? 'Hora de apertura' : 'Hora de cierre'}</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
                  {HORAS_DISPONIBLES.map((hora) => (
                    <TouchableOpacity key={hora} onPress={() => { if (campoHorarioActivo === 'apertura') { setHoraApertura(hora); } else { setHoraCierre(hora); }; setCampoHorarioActivo(null); }} style={styles.horaOption}>
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

        </View>
      </View>
      )}
    </View>
  );
}

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

const styles = StyleSheet.create({
  outerContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  centeredContent: { width: '100%', maxWidth: FORM_MAX_WIDTH, maxHeight: '90%', alignSelf: 'center' },
  cardContainer: { flex: 1, backgroundColor: COLORS.bgWhite, borderRadius: 32, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 15, flexDirection: 'column', margin: 16 },
  headerSection: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32, backgroundColor: COLORS.bgTeal, position: 'relative', zIndex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: COLORS.bgWhite },
  headerSubtitle: { fontSize: 13, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9, marginTop: 4 },
  closeButton: { backgroundColor: 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 20 },
  bodySection: { flex: 1, backgroundColor: COLORS.bgWhite, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 20, zIndex: 2 },
  scrollContent: { paddingBottom: 40 },
  formSection: { marginBottom: 16 },
  formSectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, marginBottom: 4 },
  formSectionSubtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: 16, lineHeight: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 },
  readOnlyBox: { backgroundColor: COLORS.grayLight, padding: 16, borderRadius: 16 },
  readOnlyText: { fontSize: 16, color: COLORS.textDark, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: 8 },
  animalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  animalChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  errorText: { color: COLORS.danger, fontSize: 12, marginTop: 4, marginBottom: 16 },
  mapContainer: { borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  submitError: { color: COLORS.danger, textAlign: 'center', marginBottom: 12, fontWeight: '700', fontSize: 14 },
  submitButton: { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 24, alignItems: 'center', marginBottom: 16 },
  submitButtonText: { color: COLORS.bgWhite, fontWeight: '900', fontSize: 18 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  confirmModal: { backgroundColor: COLORS.bgWhite, borderRadius: 32, padding: 32, width: '100%', maxWidth: 400 },
  confirmTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 12 },
  confirmMessage: { fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  confirmButtons: { flexDirection: 'row', gap: 12 },
  confirmButtonCancel: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.grayLight, alignItems: 'center' },
  confirmButtonCancelText: { color: COLORS.textDark, fontWeight: '700' },
  confirmButtonExit: { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: COLORS.danger, alignItems: 'center' },
  confirmButtonExitText: { color: COLORS.bgWhite, fontWeight: '700' },
  stepNavigationRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 16 },
  navBtn: { flex: 1, paddingVertical: 16, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  navBtnSec: { backgroundColor: COLORS.grayLight },
  navBtnSecText: { color: COLORS.textDark, fontWeight: '800', fontSize: 16 },
  navBtnPri: { backgroundColor: COLORS.primary },
  navBtnPriText: { color: COLORS.bgWhite, fontWeight: '900', fontSize: 16 },
  daysContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  dayChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  dayChipText: { fontWeight: '700', fontSize: 13 },
  timeContainer: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  timeLabel: { fontSize: 12, color: COLORS.textLight, marginBottom: 4, fontWeight: '700' },
  timeButton: { backgroundColor: COLORS.grayLight, borderRadius: 16, padding: 16 },
  timeButtonText: { fontWeight: '600' },
  modalContent: { backgroundColor: COLORS.bgWhite, width: '100%', maxWidth: 400, borderRadius: 24, padding: 32, maxHeight: '60%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', marginBottom: 20 },
  modalScroll: { marginBottom: 16 },
  horaOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  horaText: { fontSize: 16, color: COLORS.textDark, textAlign: 'center', fontWeight: '500' },
  modalCancel: { alignItems: 'center', marginTop: 20, backgroundColor: COLORS.grayLight, padding: 16, borderRadius: 20 },
  modalCancelText: { color: COLORS.textDark, fontWeight: '700' },
  halfWidth: { flex: 1 },
});
