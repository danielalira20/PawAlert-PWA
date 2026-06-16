import axios from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import LocationPickerMap from './LocationPickerMap';

type TipoAnimal = 'Perro' | 'Gato' | 'Otro' | null;
type Condition = 'green' | 'yellow' | 'red' | null;
type Size = 'Pequeño' | 'Mediano' | 'Grande' | null;
type UbicacionFuente = 'automatica' | 'pin';
type Sexo = 'Macho' | 'Hembra' | 'Desconocido' | null;
type Edad = 'Cachorro' | 'Joven' | 'Adulto' | 'Desconocido' | null;

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
  const { user, isLoggedIn } = useAuth();

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [guestFound, setGuestFound] = useState(false);

  useEffect(() => {
    if (isLoggedIn && user) {
      setNombre(user.nombre);
      setApellidoPaterno(user.apellido_paterno);
      setApellidoMaterno(user.apellido_materno ?? '');
      setTelefono(user.telefono);
      setEmail(user.email);
    }
  }, [isLoggedIn, user]);

  const handleTelefonoChange = async (val: string) => {
    setTelefono(val);
    setGuestFound(false);
    setErrors((prev) => ({ ...prev, telefono: '' }));
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
      } catch {
        // No existe, el usuario llena manualmente
      } finally {
        setIsLookingUp(false);
      }
    }
  };

  const [tipoAnimal, setTipoAnimal] = useState<TipoAnimal>(null);

  // --- F5: campos ampliados del animal ---
  const [sexo, setSexo] = useState<Sexo>(null);
  const [edad, setEdad] = useState<Edad>(null);
  const [tieneCollar, setTieneCollar] = useState<boolean | null>(null);
  const [estaPrenada, setEstaPrenada] = useState<boolean | null>(null);
  const [esAgresivo, setEsAgresivo] = useState<boolean | null>(null);
  const [esDomestico, setEsDomestico] = useState<boolean | null>(null);
  const [raza, setRaza] = useState<string | null>(null);
  const [subcategoria, setSubcategoria] = useState<string | null>(null);
  const [especieDescripcion, setEspecieDescripcion] = useState('');

  // --- F6: múltiples fotos ---
  const [fotos, setFotos] = useState<AnimalFoto[]>([]);

  // --- F4: ubicación por GPS o pin ---
  const [ubicacionFuente, setUbicacionFuente] = useState<UbicacionFuente>('automatica');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [pinLocation, setPinLocation] = useState<{ latitud: number; longitud: number }>({
    latitud: 19.0414,
    longitud: -98.2063,
  });

  const [referencia, setReferencia] = useState('');
  const [condition, setCondition] = useState<Condition>(null);
  const [size, setSize] = useState<Size>(null);
  const [description, setDescription] = useState('');

  const handleTipoAnimalChange = (t: TipoAnimal) => {
    setTipoAnimal(t);
    setRaza(null);
    setTieneCollar(null);
    setEsAgresivo(null);
    setEsDomestico(null);
    setSubcategoria(null);
    setEspecieDescripcion('');
  };

  // --- F6: manejo de múltiples fotos ---
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

    if (ubicacionFuente === 'automatica' && !location) {
      newErrors.ubicacion = 'Por favor, obtén tu ubicación actual con el GPS o selecciona el Pin.';
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

      fotos.forEach((f) => {
        formData.append('fotos', {
          uri: f.foto_url,
          name: `foto_${f.id}_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);
      });
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

      if (ubicacionFuente === 'automatica' && location) {
        formData.append('latitud', String(location.coords.latitude));
        formData.append('longitud', String(location.coords.longitude));
      } else if (ubicacionFuente === 'pin') {
        formData.append('latitud', String(pinLocation.latitud));
        formData.append('longitud', String(pinLocation.longitud));
      }

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

        Alert.alert(
          'Posible reporte duplicado',
          `Se reportó un ${existente.tipo_animal || 'animal'} en condición ${existente.condicion || 'desconocida'} en ${existente.colonia || existente.municipio || 'esta zona'} hace ${tiempoTexto}.\n\n¿Es el mismo animal?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Vincular al caso existente', onPress: () => handleSubmit(true, existente.id) },
            { text: 'Crear un reporte nuevo', onPress: () => handleSubmit(true) },
          ]
        );
        return;
      }

      if (data.asociacion_asignada) {
        Alert.alert('¡Reporte enviado!', `Tu reporte fue asignado a: ${data.asociacion_asignada}`, [
          { text: 'OK', onPress: () => { if (onClose) onClose(); } },
        ]);
      } else if (data.contactos_emergencia && data.contactos_emergencia.length > 0) {
        const contactos = data.contactos_emergencia.map((c: any) => `${c.nombre}: ${c.telefono}`).join('\n');
        Alert.alert(
          '¡Reporte enviado!',
          `No hay asociaciones disponibles en tu zona.\n\nContactos de emergencia:\n${contactos}`,
          [{ text: 'OK', onPress: () => { if (onClose) onClose(); } }]
        );
      } else {
        Alert.alert('¡Reporte enviado!', 'Tu reporte fue publicado. Te avisaremos cuando una asociación lo atienda.', [
          { text: 'OK', onPress: () => { if (onClose) onClose(); } },
        ]);
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
          {errors.ubicacion && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.ubicacion}</Text>}
        </View>
      );
    }
    return <LocationPickerMap onLocationSelect={(latitud: number, longitud: number) => setPinLocation({ latitud, longitud })} />;
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
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
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
              <TouchableOpacity onPress={() => router.push('/login')} style={{ alignSelf: 'flex-end' }}>
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
              <Input label="Nombre(s)" placeholder="Ej. Ana" value={nombre} onChangeText={setNombre} error={errors.nombre} required />
              <Input label="Apellido Paterno" placeholder="Ej. Pérez" value={apellidoPaterno} onChangeText={setApellidoPaterno} error={errors.apellidoPaterno} required />
              <Input label="Apellido Materno (Opcional)" placeholder="Ej. López" value={apellidoMaterno} onChangeText={setApellidoMaterno} />
              <Input label="Correo Electrónico (Opcional)" placeholder="Ej. correo@ejemplo.com" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
              <TouchableOpacity onPress={() => router.push('/login')} style={{ alignItems: 'center', paddingVertical: 8, marginBottom: 8 }}>
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
              {renderSelector('Sexo', ['Macho', 'Hembra', 'Desconocido'], sexo, setSexo, errors.sexo)}
              {renderSelector('Edad Aproximada', ['Cachorro', 'Joven', 'Adulto', 'Senior', 'Desconocido'], edad, setEdad, errors.edad)}

              {tipoAnimal === 'Perro' && (
                <>
                  {renderSelector('Raza', ['Mestizo', 'Labrador', 'Pitbull', 'Pastor Alemán', 'Chihuahua', 'Otro'], raza, setRaza, errors.raza)}
                  {renderBooleanSelector('¿Tiene collar?', tieneCollar, setTieneCollar, errors.tieneCollar)}
                  {renderBooleanSelector('¿Parece agresivo?', esAgresivo, setEsAgresivo, errors.esAgresivo)}
                  {sexo === 'Hembra' && renderBooleanSelector('¿Parece estar preñada?', estaPrenada, setEstaPrenada, errors.estaPrenada)}
                </>
              )}

              {tipoAnimal === 'Gato' && (
                <>
                  {renderSelector('Raza', ['Común', 'Siamés', 'Persa', 'Otro'], raza, setRaza, errors.raza)}
                  {renderBooleanSelector('¿Tiene collar?', tieneCollar, setTieneCollar, errors.tieneCollar)}
                  {renderBooleanSelector('¿Es doméstico / se deja acercar?', esDomestico, setEsDomestico, errors.esDomestico)}
                  {sexo === 'Hembra' && renderBooleanSelector('¿Parece estar preñada?', estaPrenada, setEstaPrenada, errors.estaPrenada)}
                </>
              )}

              {tipoAnimal === 'Otro' && (
                <>
                  {renderSelector('Categoría', ['Ave', 'Reptil', 'Roedor', 'Fauna silvestre', 'Otro'], subcategoria, setSubcategoria, errors.subcategoria)}
                  {subcategoria === 'Otro' && (
                    <Input label="Describe la especie *" placeholder="Ej. Tlacuache, caballo, etc." value={especieDescripcion} onChangeText={setEspecieDescripcion} error={errors.especieDescripcion} />
                  )}
                </>
              )}
            </>
          )}

          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Condición (Semáforo) <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <TouchableOpacity onPress={() => setCondition('green')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'green' ? '#27AE60' : '#FFFFFF', borderColor: errors.condition ? '#E74C3C' : (condition === 'green' ? '#27AE60' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'green' ? '#FFFFFF' : '#2C3E50' }}>Estable</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setCondition('yellow')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'yellow' ? '#F39C12' : '#FFFFFF', borderColor: errors.condition ? '#E74C3C' : (condition === 'yellow' ? '#F39C12' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'yellow' ? '#FFFFFF' : '#2C3E50' }}>Herido</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setCondition('red')} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, backgroundColor: condition === 'red' ? '#E74C3C' : '#FFFFFF', borderColor: errors.condition ? '#E74C3C' : (condition === 'red' ? '#E74C3C' : '#BDC3C7'), alignItems: 'center' }}><Text style={{ textAlign: 'center', fontWeight: '500', fontSize: 12, color: condition === 'red' ? '#FFFFFF' : '#2C3E50' }}>Grave</Text></TouchableOpacity>
            </View>
            {errors.condition && <Text style={{ color: '#E74C3C', fontSize: 12, marginTop: 4 }}>{errors.condition}</Text>}
          </View>

          {renderSelector('Tamaño', ['Pequeño', 'Mediano', 'Grande'], size, setSize, errors.size)}

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
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 4 }}>Ubicación del Reporte</Text>
          <Text style={{ fontSize: 12, color: '#7F8C8D', marginBottom: 16 }}>Indica el lugar donde viste al animal, no donde estás ahora.</Text>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C3E50', marginBottom: 8 }}>Método de Ubicación <Text style={{ color: '#E74C3C' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', backgroundColor: '#ECF0F1', padding: 4, borderRadius: 12 }}>
              <TouchableOpacity onPress={() => setUbicacionFuente('automatica')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'automatica' ? '#FFFFFF' : 'transparent' }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'automatica' ? '#3498DB' : '#95A5A6' }}>Mi Ubicación Actual</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUbicacionFuente('pin')} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: ubicacionFuente === 'pin' ? '#FFFFFF' : 'transparent' }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: ubicacionFuente === 'pin' ? '#3498DB' : '#95A5A6' }}>Pin en el Mapa</Text>
              </TouchableOpacity>
            </View>
          </View>

          {renderUbicacion()}

          <Input label="Referencia (Opcional)" placeholder="Ej. Frente a la tienda de abarrotes..." value={referencia} onChangeText={setReferencia} />
        </Card>

        <Button label="Enviar Reporte" onPress={() => handleSubmit(false)} />
      </ScrollView>
    </View>
  );
}