import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { Toast, useToast } from '../components/Toast';
import { API_URL } from '../constants/api';
import { Brand } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

interface Seguimiento {
  id: string;
  tipo: string;
  condicion_actual: string;
  foto_url: string;
  estado_validacion: string;
  creado_at: string;
}

export interface Custodia {
  id: string;
  reporte_id: string;
  estado: string;
  inicio_at: string;
  fecha_limite?: string | null;
  proximo_seguimiento_at?: string | null;
  seguimiento_inicial_pendiente?: boolean;
  voluntario_nombre?: string;
  distancia_km?: number;
  es_coordinadora?: boolean;
  ubicacion_hogar?: {
    calle?: string | null;
    numero?: string | null;
    colonia?: string | null;
    municipio?: string | null;
    estado?: string | null;
    latitud?: number | null;
    longitud?: number | null;
  } | null;
  reporte: {
    id: string;
    foto_url?: string | null;
    animales?: Array<{ tipo_animal?: string; condicion?: string; tamanio?: string }>;
  };
  ultimo_seguimiento?: Seguimiento | null;
  seguimiento_anterior?: Seguimiento | null;
  solicitud_relevo?: { id: string; motivo: string; estado: string } | null;
  transferencia_activa?: {
    id: string;
    fecha_programada?: string | null;
    confirma_entrega_at?: string | null;
    confirma_recepcion_at?: string | null;
    estado: string;
  } | null;
}

type ModalMode = 'seguimiento' | 'relevo' | 'extension' | 'validacion' | 'aceptar' | 'transferencia' | 'finalizar' | null;

interface Props {
  onClose?: () => void;
}

export default function CustodyDashboardScreen({ onClose }: Props) {
  const { token, user } = useAuth();
  const { width } = useWindowDimensions();
  const { toast, translateY, showToast } = useToast();
  const esAsociacion = user?.rol === 'asociacion' || user?.rol === 'staff';
  const [custodias, setCustodias] = useState<Custodia[]>([]);
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>(null);
  const [seleccionada, setSeleccionada] = useState<Custodia | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    condicion: '',
    salud: '',
    alimentacion: '',
    tratamiento: '',
    comportamiento: '',
    motivo: '',
    fecha: '',
    comentario: '',
    resolucion: '',
  });
  const [fotoAnimal, setFotoAnimal] = useState<string | null>(null);
  const [fotoEntorno, setFotoEntorno] = useState<string | null>(null);
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [reservandoRevision, setReservandoRevision] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const endpoint = esAsociacion ? '/custody/regional' : '/custody/me';
      const response = await axios.get(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustodias(response.data.custodias || []);
      setNotificaciones(response.data.notificaciones || []);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos cargar el seguimiento',
        message: error?.response?.data?.detail || 'Inténtalo nuevamente.',
      });
    } finally {
      setLoading(false);
    }
  }, [esAsociacion, showToast, token]);

  useEffect(() => {
    void cargar();
    const timer = setInterval(() => void cargar(), 30000);
    return () => clearInterval(timer);
  }, [cargar]);

  const abrir = (modo: ModalMode, custodia: Custodia) => {
    setSeleccionada(custodia);
    setModal(modo);
    setForm({
      condicion: '',
      salud: '',
      alimentacion: '',
      tratamiento: '',
      comportamiento: '',
      motivo: '',
      fecha: '',
      comentario: '',
      resolucion: '',
    });
    setFotoAnimal(null);
    setFotoEntorno(null);
    setGps(null);
  };

  const cerrarModal = () => {
    if (submitting) return;
    setModal(null);
    setSeleccionada(null);
  };

  const abrirRevision = async (custodia: Custodia) => {
    if (!custodia.ultimo_seguimiento || reservandoRevision) return;
    setReservandoRevision(custodia.ultimo_seguimiento.id);
    try {
      await axios.post(
        `${API_URL}/custody/followups/${custodia.ultimo_seguimiento.id}/review/reserve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      abrir('validacion', custodia);
    } catch (error: any) {
      showToast({
        type: 'info',
        title: 'Revisión no disponible',
        message: error?.response?.data?.detail || 'No pudimos reservar esta revisión.',
      });
    } finally {
      setReservandoRevision(null);
    }
  };

  const tomarFoto = async (entorno = false) => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      showToast({ type: 'error', title: 'Cámara requerida', message: 'Permite usar la cámara para guardar evidencia.' });
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!resultado.canceled) {
      if (entorno) setFotoEntorno(resultado.assets[0].uri);
      else setFotoAnimal(resultado.assets[0].uri);
    }
  };

  const capturarGps = async () => {
    const permiso = await Location.requestForegroundPermissionsAsync();
    if (!permiso.granted) {
      showToast({ type: 'error', title: 'Ubicación requerida', message: 'Permite usar tu GPS para confirmar la evidencia.' });
      return;
    }
    const posicion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setGps(posicion.coords);
  };

  const subirFoto = async (uri: string) => {
    if (!seleccionada) return null;
    const data = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      data.append('foto', new File([blob], `custodia_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } else {
      data.append('foto', { uri, name: `custodia_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    }
    const response = await axios.post(
      `${API_URL}/reports/${seleccionada.reporte_id}/hitos/foto`,
      data,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } },
    );
    return response.data.foto_url as string;
  };

  const ejecutar = async (accion: () => Promise<void>, exito: string) => {
    setSubmitting(true);
    try {
      await accion();
      showToast({ type: 'success', title: 'Actualización registrada', message: exito });
      setModal(null);
      setSeleccionada(null);
      await cargar();
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'No pudimos completar la acción',
        message: error?.response?.data?.detail || error?.message || 'Revisa los datos e inténtalo nuevamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const enviarSeguimiento = () => ejecutar(async () => {
    if (!seleccionada || !fotoAnimal || !form.condicion || !form.salud || !form.alimentacion || !form.comportamiento) {
      throw new Error('Completa la condición, salud, alimentación, comportamiento y fotografía.');
    }
    if (seleccionada.seguimiento_inicial_pendiente && !fotoEntorno) {
      throw new Error('El seguimiento inicial requiere fotografía del entorno.');
    }
    const foto_url = await subirFoto(fotoAnimal);
    const entorno_foto_url = fotoEntorno ? await subirFoto(fotoEntorno) : null;
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/followups`,
      {
        condicion_actual: form.condicion,
        salud: form.salud,
        alimentacion: form.alimentacion,
        tratamiento: form.tratamiento || null,
        comportamiento: form.comportamiento,
        foto_url,
        entorno_foto_url,
        latitud: gps?.latitude,
        longitud: gps?.longitude,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La asociación ya puede revisar la evidencia.');

  const enviarRelevo = () => ejecutar(async () => {
    if (!seleccionada || form.motivo.trim().length < 5) throw new Error('Explica por qué necesitas el relevo.');
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/relief`,
      { motivo: form.motivo.trim() },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'Las asociaciones regionales fueron notificadas.');

  const enviarExtension = () => ejecutar(async () => {
    if (!seleccionada || !form.fecha) throw new Error('Indica una nueva fecha.');
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/extension`,
      { nueva_fecha_limite: new Date(`${form.fecha}T18:00:00`).toISOString() },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La fecha límite del resguardo fue actualizada.');

  const validar = (decision: 'validado' | 'aclaracion_solicitada' | 'alerta') => ejecutar(async () => {
    if (!seleccionada?.ultimo_seguimiento) throw new Error('No hay seguimiento para validar.');
    await axios.post(
      `${API_URL}/custody/followups/${seleccionada.ultimo_seguimiento.id}/validation`,
      { decision, comentario: form.comentario || null },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La revisión quedó registrada.');

  const aceptarRelevo = () => ejecutar(async () => {
    if (!seleccionada?.solicitud_relevo || !form.fecha) throw new Error('Selecciona una fecha para el traslado.');
    await axios.post(
      `${API_URL}/custody/relief/${seleccionada.solicitud_relevo.id}/accept`,
      { fecha_programada: new Date(`${form.fecha}T18:00:00`).toISOString() },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'El traslado quedó reservado; ahora ambas partes deberán confirmarlo.');

  const confirmarTransferencia = () => ejecutar(async () => {
    if (!seleccionada?.transferencia_activa || !fotoAnimal || !gps) {
      throw new Error('La confirmación requiere foto y GPS.');
    }
    const foto_url = await subirFoto(fotoAnimal);
    await axios.post(
      `${API_URL}/custody/transfers/${seleccionada.transferencia_activa.id}/confirm`,
      { foto_url, latitud: gps.latitude, longitud: gps.longitude },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'Tu parte quedó confirmada. La transferencia terminará cuando ambas partes confirmen.');

  const finalizarCustodia = () => ejecutar(async () => {
    if (!seleccionada || !form.resolucion || form.comentario.trim().length < 3) {
      throw new Error('Selecciona la resolución e indica la referencia del proceso.');
    }
    await axios.post(
      `${API_URL}/custody/${seleccionada.id}/finish`,
      {
        resolucion: form.resolucion,
        referencia_proceso: form.comentario.trim(),
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }, 'La custodia y el caso quedaron finalizados.');

  const fecha = (valor?: string | null) =>
    valor ? new Date(valor).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Por definir';

  const animal = (custodia: Custodia) => custodia.reporte.animales?.[0] || {};
  const avisoActivo = notificaciones.find((n) => !n.leida);

  const cerrarAviso = async () => {
    if (!avisoActivo) return;
    setNotificaciones((actuales) =>
      actuales.map((n) => n.id === avisoActivo.id ? { ...n, leida: true } : n)
    );
    try {
      await axios.patch(
        `${API_URL}/custody/notifications/${avisoActivo.id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      // La lectura local evita bloquear el flujo; el próximo refresco reintenta.
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{esAsociacion ? 'COORDINACIÓN COMPARTIDA' : 'CUIDADO Y EVIDENCIA'}</Text>
          <Text style={styles.title}>
            {esAsociacion ? 'Seguimiento regional de hogares temporales' : 'Mis custodias temporales'}
          </Text>
          <Text style={styles.subtitle}>
            {esAsociacion
              ? 'Revisa evidencia, atiende alertas y coordina relevos sin exponer domicilios.'
              : 'Consulta próximos seguimientos, vencimientos y transferencias activas.'}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={22} color={Brand.textDark} />
          </TouchableOpacity>
        )}
      </View>

      {!esAsociacion && avisoActivo && (
        <View style={styles.notification}>
          <Ionicons name="notifications-outline" size={20} color="#9A6700" />
          <Text style={styles.notificationText}>{avisoActivo.mensaje}</Text>
          <TouchableOpacity onPress={cerrarAviso} hitSlop={8}>
            <Ionicons name="close" size={18} color="#795500" />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.empty}><ActivityIndicator color={Brand.primary} /></View>
      ) : custodias.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="home-outline" size={38} color={Brand.textFaint} />
          <Text style={styles.emptyTitle}>No hay custodias activas</Text>
          <Text style={styles.emptyText}>Cuando inicie un resguardo aparecerá aquí con sus fechas y evidencias.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.grid, width >= 900 && styles.gridDesktop]}>
          {custodias.map((custodia) => {
            const ficha = animal(custodia);
            return (
              <View key={custodia.id} style={[styles.card, width >= 900 && styles.cardDesktop]}>
                <View style={styles.cardHeader}>
                  {custodia.reporte.foto_url ? (
                    <Image source={{ uri: custodia.reporte.foto_url }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder]}>
                      <Ionicons name="paw" size={24} color={Brand.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.folio}>CASO {custodia.reporte_id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={styles.animal}>
                      {ficha.tipo_animal || 'Animal'} · {ficha.tamanio || 'Tamaño por confirmar'}
                    </Text>
                    {esAsociacion && (
                      <Text style={styles.volunteer}>
                        {custodia.voluntario_nombre || 'Hogar verificado'}
                        {custodia.distancia_km == null ? ' · Custodia coordinada' : ` · ${custodia.distancia_km} km`}
                      </Text>
                    )}
                  </View>
                  <View style={styles.statePill}><Text style={styles.stateText}>{custodia.estado.replaceAll('_', ' ')}</Text></View>
                </View>

                <View style={styles.dates}>
                  <DateCell label="Último seguimiento" value={fecha(custodia.ultimo_seguimiento?.creado_at)} />
                  <DateCell label="Próximo" value={fecha(custodia.proximo_seguimiento_at)} />
                  <DateCell label="Límite" value={fecha(custodia.fecha_limite)} />
                </View>

                {custodia.ultimo_seguimiento && (
                  <View style={styles.followup}>
                    <Ionicons name="heart-outline" size={17} color={Brand.secondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.followupTitle}>{custodia.ultimo_seguimiento.condicion_actual}</Text>
                      <Text style={styles.followupState}>Validación: {custodia.ultimo_seguimiento.estado_validacion.replaceAll('_', ' ')}</Text>
                    </View>
                  </View>
                )}

                {esAsociacion && custodia.ubicacion_hogar && (
                  <View style={styles.privateLocation}>
                    <Ionicons name="lock-closed-outline" size={17} color={Brand.secondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.privateLocationTitle}>Ubicación autorizada del hogar</Text>
                      <Text style={styles.privateLocationText}>
                        {[
                          [custodia.ubicacion_hogar.calle, custodia.ubicacion_hogar.numero]
                            .filter(Boolean)
                            .join(' '),
                          custodia.ubicacion_hogar.colonia,
                          custodia.ubicacion_hogar.municipio,
                          custodia.ubicacion_hogar.estado,
                        ].filter(Boolean).join(', ')}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.actions}>
                  {!esAsociacion ? (
                    <>
                      {custodia.estado === 'activo' && (
                        <Action icon="camera-outline" label={custodia.seguimiento_inicial_pendiente ? 'Seguimiento inicial' : 'Nuevo seguimiento'} primary onPress={() => abrir('seguimiento', custodia)} />
                      )}
                      {custodia.estado === 'activo' && <Action icon="calendar-outline" label="Extender" onPress={() => abrir('extension', custodia)} />}
                      {custodia.estado === 'activo' && <Action icon="swap-horizontal-outline" label="Necesito relevo" onPress={() => abrir('relevo', custodia)} />}
                      {custodia.transferencia_activa && !custodia.transferencia_activa.confirma_entrega_at && (
                        <Action icon="checkmark-done-outline" label="Confirmar entrega" primary onPress={() => abrir('transferencia', custodia)} />
                      )}
                    </>
                  ) : (
                    <>
                      {custodia.ultimo_seguimiento?.estado_validacion === 'pendiente' && (
                        <Action
                          icon="shield-checkmark-outline"
                          label={reservandoRevision === custodia.ultimo_seguimiento.id ? 'Reservando…' : 'Revisar evidencia'}
                          primary
                          onPress={() => void abrirRevision(custodia)}
                        />
                      )}
                      {custodia.solicitud_relevo?.estado === 'abierta' && !custodia.es_coordinadora && (
                        <Action icon="hand-left-outline" label="Recibir animal" onPress={() => abrir('aceptar', custodia)} />
                      )}
                      {custodia.transferencia_activa && !custodia.transferencia_activa.confirma_recepcion_at && (
                        <Action icon="checkmark-done-outline" label="Confirmar recepción" primary onPress={() => abrir('transferencia', custodia)} />
                      )}
                      {custodia.es_coordinadora && custodia.estado === 'transferido' && (
                        <Action icon="flag-outline" label="Finalizar custodia" primary onPress={() => abrir('finalizar', custodia)} />
                      )}
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={cerrarModal}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle(modal)}</Text>
              <TouchableOpacity onPress={cerrarModal}><Ionicons name="close" size={22} color={Brand.textFaint} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {modal === 'seguimiento' && (
                <>
                  <Field label="Condición actual" value={form.condicion} onChangeText={(v) => setForm({ ...form, condicion: v })} placeholder="Estable, herido, en recuperación..." />
                  <Field label="Salud" value={form.salud} onChangeText={(v) => setForm({ ...form, salud: v })} placeholder="Cambios visibles, heridas o síntomas" multiline />
                  <Field label="Alimentación" value={form.alimentacion} onChangeText={(v) => setForm({ ...form, alimentacion: v })} placeholder="Qué comió y cuánto" />
                  <Field label="Tratamiento" value={form.tratamiento} onChangeText={(v) => setForm({ ...form, tratamiento: v })} placeholder="Medicamentos o indicaciones (opcional)" />
                  <Field label="Comportamiento" value={form.comportamiento} onChangeText={(v) => setForm({ ...form, comportamiento: v })} placeholder="Ánimo, sueño y convivencia" multiline />
                  <EvidenceButtons animal={fotoAnimal} entorno={fotoEntorno} gps={gps} initial={!!seleccionada?.seguimiento_inicial_pendiente} onAnimal={() => tomarFoto()} onEntorno={() => tomarFoto(true)} onGps={capturarGps} />
                  <Submit label="Enviar seguimiento" loading={submitting} onPress={enviarSeguimiento} />
                </>
              )}
              {modal === 'relevo' && (
                <>
                  <Text style={styles.modalCopy}>La custodia continuará contigo hasta realizar una entrega segura.</Text>
                  <Field label="Motivo" value={form.motivo} onChangeText={(v) => setForm({ ...form, motivo: v })} placeholder="Explica desde cuándo necesitas el relevo" multiline />
                  <Submit label="Solicitar relevo" loading={submitting} onPress={enviarRelevo} />
                </>
              )}
              {(modal === 'extension' || modal === 'aceptar') && (
                <>
                  <Text style={styles.modalCopy}>{modal === 'extension' ? 'Indica hasta qué fecha puedes continuar.' : 'Propón la fecha de entrega. La reserva no concluye la transferencia.'}</Text>
                  <Field label="Fecha (AAAA-MM-DD)" value={form.fecha} onChangeText={(v) => setForm({ ...form, fecha: v })} placeholder="2026-08-15" />
                  <Submit label={modal === 'extension' ? 'Confirmar extensión' : 'Reservar traslado'} loading={submitting} onPress={modal === 'extension' ? enviarExtension : aceptarRelevo} />
                </>
              )}
              {modal === 'validacion' && (
                <>
                  <Text style={styles.modalCopy}>
                    La revisión está reservada para tu asociación durante 30 minutos. Compara las fotos y los datos antes de decidir.
                  </Text>
                  <View style={[styles.comparison, width < 600 && styles.comparisonMobile]}>
                    <EvidenceComparison
                      label="Evidencia actual"
                      uri={seleccionada?.ultimo_seguimiento?.foto_url}
                      empty="No hay foto actual"
                    />
                    <EvidenceComparison
                      label="Evidencia anterior"
                      uri={seleccionada?.seguimiento_anterior?.foto_url}
                      empty="Es el primer seguimiento"
                    />
                  </View>
                  <Field label="Comentario" value={form.comentario} onChangeText={(v) => setForm({ ...form, comentario: v })} placeholder="Observaciones o aclaraciones necesarias" multiline />
                  <View style={styles.validationRow}>
                    <Action icon="checkmark-circle-outline" label="Validar" primary onPress={() => validar('validado')} />
                    <Action icon="help-circle-outline" label="Aclaración" onPress={() => validar('aclaracion_solicitada')} />
                    <Action icon="warning-outline" label="Alerta" danger onPress={() => validar('alerta')} />
                  </View>
                </>
              )}
              {modal === 'transferencia' && (
                <>
                  <Text style={styles.modalCopy}>Tu confirmación no finaliza el traslado por sí sola. Ambas partes deben confirmar con foto y GPS.</Text>
                  <EvidenceButtons animal={fotoAnimal} entorno={null} gps={gps} initial={false} onAnimal={() => tomarFoto()} onEntorno={() => undefined} onGps={capturarGps} />
                  <Submit label={esAsociacion ? 'Confirmar recepción' : 'Confirmar entrega'} loading={submitting} onPress={confirmarTransferencia} />
                </>
              )}
              {modal === 'finalizar' && (
                <>
                  <Text style={styles.modalCopy}>Elige únicamente una resolución ya formalizada. La adopción nunca se genera automáticamente.</Text>
                  <View style={styles.validationRow}>
                    <Action icon="swap-horizontal-outline" label="Transferencia confirmada" primary={form.resolucion === 'transferencia_confirmada'} onPress={() => setForm({ ...form, resolucion: 'transferencia_confirmada' })} />
                    <Action icon="business-outline" label="Ingreso formal" primary={form.resolucion === 'ingreso_formal_asociacion'} onPress={() => setForm({ ...form, resolucion: 'ingreso_formal_asociacion' })} />
                    <Action icon="heart-outline" label="Adopción aprobada" primary={form.resolucion === 'adopcion_aprobada'} onPress={() => setForm({ ...form, resolucion: 'adopcion_aprobada' })} />
                  </View>
                  <Field label="Folio o referencia del proceso" value={form.comentario} onChangeText={(v) => setForm({ ...form, comentario: v })} placeholder="Ej. expediente de ingreso o adopción aprobada" />
                  <Submit label="Finalizar custodia" loading={submitting} onPress={finalizarCustodia} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Toast toast={toast} translateY={translateY} />
    </View>
  );
}

function DateCell({ label, value }: { label: string; value: string }) {
  return <View style={styles.dateCell}><Text style={styles.dateLabel}>{label}</Text><Text style={styles.dateValue}>{value}</Text></View>;
}

function EvidenceComparison({ label, uri, empty }: { label: string; uri?: string | null; empty: string }) {
  return (
    <View style={styles.comparisonCard}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      {uri ? (
        <Image source={{ uri }} style={styles.evidencePhoto} />
      ) : (
        <View style={styles.comparisonEmpty}>
          <Ionicons name="image-outline" size={24} color={Brand.textFaint} />
          <Text style={styles.comparisonEmptyText}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

function Action({ icon, label, onPress, primary, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity style={[styles.action, primary && styles.actionPrimary, danger && styles.actionDanger]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={primary || danger ? '#fff' : Brand.textDark} />
      <Text style={[styles.actionText, (primary || danger) && styles.actionTextLight]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; multiline?: boolean }) {
  return <View style={{ marginBottom: 12 }}><Text style={styles.label}>{props.label}</Text><TextInput {...props} style={[styles.input, props.multiline && styles.textArea]} placeholderTextColor={Brand.textFaint} /></View>;
}

function EvidenceButtons({ animal, entorno, gps, initial, onAnimal, onEntorno, onGps }: any) {
  return (
    <View style={styles.evidenceRow}>
      <Action icon={animal ? 'checkmark-circle' : 'camera-outline'} label={animal ? 'Foto lista' : 'Foto animal'} onPress={onAnimal} />
      {initial && <Action icon={entorno ? 'checkmark-circle' : 'home-outline'} label={entorno ? 'Entorno listo' : 'Foto entorno'} onPress={onEntorno} />}
      <Action icon={gps ? 'checkmark-circle' : 'locate-outline'} label={gps ? 'GPS listo' : 'Capturar GPS'} onPress={onGps} />
    </View>
  );
}

function Submit({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) {
  return <TouchableOpacity style={styles.submit} onPress={onPress} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{label}</Text>}</TouchableOpacity>;
}

function modalTitle(mode: ModalMode) {
  return ({
    seguimiento: 'Registrar seguimiento',
    relevo: 'Solicitar relevo',
    extension: 'Extender resguardo',
    validacion: 'Revisar evidencia',
    aceptar: 'Recibir al animal',
    transferencia: 'Confirmar transferencia',
    finalizar: 'Finalizar custodia',
  } as any)[mode || ''] || '';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.backgroundWarm },
  header: { flexDirection: 'row', gap: 16, padding: 22, borderBottomWidth: 1, borderBottomColor: '#E7D8C4' },
  eyebrow: { color: Brand.primary, fontWeight: '900', fontSize: 10, letterSpacing: 1.2 },
  title: { color: Brand.textDark, fontWeight: '900', fontSize: 24, marginTop: 4 },
  subtitle: { color: Brand.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 650 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  notification: { margin: 18, marginBottom: 0, padding: 12, borderRadius: 14, backgroundColor: '#FFF3CD', flexDirection: 'row', gap: 9, alignItems: 'center' },
  notificationText: { color: '#795500', fontSize: 12, flex: 1, fontWeight: '700' },
  grid: { padding: 18, gap: 14 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#E7D8C4' },
  cardDesktop: { width: '48.5%' },
  cardHeader: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  photo: { width: 56, height: 56, borderRadius: 16 },
  photoPlaceholder: { backgroundColor: `${Brand.primary}14`, alignItems: 'center', justifyContent: 'center' },
  folio: { color: Brand.textFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  animal: { color: Brand.textDark, fontSize: 14, fontWeight: '900', marginTop: 3, textTransform: 'capitalize' },
  volunteer: { color: Brand.secondary, fontSize: 10, fontWeight: '700', marginTop: 3 },
  statePill: { backgroundColor: `${Brand.secondary}16`, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99 },
  stateText: { color: Brand.secondary, fontSize: 9, fontWeight: '900', textTransform: 'capitalize' },
  dates: { flexDirection: 'row', marginTop: 14, gap: 7 },
  dateCell: { flex: 1, borderRadius: 12, padding: 9, backgroundColor: Brand.cardWarm },
  dateLabel: { color: Brand.textFaint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },
  dateValue: { color: Brand.textDark, fontSize: 10, fontWeight: '700', marginTop: 4 },
  followup: { marginTop: 12, borderRadius: 13, padding: 11, backgroundColor: `${Brand.secondary}10`, flexDirection: 'row', gap: 8, alignItems: 'center' },
  followupTitle: { color: Brand.textDark, fontSize: 12, fontWeight: '800' },
  followupState: { color: Brand.textMuted, fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  privateLocation: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#EAF7F5', borderWidth: 1, borderColor: '#C3E8E4', marginTop: 12 },
  privateLocationTitle: { color: Brand.textDark, fontWeight: '800', fontSize: 11 },
  privateLocationText: { color: Brand.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  action: { minHeight: 39, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFE3CD' },
  actionPrimary: { backgroundColor: Brand.secondary },
  actionDanger: { backgroundColor: '#B84A3A' },
  actionText: { color: Brand.textDark, fontSize: 10, fontWeight: '800' },
  actionTextLight: { color: '#fff' },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { color: Brand.textDark, fontSize: 17, fontWeight: '900', marginTop: 12 },
  emptyText: { color: Brand.textMuted, fontSize: 12, textAlign: 'center', maxWidth: 340, marginTop: 5 },
  overlay: { flex: 1, backgroundColor: 'rgba(46,42,38,0.6)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modal: { width: '100%', maxWidth: 480, maxHeight: '92%', borderRadius: 24, padding: 20, backgroundColor: Brand.cardWarm },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { color: Brand.textDark, fontSize: 19, fontWeight: '900' },
  modalCopy: { color: Brand.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  label: { color: Brand.textDark, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E4D3B8', borderRadius: 12, backgroundColor: '#fff', padding: 11, color: Brand.textDark, fontSize: 12 },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 8 },
  comparison: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  comparisonMobile: { flexDirection: 'column' },
  comparisonCard: { flex: 1, minWidth: 0 },
  comparisonLabel: { color: Brand.textDark, fontSize: 10, fontWeight: '900', marginBottom: 6 },
  comparisonEmpty: { height: 170, borderRadius: 15, backgroundColor: '#EFE3CD', alignItems: 'center', justifyContent: 'center', padding: 12 },
  comparisonEmptyText: { color: Brand.textMuted, fontSize: 10, textAlign: 'center', marginTop: 6 },
  evidencePhoto: { width: '100%', height: 170, borderRadius: 15 },
  validationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  submit: { minHeight: 48, borderRadius: 14, backgroundColor: Brand.primary, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
