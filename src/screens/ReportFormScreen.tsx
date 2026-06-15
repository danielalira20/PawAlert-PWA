import axios from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
// IMPORTANTE: Importamos el nuevo componente
import LocationPickerMap from './LocationPickerMap';

type TipoAnimal = 'Perro' | 'Gato' | 'Otro' | null;
type Condition = 'green' | 'yellow' | 'red' | null;
type Size = 'Pequeño' | 'Mediano' | 'Grande' | null;
// ACTUALIZADO: Cambiamos 'manual' por 'pin'
type UbicacionFuente = 'automatica' | 'pin';

type SelectedPhoto = {
  uri: string;
  fileName: string;
  mimeType: string;
};

interface ReportFormScreenProps {
  onClose?: () => void;
}

export default function ReportFormScreen({ onClose }: ReportFormScreenProps) {
  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');

  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');

  const [tipoAnimal, setTipoAnimal] = useState<TipoAnimal>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhoto | null>(null);

  const [ubicacionFuente, setUbicacionFuente] = useState<UbicacionFuente>('automatica');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  // ACTUALIZADO: Estado para la ubicación del pin interactivo (Por defecto en el centro de Puebla)
  const [pinLocation, setPinLocation] = useState<{ latitud: number; longitud: number }>({
    latitud: 19.0414,
    longitud: -98.2063,
  });

  const [referencia, setReferencia] = useState('');
  const [condition, setCondition] = useState<Condition>(null);
  const [size, setSize] = useState<Size>(null);
  const [description, setDescription] = useState('');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const normalizePickedImage = async (asset: ImagePicker.ImagePickerAsset) => {
    const manipulated = await manipulateAsync(asset.uri, [], { compress: 0.8, format: SaveFormat.JPEG });
    const filename = `upload_${Date.now()}.jpg`;
    setPhotoUri(manipulated.uri);
    setSelectedPhoto({ uri: manipulated.uri, fileName: filename, mimeType: 'image/jpeg' });
  };

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) { Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (!result.canceled) await normalizePickedImage(result.assets[0]);
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) { Alert.alert('Permiso denegado', 'Necesitamos acceso a tu cámara.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (!result.canceled) await normalizePickedImage(result.assets[0]);
  };

  const showImageOptions = () => {
    Alert.alert('Foto del animalito', '¿Qué deseas hacer?', [
      { text: 'Tomar Foto', onPress: handleTakePhoto },
      { text: 'Elegir de Galería', onPress: handlePickImage },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS Denegado', 'Por favor usa el Pin en el mapa para indicar la ubicación.');
        setUbicacionFuente('pin');
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      setErrors((prev) => ({ ...prev, ubicacion: '' }));
    } catch (error) {
      Alert.alert('Error', 'No pudimos obtener tu ubicación GPS.');
      setUbicacionFuente('pin');
    } finally {
      setIsLoadingGps(false);
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!nombre.trim()) newErrors.nombre = 'El nombre es obligatorio.';
    if (!apellidoPaterno.trim()) newErrors.apellidoPaterno = 'El apellido paterno es obligatorio.';
    if (!telefono.trim()) {
      newErrors.telefono = 'El teléfono de contacto es obligatorio.';
    } else if (!/^\d{10}$/.test(telefono.trim())) {
      newErrors.telefono = 'El teléfono debe tener exactamente 10 dígitos numéricos.';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Ingresa un correo electrónico válido.';
    }
    if (!tipoAnimal) newErrors.tipoAnimal = 'Selecciona un tipo de animal.';
    if (!condition) newErrors.condition = 'Indica la condición del animal.';
    if (!size) newErrors.size = 'Indica el tamaño del animal.';
    if (!selectedPhoto) newErrors.foto = 'Debes adjuntar una foto del animal.';

    // ACTUALIZADO: Ya no validamos campos de texto de ubicación manual
    if (ubicacionFuente === 'automatica' && !location) {
      newErrors.ubicacion = 'Por favor, obtén tu ubicación actual con el GPS o selecciona el Pin.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const mapCondicion = (c: Condition): string => ({ green: 'estable', yellow: 'herido', red: 'grave' }[c!]);
  const mapTipoAnimal = (t: TipoAnimal): string => t!.toLowerCase();
  const mapTamanio = (s: Size): string => ({ Pequeño: 'pequeno', Mediano: 'mediano', Grande: 'grande' }[s!]);

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Formulario Incompleto', 'Revisa los campos marcados en rojo para continuar.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('nombre', nombre);
      formData.append('apellido_paterno', apellidoPaterno);
      if (apellidoMaterno.trim()) formData.append('apellido_materno', apellidoMaterno);
      formData.append('telefono', telefono);
      if (email.trim()) formData.append('email', email);

      const photoFile = { uri: selectedPhoto!.uri, name: selectedPhoto!.fileName, type: selectedPhoto!.mimeType };
      formData.append('foto', photoFile as any);
      formData.append('tipo_animal', mapTipoAnimal(tipoAnimal));
      formData.append('condicion', mapCondicion(condition));
      formData.append('tamanio', mapTamanio(size));
      if (description.trim()) formData.append('descripcion', description);
      if (referencia.trim()) formData.append('referencia', referencia);

      // ACTUALIZADO: Envío estricto de latitud y longitud según la fuente elegida
      if (ubicacionFuente === 'automatica' && location) {
        formData.append('latitud', String(location.coords.latitude));
        formData.append('longitud', String(location.coords.longitude));
      } else if (ubicacionFuente === 'pin') {
        formData.append('latitud', String(pinLocation.latitud));
        formData.append('longitud', String(pinLocation.longitud));
      }

      const response = await axios.post(`${API_URL}/reports`, formData, { headers: { 'Content-Type': 'multipart/form-data' }});
      const data = response.data;

      if (data.asociacion_asignada) {
        Alert.alert('¡Reporte enviado!', `Tu reporte fue asignado a: ${data.asociacion_asignada}`, [{ text: 'OK' }]);
      } else if (data.contactos_emergencia && data.contactos_emergencia.length > 0) {
        const contactos = data.contactos_emergencia.map((c: any) => `${c.nombre}: ${c.telefono}`).join('\n');
        Alert.alert('¡Reporte enviado!', `No hay asociaciones disponibles en tu zona.\n\nContactos de emergencia:\n${contactos}`, [{ text: 'OK' }]);
      } else {
        Alert.alert('¡Reporte enviado!', 'Tu reporte fue publicado. Te avisaremos cuando una asociación lo atienda.', [{ text: 'OK' }]);
      }
      
      if (onClose) onClose();
      
    } catch (error: any) {
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido';
      Alert.alert('Error', mensaje);
    }
  };

  const renderUbicacion = () => {
    if (ubicacionFuente === 'automatica') {
      return (
        <View style={{ marginBottom: 16, marginTop: 8 }}>
          <Button label={location ? 'Ubicación obtenida correctamente' : 'Obtener mi ubicación actual'} variant={location ? 'success' : 'secondary'} onPress={handleGetLocation} isLoading={isLoadingGps} />
          {errors.ubicacion && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.ubicacion}</Text>}
        </View>
      );
    }
    // ACTUALIZADO: Renderizamos el mapa con el pin arrastrable
    return (
      <LocationPickerMap
        onLocationSelect={(latitud, longitud) => setPinLocation({ latitud, longitud })}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Nuevo Reporte</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#95A5A6' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>Ayúdanos a rescatar a este animalito llenando los datos.</Text>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 12 }}>Información del Reportante</Text>
          <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombre} onChangeText={setNombre} error={errors.nombre} required />
          <Input label="Apellido Paterno" placeholder="Ej. Pérez" value={apellidoPaterno} onChangeText={setApellidoPaterno} error={errors.apellidoPaterno} required />
          <Input label="Apellido Materno (Opcional)" placeholder="Ej. López" value={apellidoMaterno} onChangeText={setApellidoMaterno} />
          <Input label="Teléfono de contacto" placeholder="Ej. 2221234567" value={telefono} onChangeText={setTelefono} error={errors.telefono} keyboardType="numeric" maxLength={10} required />
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginTop: -8, marginBottom: 16 }}>Lo usamos para contactarte sobre el estado de tu reporte.</Text>
          <Input label="Correo Electrónico (Opcional)" placeholder="Ej. correo@ejemplo.com" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
        </Card>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Información del Animal</Text>
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>Describe lo mejor posible la situación actual para asignar la ayuda adecuada.</Text>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Tipo de Animal <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              {(['Perro', 'Gato', 'Otro'] as TipoAnimal[]).map((t) => (
                <TouchableOpacity key={t} onPress={() => setTipoAnimal(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: tipoAnimal === t ? '#3498DB' : '#FFFFFF', borderColor: errors.tipoAnimal ? '#E74C3C' : (tipoAnimal === t ? '#3498DB' : '#BDC3C7'), alignItems: 'center' }}>
                  <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 14, color: tipoAnimal === t ? '#FFFFFF' : '#7F8C8D' }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.tipoAnimal && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.tipoAnimal}</Text>}
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Condición (Semáforo) <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <TouchableOpacity onPress={() => setCondition('green')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'green' ? '#27AE60' : '#FFFFFF', borderColor: errors.condition ? '#E74C3C' : (condition === 'green' ? '#27AE60' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'green' ? '#FFFFFF' : '#2C3E50' }}>Estable</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setCondition('yellow')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'yellow' ? '#F39C12' : '#FFFFFF', borderColor: errors.condition ? '#E74C3C' : (condition === 'yellow' ? '#F39C12' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'yellow' ? '#FFFFFF' : '#2C3E50' }}>Herido</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setCondition('red')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'red' ? '#E74C3C' : '#FFFFFF', borderColor: errors.condition ? '#E74C3C' : (condition === 'red' ? '#E74C3C' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'red' ? '#FFFFFF' : '#2C3E50' }}>Grave</Text></TouchableOpacity>
            </View>
            {errors.condition && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.condition}</Text>}
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Tamaño <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              {(['Pequeño', 'Mediano', 'Grande'] as Size[]).map((s) => (
                <TouchableOpacity key={s} onPress={() => setSize(s)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: size === s ? '#3498DB' : '#FFFFFF', borderColor: errors.size ? '#E74C3C' : (size === s ? '#3498DB' : '#BDC3C7'), alignItems: 'center' }}>
                  <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 14, color: size === s ? '#FFFFFF' : '#7F8C8D' }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.size && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.size}</Text>}
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Foto del animalito <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            {photoUri ? (
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: photoUri }} style={{ width: '100%', height: 192, borderRadius: 12 }} />
                <TouchableOpacity onPress={() => { setPhotoUri(null); setSelectedPhoto(null); }} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#FFFFFF', padding: 8, borderRadius: 20 }}>
                  <Text style={{ color: '#E74C3C', fontWeight: 'bold', fontSize: 12 }}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={showImageOptions} style={{ width: '100%', height: 128, backgroundColor: '#ECF0F1', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: errors.foto ? '#E74C3C' : '#95A5A6', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: errors.foto ? '#E74C3C' : '#95A5A6', fontWeight: '500' }}>Toca para tomar o subir foto</Text>
              </TouchableOpacity>
            )}
            {errors.foto && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.foto}</Text>}
          </View>

          <View style={{ marginBottom: 8 }}>
            <Input label="Descripción adicional (Opcional)" placeholder="Detalles sobre el animal o la situación..." value={description} onChangeText={setDescription} multiline maxLength={300} numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12 }}>{description.length}/300</Text>
          </View>
        </Card>

        <Card>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Ubicación del Reporte</Text>
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>Indica el lugar donde viste al animal, no donde estás ahora.</Text>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Método de Ubicación <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', backgroundColor: '#ECF0F1', padding: 4, borderRadius: 12 }}>
              <TouchableOpacity onPress={() => setUbicacionFuente('automatica')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'automatica' ? '#FFFFFF' : 'transparent' }}><Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'automatica' ? '#3498DB' : '#95A5A6' }}>Mi Ubicación Actual</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setUbicacionFuente('pin')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'pin' ? '#FFFFFF' : 'transparent' }}><Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'pin' ? '#3498DB' : '#95A5A6' }}>Pin en el Mapa</Text></TouchableOpacity>
            </View>
          </View>
          
          {renderUbicacion()}
          
          <Input label="Referencia (Opcional)" placeholder="Ej. Frente a la tienda de abarrotes..." value={referencia} onChangeText={setReferencia} />
        </Card>

        <Button label="Enviar Reporte" onPress={handleSubmit} />
      </ScrollView>
    </View>
  );
}