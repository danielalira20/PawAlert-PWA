import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';

type TipoAnimal = 'perro' | 'gato' | 'ave' | 'otro';
type UbicacionFuente = 'automatica' | 'manual';

interface AsociacionFoto { id: string; foto_url: string; descripcion: string; orden: number; }
interface Props { onClose?: () => void; }

export default function AssociationFormScreen({ onClose }: Props) {
  const [nombre, setNombre] = useState('');
  const [nombreResponsable, setNombreResponsable] = useState('');
  const [acercaDe, setAcercaDe] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [horarioAtencion, setHorarioAtencion] = useState('');
  const [tiposAnimales, setTiposAnimales] = useState<TipoAnimal[]>([]);

  const [ubicacionFuente, setUbicacionFuente] = useState<UbicacionFuente>('automatica');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  
  const [calle, setCalle] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [referencia, setReferencia] = useState('');

  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [radioKm, setRadioKm] = useState('');
  const [fotos, setFotos] = useState<AsociacionFoto[]>([]);

  // --- NUEVO: Estado para manejar errores ---
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const toggleTipoAnimal = (tipo: TipoAnimal) => {
    if (tiposAnimales.includes(tipo)) {
      setTiposAnimales(tiposAnimales.filter((t) => t !== tipo));
    } else {
      setTiposAnimales([...tiposAnimales, tipo]);
    }
    setErrors((prev) => ({ ...prev, tiposAnimales: '' })); // Limpiar error al seleccionar
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
    Alert.alert('Agregar Foto de la Asociación', '¿Qué deseas hacer?', [{ text: 'Tomar Foto', onPress: () => captureFoto(true) }, { text: 'Elegir de Galería', onPress: () => captureFoto(false) }, { text: 'Cancelar', style: 'cancel' }]);
  };

  const handleUpdateFotoDesc = (id: string, text: string) => setFotos(fotos.map(f => f.id === id ? { ...f, descripcion: text } : f));
  const handleUpdateFotoOrden = (id: string, text: string) => { const parsed = parseInt(text, 10); setFotos(fotos.map(f => f.id === id ? { ...f, orden: isNaN(parsed) ? 1 : parsed } : f)); };
  const handleDeleteFoto = (id: string) => setFotos(fotos.filter(f => f.id !== id));

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitud(position.coords.latitude.toString());
          setLongitud(position.coords.longitude.toString());
          setLocation({ coords: { latitude: position.coords.latitude, longitude: position.coords.longitude, altitude: null, accuracy: position.coords.accuracy, altitudeAccuracy: null, heading: null, speed: null }, timestamp: position.timestamp } as any);
          setErrors((prev) => ({ ...prev, ubicacion: '' }));
          setIsLoadingGps(false);
          Alert.alert('Ubicación obtenida', 'Las coordenadas se han cargado.');
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
      if (status !== 'granted') { Alert.alert('GPS Denegado', 'Por favor permite el acceso al GPS.'); setIsLoadingGps(false); return; }
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      setLatitud(currentLocation.coords.latitude.toString());
      setLongitud(currentLocation.coords.longitude.toString());
      setErrors((prev) => ({ ...prev, ubicacion: '' }));
      Alert.alert('Ubicación obtenida', 'Las coordenadas se han cargado.');
    } catch (error) {
      Alert.alert('Error', 'No pudimos obtener tu ubicación.');
    } finally {
      setIsLoadingGps(false);
    }
  };

  const handleResetForm = () => {
    setNombre(''); setNombreResponsable(''); setAcercaDe(''); setLogoUrl(''); setTelefono(''); setEmail(''); setHorarioAtencion(''); setTiposAnimales([]); setCalle(''); setColonia(''); setMunicipio(''); setReferencia(''); setLatitud(''); setLongitud(''); setRadioKm(''); setLocation(null); setFotos([]); setErrors({});
  };

  // --- NUEVO: Validador estricto F1 ---
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!nombre.trim()) newErrors.nombre = 'El nombre de la asociación es obligatorio.';
    if (!nombreResponsable.trim()) newErrors.nombreResponsable = 'El nombre del responsable es obligatorio.';

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

    if (tiposAnimales.length === 0) newErrors.tiposAnimales = 'Selecciona al menos un tipo de animal que rescatan.';

    const radVal = parseInt(radioKm, 10);
    if (!radioKm.trim()) {
      newErrors.radioKm = 'El radio de cobertura es obligatorio.';
    } else if (isNaN(radVal) || radVal <= 0) {
      newErrors.radioKm = 'Ingresa un número válido mayor a 0.';
    }

    if (ubicacionFuente === 'manual') {
      if (!calle.trim()) newErrors.calle = 'La calle es obligatoria.';
      if (!colonia.trim()) newErrors.colonia = 'La colonia es obligatoria.';
      if (!municipio.trim()) newErrors.municipio = 'El municipio es obligatorio.';
    } else {
      if (!latitud || !longitud) newErrors.ubicacion = 'Por favor, obtén la ubicación de tu sede con el GPS.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Formulario Incompleto', 'Revisa los campos marcados en rojo para continuar.');
      return;
    }
  
    let finalLat = latitud;
    let finalLng = longitud;

    const formData = new FormData();
    formData.append('nombre', nombre.trim());
    formData.append('nombre_responsable', nombreResponsable.trim());
    formData.append('contacto_telefono', telefono.trim());
    formData.append('contacto_email', email.trim());
    formData.append('tipos_animales', JSON.stringify(tiposAnimales));
    formData.append('latitud', finalLat);
    formData.append('longitud', finalLng);
    formData.append('radio_km', radioKm);
    if (acercaDe.trim()) formData.append('acerca_de', acercaDe.trim());
    if (horarioAtencion.trim()) formData.append('horario_atencion', horarioAtencion.trim());
    if (calle.trim()) formData.append('calle', calle.trim());
    if (colonia.trim()) formData.append('colonia', colonia.trim());
    if (municipio.trim()) formData.append('municipio', municipio.trim());
    if (referencia.trim()) formData.append('referencia', referencia.trim());

    if (logoUrl) formData.append('logo', { uri: logoUrl, name: `logo_${Date.now()}.jpg`, type: 'image/jpeg' } as any);

    if (fotos.length > 0) {
      fotos.forEach((f) => formData.append('fotos', { uri: f.foto_url, name: `foto_${Date.now()}.jpg`, type: 'image/jpeg' } as any));
      formData.append('fotos_descripciones', JSON.stringify(fotos.map(f => f.descripcion || null)));
      formData.append('fotos_ordenes', JSON.stringify(fotos.map(f => f.orden)));
    }

    try {
      const response = await axios.post(`${API_URL}/associations`, formData, { headers: { 'Content-Type': 'multipart/form-data' }});
      if (response.status === 201) {
        Alert.alert('¡Registro exitoso!', response.data.mensaje || 'Tu solicitud ha sido registrada.', [{ text: 'OK', onPress: () => { handleResetForm(); if (onClose) onClose(); } }]);
      } else {
        Alert.alert('Error', response.data.detail || 'Ocurrió un error al registrar la asociación.');
      }
    } catch (error: any) {
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido';
      Alert.alert('Error', mensaje);
    }
  };

  const renderUbicacion = () => {
    if (ubicacionFuente === 'automatica') {
      return (
        <View style={{ marginBottom: 16, marginTop: 8 }}>
          <Button label={location ? "Ubicación obtenida correctamente" : "Obtener mi ubicación actual"} variant={location ? "success" : "secondary"} onPress={handleGetLocation} isLoading={isLoadingGps} />
          {errors.ubicacion && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.ubicacion}</Text>}
        </View>
      );
    } else {
      return (
        <View style={{ marginTop: 8 }}>
          <Input label="Calle y número" placeholder="Ej. Av. Reforma 123" value={calle} onChangeText={setCalle} error={errors.calle} required />
          <Input label="Colonia" placeholder="Ej. Centro Histórico" value={colonia} onChangeText={setColonia} error={errors.colonia} required />
          <Input label="Municipio / Ciudad" placeholder="Ej. Puebla" value={municipio} onChangeText={setMunicipio} error={errors.municipio} required />
        </View>
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      {/* Header del Modal con la X para cerrar */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Registro de Asociación</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#95A5A6' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      >
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>
          Registra tu asociación para comenzar a recibir reportes de rescate en tu zona.
        </Text>

      <Card>
        <Input label="Nombre de la Asociación" placeholder="Ej. Huellitas de Amor A.C." value={nombre} onChangeText={setNombre} error={errors.nombre} required />
        <Input label="Nombre del Responsable" placeholder="Ej. Juan Pérez" value={nombreResponsable} onChangeText={setNombreResponsable} error={errors.nombreResponsable} required />
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
        <Input label="Teléfono de contacto" placeholder="Ej. 2221234567" value={telefono} onChangeText={setTelefono} error={errors.telefono} keyboardType="numeric" maxLength={10} required />
        <Input label="Correo Electrónico de contacto" placeholder="Ej. contacto@asociacion.org" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" required />
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
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Método de Ubicación de la Sede <Text style={{ color: '#E74C3C' }}>*</Text></Text>
          <View style={{ flexDirection: 'row', backgroundColor: '#ECF0F1', padding: 4, borderRadius: 12 }}>
            <TouchableOpacity onPress={() => setUbicacionFuente('automatica')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'automatica' ? '#FFFFFF' : 'transparent' }}><Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'automatica' ? '#1F77B4' : '#95A5A6' }}>GPS Automático</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setUbicacionFuente('manual')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'manual' ? '#FFFFFF' : 'transparent' }}><Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'manual' ? '#1F77B4' : '#95A5A6' }}>Ingreso Manual</Text></TouchableOpacity>
          </View>
        </View>

        {renderUbicacion()}
        {latitud && longitud ? <Text style={{ fontSize: 12, color: '#06A77D', marginBottom: 16, textAlign: 'center', fontWeight: '500' }}>✓ Coordenadas obtenidas mediante GPS ({parseFloat(latitud).toFixed(4)}, {parseFloat(longitud).toFixed(4)})</Text> : null}
        
        <Input label="Referencia de Ubicación (Opcional)" placeholder="Ej. Frente al parque central" value={referencia} onChangeText={setReferencia} />
        <Input label="Radio de Cobertura de Rescate (KM) *" placeholder="Ej. 15" value={radioKm} onChangeText={setRadioKm} error={errors.radioKm} keyboardType="numeric" required />
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
        disabled={!isFormValid()}
      />
      </ScrollView>
    </View>
  );
}