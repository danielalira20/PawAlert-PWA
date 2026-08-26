import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { useAuth } from '../../context/AuthContext';
import { AppModal } from '../AppModal';
import { Toast, useToast } from '../Toast';
import { WithdrawalFollowupForm } from './WithdrawalFollowupForm';
import { DeceasedClosureForm } from './DeceasedClosureForm';

const COLORS = {
  primary: '#EC802B',
  secondary: '#EDC55B',
  accent: '#66BCB4',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  white: '#FFFFFF',
  danger: '#C7463B',
  warning: '#B7791F',
  success: '#27865B',
  cardBg: '#FAF3EA',
  border: '#E8DCCA',
};

type DecisionRevision =
  | 'confirmar'
  | 'duda_critica'
  | 'evidencia_insuficiente';

interface SeguimientoResumen {
  id: string;
  reporte_id: string;
  estado: string;
  iniciado_at: string;
  asociacion_deadline_at: string;
  administracion_deadline_at: string;
  reportes?: {
    municipio?: string | null;
    colonia?: string | null;
    created_at?: string;
  } | null;
}

interface AnimalSeguimiento {
  id: string;
  tipo_animal?: string | null;
  condicion?: string | null;
  tamanio?: string | null;
  descripcion?: string | null;
  cantidad?: number | null;
  es_grupo?: boolean | null;
}

interface EvidenciaSensible {
  url: string;
  expira_at: string;
  creada_at?: string | null;
  contenido_sensible: true;
}

interface ResultadoSeguimiento {
  id: string;
  animal_id: string;
  estado: string;
  cantidad_reportada: number;
  latitud: number;
  longitud: number;
  puede_esperar_seguro: boolean;
  riesgo_vial: boolean;
  riesgo_sanitario: boolean;
  identificacion_observada?: string | null;
  comentario?: string | null;
  motivo_retiro_seguridad?: string | null;
  revision_notas?: string | null;
  reportado_at: string;
  revisado_at?: string | null;
  evidencia?: EvidenciaSensible | null;
}

interface ContactoRetiro {
  id: string;
  nombre_servicio: string;
  telefono: string;
  tipo_servicio: string;
  horario?: string | null;
  verificado_at?: string | null;
}

interface AccionRetiroRegistrada {
  id: string;
  resultado_rescate_animal_id: string;
  registrado_por_id: string;
  tipo_actor: string;
  accion: string;
  folio?: string | null;
  nombre_servicio?: string | null;
  destino_informado?: string | null;
  nota?: string | null;
  registrado_at: string;
}

interface DetalleSeguimiento {
  seguimiento: SeguimientoResumen;
  reporte: {
    id: string;
    estado_reporte: string;
    municipio?: string | null;
    colonia?: string | null;
    calle?: string | null;
    animales: AnimalSeguimiento[];
  };
  resultados: ResultadoSeguimiento[];
  acciones_retiro: AccionRetiroRegistrada[];
  contactos_retiro: ContactoRetiro[];
}

interface Props {
  visible: boolean;
  mode?: 'association' | 'admin';
}

const DECISIONES: {
  key: DecisionRevision;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  {
    key: 'confirmar',
    label: 'Confirmar resultado',
    detail: 'La evidencia es consistente con lo reportado.',
    icon: 'checkmark-circle-outline',
    color: COLORS.success,
  },
  {
    key: 'evidencia_insuficiente',
    label: 'Evidencia insuficiente',
    detail: 'No hay elementos suficientes para confirmarlo.',
    icon: 'document-text-outline',
    color: COLORS.warning,
  },
  {
    key: 'duda_critica',
    label: 'Existe una duda crítica',
    detail: 'El caso debe volver a urgencia y matching.',
    icon: 'alert-circle-outline',
    color: COLORS.danger,
  },
];

const ESTADOS_RESULTADO: Record<string, { label: string; color: string }> = {
  sin_vida_reportado: { label: 'Pendiente de revisión', color: COLORS.warning },
  sin_vida_confirmado: { label: 'Resultado confirmado', color: COLORS.success },
  evidencia_insuficiente: { label: 'Evidencia insuficiente', color: COLORS.warning },
  duda_estado_critico: { label: 'Reactivado por duda', color: COLORS.danger },
};

const ACCIONES_RETIRO_LABEL: Record<string, string> = {
  contacto_oficial_realizado: 'Contacto oficial realizado',
  autoridad_se_presento: 'La autoridad se presentó',
  tercero_responsable_se_hizo_cargo: 'Un responsable se hizo cargo',
  retiro_gestionado_con_indicaciones: 'Retiro gestionado con indicaciones',
  sin_comunicacion: 'Sin comunicación',
  sin_contacto_disponible: 'Sin contacto disponible',
  retiro_por_seguridad: 'Retiro por seguridad',
};

function mensajeError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

function ubicacionTexto(...partes: (string | null | undefined)[]): string {
  return partes.filter(Boolean).join(', ') || 'Ubicación no especificada';
}

function estadoSeguimiento(estado: string): string {
  if (estado === 'pendiente_asociacion') return 'Requiere acción de la asociación';
  if (estado === 'escalado_administracion') return 'Escalado a administración';
  return 'Seguimiento en curso';
}

export function DeceasedFollowupPanel({ visible, mode = 'association' }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [seguimientos, setSeguimientos] = useState<SeguimientoResumen[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [detalle, setDetalle] = useState<DetalleSeguimiento | null>(null);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState(false);
  const [evidenciasVisibles, setEvidenciasVisibles] = useState<Set<string>>(
    new Set(),
  );
  const [resultadoRevision, setResultadoRevision] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionRevision | null>(null);
  const [notas, setNotas] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultadoGestion, setResultadoGestion] = useState<string | null>(null);
  const [isSubmittingGestion, setIsSubmittingGestion] = useState(false);
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [isSubmittingCierre, setIsSubmittingCierre] = useState(false);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );
  const seguimientoBase = mode === 'admin'
    ? `${API_URL}/admin/seguimientos-fallecimiento`
    : `${API_URL}/associations/me/seguimientos-fallecimiento`;

  const cargarSeguimientos = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await axios.get<SeguimientoResumen[]>(
        seguimientoBase,
        { headers },
      );
      setSeguimientos(response.data || []);
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No pudimos cargar los seguimientos',
        message: mensajeError(error, 'Intenta actualizar la bandeja.'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [headers, seguimientoBase, showToast, token]);

  const cargarDetalle = useCallback(
    async (reporteId: string) => {
      setIsLoadingDetalle(true);
      setEvidenciasVisibles(new Set());
      setResultadoRevision(null);
      setDecision(null);
      setNotas('');
      setResultadoGestion(null);
      try {
        const response = await axios.get<DetalleSeguimiento>(
          `${seguimientoBase}/${reporteId}`,
          { headers },
        );
        setDetalle(response.data);
      } catch (error) {
        showToast({
          type: 'error',
          title: 'No pudimos abrir el seguimiento',
          message: mensajeError(error, 'Actualiza la bandeja e inténtalo nuevamente.'),
        });
      } finally {
        setIsLoadingDetalle(false);
      }
    },
    [headers, seguimientoBase, showToast],
  );

  useEffect(() => {
    if (visible) void cargarSeguimientos();
  }, [cargarSeguimientos, visible]);

  if (!visible) return null;

  const cerrarDetalle = (forzar = false) => {
    if ((isSubmitting || isSubmittingGestion || isSubmittingCierre) && !forzar) return;
    setDetalle(null);
    setResultadoRevision(null);
    setDecision(null);
    setNotas('');
    setResultadoGestion(null);
    setIsSubmittingGestion(false);
    setMostrarCierre(false);
    setIsSubmittingCierre(false);
    setEvidenciasVisibles(new Set());
  };

  const abrirRevision = (resultadoId: string) => {
    setResultadoGestion(null);
    setResultadoRevision(resultadoId);
    setDecision(null);
    setNotas('');
  };

  const enviarRevision = async () => {
    if (!detalle || !resultadoRevision || !decision || notas.trim().length < 5) {
      showToast({
        type: 'warning',
        title: 'Completa la revisión',
        message: 'Selecciona una decisión y escribe notas de al menos 5 caracteres.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(
        `${seguimientoBase}/${detalle.reporte.id}`
          + `/resultados/${resultadoRevision}/revision`,
        { decision, notas: notas.trim() },
        { headers },
      );
      showToast({
        type: 'success',
        title: decision === 'duda_critica' ? 'Caso reactivado' : 'Revisión guardada',
        message: decision === 'duda_critica'
          ? 'La urgencia se recalculó y el caso volvió al flujo operativo.'
          : 'La decisión quedó registrada en el historial.',
      });
      if (decision === 'duda_critica') {
        cerrarDetalle(true);
        await cargarSeguimientos();
      } else {
        await cargarDetalle(detalle.reporte.id);
        await cargarSeguimientos();
      }
    } catch (error) {
      const detail = mensajeError(error, 'No pudimos guardar la revisión.');
      const dudaGuardada = axios.isAxiosError(error) && error.response?.status === 503
        && detail.toLocaleLowerCase('es-MX').includes('duda quedó registrada');
      showToast({
        type: dudaGuardada ? 'warning' : 'error',
        title: dudaGuardada ? 'Duda guardada, reactivación pendiente' : 'No se guardó la revisión',
        message: detail,
      });
      if (dudaGuardada) {
        cerrarDetalle(true);
        await cargarSeguimientos();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Toast toast={toast} translateY={translateY} />

      <View style={styles.toolbar}>
        <Text style={styles.helperText}>
          {mode === 'admin'
            ? 'Resuelve expedientes escalados sin cerrar el caso antes de completar su revisión.'
            : 'Revisa evidencias sensibles y coordina el seguimiento sin cerrar el caso antes de tiempo.'}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Actualizar seguimientos"
          onPress={() => void cargarSeguimientos()}
          disabled={isLoading}
          style={styles.refreshButton}
        >
          <Ionicons name="refresh" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.stateText}>Cargando seguimientos…</Text>
        </View>
      ) : seguimientos.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="shield-checkmark-outline" size={34} color={COLORS.accent} />
          <Text style={styles.emptyTitle}>No hay revisiones pendientes</Text>
          <Text style={styles.stateText}>
            Los casos que requieran validación aparecerán aquí.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {seguimientos.map((seguimiento) => {
            const ubicacion = seguimiento.reportes;
            const deadline = mode === 'admin'
              ? seguimiento.administracion_deadline_at
              : seguimiento.asociacion_deadline_at;
            const vencido = new Date(deadline).getTime() < Date.now();
            return (
              <TouchableOpacity
                key={seguimiento.id}
                accessibilityRole="button"
                accessibilityLabel="Abrir seguimiento sensible"
                onPress={() => void cargarDetalle(seguimiento.reporte_id)}
                style={styles.followupCard}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, vencido && styles.iconBoxDanger]}>
                    <Ionicons
                      name={vencido ? 'alert-circle-outline' : 'time-outline'}
                      size={20}
                      color={vencido ? COLORS.danger : COLORS.primary}
                    />
                  </View>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>{estadoSeguimiento(seguimiento.estado)}</Text>
                    <Text style={styles.cardLocation}>
                      {ubicacionTexto(ubicacion?.colonia, ubicacion?.municipio)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
                </View>
                <View style={styles.deadlineRow}>
                  <Text style={[styles.deadlineText, vencido && styles.deadlineDanger]}>
                    {mode === 'admin'
                      ? 'Revisión administrativa requerida'
                      : vencido ? 'Plazo de asociación vencido' : 'Revisión de asociación'}
                  </Text>
                  <Text style={styles.deadlineText}>
                    {formatDistanceToNow(new Date(deadline), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {isLoadingDetalle && (
        <View style={styles.detailLoading}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      )}

      <AppModal
        visible={Boolean(detalle)}
        onClose={() => cerrarDetalle()}
        maxWidth={820}
        dismissable={!isSubmitting && !isSubmittingGestion && !isSubmittingCierre}
      >
        {detalle && (
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.sensitiveIcon}>
                <Ionicons name="eye-off-outline" size={24} color={COLORS.danger} />
              </View>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Revisión de resultado</Text>
                <Text style={styles.modalSubtitle}>
                  {ubicacionTexto(
                    detalle.reporte.calle,
                    detalle.reporte.colonia,
                    detalle.reporte.municipio,
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.sensitiveNotice}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.danger} />
              <Text style={styles.sensitiveNoticeText}>
                Contenido sensible y privado. La fotografía permanece oculta hasta que decidas verla.
              </Text>
            </View>

            {detalle.resultados.map((resultado) => {
              const animal = detalle.reporte.animales.find(
                (item) => item.id === resultado.animal_id,
              );
              const estado = ESTADOS_RESULTADO[resultado.estado]
                || { label: resultado.estado, color: COLORS.textLight };
              const evidenciaVisible = evidenciasVisibles.has(resultado.id);
              const enRevision = resultadoRevision === resultado.id;
              const puedeRevisar = resultado.estado !== 'duda_estado_critico';

              return (
                <View key={resultado.id} style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <View style={styles.resultTitleWrap}>
                      <Text style={styles.resultTitle}>
                        {animal?.tipo_animal || 'Animal'}
                        {resultado.cantidad_reportada > 1
                          ? ` · ${resultado.cantidad_reportada} animales`
                          : ''}
                      </Text>
                      <Text style={styles.resultMeta}>
                        {[animal?.condicion, animal?.tamanio].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { borderColor: estado.color }]}>
                      <Text style={[styles.statusBadgeText, { color: estado.color }]}>
                        {estado.label}
                      </Text>
                    </View>
                  </View>

                  {(resultado.riesgo_vial || resultado.riesgo_sanitario || !resultado.puede_esperar_seguro) && (
                    <View style={styles.riskRow}>
                      {resultado.riesgo_vial && <RiskChip label="Riesgo vial" />}
                      {resultado.riesgo_sanitario && <RiskChip label="Riesgo sanitario" />}
                      {!resultado.puede_esperar_seguro && <RiskChip label="No puede esperar" />}
                    </View>
                  )}

                  {resultado.comentario && (
                    <Text style={styles.observationText}>{resultado.comentario}</Text>
                  )}
                  {resultado.identificacion_observada && (
                    <Text style={styles.detailText}>
                      Identificación observada: {resultado.identificacion_observada}
                    </Text>
                  )}

                  <View style={styles.evidenceBox}>
                    {!resultado.evidencia ? (
                      <Text style={styles.evidenceUnavailable}>
                        La evidencia no está disponible temporalmente.
                      </Text>
                    ) : evidenciaVisible ? (
                      <>
                        <Image
                          source={{ uri: resultado.evidencia.url }}
                          style={styles.evidenceImage}
                          resizeMode="contain"
                        />
                        <TouchableOpacity
                          onPress={() => setEvidenciasVisibles((actual) => {
                            const siguiente = new Set(actual);
                            siguiente.delete(resultado.id);
                            return siguiente;
                          })}
                          style={styles.hideEvidenceButton}
                        >
                          <Ionicons name="eye-off-outline" size={16} color={COLORS.textDark} />
                          <Text style={styles.hideEvidenceText}>Ocultar evidencia</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Mostrar evidencia sensible"
                        onPress={() => setEvidenciasVisibles((actual) => new Set(actual).add(resultado.id))}
                        style={styles.showEvidenceButton}
                      >
                        <Ionicons name="eye-outline" size={18} color={COLORS.white} />
                        <Text style={styles.showEvidenceText}>Mostrar evidencia sensible</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {resultado.revision_notas && (
                    <View style={styles.previousReview}>
                      <Text style={styles.previousReviewLabel}>Notas de revisión</Text>
                      <Text style={styles.previousReviewText}>{resultado.revision_notas}</Text>
                    </View>
                  )}

                  {puedeRevisar && !enRevision && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Revisar este resultado"
                      onPress={() => abrirRevision(resultado.id)}
                      style={styles.reviewButton}
                    >
                      <Ionicons name="clipboard-outline" size={17} color={COLORS.primary} />
                      <Text style={styles.reviewButtonText}>
                        {resultado.revisado_at ? 'Revisar otra vez' : 'Registrar revisión'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {enRevision && (
                    <View style={styles.reviewForm}>
                      <Text style={styles.reviewFormTitle}>Decisión humana</Text>
                      {DECISIONES.map((opcion) => {
                        const seleccionada = decision === opcion.key;
                        return (
                          <TouchableOpacity
                            key={opcion.key}
                            accessibilityRole="radio"
                            accessibilityLabel={`Decisión: ${opcion.label}`}
                            accessibilityState={{ selected: seleccionada }}
                            onPress={() => setDecision(opcion.key)}
                            style={[
                              styles.decisionOption,
                              seleccionada && { borderColor: opcion.color },
                            ]}
                          >
                            <Ionicons name={opcion.icon} size={20} color={opcion.color} />
                            <View style={styles.decisionTextWrap}>
                              <Text style={styles.decisionLabel}>{opcion.label}</Text>
                              <Text style={styles.decisionDetail}>{opcion.detail}</Text>
                            </View>
                            <Ionicons
                              name={seleccionada ? 'radio-button-on' : 'radio-button-off'}
                              size={19}
                              color={seleccionada ? opcion.color : COLORS.textLight}
                            />
                          </TouchableOpacity>
                        );
                      })}

                      {decision === 'duda_critica' && (
                        <View style={styles.criticalWarning}>
                          <Ionicons name="warning-outline" size={18} color={COLORS.danger} />
                          <Text style={styles.criticalWarningText}>
                            Esta decisión recalculará Urgency y devolverá el caso a cobertura y matching.
                          </Text>
                        </View>
                      )}

                      <TextInput
                        accessibilityLabel="Notas de revisión"
                        value={notas}
                        onChangeText={setNotas}
                        placeholder="Explica qué observaste en la evidencia y el contexto…"
                        placeholderTextColor={COLORS.textLight}
                        multiline
                        maxLength={1000}
                        style={styles.notesInput}
                      />
                      <View style={styles.formActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setResultadoRevision(null);
                            setDecision(null);
                            setNotas('');
                          }}
                          disabled={isSubmitting}
                          style={styles.cancelButton}
                        >
                          <Text style={styles.cancelButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Guardar revisión"
                          accessibilityState={{
                            disabled: !decision || notas.trim().length < 5 || isSubmitting,
                          }}
                          onPress={() => void enviarRevision()}
                          disabled={!decision || notas.trim().length < 5 || isSubmitting}
                          style={[
                            styles.submitButton,
                            (!decision || notas.trim().length < 5 || isSubmitting)
                              && styles.disabledButton,
                          ]}
                        >
                          {isSubmitting
                            ? <ActivityIndicator color={COLORS.white} />
                            : <Text style={styles.submitButtonText}>Guardar decisión</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {puedeRevisar && resultadoGestion !== resultado.id && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Registrar gestión de retiro"
                      onPress={() => {
                        setResultadoRevision(null);
                        setDecision(null);
                        setNotas('');
                        setResultadoGestion(resultado.id);
                      }}
                      style={styles.followupButton}
                    >
                      <Ionicons name="call-outline" size={17} color={COLORS.accent} />
                      <Text style={styles.followupButtonText}>Registrar gestión de retiro</Text>
                    </TouchableOpacity>
                  )}

                  {resultadoGestion === resultado.id && (
                    <WithdrawalFollowupForm
                      reporteId={detalle.reporte.id}
                      resultadoId={resultado.id}
                      onSubmittingChange={setIsSubmittingGestion}
                      onCancel={() => {
                        setResultadoGestion(null);
                      }}
                      onSaved={async () => {
                        setResultadoGestion(null);
                        await cargarDetalle(detalle.reporte.id);
                        await cargarSeguimientos();
                        showToast({
                          type: 'success',
                          title: 'Gestión registrada',
                          message: 'El avance quedó disponible para seguimiento.',
                        });
                      }}
                    />
                  )}

                  {detalle.acciones_retiro
                    .filter((accion) => accion.resultado_rescate_animal_id === resultado.id)
                    .map((accion) => (
                      <View key={accion.id} style={styles.registeredAction}>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={17}
                          color={COLORS.success}
                        />
                        <View style={styles.registeredActionText}>
                          <Text style={styles.registeredActionTitle}>
                            {ACCIONES_RETIRO_LABEL[accion.accion]
                              || 'Gestión de retiro registrada'}
                          </Text>
                          <Text style={styles.registeredActionMeta}>
                            {[accion.nombre_servicio, accion.folio].filter(Boolean).join(' · ')
                              || `Registrado por ${accion.tipo_actor}`}
                          </Text>
                          {accion.nota && (
                            <Text style={styles.registeredActionNote}>{accion.nota}</Text>
                          )}
                        </View>
                      </View>
                    ))}
                </View>
              );
            })}

            {detalle.contactos_retiro.length > 0 && (
              <View style={styles.contactsSection}>
                <Text style={styles.sectionTitle}>Contactos verificados de la zona</Text>
                {detalle.contactos_retiro.map((contacto) => (
                  <View key={contacto.id} style={styles.contactRow}>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{contacto.nombre_servicio}</Text>
                      <Text style={styles.contactMeta}>
                        {contacto.horario || contacto.tipo_servicio.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Llamar a ${contacto.nombre_servicio}`}
                      onPress={() => void Linking.openURL(`tel:${contacto.telefono}`)}
                      style={styles.callButton}
                    >
                      <Ionicons name="call-outline" size={18} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <ClosureSection
              detalle={detalle}
              mostrarFormulario={mostrarCierre}
              onMostrar={() => setMostrarCierre(true)}
              onCancel={() => setMostrarCierre(false)}
              onSubmittingChange={setIsSubmittingCierre}
              onClosed={async () => {
                cerrarDetalle(true);
                await cargarSeguimientos();
                showToast({
                  type: 'success',
                  title: 'Seguimiento cerrado',
                  message: 'La conclusión quedó documentada y el reporte terminó.',
                });
              }}
            />
          </ScrollView>
        )}
      </AppModal>
    </View>
  );
}

function ClosureSection({
  detalle,
  mostrarFormulario,
  onMostrar,
  onCancel,
  onClosed,
  onSubmittingChange,
}: {
  detalle: DetalleSeguimiento;
  mostrarFormulario: boolean;
  onMostrar: () => void;
  onCancel: () => void;
  onClosed: () => Promise<void>;
  onSubmittingChange: (isSubmitting: boolean) => void;
}) {
  const pendientes = detalle.resultados.filter(
    (resultado) => resultado.estado === 'sin_vida_reportado',
  ).length;
  const noConfirmados = detalle.resultados.filter(
    (resultado) => resultado.estado !== 'sin_vida_confirmado',
  ).length;
  const tieneGestion = detalle.acciones_retiro.length > 0;
  const puedeCerrar = pendientes === 0 && noConfirmados === 0 && tieneGestion;

  if (mostrarFormulario && puedeCerrar) {
    return (
      <DeceasedClosureForm
        reporteId={detalle.reporte.id}
        accionesRegistradas={detalle.acciones_retiro.map((accion) => accion.accion)}
        onCancel={onCancel}
        onClosed={onClosed}
        onSubmittingChange={onSubmittingChange}
      />
    );
  }

  return (
    <View style={styles.closureSection}>
      <View style={styles.closureHeader}>
        <Ionicons
          name={puedeCerrar ? 'checkmark-done-outline' : 'lock-closed-outline'}
          size={20}
          color={puedeCerrar ? COLORS.success : COLORS.textLight}
        />
        <View style={styles.closureHeaderText}>
          <Text style={styles.closureTitle}>Cierre del seguimiento</Text>
          <Text style={styles.closureHelper}>
            {puedeCerrar
              ? 'El expediente cumple las condiciones para una conclusión humana.'
              : 'El caso seguirá abierto hasta completar todas las condiciones.'}
          </Text>
        </View>
      </View>

      {!puedeCerrar && (
        <View style={styles.closureRequirements}>
          <RequirementRow complete={pendientes === 0} label="Todos los resultados revisados" />
          <RequirementRow complete={noConfirmados === 0} label="Todos los resultados confirmados" />
          <RequirementRow complete={tieneGestion} label="Al menos una gestión de retiro registrada" />
        </View>
      )}

      {puedeCerrar && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Preparar cierre del seguimiento"
          onPress={onMostrar}
          style={styles.closeFollowupButton}
        >
          <Ionicons name="document-text-outline" size={17} color={COLORS.white} />
          <Text style={styles.closeFollowupText}>Preparar cierre</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RequirementRow({ complete, label }: { complete: boolean; label: string }) {
  return (
    <View style={styles.requirementRow}>
      <Ionicons
        name={complete ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={complete ? COLORS.success : COLORS.textLight}
      />
      <Text style={[styles.requirementText, complete && styles.requirementComplete]}>
        {label}
      </Text>
    </View>
  );
}

function RiskChip({ label }: { label: string }) {
  return (
    <View style={styles.riskChip}>
      <Ionicons name="warning-outline" size={13} color={COLORS.danger} />
      <Text style={styles.riskChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  helperText: { flex: 1, color: COLORS.textLight, fontSize: 13, lineHeight: 19 },
  refreshButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border,
  },
  centerState: { alignItems: 'center', paddingVertical: 42, gap: 10 },
  stateText: { color: COLORS.textLight, fontSize: 13, textAlign: 'center' },
  emptyTitle: { color: COLORS.textDark, fontSize: 16, fontWeight: '800' },
  list: { gap: 12 },
  followupCard: {
    backgroundColor: COLORS.cardBg, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(236,128,43,0.12)',
  },
  iconBoxDanger: { backgroundColor: 'rgba(199,70,59,0.12)' },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '800' },
  cardLocation: { color: COLORS.textLight, fontSize: 12, marginTop: 3 },
  deadlineRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 8,
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  deadlineText: { color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  deadlineDanger: { color: COLORS.danger },
  detailLoading: { alignItems: 'center', paddingVertical: 20 },
  modalContent: { padding: 22, paddingTop: 26, paddingBottom: 44, gap: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 38 },
  sensitiveIcon: {
    width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(199,70,59,0.12)',
  },
  modalHeaderText: { flex: 1 },
  modalTitle: { color: COLORS.textDark, fontSize: 20, fontWeight: '900' },
  modalSubtitle: { color: COLORS.textLight, fontSize: 12, marginTop: 4 },
  sensitiveNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13,
    borderRadius: 12, backgroundColor: 'rgba(199,70,59,0.08)',
  },
  sensitiveNoticeText: { flex: 1, color: COLORS.textDark, fontSize: 12, lineHeight: 18 },
  resultCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  resultTitleWrap: { flex: 1 },
  resultTitle: { color: COLORS.textDark, fontSize: 16, fontWeight: '900', textTransform: 'capitalize' },
  resultMeta: { color: COLORS.textLight, fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  statusBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '45%' },
  statusBadgeText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  riskRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  riskChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9,
    paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'rgba(199,70,59,0.09)',
  },
  riskChipText: { color: COLORS.danger, fontSize: 10, fontWeight: '700' },
  observationText: { color: COLORS.textDark, fontSize: 13, lineHeight: 19 },
  detailText: { color: COLORS.textLight, fontSize: 12, lineHeight: 18 },
  evidenceBox: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#F1ECE6', minHeight: 70, justifyContent: 'center' },
  evidenceImage: { width: '100%', height: 280, backgroundColor: '#2E2A26' },
  showEvidenceButton: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 11, backgroundColor: COLORS.textDark, paddingHorizontal: 16, paddingVertical: 11,
  },
  showEvidenceText: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  hideEvidenceButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10,
  },
  hideEvidenceText: { color: COLORS.textDark, fontSize: 11, fontWeight: '700' },
  evidenceUnavailable: { color: COLORS.textLight, fontSize: 12, textAlign: 'center', padding: 16 },
  previousReview: { padding: 12, borderRadius: 11, backgroundColor: 'rgba(102,188,180,0.11)' },
  previousReviewLabel: { color: COLORS.accent, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  previousReviewText: { color: COLORS.textDark, fontSize: 12, lineHeight: 18, marginTop: 4 },
  reviewButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: 12, paddingVertical: 11,
  },
  reviewButtonText: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  followupButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 9, paddingVertical: 11, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.accent,
  },
  followupButtonText: { color: COLORS.accent, fontSize: 12, fontWeight: '800' },
  registeredAction: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    marginTop: 10, padding: 11, borderRadius: 8,
    backgroundColor: 'rgba(39,134,91,0.08)',
  },
  registeredActionText: { flex: 1, minWidth: 0 },
  registeredActionTitle: {
    color: COLORS.textDark, fontSize: 12, fontWeight: '800', textTransform: 'capitalize',
  },
  registeredActionMeta: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  registeredActionNote: { color: COLORS.textDark, fontSize: 11, lineHeight: 16, marginTop: 5 },
  reviewForm: { gap: 10, paddingTop: 4 },
  reviewFormTitle: { color: COLORS.textDark, fontSize: 14, fontWeight: '900' },
  decisionOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  decisionTextWrap: { flex: 1 },
  decisionLabel: { color: COLORS.textDark, fontSize: 12, fontWeight: '800' },
  decisionDetail: { color: COLORS.textLight, fontSize: 10, marginTop: 2, lineHeight: 15 },
  criticalWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10,
    padding: 10, backgroundColor: 'rgba(199,70,59,0.09)',
  },
  criticalWarningText: { flex: 1, color: COLORS.danger, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  notesInput: {
    minHeight: 100, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 12, color: COLORS.textDark, fontSize: 13, textAlignVertical: 'top', backgroundColor: COLORS.white,
  },
  formActions: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12 },
  cancelButtonText: { color: COLORS.textLight, fontSize: 12, fontWeight: '800' },
  submitButton: {
    flex: 2, minHeight: 43, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: COLORS.primary, paddingVertical: 12,
  },
  disabledButton: { opacity: 0.45 },
  submitButtonText: { color: COLORS.white, fontSize: 12, fontWeight: '900' },
  contactsSection: { gap: 10, paddingTop: 4 },
  sectionTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '900' },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
  },
  contactInfo: { flex: 1 },
  contactName: { color: COLORS.textDark, fontSize: 12, fontWeight: '800' },
  contactMeta: { color: COLORS.textLight, fontSize: 10, marginTop: 3, textTransform: 'capitalize' },
  callButton: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent,
  },
  closureSection: {
    gap: 12, padding: 15, borderRadius: 8, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border,
  },
  closureHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  closureHeaderText: { flex: 1, minWidth: 0 },
  closureTitle: { color: COLORS.textDark, fontSize: 15, fontWeight: '900' },
  closureHelper: { color: COLORS.textLight, fontSize: 12, lineHeight: 18, marginTop: 3 },
  closureRequirements: { gap: 7 },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  requirementText: { color: COLORS.textLight, fontSize: 12 },
  requirementComplete: { color: COLORS.success },
  closeFollowupButton: {
    minHeight: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    gap: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: COLORS.primary,
  },
  closeFollowupText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
});
