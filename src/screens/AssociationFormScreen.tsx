import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';

type TipoAnimal = 'perro' | 'gato' | 'ave' | 'otro';

interface AsociacionFoto { id: string; foto_url: string; descripcion: string; orden: number; }
interface Props { onClose?: () => void; }

export default function AssociationFormScreen({ onClose }: Props) {
  const { setSession } = useAuth();

  const [nombre, setNombre] = useState('');
  const [nombreResponsable, setNombreResponsable] = useState('');
  const [apellidoResponsable, setApellidoResponsable] = useState('');
  const [acercaDe, setAcercaDe] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [horarioAtencion, setHorarioAtencion] = useState('');
  const [tiposAnimales, setTiposAnimales] = useState<TipoAnimal[]>([]);

  // --- Ubicación: misma vista unificada (buscador + mapa con pin) que ya
  // usamos en el formulario de reportes, en vez del toggle GPS/Manual viejo.
  const [pinLocation, setPinLocation] = useState<{ latitud: number; longitud: number }>({
    latitud: 19.0414,
    longitud: -98.2063,
  });
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

  const toggleTipoAnimal = (tipo: TipoAnimal) => {
    if (tiposAnimales.includes(tipo)) {
      setTiposAnimales(tiposAnimales.filter((t) => t !== tipo));
    } else {
      setTiposAnimales([...tiposAnimales, tipo]);
    }
    setErrors((prev) => ({ ...prev, tiposAnimales: '' }));
  };

  const handlePickLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) { Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para subir la foto.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setLogoUrl(result.assets[0].uri);
  };

  const handleTakeLogo = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) { Alert.alert('Permiso denegado', 'Necesitamos acceso a tu cámara para tomar la foto.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setLogoUrl(result.assets[0].uri);
  };

  const showLogoOptions = () => {
    // En web no hay cámara vía expo-image-picker, y el Alert con varios
    // botones no dispara onPress de forma confiable en react-native-web —
    // mismo problema que ya resolvimos en el formulario de reportes.
    if (Platform.OS === 'web') {
      handlePickLogo();
      return;
    }
    Alert.alert('Logo de la asociación', '¿Qué deseas hacer?', [{ text: 'Tomar Foto', onPress: handleTakeLogo }, { text: 'Elegir de Galería', onPress: handlePickLogo }, { text: 'Cancelar', style: 'cancel' }]);
  };

  const captureFoto = async (fromCamera: boolean) => {
    const requestPermission = fromCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const permissionResult = await requestPermission();
    if (!permissionResult.granted) { Alert.alert('Permiso denegado', 'Necesitamos los permisos necesarios.'); return; }
    const launchMethod = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launchMethod({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });

    if (!result.canceled) {
      const newFoto: AsociacionFoto = { id: Math.random().toString(36).substring(2, 9), foto_url: result.assets[0].uri, descripcion: '', orden: fotos.length + 1 };
      setFotos([...fotos, newFoto]);
    }
  };

  const handleAddFoto = async () => {
    if (Platform.OS === 'web') {
      captureFoto(false);
      return;
    }
    Alert.alert('Agregar Foto de la Asociación', '¿Qué deseas hacer?', [{ text: 'Tomar Foto', onPress: () => captureFoto(true) }, { text: 'Elegir de Galería', onPress: () => captureFoto(false) }, { text: 'Cancelar', style: 'cancel' }]);
  };

  const handleUpdateFotoDesc = (id: string, text: string) => setFotos(fotos.map(f => f.id === id ? { ...f, descripcion: text } : f));
  const handleUpdateFotoOrden = (id: string, text: string) => { const parsed = parseInt(text, 10); setFotos(fotos.map(f => f.id === id ? { ...f, orden: isNaN(parsed) ? 1 : parsed } : f)); };
  const handleDeleteFoto = (id: string) => setFotos(fotos.filter(f => f.id !== id));

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
    } catch {
      // Si falla la geocodificación inversa no bloqueamos el flujo.
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
    setCalle([address.house_number, address.road].filter(Boolean).join(' '));
    setColonia(address.suburb || address.neighbourhood || address.colonia || '');
    setMunicipio(address.city || address.town || address.municipality || address.county || '');
    setDireccionConfirmada(result.display_name);
    setSearchQuery('');
    setSearchResults([]);
    setErrors((prev) => ({ ...prev, ubicacion: '' }));
  };

  const handleGeocodeManualFields = async () => {
    const query = [calle, colonia, municipio].filter((p) => p.trim()).join(', ');
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

  // Al abrir el formulario, si el permiso de ubicación ya estaba concedido de
  // antes, centramos el mapa silenciosamente en la posición actual — sin
  // marcar la ubicación como confirmada todavía.
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
          reverseGeocode(currentLocation.coords.latitude, currentLocation.coords.longitude);
        }
      } catch {
        // Se queda en el centro de Puebla por default.
      }
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
          Alert.alert('Error', 'No pudimos obtener la ubicación. Verifica que tu dispositivo tenga activado el GPS.');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
      return;
    }
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('GPS Denegado', 'Ajusta el pin directamente en el mapa.'); setIsLoadingGps(false); return; }
      let currentLocation = await Location.getCurrentPositionAsync({});
      const lat = currentLocation.coords.latitude;
      const lon = currentLocation.coords.longitude;
      setPinLocation({ latitud: lat, longitud: lon });
      setUbicacionConfirmada(true);
      setErrors((prev) => ({ ...prev, ubicacion: '' }));
      reverseGeocode(lat, lon);
    } catch (error) {
      Alert.alert('Error', 'No pudimos obtener tu ubicación.');
    } finally {
      setIsLoadingGps(false);
    }
  };

  const handleResetForm = () => {
    setNombre(''); setNombreResponsable(''); setApellidoResponsable(''); setAcercaDe(''); setLogoUrl('');
    setTelefono(''); setEmail(''); setPassword(''); setPassword2(''); setHorarioAtencion(''); setTiposAnimales([]);
    setCalle(''); setColonia(''); setMunicipio(''); setReferencia(''); setRadioKm('');
    setPinLocation({ latitud: 19.0414, longitud: -98.2063 }); setUbicacionConfirmada(false);
    setSearchQuery(''); setDireccionConfirmada(''); setFotos([]); setErrors({});
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!nombre.trim()) newErrors.nombre = 'El nombre de la asociación es obligatorio.';
    if (!nombreResponsable.trim()) newErrors.nombreResponsable = 'El nombre del responsable es obligatorio.';
    if (!apellidoResponsable.trim()) newErrors.apellidoResponsable = 'El apellido del responsable es obligatorio.';

    if (!telefono.trim()) {
      newErrors.telefono = 'El teléfono de contacto es obligatorio.';
    } else if (!/^\d{10}$/.test(telefono.trim())) {
      newErrors.telefono = 'El teléfono debe tener exactamente 10 dígitos numéricos.';
    }

    if (!email.trim()) {
      newErrors.email = 'El correo electrónico es obligatorio.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Ingresa un correo electrónico válido.';
    }

    if (!password.trim()) {
      newErrors.password = 'La contraseña es obligatoria.';
    } else if (password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (password !== password2) {
      newErrors.password2 = 'Las contraseñas no coinciden.';
    }

    if (tiposAnimales.length === 0) newErrors.tiposAnimales = 'Selecciona al menos un tipo de animal que rescatan.';

    const radVal = parseInt(radioKm, 10);
    if (!radioKm.trim()) {
      newErrors.radioKm = 'El radio de cobertura es obligatorio.';
    } else if (isNaN(radVal) || radVal <= 0) {
      newErrors.radioKm = 'Ingresa un número válido mayor a 0.';
    }

    if (!ubicacionConfirmada) {
      newErrors.ubicacion = 'Busca la dirección, usa el GPS, o ajusta el pin en el mapa.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Formulario Incompleto', 'Revisa los campos marcados en rojo para continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('nombre', nombre.trim());
      formData.append('nombre_responsable', nombreResponsable.trim());
      formData.append('apellido_responsable', apellidoResponsable.trim());
      formData.append('contacto_telefono', telefono.trim());
      formData.append('contacto_email', email.trim());
      formData.append('password', password);
      formData.append('tipos_animales', JSON.stringify(tiposAnimales));
      formData.append('latitud', String(pinLocation.latitud));
      formData.append('longitud', String(pinLocation.longitud));
      formData.append('radio_km', radioKm);
      if (acercaDe.trim()) formData.append('acerca_de', acercaDe.trim());
      if (horarioAtencion.trim()) formData.append('horario_atencion', horarioAtencion.trim());
      if (calle.trim()) formData.append('calle', calle.trim());
      if (colonia.trim()) formData.append('colonia', colonia.trim());
      if (municipio.trim()) formData.append('municipio', municipio.trim());
      if (referencia.trim()) formData.append('referencia', referencia.trim());

      if (Platform.OS === 'web') {
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
      } else {
        if (logoUrl) formData.append('logo', { uri: logoUrl, name: `logo_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
        fotos.forEach((f) => formData.append('fotos', { uri: f.foto_url, name: `foto_${Date.now()}.jpg`, type: 'image/jpeg' } as any));
      }

      if (fotos.length > 0) {
        formData.append('fotos_descripciones', JSON.stringify(fotos.map(f => f.descripcion || null)));
        formData.append('fotos_ordenes', JSON.stringify(fotos.map(f => f.orden)));
      }

      const response = await axios.post(`${API_URL}/associations`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

      await setSession(response.data.usuario, response.data.access_token);
      Alert.alert('¡Registro exitoso!', response.data.mensaje || 'Tu solicitud ha sido registrada.');
      handleResetForm();
      if (onClose) onClose();
      router.replace('/association-status' as any);
    } catch (error: any) {
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido';
      Alert.alert('Error', mensaje);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Registro de Asociación</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#95A5A6' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>
          Registra tu asociación para comenzar a recibir reportes de rescate en tu zona.
        </Text>

        <Card>
          <Input label="Nombre de la Asociación" placeholder="Ej. Huellitas de Amor A.C." value={nombre} onChangeText={setNombre} error={errors.nombre} required />
          <Input label="Nombre(s) del Responsable" placeholder="Ej. Juan" value={nombreResponsable} onChangeText={setNombreResponsable} error={errors.nombreResponsable} required />
          <Input label="Apellido del Responsable" placeholder="Ej. Pérez" value={apellidoResponsable} onChangeText={setApellidoResponsable} error={errors.apellidoResponsable} required />
          <Input label="Acerca de la Asociación (Opcional)" placeholder="Describe la misión o actividades de la asociación..." value={acercaDe} onChangeText={setAcercaDe} multiline maxLength={300} numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
          <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12, marginBottom: 16 }}>{acercaDe.length}/300</Text>

          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Logo de la Asociación (Opcional)</Text>
            {logoUrl ? (
              <View style={{ position: 'relative', marginTop: 4 }}>
                <Image source={{ uri: logoUrl }} style={{ width: 100, height: 100, borderRadius: 50, alignSelf: 'center' }} />
                <TouchableOpacity onPress={() => setLogoUrl('')} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#FFFFFF', padding: 6, borderRadius: 15, borderWidth: 1, borderColor: '#BDC3C7' }}><Text style={{ color: '#E74C3C', fontWeight: 'bold', fontSize: 11 }}>Eliminar</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={showLogoOptions} style={{ width: '100%', height: 80, backgroundColor: '#ECF0F1', borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#95A5A6', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                <Text style={{ color: '#95A5A6', fontWeight: '500', fontSize: 13 }}>Toca para tomar o seleccionar logo</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Cuenta del Responsable</Text>
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>Con esta contraseña podrás iniciar sesión y gestionar tu asociación.</Text>
          <Input label="Teléfono de contacto" placeholder="Ej. 2221234567" value={telefono} onChangeText={setTelefono} error={errors.telefono} keyboardType="numeric" maxLength={10} required />
          <Input label="Correo Electrónico de contacto" placeholder="Ej. contacto@asociacion.org" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" required />
          <Input label="Contraseña" placeholder="Mínimo 6 caracteres" value={password} onChangeText={setPassword} error={errors.password} secureTextEntry required />
          <Input label="Confirmar Contraseña" placeholder="Repite tu contraseña" value={password2} onChangeText={setPassword2} error={errors.password2} secureTextEntry required />
          <Input label="Horario de Atención (Opcional)" placeholder="Ej. Lunes a Viernes de 9:00 AM a 6:00 PM" value={horarioAtencion} onChangeText={setHorarioAtencion} />

          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Tipos de animales que rescatan <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([{ id: 'perro', label: 'Perro' }, { id: 'gato', label: 'Gato' }, { id: 'ave', label: 'Ave' }, { id: 'otro', label: 'Otro' }] as const).map((t) => {
                const isSelected = tiposAnimales.includes(t.id);
                return (
                  <TouchableOpacity key={t.id} onPress={() => toggleTipoAnimal(t.id)} style={{ flex: 1, minWidth: '45%', paddingVertical: 10, borderRadius: 8, borderWidth: 1, backgroundColor: isSelected ? '#1F77B4' : '#FFFFFF', borderColor: errors.tiposAnimales ? '#E74C3C' : (isSelected ? '#1F77B4' : '#BDC3C7'), alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 14, color: isSelected ? '#FFFFFF' : '#7F8C8D' }}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.tiposAnimales && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.tiposAnimales}</Text>}
          </View>
        </Card>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Ubicación de la Sede <Text style={{ color: '#E74C3C' }}>*</Text></Text>
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>Indica dónde está ubicada físicamente tu asociación.</Text>

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

          <TouchableOpacity onPress={handleGetLocation} style={{ marginTop: 8, marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: '#1F77B4', fontWeight: '600' }}>
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
            <View style={{ backgroundColor: '#EAF6FF', padding: 10, borderRadius: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: '#2C3E50' }}>
                Ubicación seleccionada: <Text style={{ fontWeight: '600' }}>{direccionConfirmada}</Text>
              </Text>
            </View>
          )}

          <View style={{ marginTop: 16 }}>
            <Input label="Calle y número" placeholder="Ej. Av. Reforma 123" value={calle} onChangeText={setCalle} />
            <Input label="Colonia" placeholder="Ej. Centro Histórico" value={colonia} onChangeText={setColonia} />
            <Input label="Municipio / Ciudad" placeholder="Ej. Puebla" value={municipio} onChangeText={setMunicipio} />
            <TouchableOpacity onPress={handleGeocodeManualFields} style={{ marginTop: -8, marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: '#1F77B4', fontWeight: '600' }}>Mover el pin a esta dirección</Text>
            </TouchableOpacity>
          </View>

          <Input label="Referencia de Ubicación (Opcional)" placeholder="Ej. Frente al parque central" value={referencia} onChangeText={setReferencia} />
          <Input label="Radio de Cobertura de Rescate (KM)" placeholder="Ej. 15" value={radioKm} onChangeText={setRadioKm} error={errors.radioKm} keyboardType="numeric" required />
        </Card>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Fotos de la Asociación (Opcional)</Text>
          <Text style={{ fontSize: 13, color: '#7F8C8D', marginBottom: 16 }}>Agrega imágenes de tu refugio, instalaciones o eventos de adopción.</Text>
          {fotos.map((f, index) => (
            <View key={f.id} style={{ borderBottomWidth: index === fotos.length - 1 ? 0 : 1, borderBottomColor: '#ECF0F1', paddingBottom: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Image source={{ uri: f.foto_url }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Input placeholder="Descripción de la foto..." value={f.descripcion} onChangeText={(text) => handleUpdateFotoDesc(f.id, text)} style={{ height: 38, paddingVertical: 4, fontSize: 13 }} />
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}><Input placeholder="Orden" value={f.orden.toString()} onChangeText={(text) => handleUpdateFotoOrden(f.id, text)} keyboardType="numeric" style={{ height: 38, paddingVertical: 4, fontSize: 13, textAlign: 'center' }} /></View>
                    <TouchableOpacity onPress={() => handleDeleteFoto(f.id)} style={{ backgroundColor: '#FADBD8', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', minHeight: 40 }}><Text style={{ color: '#E63946', fontWeight: 'bold', fontSize: 13 }}>Eliminar</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ))}
          <Button label="Agregar Foto de la Asociación" variant="secondary" onPress={handleAddFoto} />
        </Card>

        <Button
          label="Registrar Asociación"
          onPress={handleSubmit}
          isLoading={isSubmitting}
        />
      </ScrollView>
    </View>
  );
}
