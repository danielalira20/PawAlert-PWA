import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';

type TipoAnimal = 'Perro' | 'Gato' | 'Otro' | null;
type Condition = 'green' | 'yellow' | 'red' | null;
type Size = 'Pequeño' | 'Mediano' | 'Grande' | null;
type Sexo = 'Macho' | 'Hembra' | 'Desconocido' | null;
type Edad = 'Cachorro' | 'Joven' | 'Adulto' | 'Desconocido' | null;

interface AnimalFoto {
  id: string;
  foto_url: string;
  descripcion: string;
  orden: number;
}

interface DuplicadoInfo {
  existente: any;
  tiempoTexto: string;
}

interface ReportFormScreenProps {
  onClose?: () => void;
}

export default function ReportFormScreen({ onClose }: ReportFormScreenProps) {
  const { user, isLoggedIn, logout } = useAuth();

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [guestFound, setGuestFound] = useState(false);

  const [duplicadoInfo, setDuplicadoInfo] = useState<DuplicadoInfo | null>(null);
  const [resultadoEnvio, setResultadoEnvio] = useState<string | null>(null);
  const [showSubmitError, setShowSubmitError] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    const hasErrors = Object.values(errors).some(e => e !== '');
    if (!hasErrors) setShowSubmitError(false);
  }, [errors]);

  const hasUnsavedChanges = () => {
    const initialNombre = (isLoggedIn && user) ? user.nombre : '';
    const initialApellidoPaterno = (isLoggedIn && user) ? user.apellido_paterno : '';
    const initialApellidoMaterno = (isLoggedIn && user) ? (user.apellido_materno || '') : '';
    const initialTelefono = (isLoggedIn && user) ? user.telefono : '';
    const initialEmail = (isLoggedIn && user) ? user.email : '';

    const changedContactInfo =
      nombre.trim() !== initialNombre ||
      apellidoPaterno.trim() !== initialApellidoPaterno ||
      apellidoMaterno.trim() !== initialApellidoMaterno ||
      telefono.trim() !== initialTelefono ||
      email.trim() !== initialEmail;

    return changedContactInfo || tipoAnimal !== null || fotos.length > 0 || condition !== null || description.trim() !== '' || referencia.trim() !== '';
  };

  const handleCloseRequest = () => {
    if (hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      if (onClose) onClose();
    }
  };

  useEffect(() => {
    if (isLoggedIn && user) {
      setNombre(user.nombre);
      setApellidoPaterno(user.apellido_paterno);
      setApellidoMaterno(user.apellido_materno ?? '');
      setTelefono(user.telefono);
      setEmail(user.email);
    } else {
      // ← limpiar cuando cierra sesión
      setNombre('');
      setApellidoPaterno('');
      setApellidoMaterno('');
      setTelefono('');
      setEmail('');
    }
  }, [isLoggedIn, user]);

  const handleTelefonoChange = async (val: string) => {
    setTelefono(val);
    setGuestFound(false);

    if (!val.trim()) {
      setErrors((prev) => ({ ...prev, telefono: 'El teléfono es obligatorio.' }));
    } else if (/[a-zA-Z]/.test(val)) {
      setErrors((prev) => ({ ...prev, telefono: 'El teléfono no puede contener letras.' }));
    } else if (!/^\d{10}$/.test(val.trim())) {
      setErrors((prev) => ({ ...prev, telefono: 'El teléfono debe tener exactamente 10 dígitos numéricos.' }));
    } else {
      setErrors((prev) => ({ ...prev, telefono: '' }));
    }

    const clean = val.replace(/\s|-/g, '');
    if (clean.length === 10) {
      setIsLookingUp(true);
      try {
        const res = await axios.get(`${API_URL}/users/phone/${clean}`);
        setNombre(res.data.nombre);
        setApellidoPaterno(res.data.apellido_paterno);
        setApellidoMaterno(res.data.apellido_materno ?? '');
        setEmail(res.data.email ?? '');
        setGuestFound(true);
        // Clean errors for auto-filled fields
        setErrors((prev) => ({ ...prev, nombre: '', apellidoPaterno: '', email: '' }));
      } catch {
        // No existe, el usuario llena manualmente
      } finally {
        setIsLookingUp(false);
      }
    }
  };

  const handleNombreChange = (val: string) => {
    setNombre(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, nombre: 'El nombre es obligatorio.' }));
    else if (/\d/.test(val)) setErrors(prev => ({ ...prev, nombre: 'El nombre no debe contener números.' }));
    else setErrors(prev => ({ ...prev, nombre: '' }));
  };

  const handleApellidoPaternoChange = (val: string) => {
    setApellidoPaterno(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, apellidoPaterno: 'El apellido paterno es obligatorio.' }));
    else if (/\d/.test(val)) setErrors(prev => ({ ...prev, apellidoPaterno: 'El apellido no debe contener números.' }));
    else setErrors(prev => ({ ...prev, apellidoPaterno: '' }));
  };

  const handleApellidoMaternoChange = (val: string) => {
    setApellidoMaterno(val);
    if (/\d/.test(val)) setErrors(prev => ({ ...prev, apellidoMaterno: 'El apellido no debe contener números.' }));
    else setErrors(prev => ({ ...prev, apellidoMaterno: '' }));
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (val.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, email: 'Ingresa un correo electrónico válido.' }));
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  };

  const [tipoAnimal, setTipoAnimal] = useState<TipoAnimal>(null);

  const [sexo, setSexo] = useState<Sexo>(null);
  const [edad, setEdad] = useState<Edad>(null);
  const [tieneCollar, setTieneCollar] = useState<boolean | null>(null);
  const [estaPrenada, setEstaPrenada] = useState<boolean | null>(null);
  const [esAgresivo, setEsAgresivo] = useState<boolean | null>(null);
  const [esDomestico, setEsDomestico] = useState<boolean | null>(null);
  const [raza, setRaza] = useState<string | null>(null);
  const [subcategoria, setSubcategoria] = useState<string | null>(null);
  const [especieDescripcion, setEspecieDescripcion] = useState('');

  const [fotos, setFotos] = useState<AnimalFoto[]>([]);

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
  const [searchQuery, setSearchQuery] = useState('');
  const [direccionConfirmada, setDireccionConfirmada] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length < 4) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: {
            q: searchQuery,
            format: 'json',
            addressdetails: 1,
            limit: 6,
            countrycodes: 'mx',
          },
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

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon, format: 'json', addressdetails: 1 },
      });
      const address = res.data.address || {};
      setCalleNombre(address.road || '');
      setNumero(address.house_number || '');
      setColonia(address.suburb || address.neighbourhood || address.colonia || '');
      setMunicipio(address.city || address.town || address.municipality || address.county || '');
      setDireccionConfirmada(res.data.display_name || '');
    } catch {
      // Si falla la geocodificación inversa no bloqueamos el flujo.
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
        setPinLocation({ latitud: parseFloat(result.lat), longitud: parseFloat(result.lon) });
        setUbicacionConfirmada(true);
        setDireccionConfirmada(result.display_name);
        setErrors((prev) => ({ ...prev, ubicacion: '' }));
      } else {
        Alert.alert('No encontrado', 'No pudimos ubicar esa dirección exacta. Ajusta el pin manualmente en el mapa.');
      }
    } catch {
      Alert.alert('Error', 'No pudimos buscar esa dirección. Ajusta el pin manualmente en el mapa.');
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
    setCalleNombre(address.road || '');
    setNumero(address.house_number || '');
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
          setPinLocation({
            latitud: currentLocation.coords.latitude,
            longitud: currentLocation.coords.longitude,
          });
          setUbicacionConfirmada(true);
          reverseGeocode(currentLocation.coords.latitude, currentLocation.coords.longitude);
        }
      } catch {
        // Si falla, el mapa simplemente se queda en el centro de Puebla por default.
      }
    })();
  }, []);

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS Denegado', 'Ajusta el pin directamente en el mapa para indicar la ubicación.');
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
    } catch (error) {
      Alert.alert('Error', 'No pudimos obtener tu ubicación GPS. Ajusta el pin directamente en el mapa.');
    } finally {
      setIsLoadingGps(false);
    }
  };

  const [referencia, setReferencia] = useState('');
  const [condition, setCondition] = useState<Condition>(null);
  const [size, setSize] = useState<Size>(null);
  const [description, setDescription] = useState('');

  const handleTipoAnimalChange = (t: TipoAnimal) => {
    setTipoAnimal(t);
    setErrors(prev => ({ ...prev, tipoAnimal: '' }));
    setRaza(null);
    setTieneCollar(null);
    setEsAgresivo(null);
    setEsDomestico(null);
    setSubcategoria(null);
    setEspecieDescripcion('');
  };

  const captureFoto = async (fromCamera: boolean) => {
    const requestPermission = fromCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;

    const permissionResult = await requestPermission();
    if (!permissionResult.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos los permisos necesarios para realizar esta acción.');
      return;
    }

    const launchMethod = fromCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await launchMethod({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });

    if (!result.canceled) {
      const asset = result.assets[0];
      const manipulated = await manipulateAsync(asset.uri, [], { compress: 0.8, format: SaveFormat.JPEG });

      const newFoto: AnimalFoto = {
        id: Math.random().toString(36).substring(2, 9),
        foto_url: manipulated.uri,
        descripcion: '',
        orden: fotos.length + 1,
      };
      setFotos([...fotos, newFoto]);
      setErrors((prev) => ({ ...prev, foto: '' }));
    }
  };

  const handleAddFoto = () => {
    if (Platform.OS === 'web') {
      captureFoto(false);
      return;
    }
    Alert.alert('Agregar Foto del animalito', '¿Qué deseas hacer?', [
      { text: 'Tomar Foto', onPress: () => captureFoto(true) },
      { text: 'Elegir de Galería', onPress: () => captureFoto(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleUpdateFotoDesc = (id: string, text: string) => {
    setFotos(fotos.map((f) => (f.id === id ? { ...f, descripcion: text } : f)));
  };

  const handleDeleteFoto = (id: string) => {
    setFotos(fotos.filter((f) => f.id !== id));
  };

  const validateForm = () => {
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

    if (!tipoAnimal) newErrors.tipoAnimal = 'Selecciona un tipo de animal.';
    if (!sexo) newErrors.sexo = 'Indica el sexo del animal.';
    if (!edad) newErrors.edad = 'Indica la edad aproximada.';

    if (tipoAnimal === 'Perro') {
      if (tieneCollar === null) newErrors.tieneCollar = 'Indica si tiene collar.';
      if (esAgresivo === null) newErrors.esAgresivo = 'Indica si parece agresivo.';
      if (!raza) newErrors.raza = 'Selecciona la raza aproximada.';
      if (sexo === 'Hembra' && estaPrenada === null) newErrors.estaPrenada = 'Indica si está preñada.';
    } else if (tipoAnimal === 'Gato') {
      if (tieneCollar === null) newErrors.tieneCollar = 'Indica si tiene collar.';
      if (esDomestico === null) newErrors.esDomestico = 'Indica si es dócil/doméstico.';
      if (!raza) newErrors.raza = 'Selecciona la raza aproximada.';
      if (sexo === 'Hembra' && estaPrenada === null) newErrors.estaPrenada = 'Indica si está preñada.';
    } else if (tipoAnimal === 'Otro') {
      if (!subcategoria) newErrors.subcategoria = 'Selecciona la subcategoría.';
      if (subcategoria === 'Otro' && !especieDescripcion.trim()) newErrors.especieDescripcion = 'Describe la especie del animal.';
    }

    if (!condition) newErrors.condition = 'Indica la condición del animal.';
    if (!size) newErrors.size = 'Indica el tamaño del animal.';
    if (fotos.length === 0) newErrors.foto = 'Debes adjuntar al menos una foto del animal.';

    if (!ubicacionConfirmada) {
      newErrors.ubicacion = 'Busca la dirección, usa el GPS, o ajusta el pin en el mapa.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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

  const handleSubmit = async (esDuplicadoConfirmado: boolean = false, reporteOriginalId?: string) => {
    if (!esDuplicadoConfirmado && !validateForm()) {
      setShowSubmitError(true);
      return;
    }
    setShowSubmitError(false);

    try {
      const formData = new FormData();
      formData.append('nombre', nombre);
      formData.append('apellido_paterno', apellidoPaterno);
      if (apellidoMaterno.trim()) formData.append('apellido_materno', apellidoMaterno);
      formData.append('telefono', telefono);
      if (email.trim()) formData.append('email', email);

      if (Platform.OS === 'web') {
        for (const f of fotos) {
          const res = await fetch(f.foto_url);
          const blob = await res.blob();
          formData.append('fotos', blob, `foto_${f.id}_${Date.now()}.jpg`);
        }
      } else {
        fotos.forEach((f) => {
          formData.append('fotos', {
            uri: f.foto_url,
            name: `foto_${f.id}_${Date.now()}.jpg`,
            type: 'image/jpeg',
          } as any);
        });
      }

      formData.append('fotos_descripciones', JSON.stringify(fotos.map((f) => f.descripcion || null)));
      formData.append('fotos_ordenes', JSON.stringify(fotos.map((f) => f.orden)));

      formData.append('tipo_animal', mapTipoAnimal(tipoAnimal));
      formData.append('condicion', mapCondicion(condition));
      formData.append('tamanio', mapTamanio(size));
      formData.append('sexo', sexo ? sexo.toLowerCase() : 'desconocido');
      formData.append('edad_aproximada', edad ? edad.toLowerCase() : 'desconocido');

      if (tipoAnimal === 'Perro' || tipoAnimal === 'Gato') {
        formData.append('tiene_collar', String(tieneCollar));
        formData.append('raza_clave', mapRaza(raza!, tipoAnimal));
        if (sexo === 'Hembra' && estaPrenada !== null) formData.append('esta_prenada', String(estaPrenada));
        if (tipoAnimal === 'Perro') formData.append('es_agresivo', String(esAgresivo));
        if (tipoAnimal === 'Gato') formData.append('es_domestico_probable', String(esDomestico));
      } else if (tipoAnimal === 'Otro') {
        formData.append('tipo_animal_otro_clave', mapSubcategoria(subcategoria!));
        if (subcategoria === 'Otro') formData.append('especie_descripcion', especieDescripcion);
      }

      if (description.trim()) formData.append('descripcion', description);
      if (referencia.trim()) formData.append('referencia', referencia);

      formData.append('latitud', String(pinLocation.latitud));
      formData.append('longitud', String(pinLocation.longitud));
      if (calleNombre.trim() || numero.trim()) {
        formData.append('calle', [calleNombre, numero].filter((p) => p.trim()).join(' '));
      }
      if (colonia.trim()) formData.append('colonia', colonia.trim());
      if (municipio.trim()) formData.append('municipio', municipio.trim());

      if (esDuplicadoConfirmado) formData.append('es_duplicado_confirmado', 'true');
      if (reporteOriginalId) formData.append('reporte_original_id', reporteOriginalId);

      const response = await axios.post(`${API_URL}/reports`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = response.data;

      if (data.posible_duplicado) {
        const existente = data.reporte_existente;
        const fechaReporte = new Date(existente.created_at);
        const ahora = new Date();
        const diffMs = ahora.getTime() - fechaReporte.getTime();
        const minutosTranscurridos = Math.round(diffMs / 60000);

        let tiempoTexto = `${minutosTranscurridos} minutos`;
        if (minutosTranscurridos >= 60) {
          const horas = Math.floor(minutosTranscurridos / 60);
          const minutos = minutosTranscurridos % 60;
          tiempoTexto = `${horas} hora(s) y ${minutos} minuto(s)`;
        }

        setDuplicadoInfo({ existente, tiempoTexto });
        return;
      }

      if (data.asociacion_asignada) {
        setResultadoEnvio(`Tu reporte fue asignado a: ${data.asociacion_asignada}`);
      } else if (data.contactos_emergencia && data.contactos_emergencia.length > 0) {
        const contactos = data.contactos_emergencia.map((c: any) => `${c.nombre}: ${c.telefono}`).join('\n');
        setResultadoEnvio(`No hay asociaciones disponibles en tu zona.\n\nContactos de emergencia:\n${contactos}`);
      } else {
        setResultadoEnvio('Tu reporte fue publicado. Te avisaremos cuando una asociación lo atienda.');
      }
    } catch (error: any) {
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido';
      Alert.alert('Error', mensaje);
    }
  };

  const renderSelector = (label: string, options: string[], stateValue: any, setState: any, error?: string) => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>{label} <Text style={{ color: '#E74C3C' }}>*</Text></Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((opt) => (
          <TouchableOpacity key={opt} onPress={() => setState(opt)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: stateValue === opt ? '#3498DB' : '#FFFFFF', borderColor: error ? '#E74C3C' : (stateValue === opt ? '#3498DB' : '#BDC3C7'), alignItems: 'center' }}>
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
        <TouchableOpacity onPress={() => setValue(true)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: value === true ? '#3498DB' : '#FFFFFF', borderColor: error ? '#E74C3C' : (value === true ? '#3498DB' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ color: value === true ? '#FFFFFF' : '#7F8C8D', fontWeight: '500' }}>Sí</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setValue(false)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: value === false ? '#3498DB' : '#FFFFFF', borderColor: error ? '#E74C3C' : (value === false ? '#3498DB' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ color: value === false ? '#FFFFFF' : '#7F8C8D', fontWeight: '500' }}>No</Text></TouchableOpacity>
      </View>
      {error && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Nuevo Reporte</Text>
        {onClose && (
          <TouchableOpacity onPress={handleCloseRequest} style={{ padding: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#95A5A6' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>Ayúdanos a rescatar a este animalito llenando los datos.</Text>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 12 }}>Información del Reportante</Text>

          {isLoggedIn && user ? (
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF6FF', padding: 14, borderRadius: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 20, marginRight: 10 }}>👋</Text>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C3E50' }}>
                    Hola, {user.nombre} {user.apellido_paterno}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#7F8C8D' }}>{user.telefono}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={logout}
                style={{ alignSelf: 'flex-end' }}
              >
                <Text style={{ fontSize: 12, color: '#E74C3C' }}>No soy yo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Input label="Teléfono de contacto" placeholder="Ej. 2221234567" value={telefono} onChangeText={handleTelefonoChange} error={errors.telefono} keyboardType="numeric" maxLength={10} required />
              <Text style={{ fontSize: 12, color: '#7F8C8D', marginTop: -8, marginBottom: 8 }}>Lo usamos para contactarte sobre el estado de tu reporte.</Text>
              {isLookingUp && (
                <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 8 }}>Buscando datos...</Text>
              )}
              {guestFound && (
                <View style={{ backgroundColor: '#EAFAF1', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#27AE60', fontWeight: '600' }}>✓ Datos encontrados y autorellenados</Text>
                </View>
              )}
              <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombre} onChangeText={handleNombreChange} error={errors.nombre} required />
              <Input label="Apellido Paterno" placeholder="Ej. Pérez" value={apellidoPaterno} onChangeText={handleApellidoPaternoChange} error={errors.apellidoPaterno} required />
              <Input label="Apellido Materno (Opcional)" placeholder="Ej. López" value={apellidoMaterno} onChangeText={handleApellidoMaternoChange} error={errors.apellidoMaterno} />
              <Input label="Correo Electrónico (Opcional)" placeholder="Ej. correo@ejemplo.com" value={email} onChangeText={handleEmailChange} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
              <TouchableOpacity
                onPress={() => {
                  if (onClose) onClose();
                  router.push('/login');
                }}
                style={{ alignItems: 'center', paddingVertical: 8, marginBottom: 8 }}
              >
                <Text style={{ color: '#3498DB', fontSize: 13, fontWeight: '600' }}>¿Tienes cuenta? Inicia sesión</Text>
              </TouchableOpacity>
            </>
          )}
        </Card>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Información del Animal</Text>
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>Describe lo mejor posible la situación actual para asignar la ayuda adecuada.</Text>

          {renderSelector('Tipo de Animal', ['Perro', 'Gato', 'Otro'], tipoAnimal, handleTipoAnimalChange, errors.tipoAnimal)}

          {tipoAnimal && (
            <>
              {renderSelector('Sexo', ['Macho', 'Hembra', 'Desconocido'], sexo, (val: any) => { setSexo(val); setErrors(prev => ({ ...prev, sexo: '' })); }, errors.sexo)}
              {renderSelector('Edad Aproximada', ['Cachorro', 'Joven', 'Adulto', 'Senior', 'Desconocido'], edad, (val: any) => { setEdad(val); setErrors(prev => ({ ...prev, edad: '' })); }, errors.edad)}

              {tipoAnimal === 'Perro' && (
                <>
                  {renderSelector('Raza', ['Mestizo', 'Labrador', 'Pitbull', 'Pastor Alemán', 'Chihuahua', 'Otro'], raza, (val: any) => { setRaza(val); setErrors(prev => ({ ...prev, raza: '' })); }, errors.raza)}
                  {renderBooleanSelector('¿Tiene collar?', tieneCollar, (val: any) => { setTieneCollar(val); setErrors(prev => ({ ...prev, tieneCollar: '' })); }, errors.tieneCollar)}
                  {renderBooleanSelector('¿Parece agresivo?', esAgresivo, (val: any) => { setEsAgresivo(val); setErrors(prev => ({ ...prev, esAgresivo: '' })); }, errors.esAgresivo)}
                  {sexo === 'Hembra' && renderBooleanSelector('¿Parece estar preñada?', estaPrenada, (val: any) => { setEstaPrenada(val); setErrors(prev => ({ ...prev, estaPrenada: '' })); }, errors.estaPrenada)}
                </>
              )}

              {tipoAnimal === 'Gato' && (
                <>
                  {renderSelector('Raza', ['Común', 'Siamés', 'Persa', 'Otro'], raza, (val: any) => { setRaza(val); setErrors(prev => ({ ...prev, raza: '' })); }, errors.raza)}
                  {renderBooleanSelector('¿Tiene collar?', tieneCollar, (val: any) => { setTieneCollar(val); setErrors(prev => ({ ...prev, tieneCollar: '' })); }, errors.tieneCollar)}
                  {renderBooleanSelector('¿Es doméstico / se deja acercar?', esDomestico, (val: any) => { setEsDomestico(val); setErrors(prev => ({ ...prev, esDomestico: '' })); }, errors.esDomestico)}
                  {sexo === 'Hembra' && renderBooleanSelector('¿Parece estar preñada?', estaPrenada, (val: any) => { setEstaPrenada(val); setErrors(prev => ({ ...prev, estaPrenada: '' })); }, errors.estaPrenada)}
                </>
              )}

              {tipoAnimal === 'Otro' && (
                <>
                  {renderSelector('Categoría', ['Ave', 'Reptil', 'Roedor', 'Fauna silvestre', 'Otro'], subcategoria, (val: any) => { setSubcategoria(val); setErrors(prev => ({ ...prev, subcategoria: '' })); }, errors.subcategoria)}
                  {subcategoria === 'Otro' && (
                    <Input label="Describe la especie *" placeholder="Ej. Tlacuache, caballo, etc." value={especieDescripcion} onChangeText={(val) => { setEspecieDescripcion(val); if (val.trim()) setErrors(prev => ({ ...prev, especieDescripcion: '' })); }} error={errors.especieDescripcion} />
                  )}
                </>
              )}
            </>
          )}

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Condición (Semáforo) <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            
            {/* Contenedor estilo semáforo horizontal */}
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-evenly', 
              alignItems: 'center', 
              backgroundColor: '#ECF0F1', 
              paddingVertical: 14, 
              borderRadius: 40, 
              borderWidth: errors.condition ? 1 : 0, 
              borderColor: '#E74C3C' 
            }}>
              
              {/* Luz Verde (Estable) */}
              <TouchableOpacity onPress={() => setCondition('green')} style={{ alignItems: 'center' }}>
                <View style={{ 
                  width: 64, height: 64, borderRadius: 32, 
                  backgroundColor: condition === 'green' ? '#27AE60' : '#A9DFBF', 
                  borderWidth: condition === 'green' ? 4 : 2, 
                  borderColor: condition === 'green' ? '#1E8449' : '#FFFFFF', 
                  justifyContent: 'center', alignItems: 'center',
                  shadowColor: condition === 'green' ? '#27AE60' : 'transparent',
                  shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: condition === 'green' ? 10 : 0 
                }}>
                   <Text style={{ fontWeight: 'bold', fontSize: 11, color: condition === 'green' ? '#FFFFFF' : '#1E8449' }}>Estable</Text>
                </View>
              </TouchableOpacity>

              {/* Luz Amarilla (Herido) */}
              <TouchableOpacity onPress={() => setCondition('yellow')} style={{ alignItems: 'center' }}>
                <View style={{ 
                  width: 64, height: 64, borderRadius: 32, 
                  backgroundColor: condition === 'yellow' ? '#F39C12' : '#F9E79F', 
                  borderWidth: condition === 'yellow' ? 4 : 2, 
                  borderColor: condition === 'yellow' ? '#D68910' : '#FFFFFF', 
                  justifyContent: 'center', alignItems: 'center',
                  shadowColor: condition === 'yellow' ? '#F39C12' : 'transparent',
                  shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: condition === 'yellow' ? 10 : 0 
                }}>
                   <Text style={{ fontWeight: 'bold', fontSize: 11, color: condition === 'yellow' ? '#FFFFFF' : '#D68910' }}>Herido</Text>
                </View>
              </TouchableOpacity>

              {/* Luz Roja (Grave) */}
              <TouchableOpacity onPress={() => setCondition('red')} style={{ alignItems: 'center' }}>
                <View style={{ 
                  width: 64, height: 64, borderRadius: 32, 
                  backgroundColor: condition === 'red' ? '#E74C3C' : '#F5B7B1', 
                  borderWidth: condition === 'red' ? 4 : 2, 
                  borderColor: condition === 'red' ? '#CB4335' : '#FFFFFF', 
                  justifyContent: 'center', alignItems: 'center',
                  shadowColor: condition === 'red' ? '#E74C3C' : 'transparent',
                  shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: condition === 'red' ? 10 : 0 
                }}>
                   <Text style={{ fontWeight: 'bold', fontSize: 11, color: condition === 'red' ? '#FFFFFF' : '#CB4335' }}>Grave</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Retroalimentación visual interactiva con imágenes ajustadas */}
            {condition === 'green' && (
              <View style={{ marginTop: 12, backgroundColor: '#EAFAF1', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#27AE60', flexDirection: 'row', alignItems: 'center' }}>
                <Image source={require('../../assets/images/estable.png')} style={{ width: 75, height: 75, marginRight: 12 }} resizeMode="contain" />
                <Text style={{ flex: 1, fontSize: 13, color: '#1E8449', lineHeight: 18 }}>
                  <Text style={{ fontWeight: 'bold' }}>Estable:</Text> Animal caminando, alerta, sin heridas visibles, aparentemente sano pero probablemente extraviado.
                </Text>
              </View>
            )}
            {condition === 'yellow' && (
              <View style={{ marginTop: 12, backgroundColor: '#FEF9E7', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#F39C12', flexDirection: 'row', alignItems: 'center' }}>
                <Image source={require('../../assets/images/herido.png')} style={{ width: 75, height: 75, marginRight: 12 }} resizeMode="contain" />
                <Text style={{ flex: 1, fontSize: 13, color: '#D68910', lineHeight: 18 }}>
                  <Text style={{ fontWeight: 'bold' }}>Herido:</Text> Animal cojeando, con heridas superficiales, desnutrición muy visible o desorientado.
                </Text>
              </View>
            )}
            {condition === 'red' && (
              <View style={{ marginTop: 12, backgroundColor: '#FDEDEC', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#E74C3C', flexDirection: 'row', alignItems: 'center' }}>
                <Image source={require('../../assets/images/grave.png')} style={{ width: 75, height: 75, marginRight: 12 }} resizeMode="contain" />
                <Text style={{ flex: 1, fontSize: 13, color: '#CB4335', lineHeight: 18 }}>
                  <Text style={{ fontWeight: 'bold' }}>Grave:</Text> Animal atropellado, incapaz de moverse, con sangrado activo o en riesgo inminente de perder la vida.
                </Text>
              </View>
            )}

            {errors.condition && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 6 }}>{errors.condition}</Text>}
          </View>

          {renderSelector('Tamaño', ['Pequeño', 'Mediano', 'Grande'], size, (val: any) => { setSize(val); setErrors(prev => ({ ...prev, size: '' })); }, errors.size)}

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Fotos del animalito <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <Text style={{ fontSize: 13, color: '#7F8C8D', marginBottom: 16 }}>Agrega una o más imágenes para que el rescate sea más fácil.</Text>

            {fotos.map((f, index) => (
              <View key={f.id} style={{ borderBottomWidth: index === fotos.length - 1 ? 0 : 1, borderBottomColor: '#ECF0F1', paddingBottom: 16, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Image source={{ uri: f.foto_url }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Input placeholder="Descripción de la foto..." value={f.descripcion} onChangeText={(text) => handleUpdateFotoDesc(f.id, text)} style={{ height: 38, paddingVertical: 4, fontSize: 13 }} />
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <TouchableOpacity onPress={() => handleDeleteFoto(f.id)} style={{ backgroundColor: '#FADBD8', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', minHeight: 40 }}>
                        <Text style={{ color: '#E63946', fontWeight: 'bold', fontSize: 13 }}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}

            <Button label="Agregar Foto del animalito" variant="secondary" onPress={handleAddFoto} />
            {errors.foto && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 8 }}>{errors.foto}</Text>}
          </View>

          <View style={{ marginBottom: 8 }}>
            <Input label="Descripción adicional (Opcional)" placeholder="Detalles sobre el animal o la situación..." value={description} onChangeText={setDescription} multiline maxLength={300} numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12 }}>{description.length}/300</Text>
          </View>
        </Card>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Ubicación del Reporte <Text style={{ color: '#E74C3C' }}>*</Text></Text>
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>Indica el lugar donde viste al animal, no donde estás ahora.</Text>

          <Input
            placeholder="Buscar dirección, ej. Avenida Reforma, Puebla"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {isSearching && <Text style={{ fontSize: 12, color: '#7F8C8D', marginTop: 4 }}>Buscando...</Text>}
          {searchResults.length > 0 && (
            <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, marginTop: 4, marginBottom: 4 }}>
              {searchResults.map((result, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleSelectSearchResult(result)}
                  style={{ padding: 12, borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1, borderBottomColor: '#ECF0F1' }}
                >
                  <Text style={{ fontSize: 13, color: '#2C3E50' }}>{result.display_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity onPress={handleGetLocation} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
            <Feather name="map-pin" size={14} color="#3498DB" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 13, color: '#3498DB', fontWeight: '600' }}>
              {isLoadingGps ? 'Obteniendo tu ubicación...' : 'Usar mi ubicación actual'}
            </Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 8 }}>
            O ajusta directamente arrastrando el pin en el mapa:
          </Text>
          <LocationPickerMap
            selectedPosition={pinLocation}
            onLocationSelect={handlePinLocationSelect}
          />
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
                <Input label="Calle" placeholder="Ej. Francisco I. Madero" value={calleNombre} onChangeText={setCalleNombre} />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Número" placeholder="Ej. 2912" value={numero} onChangeText={setNumero} keyboardType="numeric" />
              </View>
            </View>
            <Input label="Colonia" placeholder="Ej. Viveros" value={colonia} onChangeText={setColonia} />
            <Input label="Municipio" placeholder="Ej. Puebla" value={municipio} onChangeText={setMunicipio} />
            <TouchableOpacity onPress={handleGeocodeManualFields} style={{ flexDirection: 'row', alignItems: 'center', marginTop: -8, marginBottom: 8 }}>
              <Feather name="refresh-cw" size={13} color="#3498DB" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 12, color: '#3498DB', fontWeight: '600' }}>Mover el pin a esta dirección</Text>
            </TouchableOpacity>
          </View>

          <Input label="Referencia (Opcional)" placeholder="Ej. Frente a la tienda de abarrotes..." value={referencia} onChangeText={setReferencia} />
        </Card>

        {showSubmitError && (
          <Text style={{ color: '#E74C3C', textAlign: 'center', marginBottom: 12, fontWeight: '600', fontSize: 14 }}>
            Faltan campos por llenar
          </Text>
        )}
        <Button label="Enviar Reporte" onPress={() => handleSubmit(false)} />
      </ScrollView>

      <Modal visible={!!duplicadoInfo} transparent animationType="fade" onRequestClose={() => setDuplicadoInfo(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 44 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#2C3E50', textAlign: 'center', marginBottom: 12 }}>
              Posible reporte duplicado
            </Text>

            {duplicadoInfo?.existente?.foto_url && (
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Image
                  source={{ uri: duplicadoInfo.existente.foto_url }}
                  style={{ width: 140, height: 140, borderRadius: 12, backgroundColor: '#ECF0F1' }}
                  resizeMode="cover"
                />
              </View>
            )}

            {duplicadoInfo && (
              <Text style={{ fontSize: 14, color: '#566573', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                {'Se reportó un '}
                {duplicadoInfo.existente.tipo_animal || 'animal'}
                {' en condición '}
                {duplicadoInfo.existente.condicion || 'desconocida'}
                {' en '}
                {duplicadoInfo.existente.colonia || duplicadoInfo.existente.municipio || 'esta zona'}
                {' hace '}
                {duplicadoInfo.tiempoTexto}
                {'.'}
                {'\n\n'}
                {'¿Es el mismo animal?'}
              </Text>
            )}

            <TouchableOpacity
              onPress={() => {
                const info = duplicadoInfo;
                setDuplicadoInfo(null);
                if (info) handleSubmit(true, info.existente.id);
              }}
              style={{ backgroundColor: '#3498DB', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Vincular al caso existente</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setDuplicadoInfo(null);
                handleSubmit(true);
              }}
              style={{ borderWidth: 1.5, borderColor: '#BDC3C7', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 }}
            >
              <Text style={{ color: '#2C3E50', fontWeight: '700', fontSize: 15 }}>Crear un reporte nuevo</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setDuplicadoInfo(null)} style={{ alignItems: 'center' }}>
              <Text style={{ color: '#95A5A6', fontSize: 14 }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={resultadoEnvio !== null} transparent animationType="fade" onRequestClose={() => { }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 28 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#2C3E50', textAlign: 'center', marginBottom: 12 }}>
              ¡Reporte enviado!
            </Text>
            <Text style={{ fontSize: 14, color: '#566573', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              {resultadoEnvio}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setResultadoEnvio(null);
                setTimeout(() => {
                  if (onClose) onClose();
                }, 300);
              }}
              style={{ backgroundColor: '#3498DB', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCloseConfirm} transparent animationType="fade" onRequestClose={() => setShowCloseConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#2C3E50', textAlign: 'center', marginBottom: 12 }}>
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