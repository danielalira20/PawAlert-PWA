import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import type { ReporteStaff, RespuestaStaffReportes, SugerenciaAliado } from '../types/reportestaff';

type ShowToastFn = (toast: {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}) => void;

export const OPCIONES_ENCONTRE = [
  'Igual que en el reporte',
  'Peor de lo esperado',
  'En estado crítico',
  'No estaba en el lugar',
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
          message: 'Necesitamos acceso a tu ubicación para registrar la llegada al refugio',
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
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled) return result.assets[0].uri;
      return null;
    } catch (error) {
      console.error('Error usando cámara:', error);
      showToast({ type: 'error', title: 'Error', message: 'Error al usar la cámara' });
      return null;
    }
  }, [showToast]);

  const handlePickFoto = useCallback(async (): Promise<string | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) return result.assets[0].uri;
    return null;
  }, []);

  const subirFotoHito = useCallback(
    async (reporteId: string, fotoUri: string): Promise<string | null> => {
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
        const res = await axios.post(`${API_URL}/reports/${reporteId}/hitos/foto`, formData, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        });
        return res.data.foto_url;
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
      setIsSubmitting(true);
      try {
        let foto_url = null;
        if (fotoEncontre) foto_url = await subirFotoHito(reporteId, fotoEncontre);
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
            tipo_hito: 'encontre_animal',
            condicion_observada: estadoEncontre,
            comentario: notasEncontre || null,
            foto_url: foto_url || null,
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

  const resetRefugio = useCallback(() => {
    setEstadoRefugio('');
    setNotasRefugio('');
    setFotoRefugio(null);
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
      setIsSubmitting(true);
      try {
        const foto_url = await subirFotoHito(reporteId, fotoRefugio);
        if (!foto_url) {
          showToast({ type: 'error', title: 'Error', message: 'No pudimos subir la foto. Intenta de nuevo.' });
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
            foto_url,
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
        const foto_url = await subirFotoHito(reporteId, fotoVeterinaria);
        if (!foto_url) {
          showToast({ type: 'error', title: 'Error', message: 'No pudimos subir la foto. Intenta de nuevo.' });
          return false;
        }
        await axios.post(
          `${API_URL}/reports/${reporteId}/hitos`,
          {
            tipo_hito: 'llego_veterinaria',
            comentario: notasVeterinaria || null,
            foto_url,
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

    // hito: "llegué al refugio"
    estadoRefugio,
    setEstadoRefugio,
    notasRefugio,
    setNotasRefugio,
    fotoRefugio,
    setFotoRefugio,
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
