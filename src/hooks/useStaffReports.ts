import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import type {
  ReporteStaff,
  RespuestaStaffReportes,
  ResultadoRescateSinVidaResponse,
  SugerenciaAliado,
} from '../types/reportestaff';

type ShowToastFn = (toast: {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}) => void;

type FotoHitoSubida = {
  foto_url: string;
  evidencia_id?: string;
  exif_gps_disponible?: boolean;
};

const fechaLimiteIso = (valor: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T23:59:59`);
  if (Number.isNaN(fecha.getTime())) return null;
  const componentes = valor.split('-').map(Number);
  if (
    fecha.getFullYear() !== componentes[0] ||
    fecha.getMonth() + 1 !== componentes[1] ||
    fecha.getDate() !== componentes[2] ||
    fecha.getTime() <= Date.now() + 24 * 60 * 60 * 1000
  ) {
    return null;
  }
  return fecha.toISOString();
};

export const OPCIONES_ENCONTRE = [
  'Igual que en el reporte',
  'Peor de lo esperado',
  'En estado crítico',
  'No estaba en el lugar',
];

export const OPCIONES_ENCONTRE_EXTERNO = [
  'Igual que en el reporte',
  'Peor de lo esperado',
  'En estado crítico',
];

export const OPCIONES_REFUGIO = [
  'Animal rescatado y estable',
  'Animal en tratamiento veterinario',
  'Animal en hogar temporal',
  'Animal adoptado',
  'No se pudo rescatar',
];

export function useStaffReports(showToast: ShowToastFn) {
  const { token, user } = useAuth();

  // ── Reportes asignados ──────────────────────────────────────────────
  const [reportesPendientes, setReportesPendientes] = useState<ReporteStaff[]>([]);
  const [reportesEnAccion, setReportesEnAccion] = useState<ReporteStaff[]>([]);
  const [reportesCompletados, setReportesCompletados] = useState<ReporteStaff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reportesEsperandoConfirmacion, setReportesEsperandoConfirmacion] = useState<ReporteStaff[]>([]);
  const [isConfirmando, setIsConfirmando] = useState(false);

  const cargarReportesAsignados = useCallback(async () => {
    setIsLoading(true);
    try {
      // Migración staff -> voluntario_interno: antes /staff/me/reportes,
      // ahora /voluntarios/me/reportes. Misma forma de respuesta exacta
      // (pendientes/en_accion/completados/historial), solo cambia la URL.
      const res = await axios.get<RespuestaStaffReportes>(`${API_URL}/voluntarios/me/reportes`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data) {
        setReportesEsperandoConfirmacion(res.data.esperando_confirmacion || []);
        setReportesPendientes(res.data.pendientes || []);
        setReportesEnAccion(res.data.en_accion || []);
        setReportesCompletados(res.data.completados || []);
      } else {
        throw new Error('Formato de respuesta no esperado');
      }
    } catch (error: any) {
      console.error('Error al cargar reportes del voluntario:', error);
      const mensajeError =
        error?.response?.data?.detail || error.message || 'No pudimos cargar tus casos asignados.';
      showToast({ type: 'error', title: 'Error', message: mensajeError });
      setReportesPendientes([]);
      setReportesEnAccion([]);
      setReportesCompletados([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, showToast]);

  // ── GPS ──────────────────────────────────────────────────────────────
  const [ubicacionActual, setUbicacionActual] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [obteniendoGPS, setObteniendoGPS] = useState(false);

  const obtenerUbicacionGPS = useCallback(async () => {
    setObteniendoGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermisoDenegado(true);
        showToast({
          type: 'error',
          title: 'Permiso denegado',
          message: 'Necesitamos acceso a tu ubicación para registrar este avance',
        });
        return;
      }
      setPermisoDenegado(false);
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUbicacionActual({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      showToast({
        type: 'success',
        title: 'Ubicación obtenida',
        message: `GPS: ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`,
      });
    } catch (error) {
      console.error('Error obteniendo ubicación:', error);
      showToast({ type: 'error', title: 'Error', message: 'No pudimos obtener tu ubicación actual' });
    } finally {
      setObteniendoGPS(false);
    }
  }, [showToast]);

  // ── Cámara / galería ─────────────────────────────────────────────────
  const usarCamara = useCallback(async (): Promise<string | null> => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'error', title: 'Permiso denegado', message: 'Necesitamos acceso a la cámara' });
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: true,
      });
      if (!result.canceled) return result.assets[0].uri;
      return null;
    } catch (error) {
      console.error('Error usando cámara:', error);
      showToast({ type: 'error', title: 'Error', message: 'Error al usar la cámara' });
      return null;
    }
  }, [showToast]);

  const handlePickFoto = useCallback(async (): Promise<string | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: true,
    });
    if (!result.canceled) return result.assets[0].uri;
    return null;
  }, []);

  const subirFotoHito = useCallback(
    async (
      reporteId: string,
      fotoUri: string,
      sensible = false,
    ): Promise<FotoHitoSubida | null> => {
      try {
        const formData = new FormData();
        if (Platform.OS === 'web') {
          const res = await fetch(fotoUri);
          const blob = await res.blob();
          const file = new File([blob], `hito_${Date.now()}.jpg`, { type: 'image/jpeg' });
          formData.append('foto', file);
        } else {
          formData.append('foto', {
            uri: fotoUri,
            name: `hito_${Date.now()}.jpg`,
            type: 'image/jpeg',
          } as any);
        }
        formData.append('sensible', sensible ? 'true' : 'false');
        const res = await axios.post(`${API_URL}/reports/${reporteId}/hitos/foto`, formData, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        });
        return res.data as FotoHitoSubida;
      } catch (error) {
        console.error('Error subiendo foto hito:', error);
        return null;
      }
    },
    [token],
  );

  // ── Hito: "Encontré al animal" ───────────────────────────────────────
  const [estadoEncontre, setEstadoEncontre] = useState('');
  const [notasEncontre, setNotasEncontre] = useState('');
  const [fotoEncontre, setFotoEncontre] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Resultado: animal encontrado aparentemente sin vida ─────────────
  const [cantidadesSinVida, setCantidadesSinVida] = useState<Record<string, number>>({});
  const [fotoSinVida, setFotoSinVida] = useState<string | null>(null);
  const [puedeEsperarSeguro, setPuedeEsperarSeguro] = useState<boolean | null>(null);
  const [riesgoVialSinVida, setRiesgoVialSinVida] = useState(false);
  const [riesgoSanitarioSinVida, setRiesgoSanitarioSinVida] = useState(false);
  const [identificacionSinVida, setIdentificacionSinVida] = useState('');
  const [notasSinVida, setNotasSinVida] = useState('');
  const [motivoRetiroSeguridad, setMotivoRetiroSeguridad] = useState('');

  const seleccionarAnimalSinVida = useCallback((animalId: string, _cantidadMaxima: number) => {
    setCantidadesSinVida((actuales) => {
      if (actuales[animalId]) {
        const siguientes = { ...actuales };
        delete siguientes[animalId];
        return siguientes;
      }
      return { ...actuales, [animalId]: 1 };
    });
  }, []);

  const cambiarCantidadSinVida = useCallback(
    (animalId: string, cantidad: number, cantidadMaxima: number) => {
      if (!Number.isInteger(cantidad) || cantidad < 1) return;
      setCantidadesSinVida((actuales) => ({
        ...actuales,
        [animalId]: Math.min(cantidad, Math.max(1, cantidadMaxima)),
      }));
    },
    [],
  );

  const resetSinVida = useCallback(() => {
    setCantidadesSinVida({});
    setFotoSinVida(null);
    setPuedeEsperarSeguro(null);
    setRiesgoVialSinVida(false);
    setRiesgoSanitarioSinVida(false);
    setIdentificacionSinVida('');
    setNotasSinVida('');
    setMotivoRetiroSeguridad('');
    setUbicacionActual(null);
    setPermisoDenegado(false);
  }, []);

  const registrarSinVida = useCallback(
    async (reporteId: string): Promise<boolean> => {
      const animales = Object.entries(cantidadesSinVida).map(
        ([animal_id, cantidad_reportada]) => ({ animal_id, cantidad_reportada }),
      );
      if (!animales.length) {
        showToast({
          type: 'warning',
          title: 'Selecciona al animal',
          message: 'Indica qué animal o animales encontraste en esta condición.',
        });
        return false;
      }
      if (!fotoSinVida) {
        showToast({
          type: 'warning',
          title: 'Fotografía requerida',
          message: 'Toma la evidencia desde la cámara para continuar.',
        });
        return false;
      }
      if (!ubicacionActual) {
        showToast({
          type: 'warning',
          title: 'Ubicación requerida',
          message: 'Captura el GPS desde el lugar donde encontraste al animal.',
        });
        return false;
      }
      if (puedeEsperarSeguro === null) {
        showToast({
          type: 'warning',
          title: 'Confirma tu seguridad',
          message: 'Indica si puedes esperar de forma segura.',
        });
        return false;
      }
      if (!puedeEsperarSeguro && !motivoRetiroSeguridad.trim()) {
        showToast({
          type: 'warning',
          title: 'Explica por qué debes retirarte',
          message: 'La asociación necesita conocer el riesgo para coordinar el seguimiento.',
        });
        return false;
      }

      setIsSubmitting(true);
      try {
        const fotoSubida = await subirFotoHito(reporteId, fotoSinVida, true);
        if (!fotoSubida?.evidencia_id) {
          showToast({
            type: 'error',
            title: 'No pudimos guardar la evidencia',
            message: 'Verifica tu conexión e inténtalo nuevamente.',
          });
          return false;
        }

        const respuesta = await axios.post<ResultadoRescateSinVidaResponse>(
          `${API_URL}/reports/${reporteId}/resultados/sin-vida`,
          {
            animales,
            evidencia_id: fotoSubida.evidencia_id,
            latitud: ubicacionActual.latitude,
            longitud: ubicacionActual.longitude,
            puede_esperar_seguro: puedeEsperarSeguro,
            riesgo_vial: riesgoVialSinVida,
            riesgo_sanitario: riesgoSanitarioSinVida,
            identificacion_observada: identificacionSinVida.trim() || null,
            comentario: notasSinVida.trim() || null,
            motivo_retiro_seguridad: motivoRetiroSeguridad.trim() || null,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );

        showToast({
          type: 'success',
          title: 'Resultado registrado',
          message: respuesta.data.todos_animales_reportados
            ? 'La asociación coordinará el seguimiento y el retiro digno.'
            : 'El caso sigue activo porque todavía hay animales por localizar.',
        });
        resetSinVida();
        await cargarReportesAsignados();
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'No pudimos registrar el resultado',
          message: error?.response?.data?.detail || 'Inténtalo nuevamente.',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      cantidadesSinVida,
      fotoSinVida,
      ubicacionActual,
      puedeEsperarSeguro,
      motivoRetiroSeguridad,
      subirFotoHito,
      riesgoVialSinVida,
      riesgoSanitarioSinVida,
      identificacionSinVida,
      notasSinVida,
      token,
      showToast,
      resetSinVida,
      cargarReportesAsignados,
    ],
  );

  // ── Hito: llegada a la zona del reporte ─────────────────────────────
  const resetLlegadaZona = useCallback(() => {
    setUbicacionActual(null);
    setPermisoDenegado(false);
  }, []);

  const registrarLlegadaZona = useCallback(
    async (reporteId: string): Promise<boolean> => {
      if (!ubicacionActual) {
        showToast({
          type: 'error',
          title: 'Ubicación requerida',
          message: 'Captura tu GPS cuando ya estés en la zona del reporte.',
        });
        return false;
      }
      setIsSubmitting(true);
      try {
        await axios.post(
          `${API_URL}/reports/${reporteId}/hitos`,
          {
            tipo_hito: 'llegada_zona_reporte',
            latitud: ubicacionActual.latitude,
            longitud: ubicacionActual.longitude,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        showToast({
          type: 'success',
          title: 'Llegada registrada',
          message: 'Ya puedes reportar el resultado de la búsqueda.',
        });
        resetLlegadaZona();
        await cargarReportesAsignados();
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'No pudimos validar tu llegada',
          message:
            error?.response?.data?.detail ||
            'Revisa tu ubicación e inténtalo nuevamente.',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      ubicacionActual,
      token,
      showToast,
      resetLlegadaZona,
      cargarReportesAsignados,
    ],
  );

  // ── Hito: búsqueda sin localizar al animal ──────────────────────────
  const [minutosBusqueda, setMinutosBusqueda] = useState('');
  const [notasNoLocalizado, setNotasNoLocalizado] = useState('');

  const resetNoLocalizado = useCallback(() => {
    setMinutosBusqueda('');
    setNotasNoLocalizado('');
    setUbicacionActual(null);
    setPermisoDenegado(false);
  }, []);

  const registrarNoLocalizado = useCallback(
    async (reporteId: string): Promise<boolean> => {
      const minutos = Number.parseInt(minutosBusqueda, 10);
      if (!Number.isInteger(minutos) || minutos < 1) {
        showToast({
          type: 'warning',
          title: 'Falta el tiempo de búsqueda',
          message: 'Indica cuántos minutos buscaste al animal.',
        });
        return false;
      }
      if (!notasNoLocalizado.trim()) {
        showToast({
          type: 'warning',
          title: 'Falta una observación',
          message: 'Cuéntale a la asociación dónde y cómo realizaste la búsqueda.',
        });
        return false;
      }
      if (!ubicacionActual) {
        showToast({
          type: 'error',
          title: 'Ubicación requerida',
          message: 'Captura tu ubicación al terminar la búsqueda.',
        });
        return false;
      }
      setIsSubmitting(true);
      try {
        await axios.post(
          `${API_URL}/reports/${reporteId}/hitos`,
          {
            tipo_hito: 'animal_no_localizado',
            comentario: notasNoLocalizado.trim(),
            tiempo_busqueda_minutos: minutos,
            latitud: ubicacionActual.latitude,
            longitud: ubicacionActual.longitude,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        showToast({
          type: 'success',
          title: 'Búsqueda registrada',
          message: 'La asociación ya puede revisar tu actualización.',
        });
        resetNoLocalizado();
        await cargarReportesAsignados();
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'No pudimos registrar la búsqueda',
          message: error?.response?.data?.detail || 'Inténtalo nuevamente.',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      minutosBusqueda,
      notasNoLocalizado,
      ubicacionActual,
      token,
      showToast,
      resetNoLocalizado,
      cargarReportesAsignados,
    ],
  );

  // ── Hito: animal bajo resguardo ─────────────────────────────────────
  const [condicionResguardo, setCondicionResguardo] = useState('');
  const [destinoResguardo, setDestinoResguardo] = useState('');
  const [fechaLimiteResguardo, setFechaLimiteResguardo] = useState('');
  const [notasResguardo, setNotasResguardo] = useState('');
  const [fotoResguardo, setFotoResguardo] = useState<string | null>(null);

  const resetResguardo = useCallback(() => {
    setCondicionResguardo('');
    setDestinoResguardo('');
    setFechaLimiteResguardo('');
    setNotasResguardo('');
    setFotoResguardo(null);
    setUbicacionActual(null);
    setPermisoDenegado(false);
  }, []);

  const registrarAnimalBajoResguardo = useCallback(
    async (reporteId: string): Promise<boolean> => {
      const fechaIso = fechaLimiteIso(fechaLimiteResguardo);
      if (!condicionResguardo || !destinoResguardo || !fechaIso || !fotoResguardo || !ubicacionActual) {
        showToast({
          type: 'warning',
          title: 'Faltan datos del resguardo',
          message: 'Selecciona la ruta y una fecha válida con al menos un día de margen, además de la evidencia.',
        });
        return false;
      }
      setIsSubmitting(true);
      try {
        const fotoSubida = await subirFotoHito(reporteId, fotoResguardo);
        if (!fotoSubida) {
          showToast({
            type: 'error',
            title: 'No pudimos subir la foto',
            message: 'Verifica tu conexión e inténtalo nuevamente.',
          });
          return false;
        }
        await axios.post(
          `${API_URL}/reports/${reporteId}/hitos`,
          {
            tipo_hito: 'animal_bajo_resguardo',
            condicion_observada: condicionResguardo,
            destino:
              destinoResguardo === 'veterinaria_y_hogar'
                ? 'Veterinaria y después hogar temporal verificado'
                : 'Hogar temporal verificado',
            ruta_resguardo: destinoResguardo,
            fecha_limite_resguardo: fechaIso,
            comentario: notasResguardo.trim() || null,
            foto_url: fotoSubida.foto_url,
            evidencia_id: fotoSubida.evidencia_id || null,
            latitud: ubicacionActual.latitude,
            longitud: ubicacionActual.longitude,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        showToast({
          type: 'success',
          title: 'Animal bajo resguardo',
          message: 'La asociación ya conoce su condición y destino.',
        });
        setCondicionResguardo('');
        setDestinoResguardo('');
        setNotasResguardo('');
        setFotoResguardo(null);
        setUbicacionActual(null);
        setPermisoDenegado(false);
        await cargarReportesAsignados();
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'No pudimos registrar el resguardo',
          message: error?.response?.data?.detail || 'Inténtalo nuevamente.',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      condicionResguardo,
      destinoResguardo,
      fechaLimiteResguardo,
      notasResguardo,
      fotoResguardo,
      ubicacionActual,
      token,
      showToast,
      subirFotoHito,
      cargarReportesAsignados,
    ],
  );

  const resetEncontre = useCallback(() => {
    setEstadoEncontre('');
    setNotasEncontre('');
    setFotoEncontre(null);
  }, []);

  const registrarEncontre = useCallback(
    async (reporteId: string): Promise<{ exito: boolean; sugerenciaAliado: SugerenciaAliado | null }> => {
      if (!estadoEncontre) {
        showToast({
          type: 'warning',
          title: 'Faltan datos',
          message: 'Debes seleccionar el estado actual del animal.',
        });
        return { exito: false, sugerenciaAliado: null };
      }
      if (user?.rol === 'voluntario_externo' && !fotoEncontre) {
        showToast({
          type: 'warning',
          title: 'Foto requerida',
          message: 'Toma una foto del animal desde la cámara para continuar.',
        });
        return { exito: false, sugerenciaAliado: null };
      }
      setIsSubmitting(true);
      try {
        let fotoSubida: FotoHitoSubida | null = null;
        if (fotoEncontre) {
          fotoSubida = await subirFotoHito(reporteId, fotoEncontre);
          if (!fotoSubida) {
            showToast({
              type: 'error',
              title: 'No pudimos subir la foto',
              message: 'Verifica tu conexión e inténtalo nuevamente.',
            });
            return { exito: false, sugerenciaAliado: null };
          }
        }
        let ubicacion_hito = null;
        if (user?.rol === 'voluntario_externo') {
          const permiso = await Location.requestForegroundPermissionsAsync();
          if (permiso.status !== 'granted') {
            showToast({
              type: 'error',
              title: 'Ubicación requerida',
              message: 'Necesitamos tu GPS para registrar la llegada a la zona.',
            });
            return { exito: false, sugerenciaAliado: null };
          }
          const posicion = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          ubicacion_hito = {
            latitud: posicion.coords.latitude,
            longitud: posicion.coords.longitude,
          };
        }
        const res = await axios.post(
          `${API_URL}/reports/${reporteId}/hitos`,
          {
            tipo_hito: 'animal_encontrado',
            condicion_observada: estadoEncontre,
            comentario: notasEncontre || null,
            foto_url: fotoSubida?.foto_url || null,
            evidencia_id: fotoSubida?.evidencia_id || null,
            ...ubicacion_hito,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        showToast({ type: 'success', title: 'Éxito', message: 'Hito registrado correctamente' });
        resetEncontre();
        await cargarReportesAsignados();
        return { exito: true, sugerenciaAliado: res.data?.sugerencia_aliado ?? null };
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: error?.response?.data?.detail || 'Error al registrar el hito',
        });
        return { exito: false, sugerenciaAliado: null };
      } finally {
        setIsSubmitting(false);
      }
    },
    [estadoEncontre, notasEncontre, fotoEncontre, token, user?.rol, showToast, subirFotoHito, cargarReportesAsignados, resetEncontre],
  );

  const confirmarAsignacion = useCallback(
  async (reporteId: string): Promise<boolean> => {
    setIsConfirmando(true);
    try {
      await axios.post(
        `${API_URL}/reports/${reporteId}/confirmar-asignacion`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showToast({ type: 'success', title: '¡Vas en camino!', message: 'El caso ha sido confirmado.' });
      await cargarReportesAsignados();
      return true;
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos confirmar la asignación.',
      });
      return false;
    } finally {
      setIsConfirmando(false);
    }
  },
  [token, showToast, cargarReportesAsignados],
);

const rechazarAsignacionVoluntario = useCallback(
  async (reporteId: string, motivo?: string): Promise<boolean> => {
    setIsConfirmando(true);
    try {
      await axios.post(
        `${API_URL}/reports/${reporteId}/rechazar-asignacion`,
        { motivo: motivo || null },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      showToast({ type: 'info', title: 'Caso rechazado', message: 'El caso regresó a la asociación.' });
      await cargarReportesAsignados();
      return true;
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos rechazar la asignación.',
      });
      return false;
    } finally {
      setIsConfirmando(false);
    }
  },
  [token, showToast, cargarReportesAsignados],
);

  // ── Hito: "Llegué al refugio" (cierre de caso) ───────────────────────
  const [estadoRefugio, setEstadoRefugio] = useState('');
  const [notasRefugio, setNotasRefugio] = useState('');
  const [fotoRefugio, setFotoRefugio] = useState<string | null>(null);
  const [fotoEntornoRefugio, setFotoEntornoRefugio] = useState<string | null>(null);

  const resetRefugio = useCallback(() => {
    setEstadoRefugio('');
    setNotasRefugio('');
    setFotoRefugio(null);
    setFotoEntornoRefugio(null);
    setFechaLimiteResguardo('');
    setUbicacionActual(null);
    setPermisoDenegado(false);
  }, []);

  const registrarRefugio = useCallback(
    async (reporteId: string): Promise<boolean> => {
      if (!estadoRefugio) {
        showToast({
          type: 'warning',
          title: 'Faltan datos',
          message: 'Debes seleccionar el estado final del animal.',
        });
        return false;
      }
      if (!ubicacionActual) {
        showToast({
          type: 'error',
          title: 'Ubicación requerida',
          message: 'Debes capturar tu ubicación GPS antes de cerrar el caso',
        });
        return false;
      }
      if (!fotoRefugio) {
        showToast({
          type: 'error',
          title: 'Foto requerida',
          message: 'Debes tomar una foto con la cámara para registrar la llegada al refugio',
        });
        return false;
      }
      if (user?.rol === 'voluntario_externo' && !fotoEntornoRefugio) {
        showToast({
          type: 'error',
          title: 'Foto del entorno requerida',
          message: 'Toma una foto del espacio donde permanecerá el animal.',
        });
        return false;
      }
      const fechaIso = fechaLimiteIso(fechaLimiteResguardo);
      if (user?.rol === 'voluntario_externo' && !fechaIso) {
        showToast({
          type: 'warning',
          title: 'Confirma la fecha límite',
          message: 'Usa el formato AAAA-MM-DD y deja al menos un día completo de margen.',
        });
        return false;
      }
      setIsSubmitting(true);
      try {
        const fotoSubida = await subirFotoHito(reporteId, fotoRefugio);
        if (!fotoSubida) {
          showToast({ type: 'error', title: 'Error', message: 'No pudimos subir la foto. Intenta de nuevo.' });
          return false;
        }
        const fotoEntornoSubida =
          user?.rol === 'voluntario_externo' && fotoEntornoRefugio
            ? await subirFotoHito(reporteId, fotoEntornoRefugio)
            : null;
        if (user?.rol === 'voluntario_externo' && !fotoEntornoSubida) {
          showToast({
            type: 'error',
            title: 'No pudimos subir la foto del entorno',
            message: 'Verifica tu conexión e inténtalo nuevamente.',
          });
          return false;
        }
        await axios.post(
          `${API_URL}/reports/${reporteId}/hitos`,
          {
            tipo_hito:
              user?.rol === 'voluntario_externo'
                ? 'llegada_hogar_temporal'
                : 'llegue_refugio',
            condicion_observada: estadoRefugio,
            comentario: notasRefugio || null,
            foto_url: fotoSubida.foto_url,
            evidencia_id: fotoSubida.evidencia_id || null,
            foto_entorno_url: fotoEntornoSubida?.foto_url || null,
            fecha_limite_resguardo:
              user?.rol === 'voluntario_externo' ? fechaIso : null,
            latitud: ubicacionActual.latitude,
            longitud: ubicacionActual.longitude,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        showToast({
          type: 'success',
          title: user?.rol === 'voluntario_externo' ? 'Custodia iniciada' : 'Rescate completado',
          message:
            user?.rol === 'voluntario_externo'
              ? 'El rescate quedó a salvo y comenzó el seguimiento del hogar temporal.'
              : 'La llegada quedó registrada correctamente.',
        });
        resetRefugio();
        await cargarReportesAsignados();
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: error?.response?.data?.detail || 'Error al cerrar el caso',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      estadoRefugio,
      notasRefugio,
      fotoRefugio,
      fotoEntornoRefugio,
      fechaLimiteResguardo,
      ubicacionActual,
      token,
      showToast,
      subirFotoHito,
      cargarReportesAsignados,
      resetRefugio,
      user?.rol,
    ],
  );

  // ── Hito: "Llegué a la veterinaria" (Ruta 1, sin select de estado ────
  // ni cambio de estado_reporte — decisión A: solo notas opcionales,
  // GPS y foto obligatorios, validados contra la ubicación del aliado.
  const [notasVeterinaria, setNotasVeterinaria] = useState('');
  const [fotoVeterinaria, setFotoVeterinaria] = useState<string | null>(null);

  const resetVeterinaria = useCallback(() => {
    setNotasVeterinaria('');
    setFotoVeterinaria(null);
    setUbicacionActual(null);
    setPermisoDenegado(false);
  }, []);

  const registrarLlegadaVeterinaria = useCallback(
    async (reporteId: string): Promise<boolean> => {
      if (!ubicacionActual) {
        showToast({
          type: 'error',
          title: 'Ubicación requerida',
          message: 'Debes capturar tu ubicación GPS antes de registrar la llegada a la veterinaria',
        });
        return false;
      }
      if (!fotoVeterinaria) {
        showToast({
          type: 'error',
          title: 'Foto requerida',
          message: 'Debes tomar una foto con la cámara para registrar la llegada a la veterinaria',
        });
        return false;
      }
      setIsSubmitting(true);
      try {
        const fotoSubida = await subirFotoHito(reporteId, fotoVeterinaria);
        if (!fotoSubida) {
          showToast({ type: 'error', title: 'Error', message: 'No pudimos subir la foto. Intenta de nuevo.' });
          return false;
        }
        await axios.post(
          `${API_URL}/reports/${reporteId}/hitos`,
          {
            tipo_hito: 'llegada_veterinaria',
            comentario: notasVeterinaria || null,
            foto_url: fotoSubida.foto_url,
            evidencia_id: fotoSubida.evidencia_id || null,
            latitud: ubicacionActual.latitude,
            longitud: ubicacionActual.longitude,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        showToast({ type: 'success', title: 'Éxito', message: 'Llegada a la veterinaria registrada correctamente' });
        resetVeterinaria();
        await cargarReportesAsignados();
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          title: 'Error',
          message: error?.response?.data?.detail || 'Error al registrar la llegada a la veterinaria',
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      notasVeterinaria,
      fotoVeterinaria,
      ubicacionActual,
      token,
      showToast,
      subirFotoHito,
      cargarReportesAsignados,
      resetVeterinaria,
    ],
  );

  return {
    // reportes
    reportesPendientes,
    reportesEnAccion,
    reportesCompletados,
    isLoading,
    cargarReportesAsignados,

    reportesEsperandoConfirmacion,
    confirmarAsignacion,
    rechazarAsignacionVoluntario,
    isConfirmando,

    // GPS
    ubicacionActual,
    permisoDenegado,
    obteniendoGPS,
    obtenerUbicacionGPS,

    // fotos
    usarCamara,
    handlePickFoto,

    // hito: "encontré al animal"
    estadoEncontre,
    setEstadoEncontre,
    notasEncontre,
    setNotasEncontre,
    fotoEncontre,
    setFotoEncontre,
    registrarEncontre,
    resetEncontre,
    OPCIONES_ENCONTRE,
    OPCIONES_ENCONTRE_EXTERNO,

    // resultado: animal aparentemente sin vida
    cantidadesSinVida,
    seleccionarAnimalSinVida,
    cambiarCantidadSinVida,
    fotoSinVida,
    setFotoSinVida,
    puedeEsperarSeguro,
    setPuedeEsperarSeguro,
    riesgoVialSinVida,
    setRiesgoVialSinVida,
    riesgoSanitarioSinVida,
    setRiesgoSanitarioSinVida,
    identificacionSinVida,
    setIdentificacionSinVida,
    notasSinVida,
    setNotasSinVida,
    motivoRetiroSeguridad,
    setMotivoRetiroSeguridad,
    registrarSinVida,
    resetSinVida,

    // hito: llegada a la zona
    registrarLlegadaZona,
    resetLlegadaZona,

    // hito: animal no localizado
    minutosBusqueda,
    setMinutosBusqueda,
    notasNoLocalizado,
    setNotasNoLocalizado,
    registrarNoLocalizado,
    resetNoLocalizado,

    // hito: animal bajo resguardo
    condicionResguardo,
    setCondicionResguardo,
    destinoResguardo,
    setDestinoResguardo,
    fechaLimiteResguardo,
    setFechaLimiteResguardo,
    notasResguardo,
    setNotasResguardo,
    fotoResguardo,
    setFotoResguardo,
    registrarAnimalBajoResguardo,
    resetResguardo,

    // hito: "llegué al refugio"
    estadoRefugio,
    setEstadoRefugio,
    notasRefugio,
    setNotasRefugio,
    fotoRefugio,
    setFotoRefugio,
    fotoEntornoRefugio,
    setFotoEntornoRefugio,
    registrarRefugio,
    resetRefugio,
    OPCIONES_REFUGIO,

    // hito: "llegué a la veterinaria"
    notasVeterinaria,
    setNotasVeterinaria,
    fotoVeterinaria,
    setFotoVeterinaria,
    registrarLlegadaVeterinaria,
    resetVeterinaria,

    isSubmitting,
  };
}
