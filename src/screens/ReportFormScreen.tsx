import { Feather, Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Image, Modal, Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Toast, useToast } from '../components/Toast';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { AnimalIcon } from '../components/profile/AnimalIcon';
import { AnimalThumbnailStrip, DuplicadoAnimal } from '../components/common/AnimalThumbnailStrip';
import { API_URL } from '../constants/api';
import { petzen } from '../constants/petzenTheme';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import CrearCuentaInvitadoFlow from './CrearCuentaInvitadoFlow';

type TipoAnimal = 'Perro' | 'Gato' | 'Otro' | null;
type Condition = 'green' | 'yellow' | 'red' | null;
type Size = 'Pequeño' | 'Mediano' | 'Grande' | null;
type Sexo = 'Macho' | 'Hembra' | 'Desconocido' | null;
type Edad = 'Cachorro' | 'Joven' | 'Adulto' | 'Senior' | 'Desconocido' | null;

interface AnimalFoto {
  id: string;
  foto_url: string;
  descripcion: string;
  orden: number;
  // A qué animal (AnimalDraft.id) pertenece esta foto — un caso puede
  // traer varios animales, cada uno con sus propias fotos.
  animalLocalId: string;
}

// Un animal (o grupo homogéneo) capturado dentro del caso. Un reporte puede
// traer varios de estos combinados: fichas individuales y grupos a la vez.
interface AnimalDraft {
  id: string;
  esGrupo: boolean;
  cantidad: number; // 1 en modo individual; >1 en modo grupo
  tipoAnimal: TipoAnimal;
  subcategoria: string | null;
  especieDescripcion: string;
  condition: Condition;
  size: Size;
  sexo: Sexo;
  edad: Edad;
  tieneCollar: boolean | null;
  estaPrenada: boolean | null;
  traeCriasNacidas: boolean | null;
  numeroCriasNacidas: string;
  esAgresivo: boolean | null;
  esDomestico: boolean | null;
  raza: string | null;
  description: string;
}

function nuevoAnimalDraft(esGrupo: boolean = false): AnimalDraft {
  return {
    id: Math.random().toString(36).substring(2, 9),
    esGrupo,
    cantidad: esGrupo ? 2 : 1,
    tipoAnimal: null,
    subcategoria: null,
    especieDescripcion: '',
    condition: null,
    size: null,
    sexo: null,
    edad: null,
    tieneCollar: null,
    estaPrenada: null,
    traeCriasNacidas: null,
    numeroCriasNacidas: '',
    esAgresivo: null,
    esDomestico: null,
    raza: null,
    description: '',
  };
}

interface DuplicadoInfo {
  existente: any;
  tiempoTexto: string;
  escenario: 1 | 2;
  animales: DuplicadoAnimal[];
}

interface ReportFormScreenProps {
  onClose?: () => void;
}

const PASO_NOMBRES = ['Ubicación', 'Animal(es)', 'Tus datos'];
const TOTAL_PASOS = 3;

// Sub-pantallas dentro del Paso 2. `pregunta-*` son las preguntas del árbol
// de decisión (solo se recorren para el primer animal); `ficha`/`grupo` son
// las pantallas de captura; `grupo-distinto` es la pregunta de seguimiento
// al terminar un grupo; `resumen` es el panel con lo ya agregado.
type VistaPaso2 = 'pregunta-multi' | 'pregunta-especie' | 'pregunta-parecidos' | 'ficha' | 'grupo' | 'grupo-distinto' | 'resumen';

export default function ReportFormScreen({ onClose }: ReportFormScreenProps) {
  const { user, isLoggedIn, logout, login, token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width: winWidth } = useWindowDimensions();
  const isDesktopModal = winWidth >= 768;

  // ─── Navegación por pasos ───
  const [paso, setPaso] = useState(1);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // ─── Datos del reportante ───
  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [guestFound, setGuestFound] = useState(false);

  // ─── Estado de envío ───
  const [duplicadoInfo, setDuplicadoInfo] = useState<DuplicadoInfo | null>(null);
  const [resultadoEnvio, setResultadoEnvio] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mostrarCrearCuenta, setMostrarCrearCuenta] = useState(false);

  // ─── Modal de login inline ───
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // ─── Animal(es) del caso ───
  // `animales` ya está confirmado (agregado al reporte); `borrador` es la
  // ficha o el grupo que se está llenando en este momento.
  const [animales, setAnimales] = useState<AnimalDraft[]>([]);
  const [vistaPaso2, setVistaPaso2] = useState<VistaPaso2>('pregunta-multi');
  const [borrador, setBorrador] = useState<AnimalDraft>(nuevoAnimalDraft());

  // ─── Fotos — un solo arreglo para todo el caso, cada foto etiquetada con
  // el animal (AnimalDraft.id) al que pertenece ───
  const [fotos, setFotos] = useState<AnimalFoto[]>([]);
  const [isValidatingFoto, setIsValidatingFoto] = useState(false);

  // ─── Ubicación ───
  const [pinLocation, setPinLocation] = useState<{ latitud: number; longitud: number }>({
    latitud: 19.0414,
    longitud: -98.2063,
  });
  const [ubicacionConfirmada, setUbicacionConfirmada] = useState(false);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [calleNombre, setCalleNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [referencia, setReferencia] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [direccionConfirmada, setDireccionConfirmada] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [estadoUbicacion, setEstadoUbicacion] = useState('');

  // ─── Pre-rellenar con datos del usuario logueado ───
  useEffect(() => {
    if (isLoggedIn && user) {
      setNombre(user.nombre);
      setApellidoPaterno(user.apellido_paterno);
      setApellidoMaterno(user.apellido_materno ?? '');
      setTelefono(user.telefono);
      setEmail(user.email);
    } else {
      setNombre('');
      setApellidoPaterno('');
      setApellidoMaterno('');
      setTelefono('');
      setEmail('');
    }
  }, [isLoggedIn, user]);

  // ─── GPS al montar ───
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const currentLocation = await Location.getCurrentPositionAsync({});
          setPinLocation({
            latitud: currentLocation.coords.latitude,
            longitud: currentLocation.coords.longitude,
          });
          setUbicacionConfirmada(true);
          reverseGeocode(currentLocation.coords.latitude, currentLocation.coords.longitude);
        }
      } catch {
        // Si falla, el mapa queda en el centro de Puebla.
      }
    })();
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
      // Si falla no bloqueamos el flujo.
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
      setPinLocation({
        latitud: currentLocation.coords.latitude,
        longitud: currentLocation.coords.longitude,
      });
      setUbicacionConfirmada(true);
      setErrors((prev) => ({ ...prev, ubicacion: '' }));
      reverseGeocode(currentLocation.coords.latitude, currentLocation.coords.longitude);
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos obtener tu ubicación GPS. Ajusta el pin directamente en el mapa.' });
    } finally {
      setIsLoadingGps(false);
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
        setPinLocation({ latitud: parseFloat(result.lat), longitud: parseFloat(result.lon) });
        setUbicacionConfirmada(true);
        setEstadoUbicacion(address.state || '');
        setDireccionConfirmada(result.display_name);
        setErrors((prev) => ({ ...prev, ubicacion: '' }));
      } else {
        showToast({ type: 'warning', title: 'No encontrado', message: 'No pudimos ubicar esa dirección exacta. Ajusta el pin manualmente en el mapa.' });
      }
    } catch {
      showToast({ type: 'error', title: 'Error', message: 'No pudimos buscar esa dirección. Ajusta el pin manualmente en el mapa.' });
    }
  };

  const handlePinLocationSelect = (latitud: number, longitud: number) => {
    setPinLocation({ latitud, longitud });
    setUbicacionConfirmada(true);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
    reverseGeocode(latitud, longitud);
  };

  const handleSelectSearchResult = (result: any) => {
    const address = result.address || {};
    setPinLocation({ latitud: parseFloat(result.lat), longitud: parseFloat(result.lon) });
    setUbicacionConfirmada(true);
    setCalleNombre(address.road || address.pedestrian || address.square || address.footway || address.path || result.name || '');
    setNumero(address.house_number || '');
    setColonia(address.suburb || address.neighbourhood || address.colonia || address.city_district || address.quarter || address.residential || address.village || address.hamlet || address.borough || '');
    setMunicipio(address.city || address.town || address.municipality || address.county || '');
    setEstadoUbicacion(address.state || '');
    setDireccionConfirmada(result.display_name);
    setSearchQuery('');
    setSearchResults([]);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
  };

  // ─── Fotos (por animal) ───
  const captureFoto = async (fromCamera: boolean, animalLocalId: string) => {
    const requestPermission = fromCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const permissionResult = await requestPermission();
    if (!permissionResult.granted) {
      showToast({ type: 'warning', title: 'Permiso denegado', message: 'Necesitamos los permisos necesarios para realizar esta acción.' });
      return;
    }
    const launchMethod = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launchMethod({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (!result.canceled) {
      const asset = result.assets[0];
      const manipulated = await manipulateAsync(asset.uri, [], { compress: 0.8, format: SaveFormat.JPEG });

      setIsValidatingFoto(true);
      try {
        const formData = new FormData();
        if (Platform.OS === 'web') {
          const res = await fetch(manipulated.uri);
          const blob = await res.blob();
          formData.append('foto', blob, `check_${Date.now()}.jpg`);
        } else {
          formData.append('foto', { uri: manipulated.uri, name: `check_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
        }
        const { data } = await axios.post(`${API_URL}/reports/validar-foto`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (!data.valido) {
          showToast({ type: 'warning', title: 'Foto no válida', message: data.mensaje });
          return;
        }
      } catch {
        // Fallo de red del pre-check: no bloquea (fail-open), igual que el
        // backend cuando el análisis de Gemini falla técnicamente.
      } finally {
        setIsValidatingFoto(false);
      }

      setFotos((prev) => {
        const ordenSiguiente = prev.filter((f) => f.animalLocalId === animalLocalId).length + 1;
        const newFoto: AnimalFoto = {
          id: Math.random().toString(36).substring(2, 9),
          foto_url: manipulated.uri,
          descripcion: '',
          orden: ordenSiguiente,
          animalLocalId,
        };
        return [...prev, newFoto];
      });
      setErrors((prev) => ({ ...prev, foto: '' }));
    }
  };

  const handleAddFoto = (animalLocalId: string) => {
    if (Platform.OS === 'web') {
      captureFoto(false, animalLocalId);
      return;
    }
    // En native usamos Toast en lugar de Alert para consistencia
    // pero Alert es necesario aquí para opciones múltiples
    const { Alert } = require('react-native');
    Alert.alert('Agregar Foto del animalito', '¿Qué deseas hacer?', [
      { text: 'Tomar Foto', onPress: () => captureFoto(true, animalLocalId) },
      { text: 'Elegir de Galería', onPress: () => captureFoto(false, animalLocalId) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleUpdateFotoDesc = (id: string, text: string) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, descripcion: text } : f)));
  };

  const handleDeleteFoto = (id: string) => {
    setFotos((prev) => prev.filter((f) => f.id !== id));
  };

  // ─── Borrador del animal/grupo en edición ───
  const actualizarBorrador = (patch: Partial<AnimalDraft>) => {
    setBorrador((prev) => ({ ...prev, ...patch }));
  };

  const copiarDeAnterior = (anterior: AnimalDraft) => {
    actualizarBorrador({
      tipoAnimal: anterior.tipoAnimal,
      size: anterior.size,
      sexo: anterior.sexo,
      edad: anterior.edad,
      tieneCollar: anterior.tieneCollar,
      raza: anterior.raza,
      subcategoria: anterior.subcategoria,
      especieDescripcion: anterior.especieDescripcion,
    });
  };

  const iniciarFichaIndividual = () => {
    setBorrador(nuevoAnimalDraft(false));
    setErrors({});
    setVistaPaso2('ficha');
  };

  const iniciarGrupo = () => {
    setBorrador(nuevoAnimalDraft(true));
    setErrors({});
    setVistaPaso2('grupo');
  };

  const cancelarBorrador = () => {
    // Limpia fotos huérfanas del borrador que se está cancelando.
    setFotos((prev) => prev.filter((f) => f.animalLocalId !== borrador.id));
    setErrors({});
    setVistaPaso2(animales.length > 0 ? 'resumen' : 'pregunta-multi');
  };

  const editarAnimal = (index: number) => {
    const a = animales[index];
    setBorrador(a);
    setAnimales((prev) => prev.filter((_, i) => i !== index));
    setErrors({});
    setVistaPaso2(a.esGrupo ? 'grupo' : 'ficha');
  };

  const eliminarAnimal = (index: number) => {
    const a = animales[index];
    setAnimales((prev) => prev.filter((_, i) => i !== index));
    setFotos((prev) => prev.filter((f) => f.animalLocalId !== a.id));
  };

  // ─── Validación de ficha individual / grupo ───
  const validarFicha = (d: AnimalDraft): boolean => {
    const newErrors: { [key: string]: string } = {};
    const fotosDelAnimal = fotos.filter((f) => f.animalLocalId === d.id);
    if (fotosDelAnimal.length === 0) newErrors.foto = 'Agrega al menos una foto de este animal.';
    if (!d.condition) newErrors.condition = 'Indica la condición del animal.';
    if (!d.tipoAnimal) newErrors.tipoAnimal = 'Selecciona un tipo de animal.';
    if (!d.sexo) newErrors.sexo = 'Indica el sexo del animal.';
    if (!d.edad) newErrors.edad = 'Indica la edad aproximada.';
    if (!d.size) newErrors.size = 'Indica el tamaño del animal.';
    if (d.tipoAnimal === 'Perro') {
      if (d.tieneCollar === null) newErrors.tieneCollar = 'Indica si tiene collar.';
      if (d.esAgresivo === null) newErrors.esAgresivo = 'Indica si parece agresivo.';
      if (!d.raza) newErrors.raza = 'Selecciona la raza aproximada.';
      if (d.sexo === 'Hembra') {
        if (d.estaPrenada === null) newErrors.estaPrenada = 'Indica si está preñada.';
        if (d.traeCriasNacidas === null) newErrors.traeCriasNacidas = 'Indica si trae crías con ella.';
      }
    } else if (d.tipoAnimal === 'Gato') {
      if (d.tieneCollar === null) newErrors.tieneCollar = 'Indica si tiene collar.';
      if (d.esDomestico === null) newErrors.esDomestico = 'Indica si es dócil/doméstico.';
      if (!d.raza) newErrors.raza = 'Selecciona la raza aproximada.';
      if (d.sexo === 'Hembra') {
        if (d.estaPrenada === null) newErrors.estaPrenada = 'Indica si está preñada.';
        if (d.traeCriasNacidas === null) newErrors.traeCriasNacidas = 'Indica si trae crías con ella.';
      }
    } else if (d.tipoAnimal === 'Otro') {
      if (!d.subcategoria) newErrors.subcategoria = 'Selecciona la subcategoría.';
      if (d.subcategoria === 'Otro' && !d.especieDescripcion.trim()) newErrors.especieDescripcion = 'Describe la especie del animal.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarGrupo = (d: AnimalDraft): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!d.tipoAnimal) newErrors.tipoAnimal = 'Selecciona un tipo de animal.';
    if (!d.condition) newErrors.condition = 'Indica la condición general.';
    if (!d.size) newErrors.size = 'Indica el tamaño general.';
    if (!d.edad) newErrors.edad = 'Indica la edad aproximada general.';
    if (!d.cantidad || d.cantidad < 2) newErrors.cantidad = 'La cantidad debe ser mayor a 1 — si es solo uno, usa ficha individual.';
    if (d.tipoAnimal === 'Otro') {
      if (!d.subcategoria) newErrors.subcategoria = 'Selecciona la subcategoría.';
      if (d.subcategoria === 'Otro' && !d.especieDescripcion.trim()) newErrors.especieDescripcion = 'Describe la especie del animal.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const confirmarFicha = () => {
    if (!validarFicha(borrador)) return;
    setAnimales((prev) => [...prev, borrador]);
    setErrors({});
    setVistaPaso2('resumen');
  };

  const confirmarGrupo = () => {
    if (!validarGrupo(borrador)) return;
    setAnimales((prev) => [...prev, borrador]);
    setErrors({});
    setVistaPaso2('grupo-distinto');
  };

  // ─── Validación por paso ───
  const validarPaso1 = () => {
    const newErrors: { [key: string]: string } = {};
    if (!ubicacionConfirmada) newErrors.ubicacion = 'Busca la dirección, usa el GPS, o ajusta el pin en el mapa.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validarPaso2 = () => {
    if (animales.length === 0) {
      showToast({ type: 'warning', title: 'Falta información', message: 'Agrega al menos un animal antes de continuar.' });
      return false;
    }
    return true;
  };

  const validarPaso3 = () => {
    if (isLoggedIn && user) return true;
    const newErrors: { [key: string]: string } = {};
    if (!nombre.trim()) newErrors.nombre = 'El nombre es obligatorio.';
    if (!apellidoPaterno.trim()) newErrors.apellidoPaterno = 'El apellido paterno es obligatorio.';
    if (!telefono.trim()) {
      newErrors.telefono = 'El teléfono es obligatorio.';
    } else if (!/^\d{10}$/.test(telefono.trim())) {
      newErrors.telefono = 'El teléfono debe tener exactamente 10 dígitos numéricos.';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Ingresa un correo electrónico válido.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSiguiente = () => {
    let valido = false;
    if (paso === 1) valido = validarPaso1();
    if (paso === 2) valido = validarPaso2();
    if (valido) {
      setErrors({});
      setPaso(paso + 1);
    }
  };

  const handleAnterior = () => {
    setErrors({});
    if (paso === 1) {
      handleCloseRequest();
    } else {
      setPaso(paso - 1);
    }
  };

  const hasUnsavedChanges = () => {
    return animales.length > 0 || nombre.trim() !== '' || ubicacionConfirmada;
  };

  const handleCloseRequest = () => {
    if (hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      if (onClose) onClose();
    }
  };

  // ─── Mapeos ───
  const mapCondicion = (c: Condition): string => ({ green: 'estable', yellow: 'herido', red: 'grave' }[c!]);
  const mapTipoAnimal = (t: TipoAnimal): string => t!.toLowerCase();
  const mapTamanio = (s: Size): string => ({ Pequeño: 'pequeno', Mediano: 'mediano', Grande: 'grande' }[s!]);

  const mapRaza = (r: string, tipo: TipoAnimal) => {
    if (tipo === 'Perro') {
      const map: any = { Mestizo: 'mestizo', Labrador: 'labrador', Pitbull: 'pitbull', 'Pastor Alemán': 'pastor aleman', Chihuahua: 'chihuahua', Otro: 'otro_perro' };
      return map[r];
    } else {
      const map: any = { Común: 'comun', Siamés: 'siames', Persa: 'persa', Otro: 'otro_gato' };
      return map[r];
    }
  };

  const mapSubcategoria = (s: string) => {
    const map: any = { Ave: 'ave', Reptil: 'reptil', Roedor: 'roedor', 'Fauna silvestre': 'fauna silvestre', Otro: 'otro' };
    return map[s];
  };

  const mapAnimalDraftToPayload = (d: AnimalDraft) => {
    const payload: any = {
      tipo_animal: mapTipoAnimal(d.tipoAnimal),
      condicion: mapCondicion(d.condition),
      tamanio: mapTamanio(d.size),
      sexo: d.sexo ? d.sexo.toLowerCase() : 'desconocido',
      edad_aproximada: d.edad ? d.edad.toLowerCase() : 'desconocido',
      es_grupo: d.esGrupo,
      cantidad: d.esGrupo ? d.cantidad : 1,
    };
    if (d.tipoAnimal === 'Perro' || d.tipoAnimal === 'Gato') {
      if (d.tieneCollar !== null) payload.tiene_collar = d.tieneCollar;
      if (d.raza) payload.raza_clave = mapRaza(d.raza, d.tipoAnimal);
      if (!d.esGrupo && d.sexo === 'Hembra') {
        if (d.estaPrenada !== null) payload.esta_prenada = d.estaPrenada;
        if (d.traeCriasNacidas !== null) payload.trae_crias_nacidas = d.traeCriasNacidas;
        if (d.traeCriasNacidas && d.numeroCriasNacidas.trim()) {
          const n = parseInt(d.numeroCriasNacidas, 10);
          if (!isNaN(n)) payload.numero_crias_nacidas = n;
        }
      }
      if (d.tipoAnimal === 'Perro' && d.esAgresivo !== null) payload.es_agresivo = d.esAgresivo;
      if (d.tipoAnimal === 'Gato' && d.esDomestico !== null) payload.es_domestico_probable = d.esDomestico;
    } else if (d.tipoAnimal === 'Otro') {
      if (d.subcategoria) payload.tipo_animal_otro_clave = mapSubcategoria(d.subcategoria);
      if (d.subcategoria === 'Otro' && d.especieDescripcion.trim()) payload.especie_descripcion = d.especieDescripcion.trim();
    }
    if (d.description.trim()) payload.descripcion = d.description.trim();
    return payload;
  };

  // ─── Envío ───
  const handleSubmit = async (esDuplicadoConfirmado: boolean = false, reporteOriginalId?: string) => {
    if (!esDuplicadoConfirmado && !validarPaso3()) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('nombre', nombre);
      formData.append('apellido_paterno', apellidoPaterno);
      if (apellidoMaterno.trim()) formData.append('apellido_materno', apellidoMaterno);
      formData.append('telefono', telefono);
      if (email.trim()) formData.append('email', email);

      formData.append('animales', JSON.stringify(animales.map(mapAnimalDraftToPayload)));

      // Fotos de todos los animales, aplanadas — cada una lleva el índice
      // (posición dentro de `animales`) del animal al que pertenece, para
      // que el backend las reparta correctamente entre las filas de `animal`.
      const fotosOrdenadas: AnimalFoto[] = [];
      const fotosAnimalIndex: number[] = [];
      animales.forEach((a, idx) => {
        fotos.filter((f) => f.animalLocalId === a.id).forEach((f) => {
          fotosOrdenadas.push(f);
          fotosAnimalIndex.push(idx);
        });
      });

      if (Platform.OS === 'web') {
        for (const f of fotosOrdenadas) {
          const res = await fetch(f.foto_url);
          const blob = await res.blob();
          formData.append('fotos', blob, `foto_${f.id}_${Date.now()}.jpg`);
        }
      } else {
        fotosOrdenadas.forEach((f) => {
          formData.append('fotos', { uri: f.foto_url, name: `foto_${f.id}_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
        });
      }

      formData.append('fotos_descripciones', JSON.stringify(fotosOrdenadas.map((f) => f.descripcion || null)));
      formData.append('fotos_ordenes', JSON.stringify(fotosOrdenadas.map((f) => f.orden)));
      formData.append('fotos_animal_index', JSON.stringify(fotosAnimalIndex));

      if (referencia.trim()) formData.append('referencia', referencia);
      formData.append('latitud', String(pinLocation.latitud));
      formData.append('longitud', String(pinLocation.longitud));
      if (calleNombre.trim() || numero.trim()) {
        formData.append('calle', [calleNombre, numero].filter((p) => p.trim()).join(' '));
      }
      if (colonia.trim()) formData.append('colonia', colonia.trim());
      if (municipio.trim()) formData.append('municipio', municipio.trim());
      if (estadoUbicacion.trim()) formData.append('estado_ubicacion', estadoUbicacion.trim());
      if (esDuplicadoConfirmado) formData.append('es_duplicado_confirmado', 'true');
      if (reporteOriginalId) formData.append('reporte_original_id', reporteOriginalId);

      const response = await axios.post(`${API_URL}/reports`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(isLoggedIn && token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = response.data;

      if (data.posible_duplicado) {
        const existente = data.reporte_existente;
        const diffMs = new Date().getTime() - new Date(existente.created_at).getTime();
        const minutosTranscurridos = Math.round(diffMs / 60000);
        let tiempoTexto = `${minutosTranscurridos} minutos`;
        if (minutosTranscurridos >= 60) {
          const horas = Math.floor(minutosTranscurridos / 60);
          const minutos = minutosTranscurridos % 60;
          tiempoTexto = `${horas} hora(s) y ${minutos} minuto(s)`;
        }
        setDuplicadoInfo({
          existente,
          tiempoTexto,
          escenario: data.escenario === 2 ? 2 : 1,
          animales: existente.animales ?? [],
        });
        return;
      }

      if (data.asociacion_asignada) {
        setResultadoEnvio(`Tu reporte fue asignado a: ${data.asociacion_asignada}`);
      } else if (data.contactos_emergencia && data.contactos_emergencia.length > 0) {
        const contactos = data.contactos_emergencia.map((c: any) => `${c.nombre}: ${c.telefono}`).join('\n');
        setResultadoEnvio(`No hay asociaciones disponibles en tu zona.\n\nContactos de emergencia:\n${contactos}`);
      } else {
        // Mensaje por defecto para perros, gatos o subcategoría "Otro"
        let mensajeFinal = 'Tu reporte fue publicado. No encontramos asociaciones ni contactos de emergencia en tu zona. Te recomendamos contactar a tu Ayuntamiento local o Protección Civil municipal.';

        // Mensaje personalizado si algún animal del caso es especie "Otro"
        const otroConSubcategoria = animales.find((a) => a.tipoAnimal === 'Otro' && a.subcategoria);
        if (otroConSubcategoria) {
          switch (otroConSubcategoria.subcategoria) {
            case 'Ave':
              mensajeFinal = 'Tu reporte fue publicado. Actualmente no contamos con asociaciones especializadas en aves en nuestra red. Te recomendamos contactar a Protección Civil o buscar un veterinario de especies exóticas.';
              break;
            case 'Reptil':
              mensajeFinal = 'Tu reporte fue publicado. El manejo de reptiles requiere capacitación específica con la que nuestras asociaciones no cuentan actualmente. Por favor, contacta a Protección Civil de tu municipio.';
              break;
            case 'Roedor':
              mensajeFinal = 'Tu reporte fue publicado. Por el momento no manejamos rescates de pequeños roedores. Te sugerimos acudir a clínicas veterinarias de fauna exótica cercanas.';
              break;
            case 'Fauna silvestre':
              mensajeFinal = 'Tu reporte fue publicado. No manejamos el rescate de fauna silvestre ya que, por ley, requiere la intervención de autoridades federales. Por favor, reporta este caso a PROFEPA o Protección Civil.';
              break;
          }
        }

        setResultadoEnvio(mensajeFinal);
      }
    } catch (error: any) {
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido';
      showToast({ type: 'error', title: 'Error', message: mensaje });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Login inline desde el formulario ───
  const handleLoginInline = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      showToast({ type: 'warning', title: 'Datos incompletos', message: 'Ingresa tu correo y contraseña.' });
      return;
    }
    setIsLoggingIn(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      setShowLoginModal(false);
      setLoginEmail('');
      setLoginPassword('');
      showToast({ type: 'success', title: '¡Bienvenida!', message: 'Sesión iniciada. Tus datos fueron autorellenados.' });
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'Correo o contraseña incorrectos' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ─── Renderizadores de selectores ───
  const renderSelector = (label: string, options: string[], stateValue: any, setState: any, error?: string) => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>{label} <Text style={{ color: '#E74C3C' }}>*</Text></Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((opt) => (
          <TouchableOpacity key={opt} onPress={() => setState(opt)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: stateValue === opt ? petzen.colors.teal : '#FFFFFF', borderColor: error ? '#E74C3C' : (stateValue === opt ? petzen.colors.teal : '#BDC3C7'), alignItems: 'center' }}>
            <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 14, color: stateValue === opt ? '#FFFFFF' : '#7F8C8D' }}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {error && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );

  const renderBooleanSelector = (label: string, value: boolean | null, setValue: (v: boolean) => void, error?: string) => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>{label} <Text style={{ color: '#E74C3C' }}>*</Text></Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={() => setValue(true)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: value === true ? petzen.colors.teal : '#FFFFFF', borderColor: error ? '#E74C3C' : (value === true ? petzen.colors.teal : '#BDC3C7'), alignItems: 'center' }}>
          <Text style={{ color: value === true ? '#FFFFFF' : '#7F8C8D', fontWeight: '500' }}>Sí</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setValue(false)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: value === false ? petzen.colors.teal : '#FFFFFF', borderColor: error ? '#E74C3C' : (value === false ? petzen.colors.teal : '#BDC3C7'), alignItems: 'center' }}>
          <Text style={{ color: value === false ? '#FFFFFF' : '#7F8C8D', fontWeight: '500' }}>No</Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );

  // Semáforo de condición — reusado por la ficha individual y el modo grupo.
  const renderSemaforo = (
    value: Condition,
    onChange: (c: Condition) => void,
    error?: string,
    titulo: string = 'Condición del animal',
    ayuda: string = '¿Cómo se ve el animal en este momento?',
  ) => (
    <Card>
      <Text style={{ fontSize: 16, fontFamily: petzen.fonts.bold, color: '#2C3E50', marginBottom: 4 }}>
        {titulo} <Text style={{ color: '#E74C3C' }}>*</Text>
      </Text>
      <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>{ayuda}</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', backgroundColor: '#ECF0F1', paddingVertical: 14, borderRadius: 40, borderWidth: error ? 1 : 0, borderColor: '#E74C3C' }}>
        <TouchableOpacity onPress={() => onChange('green')} style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: value === 'green' ? '#27AE60' : '#A9DFBF', borderWidth: value === 'green' ? 4 : 2, borderColor: value === 'green' ? '#1E8449' : '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: value === 'green' ? '#27AE60' : 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: value === 'green' ? 10 : 0 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 11, color: value === 'green' ? '#FFFFFF' : '#1E8449' }}>Estable</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onChange('yellow')} style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: value === 'yellow' ? '#F39C12' : '#F9E79F', borderWidth: value === 'yellow' ? 4 : 2, borderColor: value === 'yellow' ? '#D68910' : '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: value === 'yellow' ? '#F39C12' : 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: value === 'yellow' ? 10 : 0 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 11, color: value === 'yellow' ? '#FFFFFF' : '#D68910' }}>Herido</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onChange('red')} style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: value === 'red' ? '#E74C3C' : '#F5B7B1', borderWidth: value === 'red' ? 4 : 2, borderColor: value === 'red' ? '#CB4335' : '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: value === 'red' ? '#E74C3C' : 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: value === 'red' ? 10 : 0 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 11, color: value === 'red' ? '#FFFFFF' : '#CB4335' }}>Grave</Text>
          </View>
        </TouchableOpacity>
      </View>

      {value === 'green' && (
        <View style={{ marginTop: 12, backgroundColor: '#EAFAF1', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#27AE60', flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('../../assets/images/estable.png')} style={{ width: 60, height: 60, marginRight: 12 }} resizeMode="contain" />
          <Text style={{ flex: 1, fontSize: 12, color: '#1E8449', lineHeight: 18 }}>
            <Text style={{ fontWeight: 'bold' }}>Estable:</Text> Caminando, alerta, sin heridas visibles, probablemente extraviado.
          </Text>
        </View>
      )}
      {value === 'yellow' && (
        <View style={{ marginTop: 12, backgroundColor: '#FEF9E7', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#F39C12', flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('../../assets/images/herido.png')} style={{ width: 60, height: 60, marginRight: 12 }} resizeMode="contain" />
          <Text style={{ flex: 1, fontSize: 12, color: '#D68910', lineHeight: 18 }}>
            <Text style={{ fontWeight: 'bold' }}>Herido:</Text> Cojeando, con heridas superficiales, desnutrición visible o desorientado.
          </Text>
        </View>
      )}
      {value === 'red' && (
        <View style={{ marginTop: 12, backgroundColor: '#FDEDEC', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#E74C3C', flexDirection: 'row', alignItems: 'center' }}>
          <Image source={require('../../assets/images/grave.png')} style={{ width: 60, height: 60, marginRight: 12 }} resizeMode="contain" />
          <Text style={{ flex: 1, fontSize: 12, color: '#CB4335', lineHeight: 18 }}>
            <Text style={{ fontWeight: 'bold' }}>Grave:</Text> Atropellado, incapaz de moverse, con sangrado activo o en riesgo inminente.
          </Text>
        </View>
      )}
      {error && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 6 }}>{error}</Text>}
    </Card>
  );

  // Tarjeta de fotos — reusada por la ficha individual (obligatoria) y el
  // modo grupo (opcional, "foto grupal").
  const renderFotosCard = (animalLocalId: string, opcional: boolean = false) => {
    const fotosDelAnimal = fotos.filter((f) => f.animalLocalId === animalLocalId);
    return (
      <Card>
        <Text style={{ fontSize: 16, fontFamily: petzen.fonts.bold, color: '#2C3E50', marginBottom: 4 }}>
          {opcional ? 'Foto grupal (Opcional)' : 'Foto del animalito'} {!opcional && <Text style={{ color: '#E74C3C' }}>*</Text>}
        </Text>
        <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>
          {opcional ? 'Una foto del grupo ayuda a identificarlos, pero no es obligatoria.' : 'Agrega al menos una imagen para que el rescate sea más fácil.'}
        </Text>

        {fotosDelAnimal.map((f, index) => (
          <View key={f.id} style={{ borderBottomWidth: index === fotosDelAnimal.length - 1 ? 0 : 1, borderBottomColor: '#ECF0F1', paddingBottom: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Image source={{ uri: f.foto_url }} style={{ width: 80, height: 80, borderRadius: 8 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Input placeholder="Descripción de la foto..." value={f.descripcion} onChangeText={(text) => handleUpdateFotoDesc(f.id, text)} style={{ height: 38, paddingVertical: 4, fontSize: 13 }} maxLength={100} />
                <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 11 }}>{f.descripcion.length}/100</Text>
                <TouchableOpacity onPress={() => handleDeleteFoto(f.id)} style={{ backgroundColor: '#FADBD8', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignSelf: 'flex-end' }}>
                  <Text style={{ color: '#E63946', fontWeight: 'bold', fontSize: 13 }}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity
          onPress={() => handleAddFoto(animalLocalId)}
          disabled={isValidatingFoto}
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 16,
            borderRadius: 16,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: isValidatingFoto ? '#B0A098' : petzen.colors.orange,
            backgroundColor: isValidatingFoto ? '#ECECEC' : petzen.colors.peach + '40',
          }}
        >
          <Feather name="camera" size={18} color={isValidatingFoto ? '#B0A098' : petzen.colors.orange} style={{ marginRight: 8 }} />
          <Text style={{ fontFamily: petzen.fonts.bold, fontSize: 14, color: isValidatingFoto ? '#B0A098' : petzen.colors.orange }}>
            {isValidatingFoto ? 'Validando foto...' : (opcional ? 'Agregar foto grupal' : 'Agregar Foto del animalito')}
          </Text>
        </TouchableOpacity>
        {!opcional && errors.foto && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 8 }}>{errors.foto}</Text>}
      </Card>
    );
  };

  // Pantalla de pregunta sí/no del árbol de decisión.
  const renderPregunta = (
    icono: keyof typeof Ionicons.glyphMap,
    pregunta: string,
    ayuda: string,
    onSi: () => void,
    onNo: () => void,
    labelSi: string = 'Sí',
    labelNo: string = 'No',
    onAtras?: () => void,
  ) => (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' }}>
      {onAtras && (
        <TouchableOpacity onPress={onAtras} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, alignSelf: 'flex-start' }}>
          <Feather name="arrow-left" size={14} color={petzen.colors.textSecondary} />
          <Text style={{ fontSize: 13, color: petzen.colors.textSecondary, marginLeft: 6 }}>Atrás</Text>
        </TouchableOpacity>
      )}
      <Card>
        <View style={{ alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: petzen.colors.peach + '80', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Ionicons name={icono} size={34} color={petzen.colors.orange} />
          </View>
          <Text style={{ fontSize: 18, fontFamily: petzen.fonts.extraBold, color: petzen.colors.textDark, textAlign: 'center', marginBottom: 8, lineHeight: 24 }}>
            {pregunta}
          </Text>
          <Text style={{ fontSize: 13, color: petzen.colors.textSecondary, textAlign: 'center', marginBottom: 26, lineHeight: 19 }}>
            {ayuda}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            <TouchableOpacity onPress={onNo} style={{ flex: 1, paddingVertical: 15, borderRadius: petzen.radii.pill, borderWidth: 1.5, borderColor: petzen.colors.teal, alignItems: 'center', backgroundColor: '#FFFFFF' }}>
              <Text style={{ color: petzen.colors.tealDark, fontFamily: petzen.fonts.bold, fontSize: 15, textAlign: 'center' }}>{labelNo}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSi} style={{ flex: 1, paddingVertical: 15, borderRadius: petzen.radii.pill, alignItems: 'center', backgroundColor: petzen.colors.orange }}>
              <Text style={{ color: '#FFFFFF', fontFamily: petzen.fonts.bold, fontSize: 15, textAlign: 'center' }}>{labelSi}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    </ScrollView>
  );

  // ─── Pantalla de confirmación ───
  if (resultadoEnvio !== null) {
    return (
      <View style={{ flex: 1, backgroundColor: petzen.colors.background, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Toast toast={toast} translateY={translateY} />

        <Image
          source={require('../../assets/images/confirmacion-animal.png')}
          style={{ width: 200, height: 200, marginBottom: 28 }}
          resizeMode="contain"
        />

        <Text style={{ fontFamily: petzen.fonts.extraBold, fontSize: 26, color: petzen.colors.textDark, textAlign: 'center', marginBottom: 12 }}>
          ¡Gracias por reportar!
        </Text>
        <Text style={{ fontFamily: petzen.fonts.regular, fontSize: 15, color: petzen.colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 36 }}>
          {resultadoEnvio}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setResultadoEnvio(null);
            if (!isLoggedIn) {
              setMostrarCrearCuenta(true);
            } else {
              setTimeout(() => { if (onClose) onClose(); }, 300);
            }
          }}
          style={{ backgroundColor: petzen.colors.orange, paddingVertical: 16, paddingHorizontal: 48, borderRadius: petzen.radii.pill, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Entendido</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mostrarCrearCuenta) {
    return (
      <CrearCuentaInvitadoFlow
        nombre={nombre}
        apellidoPaterno={apellidoPaterno}
        apellidoMaterno={apellidoMaterno}
        telefono={telefono}
        email={email}
        petzen={petzen}
        onClose={() => { if (onClose) onClose(); }}
      />
    );
  }

  // ─── Header con progreso ───
  const renderHeader = () => (
    <View
      style={{
        backgroundColor: petzen.colors.teal,
        paddingTop: 28,
        paddingBottom: 40,
        paddingHorizontal: 24,
        borderBottomLeftRadius: petzen.radii.headerCurve,
        borderBottomRightRadius: petzen.radii.headerCurve,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={handleAnterior}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
        >
          <Feather name="chevron-left" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: petzen.fonts.bold, fontSize: 18, color: '#FFFFFF' }}>Nuevo Reporte</Text>
          <Text style={{ fontFamily: petzen.fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
            Paso {paso} de {TOTAL_PASOS}: {PASO_NOMBRES[paso - 1]}
          </Text>
        </View>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginRight: onClose ? 8 : 0 }}>
          <Ionicons name="paw" size={22} color="#FFFFFF" />
        </View>
        {onClose && (
          <TouchableOpacity
            onPress={handleCloseRequest}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
      {/* Barra de progreso */}
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, marginTop: 18 }}>
        <View style={{ height: 4, backgroundColor: petzen.colors.yellow, borderRadius: 2, width: `${(paso / TOTAL_PASOS) * 100}%` }} />
      </View>
    </View>
  );

  const CONDICION_DUPLICADO: Record<string, { color: string; bg: string; label: string }> = {
    estable: { color: '#27AE60', bg: '#EAFAF1', label: 'Estable' },
    herido:  { color: '#F39C12', bg: '#FEF9E7', label: 'Herido' },
    grave:   { color: '#E74C3C', bg: '#FDEDEC', label: 'Grave' },
  };

  // ─── PASO 1: Ubicación ───
  const renderPaso1 = () => (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
      <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>
        Indica dónde está el animal — en el siguiente paso nos cuentas de él.
      </Text>

      <Card>
        <Text style={{ fontSize: 16, fontFamily: petzen.fonts.bold, color: '#2C3E50', marginBottom: 4 }}>
          Ubicación del animal <Text style={{ color: '#E74C3C' }}>*</Text>
        </Text>
        <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>
          Indica el lugar donde viste al animal, no donde estás ahora.
        </Text>

        <Input placeholder="Buscar dirección, ej. Avenida Reforma, Puebla" value={searchQuery} onChangeText={setSearchQuery} />
        {isSearching && <Text style={{ fontSize: 12, color: '#7F8C8D', marginTop: 4 }}>Buscando...</Text>}
        {searchResults.length > 0 && (
          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, marginTop: 4, marginBottom: 4 }}>
            {searchResults.map((result, idx) => (
              <TouchableOpacity key={idx} onPress={() => handleSelectSearchResult(result)} style={{ padding: 12, borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1, borderBottomColor: '#ECF0F1' }}>
                <Text style={{ fontSize: 13, color: '#2C3E50' }}>{result.display_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity onPress={handleGetLocation} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
          <Feather name="map-pin" size={14} color={petzen.colors.teal} style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 13, color: petzen.colors.teal, fontWeight: '600' }}>
            {isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 8 }}>O ajusta directamente arrastrando el pin en el mapa:</Text>
        <LocationPickerMap selectedPosition={pinLocation} onLocationSelect={handlePinLocationSelect} />
        {errors.ubicacion && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.ubicacion}</Text>}

        {direccionConfirmada !== '' && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EAF6FF', padding: 10, borderRadius: 8, marginTop: 8 }}>
            <Feather name="map-pin" size={14} color="#2C3E50" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={{ fontSize: 12, color: '#2C3E50', flex: 1 }}>
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
            <Feather name="refresh-cw" size={13} color={petzen.colors.teal} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 12, color: petzen.colors.teal, fontWeight: '600' }}>Mover el pin a esta dirección</Text>
          </TouchableOpacity>
          <View>
            <Input label="Referencia (Opcional)" placeholder="Ej. Frente a la tienda de abarrotes..." value={referencia} onChangeText={setReferencia} maxLength={150} />
            <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12, marginTop: -12, marginBottom: 8 }}>{referencia.length}/150</Text>
          </View>
        </View>
      </Card>

      <TouchableOpacity
        onPress={handleSiguiente}
        style={{ backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 8 }}
      >
        <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Siguiente →</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ─── PASO 2 · Ficha individual (un animal) ───
  const renderFichaIndividual = () => {
    const animalesIndividualesPrevios = animales.filter((a) => !a.esGrupo);
    const anterior = animalesIndividualesPrevios[animalesIndividualesPrevios.length - 1];
    const puedeCopiar = !!anterior && !borrador.tipoAnimal;
    const numeroFicha = animales.length + 1;

    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 16 }}>
          {animales.length > 0
            ? `Animal #${numeroFicha} — cuéntanos de este.`
            : 'Cuéntanos sobre el animal para poder asignar la ayuda adecuada.'}
        </Text>

        {puedeCopiar && (
          <TouchableOpacity
            onPress={() => copiarDeAnterior(anterior)}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: petzen.colors.tealDark + '18', borderRadius: 12, padding: 12, marginBottom: 16, gap: 8 }}
          >
            <Ionicons name="copy-outline" size={16} color={petzen.colors.tealDark} />
            <Text style={{ fontSize: 12, color: petzen.colors.textDark, flex: 1, lineHeight: 16 }}>
              Copiar tipo, tamaño, sexo, edad, collar y raza del animal anterior
            </Text>
            <Feather name="chevron-right" size={14} color={petzen.colors.textSecondary} />
          </TouchableOpacity>
        )}

        {renderFotosCard(borrador.id, false)}
        {renderSemaforo(borrador.condition, (c) => { actualizarBorrador({ condition: c }); setErrors((prev) => ({ ...prev, condition: '' })); }, errors.condition)}

        <Card>
          {renderSelector('Tipo de Animal', ['Perro', 'Gato', 'Otro'], borrador.tipoAnimal, (t: TipoAnimal) => {
            actualizarBorrador({ tipoAnimal: t, raza: null, tieneCollar: null, esAgresivo: null, esDomestico: null, subcategoria: null, especieDescripcion: '' });
            setErrors((prev) => ({ ...prev, tipoAnimal: '' }));
          }, errors.tipoAnimal)}

          {borrador.tipoAnimal === 'Otro' && (
            <>
              {renderSelector('Categoría', ['Ave', 'Reptil', 'Roedor', 'Fauna silvestre', 'Otro'], borrador.subcategoria, (val: string) => { actualizarBorrador({ subcategoria: val }); setErrors((prev) => ({ ...prev, subcategoria: '' })); }, errors.subcategoria)}
              {borrador.subcategoria === 'Otro' && (
                <View>
                  <Input label="Describe la especie *" placeholder="Ej. Tlacuache, caballo, etc." value={borrador.especieDescripcion} onChangeText={(val) => { actualizarBorrador({ especieDescripcion: val }); if (val.trim()) setErrors((prev) => ({ ...prev, especieDescripcion: '' })); }} error={errors.especieDescripcion} maxLength={100} />
                  <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12, marginTop: -12, marginBottom: 8 }}>{borrador.especieDescripcion.length}/100</Text>
                </View>
              )}
            </>
          )}

          {borrador.tipoAnimal && (
            <>
              {renderSelector('Sexo', ['Macho', 'Hembra', 'Desconocido'], borrador.sexo, (val: Sexo) => { actualizarBorrador({ sexo: val }); setErrors((prev) => ({ ...prev, sexo: '' })); }, errors.sexo)}

              {(borrador.tipoAnimal === 'Perro' || borrador.tipoAnimal === 'Gato') && borrador.sexo === 'Hembra' && (
                <>
                  {renderBooleanSelector('¿Parece estar preñada?', borrador.estaPrenada, (val) => { actualizarBorrador({ estaPrenada: val }); setErrors((prev) => ({ ...prev, estaPrenada: '' })); }, errors.estaPrenada)}
                  {renderBooleanSelector('¿Trae crías con ella?', borrador.traeCriasNacidas, (val) => { actualizarBorrador({ traeCriasNacidas: val, numeroCriasNacidas: val ? borrador.numeroCriasNacidas : '' }); setErrors((prev) => ({ ...prev, traeCriasNacidas: '' })); }, errors.traeCriasNacidas)}
                  {borrador.traeCriasNacidas && (
                    <Input label="¿Cuántas aproximadamente? (Opcional)" placeholder="Ej. 3" value={borrador.numeroCriasNacidas} onChangeText={(val) => actualizarBorrador({ numeroCriasNacidas: val.replace(/[^0-9]/g, '') })} keyboardType="numeric" maxLength={2} />
                  )}
                </>
              )}

              {renderSelector('Edad Aproximada', ['Cachorro', 'Joven', 'Adulto', 'Senior', 'Desconocido'], borrador.edad, (val: Edad) => { actualizarBorrador({ edad: val }); setErrors((prev) => ({ ...prev, edad: '' })); }, errors.edad)}
              {renderSelector('Tamaño', ['Pequeño', 'Mediano', 'Grande'], borrador.size, (val: Size) => { actualizarBorrador({ size: val }); setErrors((prev) => ({ ...prev, size: '' })); }, errors.size)}

              {borrador.tipoAnimal === 'Perro' && (
                <>
                  {renderSelector('Raza', ['Mestizo', 'Labrador', 'Pitbull', 'Pastor Alemán', 'Chihuahua', 'Otro'], borrador.raza, (val: string) => { actualizarBorrador({ raza: val }); setErrors((prev) => ({ ...prev, raza: '' })); }, errors.raza)}
                  {renderBooleanSelector('¿Tiene collar?', borrador.tieneCollar, (val) => { actualizarBorrador({ tieneCollar: val }); setErrors((prev) => ({ ...prev, tieneCollar: '' })); }, errors.tieneCollar)}
                  {renderBooleanSelector('¿Parece agresivo?', borrador.esAgresivo, (val) => { actualizarBorrador({ esAgresivo: val }); setErrors((prev) => ({ ...prev, esAgresivo: '' })); }, errors.esAgresivo)}
                </>
              )}

              {borrador.tipoAnimal === 'Gato' && (
                <>
                  {renderSelector('Raza', ['Común', 'Siamés', 'Persa', 'Otro'], borrador.raza, (val: string) => { actualizarBorrador({ raza: val }); setErrors((prev) => ({ ...prev, raza: '' })); }, errors.raza)}
                  {renderBooleanSelector('¿Tiene collar?', borrador.tieneCollar, (val) => { actualizarBorrador({ tieneCollar: val }); setErrors((prev) => ({ ...prev, tieneCollar: '' })); }, errors.tieneCollar)}
                  {renderBooleanSelector('¿Es doméstico / se deja acercar?', borrador.esDomestico, (val) => { actualizarBorrador({ esDomestico: val }); setErrors((prev) => ({ ...prev, esDomestico: '' })); }, errors.esDomestico)}
                </>
              )}
            </>
          )}

          <View style={{ marginBottom: 8 }}>
            <Input label="Descripción adicional (Opcional)" placeholder="Detalles sobre el animal o la situación..." value={borrador.description} onChangeText={(val) => actualizarBorrador({ description: val })} multiline maxLength={300} numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12 }}>{borrador.description.length}/300</Text>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <TouchableOpacity onPress={cancelarBorrador} style={{ flex: 1, paddingVertical: 16, borderRadius: 30, alignItems: 'center', borderWidth: 1.5, borderColor: '#BDC3C7' }}>
            <Text style={{ color: '#7F8C8D', fontFamily: petzen.fonts.bold, fontSize: 15 }}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmarFicha} style={{ flex: 2, backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: 30, alignItems: 'center' }}>
            <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>
              {animales.length > 0 ? 'Agregar a mi reporte' : 'Siguiente →'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ─── PASO 2 · Modo grupo (varios animales parecidos) ───
  const renderPantallaGrupo = () => (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: petzen.colors.tealDark + '18', borderRadius: 12, padding: 12, marginBottom: 20, gap: 10 }}>
        <Ionicons name="people-outline" size={20} color={petzen.colors.tealDark} />
        <Text style={{ fontSize: 12, color: petzen.colors.textDark, flex: 1, lineHeight: 17 }}>
          Modo grupo: descríbelos juntos con datos generales — no hace falta una ficha por cada uno.
        </Text>
      </View>

      {renderFotosCard(borrador.id, true)}

      <Card>
        {renderSelector('Tipo de Animal', ['Perro', 'Gato', 'Otro'], borrador.tipoAnimal, (t: TipoAnimal) => {
          actualizarBorrador({ tipoAnimal: t, subcategoria: null, especieDescripcion: '' });
          setErrors((prev) => ({ ...prev, tipoAnimal: '' }));
        }, errors.tipoAnimal)}

        {borrador.tipoAnimal === 'Otro' && (
          <>
            {renderSelector('Categoría', ['Ave', 'Reptil', 'Roedor', 'Fauna silvestre', 'Otro'], borrador.subcategoria, (val: string) => { actualizarBorrador({ subcategoria: val }); setErrors((prev) => ({ ...prev, subcategoria: '' })); }, errors.subcategoria)}
            {borrador.subcategoria === 'Otro' && (
              <View>
                <Input label="Describe la especie *" placeholder="Ej. Tlacuaches, palomas, etc." value={borrador.especieDescripcion} onChangeText={(val) => { actualizarBorrador({ especieDescripcion: val }); if (val.trim()) setErrors((prev) => ({ ...prev, especieDescripcion: '' })); }} error={errors.especieDescripcion} maxLength={100} />
                <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12, marginTop: -12, marginBottom: 8 }}>{borrador.especieDescripcion.length}/100</Text>
              </View>
            )}
          </>
        )}

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>¿Cuántos son aproximadamente? <Text style={{ color: '#E74C3C' }}>*</Text></Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity
              onPress={() => actualizarBorrador({ cantidad: Math.max(2, borrador.cantidad - 1) })}
              style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: petzen.colors.orange, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="minus" size={18} color={petzen.colors.orange} />
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontFamily: petzen.fonts.extraBold, color: petzen.colors.textDark, minWidth: 44, textAlign: 'center' }}>{borrador.cantidad}</Text>
            <TouchableOpacity
              onPress={() => actualizarBorrador({ cantidad: borrador.cantidad + 1 })}
              style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: petzen.colors.orange, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="plus" size={18} color={petzen.colors.orange} />
            </TouchableOpacity>
          </View>
          {errors.cantidad && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.cantidad}</Text>}
        </View>
      </Card>

      {renderSemaforo(borrador.condition, (c) => { actualizarBorrador({ condition: c }); setErrors((prev) => ({ ...prev, condition: '' })); }, errors.condition, 'Condición general', '¿Cómo se ve la mayoría del grupo?')}

      <Card>
        {renderSelector('Tamaño general', ['Pequeño', 'Mediano', 'Grande'], borrador.size, (val: Size) => { actualizarBorrador({ size: val }); setErrors((prev) => ({ ...prev, size: '' })); }, errors.size)}
        {renderSelector('Edad aproximada general', ['Cachorro', 'Joven', 'Adulto', 'Senior', 'Desconocido'], borrador.edad, (val: Edad) => { actualizarBorrador({ edad: val }); setErrors((prev) => ({ ...prev, edad: '' })); }, errors.edad)}

        <View style={{ marginBottom: 8 }}>
          <Input label="Descripción adicional (Opcional)" placeholder="Ej. Están debajo de una camioneta abandonada..." value={borrador.description} onChangeText={(val) => actualizarBorrador({ description: val })} multiline maxLength={300} numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
          <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12 }}>{borrador.description.length}/300</Text>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <TouchableOpacity onPress={cancelarBorrador} style={{ flex: 1, paddingVertical: 16, borderRadius: 30, alignItems: 'center', borderWidth: 1.5, borderColor: '#BDC3C7' }}>
          <Text style={{ color: '#7F8C8D', fontFamily: petzen.fonts.bold, fontSize: 15 }}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmarGrupo} style={{ flex: 2, backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: 30, alignItems: 'center' }}>
          <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Agregar grupo a mi reporte</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ─── PASO 2 · Resumen de animales agregados ───
  const renderResumenAnimales = () => {
    const totalAnimalesCount = animales.reduce((sum, a) => sum + (a.esGrupo ? a.cantidad : 1), 0);
    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 20 }}>
          {totalAnimalesCount === 1
            ? 'Este es el animal de tu reporte.'
            : `Tu reporte incluye ${totalAnimalesCount} animales en total.`}
        </Text>

        {animales.map((a, index) => {
          const fotosDelAnimal = fotos.filter((f) => f.animalLocalId === a.id);
          const especieLabel = a.tipoAnimal === 'Otro' ? (a.subcategoria || 'Otro') : (a.tipoAnimal || 'Animal');
          return (
            <View key={a.id} style={{ flexDirection: 'row', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F0E8DC', alignItems: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F5F0E8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {fotosDelAnimal[0] ? (
                  <Image source={{ uri: fotosDelAnimal[0].foto_url }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                ) : (
                  <AnimalIcon tipoAnimal={a.tipoAnimal} condicion={mapCondicion(a.condition)} size={40} bare />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontFamily: petzen.fonts.bold, color: '#2C3E50' }} numberOfLines={1}>
                  {especieLabel}{a.esGrupo ? ` · Grupo de ${a.cantidad}` : ''}
                </Text>
                <Text style={{ fontSize: 12, color: '#7F8C8D', marginTop: 2 }} numberOfLines={1}>
                  {[a.size, a.condition && mapCondicion(a.condition)].filter(Boolean).join(' · ') || 'Sin detalles'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => editarAnimal(index)} style={{ padding: 8 }}>
                <Feather name="edit-2" size={16} color={petzen.colors.tealDark} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => eliminarAnimal(index)} style={{ padding: 8 }}>
                <Feather name="trash-2" size={16} color="#E74C3C" />
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 24, flexWrap: 'wrap' }}>
          <TouchableOpacity onPress={iniciarFichaIndividual} style={{ flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: petzen.colors.tealDark, backgroundColor: petzen.colors.tealDark + '10' }}>
            <Feather name="plus" size={16} color={petzen.colors.tealDark} />
            <Text style={{ fontSize: 13, fontFamily: petzen.fonts.bold, color: petzen.colors.tealDark }}>Otro animal</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={iniciarGrupo} style={{ flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: petzen.colors.orange, backgroundColor: petzen.colors.peach + '40' }}>
            <Feather name="users" size={16} color={petzen.colors.orange} />
            <Text style={{ fontSize: 13, fontFamily: petzen.fonts.bold, color: petzen.colors.orange }}>Grupo similar</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleSiguiente}
          style={{ backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: 30, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Siguiente →</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ─── PASO 2: despacha a la sub-vista activa ───
  const renderPaso2 = () => {
    switch (vistaPaso2) {
      case 'pregunta-multi':
        return renderPregunta(
          'paw-outline',
          '¿Hay más de un animal en este lugar?',
          'Por ejemplo, una colonia de gatos o una camada — así no llenas una ficha completa para cada uno si son parecidos.',
          () => setVistaPaso2('pregunta-especie'),
          () => iniciarFichaIndividual(),
          'Sí, hay más',
          'No, solo uno',
        );
      case 'pregunta-especie':
        return renderPregunta(
          'git-compare-outline',
          '¿Son todos de la misma especie?',
          'Ej. todos perros, o todos gatos.',
          () => setVistaPaso2('pregunta-parecidos'),
          () => iniciarFichaIndividual(),
          'Sí, misma especie',
          'No, especies distintas',
          () => setVistaPaso2('pregunta-multi'),
        );
      case 'pregunta-parecidos':
        return renderPregunta(
          'resize-outline',
          '¿Son parecidos en tamaño y condición?',
          'Si se ven todos más o menos igual de sanos (o heridos) y del mismo tamaño, podemos describirlos juntos.',
          () => iniciarGrupo(),
          () => iniciarFichaIndividual(),
          'Sí, son parecidos',
          'No, hay diferencias',
          () => setVistaPaso2('pregunta-especie'),
        );
      case 'grupo-distinto':
        return renderPregunta(
          'alert-circle-outline',
          '¿Alguno del grupo se ve distinto o herido?',
          'Sepáralo en su propia ficha — no hace falta describir al resto de nuevo.',
          () => {
            setAnimales((prev) => {
              if (prev.length === 0) return prev;
              const copia = [...prev];
              const idx = copia.length - 1;
              copia[idx] = { ...copia[idx], cantidad: Math.max(1, copia[idx].cantidad - 1) };
              return copia;
            });
            iniciarFichaIndividual();
          },
          () => setVistaPaso2('resumen'),
          'Sí, separar uno',
          'No, listo así',
        );
      case 'ficha':
        return renderFichaIndividual();
      case 'grupo':
        return renderPantallaGrupo();
      case 'resumen':
      default:
        return renderResumenAnimales();
    }
  };

  // ─── PASO 3: Datos del reportante ───
  const renderPaso3 = () => (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
      <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>
        Para poder avisarte sobre el estado del rescate, necesitamos tus datos.
      </Text>

      <Card>
        <Text style={{ fontSize: 16, fontFamily: petzen.fonts.bold, color: '#2C3E50', marginBottom: 12 }}>Información del Reportante</Text>

        {isLoggedIn && user ? (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF6FF', padding: 14, borderRadius: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: 20, marginRight: 10 }}>👋</Text>
              <View>
                <Text style={{ fontSize: 15, fontFamily: petzen.fonts.bold, color: '#2C3E50' }}>
                  Hola, {user.nombre} {user.apellido_paterno}
                </Text>
                <Text style={{ fontSize: 12, color: '#7F8C8D' }}>{user.telefono}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={logout} style={{ alignSelf: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: '#E74C3C' }}>No soy yo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Input label="Teléfono de contacto" placeholder="Ej. 2221234567" value={telefono} onChangeText={(val) => {
              setTelefono(val);
              setGuestFound(false);
              if (!val.trim()) setErrors(prev => ({ ...prev, telefono: 'El teléfono es obligatorio.' }));
              else if (/[a-zA-Z]/.test(val)) setErrors(prev => ({ ...prev, telefono: 'El teléfono no puede contener letras.' }));
              else if (!/^\d{10}$/.test(val.trim())) setErrors(prev => ({ ...prev, telefono: 'El teléfono debe tener exactamente 10 dígitos numéricos.' }));
              else setErrors(prev => ({ ...prev, telefono: '' }));
            }} error={errors.telefono} keyboardType="numeric" maxLength={10} required />
            <Text style={{ fontSize: 12, color: '#7F8C8D', marginTop: -8, marginBottom: 8 }}>Lo usamos para contactarte sobre el estado de tu reporte.</Text>
            {isLookingUp && <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 8 }}>Buscando datos...</Text>}
            {guestFound && (
              <View style={{ backgroundColor: '#EAFAF1', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, color: '#27AE60', fontWeight: '600' }}>✓ Datos encontrados y autorellenados</Text>
              </View>
            )}
            <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombre} onChangeText={(val) => { setNombre(val); if (!val.trim()) setErrors(prev => ({ ...prev, nombre: 'El nombre es obligatorio.' })); else if (/\d/.test(val)) setErrors(prev => ({ ...prev, nombre: 'El nombre no debe contener números.' })); else setErrors(prev => ({ ...prev, nombre: '' })); }} error={errors.nombre} maxLength={30} required />
            <Input label="Apellido Paterno" placeholder="Ej. Pérez" value={apellidoPaterno} onChangeText={(val) => { setApellidoPaterno(val); if (!val.trim()) setErrors(prev => ({ ...prev, apellidoPaterno: 'El apellido paterno es obligatorio.' })); else if (/\d/.test(val)) setErrors(prev => ({ ...prev, apellidoPaterno: 'El apellido no debe contener números.' })); else setErrors(prev => ({ ...prev, apellidoPaterno: '' })); }} error={errors.apellidoPaterno} maxLength={30} required />
            <Input label="Apellido Materno (Opcional)" placeholder="Ej. López" value={apellidoMaterno} onChangeText={(val) => { setApellidoMaterno(val); if (/\d/.test(val)) setErrors(prev => ({ ...prev, apellidoMaterno: 'El apellido no debe contener números.' })); else setErrors(prev => ({ ...prev, apellidoMaterno: '' })); }} error={errors.apellidoMaterno} maxLength={30} />
            <Input label="Correo Electrónico (Opcional)" placeholder="Ej. correo@ejemplo.com" value={email} onChangeText={(val) => { setEmail(val); if (val.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) setErrors(prev => ({ ...prev, email: 'Ingresa un correo electrónico válido.' })); else setErrors(prev => ({ ...prev, email: '' })); }} error={errors.email} keyboardType="email-address" autoCapitalize="none" maxLength={50} />
            <TouchableOpacity
              onPress={() => setShowLoginModal(true)}
              style={{ alignItems: 'center', paddingVertical: 8, marginBottom: 8 }}
            >
              <Text style={{ color: petzen.colors.teal, fontSize: 13, fontWeight: '600' }}>¿Tienes cuenta? Inicia sesión</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>

      <TouchableOpacity
        onPress={() => handleSubmit(false)}
        disabled={isSubmitting}
        style={{ backgroundColor: isSubmitting ? '#95A5A6' : petzen.colors.orange, paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginTop: 8 }}
      >
        <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>
          {isSubmitting ? 'Enviando...' : 'Enviar Reporte 🐾'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: petzen.colors.teal }}>
      <Toast toast={toast} translateY={translateY} />
      {renderHeader()}

      <View style={{ flex: 1, backgroundColor: petzen.colors.background, marginTop: -28, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
        {paso === 1 && renderPaso1()}
        {paso === 2 && renderPaso2()}
        {paso === 3 && renderPaso3()}
      </View>

      {/* Modal: Duplicado */}
      <Modal visible={!!duplicadoInfo} transparent animationType="fade" onRequestClose={() => setDuplicadoInfo(null)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(20,15,10,0.55)',
            justifyContent: isDesktopModal ? 'center' : 'flex-end',
            alignItems: isDesktopModal ? 'center' : undefined,
            padding: isDesktopModal ? 24 : 0,
          }}
        >
          <View
            style={{
              width: isDesktopModal ? '100%' : undefined,
              maxWidth: isDesktopModal ? 400 : undefined,
              borderRadius: isDesktopModal ? 24 : 24,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: isDesktopModal ? 24 : 0,
              borderBottomRightRadius: isDesktopModal ? 24 : 0,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 20,
            }}
          >
            <BlurView intensity={60} tint="light" style={{ backgroundColor: 'rgba(255,250,246,0.85)' }}>
              {/* Foto tipo "se busca" con degradado y datos encima */}
              <View style={{ width: '100%', height: 190, backgroundColor: (duplicadoInfo && CONDICION_DUPLICADO[duplicadoInfo.existente?.condicion?.toLowerCase()]?.bg) || '#F2EEE8' }}>
                {duplicadoInfo?.existente?.foto_url ? (
                  <Image source={{ uri: duplicadoInfo.existente.foto_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="paw" size={48} color={petzen.colors.orange} />
                  </View>
                )}

                {/* Degradado inferior para que el texto flote sobre la foto */}
                <LinearGradient
                  colors={['transparent', 'rgba(20,15,10,0.75)']}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 }}
                />

                {/* Badge de condición, esquina superior */}
                {duplicadoInfo && (
                  <View
                    style={{
                      position: 'absolute', top: 12, right: 12,
                      backgroundColor: CONDICION_DUPLICADO[duplicadoInfo.existente?.condicion?.toLowerCase()]?.color || petzen.colors.orange,
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {CONDICION_DUPLICADO[duplicadoInfo.existente?.condicion?.toLowerCase()]?.label || duplicadoInfo.existente?.condicion}
                    </Text>
                  </View>
                )}

                {/* Hace X tiempo, flotando sobre el degradado */}
                {duplicadoInfo && (
                  <View style={{ position: 'absolute', left: 14, right: 14, bottom: 10 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                      Reportado hace {duplicadoInfo.tiempoTexto}
                    </Text>
                    <Text style={{ fontSize: 15, color: '#FFF', fontWeight: '800', marginTop: 1 }}>
                      {duplicadoInfo.existente.tipo_animal || 'Animal'} en {duplicadoInfo.existente.colonia || duplicadoInfo.existente.municipio || 'esta zona'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Contenido de la tarjeta */}
              <View style={{ padding: 24, paddingTop: 20 }}>
                <Text style={{ fontSize: 19, fontFamily: petzen.fonts.extraBold, color: petzen.colors.textDark, textAlign: 'center', marginBottom: 6 }}>
                  {duplicadoInfo?.escenario === 2 ? '¿Es parte de este grupo?' : '¿Es el mismo animal?'}
                </Text>
                <Text style={{ fontSize: 13, color: petzen.colors.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 19 }}>
                  {duplicadoInfo?.escenario === 2
                    ? 'Hay un reporte activo de un grupo más grande en esta zona — ¿este animal es parte de ese grupo, o es un caso aparte?'
                    : 'Ya existe un reporte activo que coincide con la ubicación y el tipo de animal.'}
                </Text>

                {!!duplicadoInfo?.animales?.length && (
                  <View style={{ marginBottom: 18 }}>
                    <AnimalThumbnailStrip animales={duplicadoInfo.animales} />
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => { const info = duplicadoInfo; setDuplicadoInfo(null); if (info) handleSubmit(true, info.existente.id); }}
                  style={{ backgroundColor: petzen.colors.orange, paddingVertical: 15, borderRadius: petzen.radii.pill, alignItems: 'center', marginBottom: 10 }}
                >
                  <Text style={{ color: '#FFFFFF', fontFamily: petzen.fonts.bold, fontSize: 15 }}>
                    {duplicadoInfo?.escenario === 2 ? 'Es parte de ese grupo' : 'Vincular al caso existente'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setDuplicadoInfo(null); handleSubmit(true); }}
                  style={{ borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.15)', paddingVertical: 15, borderRadius: petzen.radii.pill, alignItems: 'center', marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.4)' }}
                >
                  <Text style={{ color: petzen.colors.textDark, fontFamily: petzen.fonts.bold, fontSize: 15 }}>
                    {duplicadoInfo?.escenario === 2 ? 'Es un caso aparte, crear nuevo' : 'Crear un reporte nuevo'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDuplicadoInfo(null)} style={{ alignItems: 'center' }}>
                  <Text style={{ color: petzen.colors.textSecondary, fontSize: 13 }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      </Modal>

      {/* Modal: Login inline — sin cerrar el formulario */}
      <Modal visible={showLoginModal} transparent animationType="slide" onRequestClose={() => setShowLoginModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 44 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontFamily: petzen.fonts.bold, color: '#2C3E50' }}>Iniciar Sesión</Text>
              <TouchableOpacity onPress={() => setShowLoginModal(false)}>
                <Feather name="x" size={22} color="#95A5A6" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: '#7F8C8D', marginBottom: 16 }}>
              Al iniciar sesión, tus datos se autorellenarán en el formulario.
            </Text>
            <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 4, fontWeight: '600' }}>Correo electrónico *</Text>
            <Input
              placeholder="correo@ejemplo.com"
              value={loginEmail}
              onChangeText={setLoginEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 4, fontWeight: '600' }}>Contraseña *</Text>
            <Input
              placeholder="••••••••"
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
            />
            <TouchableOpacity
              onPress={handleLoginInline}
              disabled={isLoggingIn}
              style={{ backgroundColor: isLoggingIn ? '#95A5A6' : petzen.colors.orange, paddingVertical: 14, borderRadius: 30, alignItems: 'center', marginTop: 8 }}
            >
              <Text style={{ color: '#FFFFFF', fontFamily: petzen.fonts.bold, fontSize: 15 }}>
                {isLoggingIn ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Confirmar cierre */}
      <Modal visible={showCloseConfirm} transparent animationType="fade" onRequestClose={() => setShowCloseConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontFamily: petzen.fonts.bold, color: '#2C3E50', textAlign: 'center', marginBottom: 12 }}>
              ¿Estás seguro de cerrarlo?
            </Text>
            <Text style={{ fontSize: 14, color: '#566573', textAlign: 'center', marginBottom: 24 }}>
              Los datos ingresados se perderán y tendrás que empezar de nuevo.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setShowCloseConfirm(false)} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#BDC3C7', alignItems: 'center' }}>
                <Text style={{ color: '#7F8C8D', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowCloseConfirm(false); if (onClose) onClose(); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#E74C3C', alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Sí, cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
