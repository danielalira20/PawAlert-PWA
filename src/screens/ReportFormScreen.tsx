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

type TipoAnimal = 'Perro' | 'Gato' | 'Otro' | null;
type Condition = 'green' | 'yellow' | 'red' | null;
type Size = 'Pequeño' | 'Mediano' | 'Grande' | null;
type UbicacionFuente = 'automatica' | 'manual';

interface AnimalFoto {
  id: string;
  foto_url: string;
  descripcion: string;
  orden: number;
}

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
  const [fotos, setFotos] = useState<AnimalFoto[]>([]);

  const [ubicacionFuente, setUbicacionFuente] = useState<UbicacionFuente>('automatica');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isLoadingGps, setIsLoadingGps] = useState(false);

  const [calle, setCalle] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [referencia, setReferencia] = useState('');

  const [condition, setCondition] = useState<Condition>(null);
  const [size, setSize] = useState<Size>(null);
  const [description, setDescription] = useState('');

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

    const result = await launchMethod({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const manipulated = await manipulateAsync(
        asset.uri,
        [],
        { compress: 0.8, format: SaveFormat.JPEG }
      );

      const newFoto: AnimalFoto = {
        id: Math.random().toString(36).substring(2, 9),
        foto_url: manipulated.uri,
        descripcion: '',
        orden: fotos.length + 1,
      };
      setFotos([...fotos, newFoto]);
    }
  };

  const handleAddFoto = () => {
    Alert.alert(
      'Agregar Foto del animalito',
      '¿Qué deseas hacer?',
      [
        { text: 'Tomar Foto', onPress: () => captureFoto(true) },
        { text: 'Elegir de Galería', onPress: () => captureFoto(false) },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  const handleUpdateFotoDesc = (id: string, text: string) => {
    setFotos(fotos.map(f => f.id === id ? { ...f, descripcion: text } : f));
  };

  const handleDeleteFoto = (id: string) => {
    setFotos(fotos.filter(f => f.id !== id));
  };

  const handleGetLocation = async () => {
    setIsLoadingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS Denegado', 'Usa la opción manual para ingresar la dirección.');
        setUbicacionFuente('manual');
        setIsLoadingGps(false);
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    } catch (error) {
      Alert.alert('Error', 'No pudimos obtener tu ubicación.');
      setUbicacionFuente('manual');
    } finally {
      setIsLoadingGps(false);
    }
  };

  const isFormValid = () => {
    const hasBaseInfo =
      nombre.trim().length > 0 &&
      apellidoPaterno.trim().length > 0 &&
      telefono.trim().length > 0 &&
      fotos.length > 0 &&
      tipoAnimal !== null;

    const hasStatusInfo = condition !== null && size !== null;
    let hasLocation = false;
    if (ubicacionFuente === 'automatica') {
      hasLocation = location !== null;
    } else {
      hasLocation = calle.trim().length > 0 && colonia.trim().length > 0 && municipio.trim().length > 0;
    }
    return hasBaseInfo && hasStatusInfo && hasLocation;
  };

  const mapCondicion = (c: Condition): string => ({ green: 'estable', yellow: 'herido', red: 'grave' }[c!]);
  const mapTipoAnimal = (t: TipoAnimal): string => t!.toLowerCase();
  const mapTamanio = (s: Size): string => ({ Pequeño: 'pequeno', Mediano: 'mediano', Grande: 'grande' }[s!]);

  const handleSubmit = async () => {
    try {
      if (fotos.length === 0) {
        Alert.alert('Falta la foto', 'Sube al menos una foto antes de enviar.');
        return;
      }
      const formData = new FormData();
      formData.append('nombre', nombre);
      formData.append('apellido_paterno', apellidoPaterno);
      if (apellidoMaterno.trim()) formData.append('apellido_materno', apellidoMaterno);
      formData.append('telefono', telefono);
      if (email.trim()) formData.append('email', email);

      fotos.forEach((f) => {
        formData.append('fotos', {
          uri: f.foto_url,
          name: `foto_${f.id}_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);
      });
      formData.append('fotos_descripciones', JSON.stringify(fotos.map(f => f.descripcion || null)));
      formData.append('fotos_ordenes', JSON.stringify(fotos.map(f => f.orden)));

      formData.append('tipo_animal', mapTipoAnimal(tipoAnimal));
      formData.append('condicion', mapCondicion(condition));
      formData.append('tamanio', mapTamanio(size));
      if (description.trim()) formData.append('descripcion', description);

      if (ubicacionFuente === 'automatica' && location) {
        formData.append('latitud', String(location.coords.latitude));
        formData.append('longitud', String(location.coords.longitude));
      } else {
        formData.append('calle', calle);
        formData.append('colonia', colonia);
        formData.append('municipio', municipio);
        if (referencia.trim()) formData.append('referencia', referencia);
      }

      const response = await axios.post(`${API_URL}/reports`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = response.data;

      if (data.asociacion_asignada) {
        Alert.alert(
          '¡Reporte enviado!',
          `Tu reporte fue asignado a: ${data.asociacion_asignada}`,
          [{ text: 'OK' }]
        )
      } else if (data.contactos_emergencia && data.contactos_emergencia.length > 0) {
        const contactos = data.contactos_emergencia
          .map((c: any) => `${c.nombre}: ${c.telefono}`)
          .join('\n')
        Alert.alert(
          '¡Reporte enviado!',
          `No hay asociaciones disponibles en tu zona.\n\nContactos de emergencia:\n${contactos}`,
          [{ text: 'OK' }]
        )
      } else {
        Alert.alert(
          '¡Reporte enviado!',
          'Tu reporte fue publicado. Te avisaremos cuando una asociación lo atienda.',
          [{ text: 'OK' }]
        )
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
          <Button label={location ? 'Ubicación obtenida correctamente' : 'Obtener mi ubicación actual'} variant={location ? 'success' : 'secondary'} onPress={handleGetLocation} isLoading={isLoadingGps} />
        </View>
      );
    }
    return (
      <View style={{ marginTop: 8 }}>
        <Input label="Calle y número" placeholder="Ej. Av. Reforma 123" value={calle} onChangeText={setCalle} required />
        <Input label="Colonia" placeholder="Ej. Centro Histórico" value={colonia} onChangeText={setColonia} required />
        <Input label="Municipio / Ciudad" placeholder="Ej. Puebla" value={municipio} onChangeText={setMunicipio} required />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      {/* Header del Modal con la X para cerrar */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C3E50' }}>Nuevo Reporte</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#95A5A6' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>
          Ayúdanos a rescatar a este animalito llenando los datos.
        </Text>

        <Card>
          <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombre} onChangeText={setNombre} required />
          <Input label="Apellido Paterno" placeholder="Ej. Pérez" value={apellidoPaterno} onChangeText={setApellidoPaterno} required />
          <Input label="Apellido Materno (Opcional)" placeholder="Ej. López" value={apellidoMaterno} onChangeText={setApellidoMaterno} />
          <Input label="Teléfono de contacto" placeholder="Ej. 222 123 4567" value={telefono} onChangeText={setTelefono} required />
          <Input label="Correo Electrónico (Opcional)" placeholder="Ej. correo@ejemplo.com" value={email} onChangeText={setEmail} />

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Tipo de Animal <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              {(['Perro', 'Gato', 'Otro'] as TipoAnimal[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTipoAnimal(t)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: tipoAnimal === t ? '#3498DB' : '#FFFFFF', borderColor: tipoAnimal === t ? '#3498DB' : '#BDC3C7', alignItems: 'center' }}
                >
                  <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 14, color: tipoAnimal === t ? '#FFFFFF' : '#7F8C8D' }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Fotos del animalito <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <Text style={{ fontSize: 13, color: '#7F8C8D', marginBottom: 16 }}>
              Agrega una o más imágenes para que el rescate sea más fácil.
            </Text>

            {fotos.map((f, index) => (
              <View
                key={f.id}
                style={{
                  borderBottomWidth: index === fotos.length - 1 ? 0 : 1,
                  borderBottomColor: '#ECF0F1',
                  paddingBottom: 16,
                  marginBottom: 16
                }}
              >
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Image
                    source={{ uri: f.foto_url }}
                    style={{ width: 80, height: 80, borderRadius: 8 }}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Input
                      placeholder="Descripción de la foto..."
                      value={f.descripcion}
                      onChangeText={(text) => handleUpdateFotoDesc(f.id, text)}
                      style={{ height: 38, paddingVertical: 4, fontSize: 13 }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <TouchableOpacity
                        onPress={() => handleDeleteFoto(f.id)}
                        style={{
                          backgroundColor: '#FADBD8',
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          justifyContent: 'center',
                          alignItems: 'center',
                          minHeight: 40,
                        }}
                      >
                        <Text style={{ color: '#E63946', fontWeight: 'bold', fontSize: 13 }}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}

            <Button
              label="Agregar Foto del animalito"
              variant="secondary"
              onPress={handleAddFoto}
            />
          </View>
        </Card>

        <Card>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Método de Ubicación <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', backgroundColor: '#ECF0F1', padding: 4, borderRadius: 12 }}>
              <TouchableOpacity onPress={() => setUbicacionFuente('automatica')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'automatica' ? '#FFFFFF' : 'transparent' }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'automatica' ? '#3498DB' : '#95A5A6' }}>GPS Automático</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUbicacionFuente('manual')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'manual' ? '#FFFFFF' : 'transparent' }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'manual' ? '#3498DB' : '#95A5A6' }}>Ingreso Manual</Text>
              </TouchableOpacity>
            </View>
          </View>
          {renderUbicacion()}
          <Input label="Referencia (Opcional)" placeholder="Ej. Frente a la tienda de abarrotes..." value={referencia} onChangeText={setReferencia} />
        </Card>

        <Card>
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Condición (Semáforo) <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <TouchableOpacity onPress={() => setCondition('green')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'green' ? '#27AE60' : '#FFFFFF', borderColor: condition === 'green' ? '#27AE60' : '#BDC3C7', alignItems: 'center' }}>
                <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'green' ? '#FFFFFF' : '#2C3E50' }}>Estable</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCondition('yellow')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'yellow' ? '#F39C12' : '#FFFFFF', borderColor: condition === 'yellow' ? '#F39C12' : '#BDC3C7', alignItems: 'center' }}>
                <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'yellow' ? '#FFFFFF' : '#2C3E50' }}>Herido</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCondition('red')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'red' ? '#E74C3C' : '#FFFFFF', borderColor: condition === 'red' ? '#E74C3C' : '#BDC3C7', alignItems: 'center' }}>
                <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'red' ? '#FFFFFF' : '#2C3E50' }}>Grave</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Tamaño <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              {(['Pequeño', 'Mediano', 'Grande'] as Size[]).map((s) => (
                <TouchableOpacity key={s} onPress={() => setSize(s)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: size === s ? '#3498DB' : '#FFFFFF', borderColor: size === s ? '#3498DB' : '#BDC3C7', alignItems: 'center' }}>
                  <Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 14, color: size === s ? '#FFFFFF' : '#7F8C8D' }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ marginBottom: 8 }}>
            <Input label="Descripción adicional (Opcional)" placeholder="Detalles sobre el animal o la situación..." value={description} onChangeText={setDescription} multiline maxLength={300} numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12 }}>{description.length}/300</Text>
          </View>
        </Card>

        <Button label="Enviar Reporte" onPress={handleSubmit} disabled={!isFormValid()} />
      </ScrollView>
    </View>
  );
}