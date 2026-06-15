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

interface AsociacionFoto {
  id: string;
  foto_url: string;
  descripcion: string;
  orden: number;
}

interface Props {
  onClose?: () => void;
}
export default function AssociationFormScreen({ onClose }: Props) {

  // --- Estados del Formulario ---
  
  // Datos Generales
  const [nombre, setNombre] = useState('');
  const [nombreResponsable, setNombreResponsable] = useState('');
  const [acercaDe, setAcercaDe] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Contacto y Servicio
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [horarioAtencion, setHorarioAtencion] = useState('');
  const [tiposAnimales, setTiposAnimales] = useState<TipoAnimal[]>([]);

  // Ubicación
  const [ubicacionFuente, setUbicacionFuente] = useState<UbicacionFuente>('automatica');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  
  // Campos de dirección física (para modo manual)
  const [calle, setCalle] = useState('');
  const [colonia, setColonia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [referencia, setReferencia] = useState('');

  // Coordenadas resueltas por GPS
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');

  // Radio de cobertura
  const [radioKm, setRadioKm] = useState('');

  // Fotos de la Asociación
  const [fotos, setFotos] = useState<AsociacionFoto[]>([]);

  // --- Lógica del Selector de Animales ---
  const toggleTipoAnimal = (tipo: TipoAnimal) => {
    if (tiposAnimales.includes(tipo)) {
      setTiposAnimales(tiposAnimales.filter((t) => t !== tipo));
    } else {
      setTiposAnimales([...tiposAnimales, tipo]);
    }
  };

  // --- Lógica del Logo ---
  const handlePickLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para subir la foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setLogoUrl(result.assets[0].uri);
    }
  };

  const handleTakeLogo = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu cámara para tomar la foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setLogoUrl(result.assets[0].uri);
    }
  };

  const showLogoOptions = () => {
    Alert.alert(
      'Logo de la asociación',
      '¿Qué deseas hacer?',
      [
        { text: 'Tomar Foto', onPress: handleTakeLogo },
        { text: 'Elegir de Galería', onPress: handlePickLogo },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  // --- Lógica de Fotos Adicionales ---
  const handleAddFoto = async () => {
    Alert.alert(
      'Agregar Foto de la Asociación',
      '¿Qué deseas hacer?',
      [
        { text: 'Tomar Foto', onPress: () => captureFoto(true) },
        { text: 'Elegir de Galería', onPress: () => captureFoto(false) },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
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

    const result = await launchMethod({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      const newFoto: AsociacionFoto = {
        id: Math.random().toString(36).substring(2, 9),
        foto_url: result.assets[0].uri,
        descripcion: '',
        orden: fotos.length + 1,
      };
      setFotos([...fotos, newFoto]);
    }
  };

  const handleUpdateFotoDesc = (id: string, text: string) => {
    setFotos(fotos.map(f => f.id === id ? { ...f, descripcion: text } : f));
  };

  const handleUpdateFotoOrden = (id: string, text: string) => {
    const parsed = parseInt(text, 10);
    setFotos(fotos.map(f => f.id === id ? { ...f, orden: isNaN(parsed) ? 1 : parsed } : f));
  };

  const handleDeleteFoto = (id: string) => {
    setFotos(fotos.filter(f => f.id !== id));
  };

  // --- Lógica de GPS con Fallback para Web ---
  const handleGetLocation = async () => {
    setIsLoadingGps(true);

    // Si estamos en ambiente Web, el fallback nativo del navegador es el más robusto
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toString();
          const lng = position.coords.longitude.toString();
          setLatitud(lat);
          setLongitud(lng);
          setLocation({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              altitude: null,
              accuracy: position.coords.accuracy,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: position.timestamp,
          } as any);
          setIsLoadingGps(false);
          Alert.alert('Ubicación obtenida', 'Las coordenadas de tu ubicación actual se han cargado.');
        },
        (error) => {
          setIsLoadingGps(false);
          if (error.code === error.PERMISSION_DENIED) {
            Alert.alert(
              'GPS Denegado',
              'El acceso al GPS fue bloqueado en este sitio. Por favor, haz clic en el icono del candado o configuración junto a la barra de dirección (URL) del navegador y activa la Ubicación.'
            );
          } else {
            Alert.alert('Error', 'No pudimos obtener la ubicación. Verifica que tu dispositivo tenga activado el GPS.');
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
      return;
    }

    // Código para dispositivos móviles nativos (iOS / Android)
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS Denegado', 'Por favor permite el acceso al GPS para obtener la ubicación.');
        setIsLoadingGps(false);
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      setLatitud(currentLocation.coords.latitude.toString());
      setLongitud(currentLocation.coords.longitude.toString());
      Alert.alert('Ubicación obtenida', 'Las coordenadas de tu ubicación actual se han cargado.');
    } catch (error) {
      Alert.alert('Error', 'No pudimos obtener tu ubicación. Verifica tu conexión GPS.');
    } finally {
      setIsLoadingGps(false);
    }
  };

  // --- Resetear Formulario ---
  const handleResetForm = () => {
    setNombre('');
    setNombreResponsable('');
    setAcercaDe('');
    setLogoUrl('');
    setTelefono('');
    setEmail('');
    setHorarioAtencion('');
    setTiposAnimales([]);
    setCalle('');
    setColonia('');
    setMunicipio('');
    setReferencia('');
    setLatitud('');
    setLongitud('');
    setRadioKm('');
    setLocation(null);
    setFotos([]);
  };

  // --- Validación ---
  const isFormValid = () => {
    const hasBaseInfo = nombre.trim().length > 0 && 
                        nombreResponsable.trim().length > 0 && 
                        telefono.trim().length > 0 && 
                        email.trim().length > 0 && 
                        tiposAnimales.length > 0;

    const radVal = parseInt(radioKm, 10);
    const hasRadio = !isNaN(radVal) && radVal > 0;

    let hasAddress = true;
    if (ubicacionFuente === 'manual') {
      hasAddress = calle.trim().length > 0 && colonia.trim().length > 0 && municipio.trim().length > 0;
    }

    return hasBaseInfo && hasRadio && hasAddress;
  };

  // --- Enviar Formulario ---
  const handleSubmit = async () => {
  if (!isFormValid()) {
    Alert.alert('Formulario Incompleto', 'Por favor llena todos los campos obligatorios.')
    return
  }
  
  let finalLat = latitud
  let finalLng = longitud

  const latVal = parseFloat(latitud)
  const lngVal = parseFloat(longitud)

  if (isNaN(latVal) || isNaN(lngVal)) {
    setIsLoadingGps(true)

    if (typeof window !== 'undefined' && navigator.geolocation) {
      const getGeoLocation = () => {
        return new Promise<{ lat: string; lng: string }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude.toString(), lng: pos.coords.longitude.toString() }),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 8000 }
          )
        })
      }

      try {
        const coords = await getGeoLocation()
        finalLat = coords.lat
        finalLng = coords.lng
        setLatitud(finalLat)
        setLongitud(finalLng)
      } catch (error) {
        Alert.alert('GPS Requerido', 'Habilita los permisos de ubicación e intenta de nuevo.')
        setIsLoadingGps(false)
        return
      } finally {
        setIsLoadingGps(false)
      }
    } else {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          let currentLocation = await Location.getCurrentPositionAsync({})
          finalLat = currentLocation.coords.latitude.toString()
          finalLng = currentLocation.coords.longitude.toString()
          setLatitud(finalLat)
          setLongitud(finalLng)
        } else {
          Alert.alert('GPS Requerido', 'Habilita los permisos de ubicación e intenta de nuevo.')
          setIsLoadingGps(false)
          return
        }
      } catch (error) {
        Alert.alert('Error de Ubicación', 'No pudimos obtener la ubicación por GPS.')
        setIsLoadingGps(false)
        return
      } finally {
        setIsLoadingGps(false)
      }
    }
  }

  try {
    const formData = new FormData()

    formData.append('nombre', nombre.trim())
    formData.append('nombre_responsable', nombreResponsable.trim())
    formData.append('contacto_telefono', telefono.trim())
    formData.append('contacto_email', email.trim())
    formData.append('tipos_animales', JSON.stringify(tiposAnimales))
    formData.append('latitud', finalLat)
    formData.append('longitud', finalLng)
    formData.append('radio_km', radioKm)
    if (acercaDe.trim()) formData.append('acerca_de', acercaDe.trim())
    if (horarioAtencion.trim()) formData.append('horario_atencion', horarioAtencion.trim())
    if (calle.trim()) formData.append('calle', calle.trim())
    if (colonia.trim()) formData.append('colonia', colonia.trim())
    if (municipio.trim()) formData.append('municipio', municipio.trim())
    if (referencia.trim()) formData.append('referencia', referencia.trim())

    // Logo
    if (logoUrl) {
      formData.append('logo', {
        uri: logoUrl,
        name: `logo_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any)
    }

    // Fotos adicionales
    if (fotos.length > 0) {
      fotos.forEach((f) => {
        formData.append('fotos', {
          uri: f.foto_url,
          name: `foto_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any)
      })
      formData.append('fotos_descripciones', JSON.stringify(fotos.map(f => f.descripcion || null)))
      formData.append('fotos_ordenes', JSON.stringify(fotos.map(f => f.orden)))
    }

    const response = await axios.post(`${API_URL}/associations`, formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
  },
})

    const data = response.data

    if (response.status === 201) {
      Alert.alert(
        '¡Registro exitoso!',
        data.mensaje || 'Tu solicitud ha sido registrada.',
        [{ text: 'OK', onPress: () => { handleResetForm(); if (onClose) onClose(); } }]
      )
    } else {
      Alert.alert('Error', data.detail || 'Ocurrió un error al registrar la asociación.')
    }
    
      } catch (error: any) {
      console.log('Error completo:', error)
      const mensaje = error?.response?.data?.detail || error?.message || 'Error desconocido'
      Alert.alert('Error', mensaje)
    }
}

  // --- Renderizado de Ubicación (Igual a ReportFormScreen) ---
  const renderUbicacion = () => {
    if (ubicacionFuente === 'automatica') {
      return (
        <View style={{ marginBottom: 16, marginTop: 8 }}>
          <Button 
            label={location ? "Ubicación obtenida correctamente" : "Obtener mi ubicación actual"}
            variant={location ? "success" : "secondary"}
            onPress={handleGetLocation}
            isLoading={isLoadingGps}
          />
        </View>
      );
    } else {
      return (
        <View style={{ marginTop: 8 }}>
          <Input 
            label="Calle y número" 
            placeholder="Ej. Av. Reforma 123" 
            value={calle}
            onChangeText={setCalle}
            required 
          />
          <Input 
            label="Colonia" 
            placeholder="Ej. Centro Histórico" 
            value={colonia}
            onChangeText={setColonia}
            required 
          />
          <Input 
            label="Municipio / Ciudad" 
            placeholder="Ej. Puebla" 
            value={municipio}
            onChangeText={setMunicipio}
            required 
          />
        </View>
      );
    }
  };

  return (
    <ScrollView 
      style={{ flex: 1, backgroundColor: '#F5F5F5' }} 
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
    >
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2C3E50', marginBottom: 8 }}>
        Registro de Asociación
      </Text>
      <Text style={{ fontSize: 14, color: '#7F8C8D', marginBottom: 24 }}>
        Registra tu asociación para comenzar a recibir reportes de rescate en tu zona.
      </Text>

      {/* --- TARJETA 1: DATOS GENERALES --- */}
      <Card>
        <Input 
          label="Nombre de la Asociación" 
          placeholder="Ej. Huellitas de Amor A.C." 
          value={nombre}
          onChangeText={setNombre}
          required 
        />
        
        <Input 
          label="Nombre del Responsable" 
          placeholder="Ej. Juan Pérez" 
          value={nombreResponsable}
          onChangeText={setNombreResponsable}
          required 
        />
        
        <Input 
          label="Acerca de la Asociación (Opcional)" 
          placeholder="Describe la misión o actividades de la asociación..." 
          value={acercaDe}
          onChangeText={setAcercaDe}
          multiline
          maxLength={300}
          numberOfLines={3}
          style={{ height: 80, textAlignVertical: 'top' }}
        />
        <Text style={{ textAlign: 'right', color: '#95A5A6', fontSize: 12, marginBottom: 16 }}>
          {acercaDe.length}/300
        </Text>

        {/* Campo de Logo de la Asociación */}
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>
            Logo de la Asociación (Opcional)
          </Text>

          {logoUrl ? (
            <View style={{ position: 'relative', marginTop: 4 }}>
              <Image 
                source={{ uri: logoUrl }} 
                style={{ width: 100, height: 100, borderRadius: 50, alignSelf: 'center' }} 
              />
              <TouchableOpacity 
                onPress={() => setLogoUrl('')}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  backgroundColor: '#FFFFFF',
                  padding: 6,
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor: '#BDC3C7',
                }}
              >
                <Text style={{ color: '#E74C3C', fontWeight: 'bold', fontSize: 11 }}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              onPress={showLogoOptions}
              style={{
                width: '100%',
                height: 80,
                backgroundColor: '#ECF0F1',
                borderRadius: 8,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#95A5A6',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ color: '#95A5A6', fontWeight: '500', fontSize: 13 }}>
                Toca para tomar o seleccionar logo
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* --- TARJETA 2: CONTACTO Y SERVICIO --- */}
      <Card>
        <Input 
          label="Teléfono de contacto" 
          placeholder="Ej. 222 123 4567" 
          value={telefono}
          onChangeText={setTelefono}
          required 
        />

        <Input 
          label="Correo Electrónico de contacto" 
          placeholder="Ej. contacto@asociacion.org" 
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          required 
        />

        <Input 
          label="Horario de Atención (Opcional)" 
          placeholder="Ej. Lunes a Viernes de 9:00 AM a 6:00 PM" 
          value={horarioAtencion}
          onChangeText={setHorarioAtencion}
        />

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>
            Tipos de animales que rescatan <Text style={{ color: '#E74C3C' }}>*</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([
              { id: 'perro', label: 'Perro' },
              { id: 'gato', label: 'Gato' },
              { id: 'ave', label: 'Ave' },
              { id: 'otro', label: 'Otro' }
            ] as const).map((t) => {
              const isSelected = tiposAnimales.includes(t.id);
              return (
                <TouchableOpacity 
                  key={t.id}
                  onPress={() => toggleTipoAnimal(t.id)}
                  style={{
                    flex: 1,
                    minWidth: '45%',
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    backgroundColor: isSelected ? '#1F77B4' : '#FFFFFF',
                    borderColor: isSelected ? '#1F77B4' : '#BDC3C7',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <Text style={{
                    textAlign: 'center',
                    fontWeight: '500',
                    fontSize: 14,
                    color: isSelected ? '#FFFFFF' : '#7F8C8D',
                  }}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Card>

      {/* --- TARJETA 3: UBICACIÓN Y COBERTURA --- */}
      <Card>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>
            Método de Ubicación de la Sede <Text style={{ color: '#E74C3C' }}>*</Text>
          </Text>
          <View style={{ flexDirection: 'row', backgroundColor: '#ECF0F1', padding: 4, borderRadius: 12 }}>
            <TouchableOpacity
              onPress={() => setUbicacionFuente('automatica')}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: ubicacionFuente === 'automatica' ? '#FFFFFF' : 'transparent',
              }}
            >
              <Text style={{
                fontWeight: '600',
                fontSize: 14,
                color: ubicacionFuente === 'automatica' ? '#1F77B4' : '#95A5A6',
              }}>
                GPS Automático
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setUbicacionFuente('manual')}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: ubicacionFuente === 'manual' ? '#FFFFFF' : 'transparent',
              }}
            >
              <Text style={{
                fontWeight: '600',
                fontSize: 14,
                color: ubicacionFuente === 'manual' ? '#1F77B4' : '#95A5A6',
              }}>
                Ingreso Manual
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {renderUbicacion()}

        {/* Mostrar discretamente si la geolocalización está activa en segundo plano */}
        {latitud && longitud ? (
          <Text style={{ fontSize: 12, color: '#06A77D', marginBottom: 16, textAlign: 'center', fontWeight: '500' }}>
            ✓ Coordenadas obtenidas mediante GPS ({parseFloat(latitud).toFixed(4)}, {parseFloat(longitud).toFixed(4)})
          </Text>
        ) : null}

        <Input 
          label="Referencia de Ubicación (Opcional)" 
          placeholder="Ej. Frente al parque central, portón verde" 
          value={referencia}
          onChangeText={setReferencia}
        />

        {/* Radio de cobertura solicitado sin importar el método de ubicación */}
        <Input 
          label="Radio de Cobertura de Rescate (KM) *" 
          placeholder="Ej. 15" 
          value={radioKm}
          onChangeText={setRadioKm}
          keyboardType="numeric"
          required 
        />
      </Card>

      {/* --- TARJETA 4: FOTOS DE LA ASOCIACIÓN --- */}
      <Card>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>
          Fotos de la Asociación (Opcional)
        </Text>
        <Text style={{ fontSize: 13, color: '#7F8C8D', marginBottom: 16 }}>
          Agrega imágenes de tu refugio, instalaciones o eventos de adopción.
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
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Input 
                      placeholder="Orden" 
                      value={f.orden.toString()}
                      onChangeText={(text) => handleUpdateFotoOrden(f.id, text)}
                      keyboardType="numeric"
                      style={{ height: 38, paddingVertical: 4, fontSize: 13, textAlign: 'center' }}
                    />
                  </View>
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
          label="Agregar Foto de la Asociación" 
          variant="secondary"
          onPress={handleAddFoto}
        />
      </Card>

      <Button 
        label="Registrar Asociación" 
        onPress={handleSubmit}
        disabled={!isFormValid()}
      />
    </ScrollView>
  );
}
