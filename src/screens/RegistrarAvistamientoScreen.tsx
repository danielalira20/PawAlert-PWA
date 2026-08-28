import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Toast, useToast } from '../components/Toast';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';

const C = {
  orange: '#EC802B',
  teal: '#66BCB4',
  tealDark: '#278F87',
  tealSoft: '#E8F7F5',
  text: '#4A3728',
  muted: '#8C7A6B',
  border: '#EADAC9',
  background: '#FAF3EA',
  white: '#FFFFFF',
  danger: '#D94025',
  dangerSoft: '#FDEDE8',
  warnSoft: '#FFF7DF',
  warnBorder: '#EDC55B',
};

/** Espejo de ObservedMobility en backend/app/models/dispatch.py. */
const MOVILIDADES: Array<{
  value: 'sin_movimiento' | 'limitada' | 'normal' | 'corrio_se_alejo' | 'desconocida';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: 'sin_movimiento', label: 'No se movía', icon: 'pause-circle-outline' },
  { value: 'limitada', label: 'Con dificultad', icon: 'walk-outline' },
  { value: 'normal', label: 'Se movía normal', icon: 'footsteps-outline' },
  { value: 'corrio_se_alejo', label: 'Corrió / se alejó', icon: 'flash-outline' },
  { value: 'desconocida', label: 'No sabría decir', icon: 'help-circle-outline' },
];

type Movilidad = (typeof MOVILIDADES)[number]['value'];

interface AnimalParam {
  id: string;
  tipo_animal?: string | null;
  orden?: number | null;
}

interface Elegibilidad {
  elegible: boolean;
  motivo?: string | null;
  fuente?: string | null;
  distancia_metros?: number | null;
  radio_metros?: number | null;
}

interface Gps {
  latitud: number;
  longitud: number;
  precision_metros: number | null;
  observado_at: string;
}

type FaseGps = 'consultando' | 'listo' | 'denegado' | 'error';

function parsearAnimales(crudo: string | string[] | undefined): AnimalParam[] {
  const texto = Array.isArray(crudo) ? crudo[0] : crudo;
  if (!texto) return [];
  try {
    const parseado = JSON.parse(texto);
    if (!Array.isArray(parseado)) return [];
    return parseado.filter((animal) => animal && typeof animal.id === 'string');
  } catch {
    return [];
  }
}

function etiquetaAnimal(animal: AnimalParam, indice: number): string {
  const especie = animal.tipo_animal
    ? animal.tipo_animal.charAt(0).toUpperCase() + animal.tipo_animal.slice(1)
    : 'Animal';
  return `${especie} ${animal.orden ?? indice + 1}`;
}

export default function RegistrarAvistamientoScreen() {
  const params = useLocalSearchParams<{ reporteId?: string; animales?: string }>();
  const reporteId = Array.isArray(params.reporteId) ? params.reporteId[0] : params.reporteId;
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [animales] = useState<AnimalParam[]>(() => parsearAnimales(params.animales));
  const [animalId, setAnimalId] = useState<string | null>(null);

  const [faseGps, setFaseGps] = useState<FaseGps>('consultando');
  const [gps, setGps] = useState<Gps | null>(null);

  const [elegibilidad, setElegibilidad] = useState<Elegibilidad | null>(null);
  const [cargandoElegibilidad, setCargandoElegibilidad] = useState(false);
  const [errorElegibilidad, setErrorElegibilidad] = useState<string | null>(null);

  const [movilidad, setMovilidad] = useState<Movilidad | null>(null);
  const [direccion, setDireccion] = useState('');
  const [comentario, setComentario] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ estado_validacion: string } | null>(null);

  useEffect(() => {
    if (animales.length === 1) setAnimalId(animales[0].id);
  }, [animales]);

  // ─── 1. GPS ───────────────────────────────────────────────────────────────
  const capturarGps = useCallback(async () => {
    setFaseGps('consultando');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setFaseGps('denegado');
        return;
      }
      const posicion = await Location.getCurrentPositionAsync({});
      setGps({
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
        precision_metros: posicion.coords.accuracy ?? null,
        observado_at: new Date(posicion.timestamp || Date.now()).toISOString(),
      });
      setFaseGps('listo');
    } catch {
      setFaseGps('error');
    }
  }, []);

  useEffect(() => {
    void capturarGps();
  }, [capturarGps]);

  // ─── 2. Elegibilidad ──────────────────────────────────────────────────────
  // Fail-closed: si la consulta falla no se muestra el formulario. Un
  // avistamiento fuera de radio lo rechazaría el backend de todas formas;
  // mostrar el formulario "por si acaso" solo produciría trabajo perdido.
  const consultarElegibilidad = useCallback(async () => {
    if (!reporteId || !gps || !token) return;
    setCargandoElegibilidad(true);
    setErrorElegibilidad(null);
    try {
      const respuesta = await axios.get(
        `${API_URL}/reports/${reporteId}/avistamientos/elegible`,
        {
          params: { latitud: gps.latitud, longitud: gps.longitud },
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setElegibilidad(respuesta.data);
    } catch (error: any) {
      setElegibilidad(null);
      setErrorElegibilidad(
        error?.response?.data?.detail
        || 'No pudimos verificar si puedes registrar un avistamiento en este caso.',
      );
    } finally {
      setCargandoElegibilidad(false);
    }
  }, [gps, reporteId, token]);

  useEffect(() => {
    if (faseGps === 'listo') void consultarElegibilidad();
  }, [consultarElegibilidad, faseGps]);

  // ─── 3. Foto (opcional) ───────────────────────────────────────────────────
  const elegirFoto = async (desdeCamara: boolean) => {
    const pedirPermiso = desdeCamara
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const permiso = await pedirPermiso();
    if (!permiso.granted) {
      showToast({
        type: 'warning',
        title: 'Permiso denegado',
        message: 'Necesitamos el permiso para adjuntar una foto. Puedes enviar el avistamiento sin ella.',
      });
      return;
    }
    const lanzar = desdeCamara
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;
    const seleccion = await lanzar({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!seleccion.canceled) setFotoUri(seleccion.assets[0].uri);
  };

  /** Devuelve el evidencia_id, o null si no había foto o la subida falló.
   * Una foto es evidencia de apoyo: que falle no debe costar el avistamiento,
   * que es el dato que de verdad ayuda a quien busca al animal. */
  const subirFoto = async (): Promise<string | null> => {
    if (!fotoUri) return null;
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const respuesta = await fetch(fotoUri);
        const blob = await respuesta.blob();
        formData.append('foto', blob, `avistamiento_${Date.now()}.jpg`);
      } else {
        formData.append('foto', {
          uri: fotoUri,
          name: `avistamiento_${Date.now()}.jpg`,
          type: 'image/jpeg',
        } as any);
      }
      const { data } = await axios.post(
        `${API_URL}/reports/${reporteId}/avistamientos/foto`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return data.evidencia_id ?? null;
    } catch {
      showToast({
        type: 'warning',
        title: 'No pudimos subir la foto',
        message: 'Enviamos tu avistamiento sin la fotografía.',
      });
      return null;
    }
  };

  // ─── 4. Envío ─────────────────────────────────────────────────────────────
  const enviar = async () => {
    if (!gps || !animalId || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const evidenciaId = await subirFoto();
      const { data } = await axios.post(
        `${API_URL}/reports/${reporteId}/avistamientos`,
        {
          animal_id: animalId,
          latitud: gps.latitud,
          longitud: gps.longitud,
          precision_metros: gps.precision_metros,
          observado_at: gps.observado_at,
          movilidad_observada: movilidad,
          direccion_observada: direccion.trim() || null,
          comentario: comentario.trim() || null,
          evidencia_id: evidenciaId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setResultado({ estado_validacion: data.estado_validacion });
    } catch (error: any) {
      setErrorEnvio(
        error?.response?.data?.detail
        || 'No pudimos registrar tu avistamiento. Inténtalo nuevamente.',
      );
    } finally {
      setEnviando(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const cerrar = () => router.back();

  const encabezado = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          backgroundColor: C.tealSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="eye-outline" size={22} color={C.tealDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 19, fontWeight: '900' }}>
          Reportar avistamiento
        </Text>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
          Caso {String(reporteId ?? '').slice(0, 8).toUpperCase()}
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={cerrar}
        hitSlop={8}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: 'rgba(0,0,0,0.05)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={19} color={C.text} />
      </TouchableOpacity>
    </View>
  );

  const tarjeta = (children: React.ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: 22,
          paddingBottom: 60,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        {encabezado}
        {children}
      </ScrollView>
      <Toast toast={toast} translateY={translateY} />
    </SafeAreaView>
  );

  // Resultado final — mensaje diferenciado por estado de validación. Un
  // avistamiento pendiente NO movió el pin oficial todavía; decir lo
  // contrario haría creer que el equipo de rescate ya tiene el dato nuevo.
  if (resultado) {
    const autoValidado = resultado.estado_validacion === 'validado';
    return tarjeta(
      <View style={{ alignItems: 'center', paddingTop: 20 }}>
        <Ionicons
          name={autoValidado ? 'checkmark-circle' : 'time-outline'}
          size={58}
          color={autoValidado ? C.teal : C.warnBorder}
        />
        <Text
          style={{
            color: C.text,
            fontSize: 18,
            fontWeight: '900',
            textAlign: 'center',
            marginTop: 14,
          }}
        >
          {autoValidado
            ? '¡Ubicación actualizada!'
            : 'Avistamiento enviado'}
        </Text>
        <Text
          style={{
            color: C.muted,
            fontSize: 13,
            lineHeight: 20,
            textAlign: 'center',
            marginTop: 8,
          }}
        >
          {autoValidado
            ? 'Gracias por tu ayuda. La nueva ubicación ya quedó registrada en el caso.'
            : 'Gracias por tu ayuda. La asociación revisará tu avistamiento antes de actualizar la ubicación del caso.'}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cerrar avistamiento"
          onPress={cerrar}
          style={{
            marginTop: 26,
            minHeight: 48,
            paddingHorizontal: 26,
            borderRadius: 15,
            backgroundColor: C.orange,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: C.white, fontSize: 14, fontWeight: '900' }}>Listo</Text>
        </TouchableOpacity>
      </View>,
    );
  }

  if (faseGps === 'consultando') {
    return tarjeta(
      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 14, fontWeight: '600' }}>
          Obteniendo tu ubicación…
        </Text>
      </View>,
    );
  }

  if (faseGps === 'denegado' || faseGps === 'error') {
    return tarjeta(
      <View
        style={{
          padding: 18,
          borderRadius: 18,
          backgroundColor: C.dangerSoft,
          borderWidth: 1.5,
          borderColor: C.danger,
        }}
      >
        <Ionicons name="location-outline" size={26} color={C.danger} />
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '900', marginTop: 10 }}>
          {faseGps === 'denegado'
            ? 'Necesitamos tu ubicación'
            : 'No pudimos obtener tu ubicación'}
        </Text>
        <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          Un avistamiento sirve porque dice dónde está el animal ahora mismo.
          Activa el permiso de ubicación para continuar.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Reintentar ubicación"
          onPress={() => void capturarGps()}
          style={{
            marginTop: 16,
            minHeight: 44,
            borderRadius: 14,
            backgroundColor: C.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: C.white, fontWeight: '900', fontSize: 13 }}>
            Reintentar
          </Text>
        </TouchableOpacity>
      </View>,
    );
  }

  if (cargandoElegibilidad) {
    return tarjeta(
      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 14, fontWeight: '600' }}>
          Verificando el caso…
        </Text>
      </View>,
    );
  }

  if (errorElegibilidad) {
    return tarjeta(
      <View
        style={{
          padding: 18,
          borderRadius: 18,
          backgroundColor: C.dangerSoft,
          borderWidth: 1.5,
          borderColor: C.danger,
        }}
      >
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '900' }}>
          No pudimos verificar el caso
        </Text>
        <Text
          accessibilityRole="alert"
          style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}
        >
          {errorElegibilidad}
        </Text>
      </View>,
    );
  }

  if (elegibilidad && !elegibilidad.elegible) {
    const distancia = elegibilidad.distancia_metros;
    const radio = elegibilidad.radio_metros;
    return tarjeta(
      <View
        style={{
          padding: 18,
          borderRadius: 18,
          backgroundColor: C.warnSoft,
          borderWidth: 1.5,
          borderColor: C.warnBorder,
        }}
      >
        <Ionicons name="navigate-outline" size={26} color="#8A6D1F" />
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '900', marginTop: 10 }}>
          Estás demasiado lejos del caso
        </Text>
        <Text style={{ color: '#7E6A59', fontSize: 12, lineHeight: 18, marginTop: 6 }}>
          {distancia != null && radio != null
            ? `Estás a ${Math.round(distancia)} m, el límite es ${Math.round(radio)} m.`
            : 'Necesitas estar cerca del caso para registrar un avistamiento.'}
          {' '}
          Acércate al lugar donde viste al animal y vuelve a intentarlo.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Volver a verificar mi ubicación"
          onPress={() => void capturarGps()}
          style={{
            marginTop: 16,
            minHeight: 44,
            borderRadius: 14,
            backgroundColor: C.white,
            borderWidth: 1.5,
            borderColor: C.warnBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: C.text, fontWeight: '900', fontSize: 13 }}>
            Volver a verificar
          </Text>
        </TouchableOpacity>
      </View>,
    );
  }

  if (!elegibilidad) return tarjeta(<View />);

  // ─── Formulario ───────────────────────────────────────────────────────────
  const puedeEnviar = !!animalId && !enviando;

  return tarjeta(
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          padding: 12,
          borderRadius: 14,
          backgroundColor: C.tealSoft,
          marginBottom: 18,
        }}
      >
        <Ionicons name="location" size={18} color={C.tealDark} />
        <Text style={{ flex: 1, color: C.text, fontSize: 12, lineHeight: 17, fontWeight: '600' }}>
          Usaremos tu ubicación actual como el punto donde viste al animal.
        </Text>
      </View>

      {animales.length > 1 && (
        <View style={{ marginBottom: 18 }}>
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>
            ¿A cuál animal viste?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {animales.map((animal, indice) => {
              const seleccionado = animalId === animal.id;
              return (
                <TouchableOpacity
                  key={animal.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Seleccionar ${etiquetaAnimal(animal, indice)}`}
                  onPress={() => setAnimalId(animal.id)}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 10,
                    borderRadius: 13,
                    borderWidth: 1.5,
                    borderColor: seleccionado ? C.teal : C.border,
                    backgroundColor: seleccionado ? C.tealSoft : C.white,
                  }}
                >
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 12 }}>
                    {etiquetaAnimal(animal, indice)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <Text style={{ color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>
        ¿Cómo se movía? <Text style={{ color: C.muted, fontWeight: '600' }}>(opcional)</Text>
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {MOVILIDADES.map((opcion) => {
          const seleccionado = movilidad === opcion.value;
          return (
            <TouchableOpacity
              key={opcion.value}
              accessibilityRole="button"
              accessibilityLabel={`Movilidad ${opcion.label}`}
              onPress={() => setMovilidad(seleccionado ? null : opcion.value)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 11,
                paddingVertical: 9,
                borderRadius: 13,
                borderWidth: 1.5,
                borderColor: seleccionado ? C.teal : C.border,
                backgroundColor: seleccionado ? C.tealSoft : C.white,
              }}
            >
              <Ionicons name={opcion.icon} size={15} color={C.text} />
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 11 }}>
                {opcion.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>
        Dirección aproximada <Text style={{ color: C.muted, fontWeight: '600' }}>(opcional)</Text>
      </Text>
      <TextInput
        accessibilityLabel="Dirección aproximada"
        value={direccion}
        onChangeText={setDireccion}
        placeholder="Ej. Calle Reforma esquina con 5 de Mayo"
        placeholderTextColor={C.muted}
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.white,
          padding: 12,
          color: C.text,
          marginBottom: 18,
        }}
      />

      <Text style={{ color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>
        Comentario <Text style={{ color: C.muted, fontWeight: '600' }}>(opcional)</Text>
      </Text>
      <TextInput
        accessibilityLabel="Comentario del avistamiento"
        value={comentario}
        onChangeText={setComentario}
        placeholder="Cómo se veía, hacia dónde iba, cualquier detalle útil"
        placeholderTextColor={C.muted}
        multiline
        style={{
          minHeight: 84,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.white,
          padding: 12,
          color: C.text,
          textAlignVertical: 'top',
          marginBottom: 18,
        }}
      />

      <Text style={{ color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>
        Foto <Text style={{ color: C.muted, fontWeight: '600' }}>(opcional)</Text>
      </Text>
      {fotoUri ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Image
            source={{ uri: fotoUri }}
            style={{ width: 76, height: 76, borderRadius: 14, backgroundColor: C.border }}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Quitar foto"
            onPress={() => setFotoUri(null)}
          >
            <Text
              style={{
                color: C.danger,
                fontSize: 12,
                fontWeight: '800',
                textDecorationLine: 'underline',
              }}
            >
              Quitar foto
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Tomar foto"
            onPress={() => void elegirFoto(true)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              minHeight: 46,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: C.border,
              backgroundColor: C.white,
            }}
          >
            <Ionicons name="camera-outline" size={17} color={C.text} />
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 12 }}>Tomar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Elegir foto de galería"
            onPress={() => void elegirFoto(false)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              minHeight: 46,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: C.border,
              backgroundColor: C.white,
            }}
          >
            <Ionicons name="images-outline" size={17} color={C.text} />
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 12 }}>Galería</Text>
          </TouchableOpacity>
        </View>
      )}

      {!!errorEnvio && (
        <View
          style={{
            backgroundColor: C.dangerSoft,
            borderRadius: 12,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <Text
            accessibilityRole="alert"
            style={{ color: C.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' }}
          >
            {errorEnvio}
          </Text>
        </View>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Enviar avistamiento"
        disabled={!puedeEnviar}
        onPress={() => void enviar()}
        style={{
          minHeight: 50,
          borderRadius: 15,
          backgroundColor: C.orange,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: puedeEnviar ? 1 : 0.6,
        }}
      >
        {enviando ? (
          <ActivityIndicator color={C.white} />
        ) : (
          <Text style={{ color: C.white, fontSize: 14, fontWeight: '900' }}>
            Enviar avistamiento
          </Text>
        )}
      </TouchableOpacity>
    </View>,
  );
}
