import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '../../constants/api';
import { Brand } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { WithdrawalFollowupForm } from '../association-dashboard/WithdrawalFollowupForm';
import { AppModal } from '../AppModal';
import { Toast, useToast } from '../Toast';

interface ResultadoSeguimiento {
  id: string;
  animal_id: string;
  estado: string;
  cantidad_reportada: number;
  puede_esperar_seguro: boolean;
  riesgo_vial: boolean;
  riesgo_sanitario: boolean;
  identificacion_observada?: string | null;
  comentario?: string | null;
  motivo_retiro_seguridad?: string | null;
  reportado_at: string;
  revisado_at?: string | null;
}

interface AnimalSeguimiento {
  id: string;
  tipo_animal?: string | null;
  condicion?: string | null;
  tamanio?: string | null;
}

interface SeguimientoResumen {
  id: string;
  reporte_id: string;
  estado: string;
  iniciado_at: string;
  reporte?: {
    municipio?: string | null;
    colonia?: string | null;
  } | null;
  resultados: ResultadoSeguimiento[];
}

interface ContactoRetiro {
  id: string;
  nombre_servicio: string;
  telefono: string;
  tipo_servicio: string;
  horario?: string | null;
}

interface AccionRetiroRegistrada {
  id: string;
  resultado_rescate_animal_id: string;
  tipo_actor: string;
  accion: string;
  folio?: string | null;
  nombre_servicio?: string | null;
  nota?: string | null;
  registrado_at: string;
}

interface DetalleSeguimiento {
  seguimiento: SeguimientoResumen;
  reporte: {
    id: string;
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
  refreshKey?: number;
}

const ACCIONES_RETIRO_LABEL: Record<string, string> = {
  contacto_oficial_realizado: 'Contacto oficial realizado',
  autoridad_se_presento: 'La autoridad se presentó',
  tercero_responsable_se_hizo_cargo: 'Un responsable se hizo cargo',
  retiro_gestionado_con_indicaciones: 'Retiro gestionado con indicaciones',
  sin_comunicacion: 'Sin comunicación',
  sin_contacto_disponible: 'Sin contacto disponible',
  retiro_por_seguridad: 'Retiro por seguridad',
};

function ubicacionTexto(...partes: (string | null | undefined)[]): string {
  return partes.filter(Boolean).join(', ') || 'Ubicación no especificada';
}

function mensajeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return 'Intenta actualizar el seguimiento.';
}

export function VolunteerDeceasedFollowupPanel({ refreshKey = 0 }: Props) {
  const { token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [seguimientos, setSeguimientos] = useState<SeguimientoResumen[]>([]);
  const [detalle, setDetalle] = useState<DetalleSeguimiento | null>(null);
  const [visible, setVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState(false);
  const [resultadoGestion, setResultadoGestion] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const cargarSeguimientos = useCallback(async (mostrarError = false) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await axios.get<SeguimientoResumen[]>(
        `${API_URL}/voluntarios/me/seguimientos-fallecimiento`,
        { headers },
      );
      setSeguimientos(response.data || []);
    } catch (error) {
      if (mostrarError) {
        showToast({
          type: 'error',
          title: 'No pudimos cargar los seguimientos',
          message: mensajeError(error),
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [headers, showToast, token]);

  const cargarDetalle = useCallback(async (reporteId: string) => {
    setIsLoadingDetalle(true);
    setResultadoGestion(null);
    try {
      const response = await axios.get<DetalleSeguimiento>(
        `${API_URL}/voluntarios/me/seguimientos-fallecimiento/${reporteId}`,
        { headers },
      );
      setDetalle(response.data);
    } catch (error) {
      showToast({
        type: 'error',
        title: 'No pudimos abrir el seguimiento',
        message: mensajeError(error),
      });
    } finally {
      setIsLoadingDetalle(false);
    }
  }, [headers, showToast]);

  useEffect(() => {
    void cargarSeguimientos(false);
  }, [cargarSeguimientos, refreshKey]);

  if (seguimientos.length === 0) return null;

  const cerrar = () => {
    if (isSubmitting) return;
    setVisible(false);
    setDetalle(null);
    setResultadoGestion(null);
  };

  return (
    <View style={styles.wrapper}>
      <Toast toast={toast} translateY={translateY} />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Abrir seguimientos de retiro"
        onPress={() => setVisible(true)}
        style={styles.banner}
      >
        <View style={styles.bannerIcon}>
          {isLoading
            ? <ActivityIndicator size="small" color={Brand.primary} />
            : <Ionicons name="heart-outline" size={21} color={Brand.primary} />}
        </View>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>Seguimientos de retiro</Text>
          <Text style={styles.bannerDetail}>
            {seguimientos.length === 1
              ? 'Tienes 1 caso que todavía requiere seguimiento.'
              : `Tienes ${seguimientos.length} casos que todavía requieren seguimiento.`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Brand.textMuted} />
      </TouchableOpacity>

      <AppModal
        visible={visible}
        onClose={cerrar}
        dismissable={!isSubmitting}
        maxWidth={760}
      >
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            {detalle && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Volver a seguimientos"
                onPress={() => {
                  if (!isSubmitting) {
                    setDetalle(null);
                    setResultadoGestion(null);
                  }
                }}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={20} color={Brand.textDark} />
              </TouchableOpacity>
            )}
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>
                {detalle ? 'Seguimiento del retiro' : 'Seguimientos de retiro'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {detalle
                  ? ubicacionTexto(
                    detalle.reporte.calle,
                    detalle.reporte.colonia,
                    detalle.reporte.municipio,
                  )
                  : 'Estos casos permanecen abiertos hasta confirmar una solución.'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Actualizar seguimientos"
              onPress={() => void cargarSeguimientos(true)}
              disabled={isLoading}
              style={styles.refreshButton}
            >
              <Ionicons name="refresh" size={18} color={Brand.primary} />
            </TouchableOpacity>
          </View>

          {isLoadingDetalle ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Brand.primary} />
              <Text style={styles.helperText}>Abriendo seguimiento...</Text>
            </View>
          ) : detalle ? (
            <>
              <View style={styles.privacyNotice}>
                <Ionicons name="lock-closed-outline" size={18} color={Brand.textDark} />
                <Text style={styles.privacyText}>
                  La evidencia sensible permanece bajo revisión de la asociación y administración.
                </Text>
              </View>

              {detalle.resultados.map((resultado) => {
                const animal = detalle.reporte.animales.find(
                  (item) => item.id === resultado.animal_id,
                );
                const acciones = detalle.acciones_retiro.filter(
                  (accion) => accion.resultado_rescate_animal_id === resultado.id,
                );
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
                          {[animal?.condicion, animal?.tamanio]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>Seguimiento abierto</Text>
                      </View>
                    </View>

                    {(resultado.riesgo_vial
                      || resultado.riesgo_sanitario
                      || !resultado.puede_esperar_seguro) && (
                      <View style={styles.risks}>
                        {resultado.riesgo_vial && <RiskChip label="Riesgo vial" />}
                        {resultado.riesgo_sanitario && <RiskChip label="Riesgo sanitario" />}
                        {!resultado.puede_esperar_seguro && (
                          <RiskChip label="No era seguro esperar" />
                        )}
                      </View>
                    )}

                    {resultado.comentario && (
                      <Text style={styles.observation}>{resultado.comentario}</Text>
                    )}

                    {resultadoGestion !== resultado.id ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Registrar una gestión de retiro"
                        onPress={() => setResultadoGestion(resultado.id)}
                        style={styles.followupButton}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.followupButtonText}>Registrar avance</Text>
                      </TouchableOpacity>
                    ) : (
                      <WithdrawalFollowupForm
                        reporteId={detalle.reporte.id}
                        resultadoId={resultado.id}
                        onSubmittingChange={setIsSubmitting}
                        onCancel={() => setResultadoGestion(null)}
                        onSaved={async () => {
                          setResultadoGestion(null);
                          await cargarDetalle(detalle.reporte.id);
                          await cargarSeguimientos(false);
                          showToast({
                            type: 'success',
                            title: 'Avance registrado',
                            message: 'La asociación ya puede consultar esta gestión.',
                          });
                        }}
                      />
                    )}

                    {acciones.map((accion) => (
                      <View key={accion.id} style={styles.historyRow}>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={17}
                          color={Brand.secondary}
                        />
                        <View style={styles.historyText}>
                          <Text style={styles.historyTitle}>
                            {ACCIONES_RETIRO_LABEL[accion.accion]
                              || 'Gestión registrada'}
                          </Text>
                          <Text style={styles.historyMeta}>
                            {[accion.nombre_servicio, accion.folio]
                              .filter(Boolean)
                              .join(' · ') || `Registrado por ${accion.tipo_actor}`}
                          </Text>
                          {accion.nota && (
                            <Text style={styles.historyNote}>{accion.nota}</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}

              {detalle.contactos_retiro.length > 0 && (
                <View style={styles.contacts}>
                  <Text style={styles.sectionTitle}>Contactos verificados de la zona</Text>
                  {detalle.contactos_retiro.map((contacto) => (
                    <View key={contacto.id} style={styles.contactRow}>
                      <View style={styles.contactText}>
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
                        <Ionicons name="call-outline" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.list}>
              {seguimientos.map((seguimiento) => (
                <TouchableOpacity
                  key={seguimiento.id}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir seguimiento de retiro"
                  onPress={() => void cargarDetalle(seguimiento.reporte_id)}
                  style={styles.followupCard}
                >
                  <View style={styles.cardIcon}>
                    <Ionicons name="time-outline" size={20} color={Brand.primary} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>Seguimiento en curso</Text>
                    <Text style={styles.cardLocation}>
                      {ubicacionTexto(
                        seguimiento.reporte?.colonia,
                        seguimiento.reporte?.municipio,
                      )}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Brand.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </AppModal>
    </View>
  );
}

function RiskChip({ label }: { label: string }) {
  return (
    <View style={styles.riskChip}>
      <Ionicons name="warning-outline" size={13} color={Brand.danger} />
      <Text style={styles.riskText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: 16, marginTop: 12 },
  banner: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#FFF8F1',
    borderWidth: 1,
    borderColor: '#E8DCCA',
    borderRadius: 8,
  },
  bannerIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(236,128,43,0.12)',
  },
  bannerText: { flex: 1, minWidth: 0 },
  bannerTitle: { color: Brand.textDark, fontSize: 15, fontWeight: '900' },
  bannerDetail: { color: Brand.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  modalContent: { padding: 22, paddingTop: 26, paddingBottom: 44, gap: 14 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 38 },
  backButton: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, backgroundColor: '#F5EAD8',
  },
  modalTitleWrap: { flex: 1, minWidth: 0 },
  modalTitle: { color: Brand.textDark, fontSize: 20, fontWeight: '900' },
  modalSubtitle: { color: Brand.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  refreshButton: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, backgroundColor: '#FFF8F1', borderWidth: 1, borderColor: '#E8DCCA',
  },
  centerState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  helperText: { color: Brand.textMuted, fontSize: 13 },
  privacyNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12,
    borderRadius: 8, backgroundColor: '#F5EAD8',
  },
  privacyText: { flex: 1, color: Brand.textDark, fontSize: 12, lineHeight: 18 },
  list: { gap: 10 },
  followupCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8DCCA',
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(236,128,43,0.12)',
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { color: Brand.textDark, fontSize: 14, fontWeight: '800' },
  cardLocation: { color: Brand.textMuted, fontSize: 12, marginTop: 3 },
  resultCard: {
    gap: 12, padding: 15, borderRadius: 8, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E8DCCA',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  resultTitleWrap: { flex: 1, minWidth: 0 },
  resultTitle: { color: Brand.textDark, fontSize: 16, fontWeight: '900', textTransform: 'capitalize' },
  resultMeta: { color: Brand.textMuted, fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: Brand.secondary,
  },
  statusText: { color: Brand.secondary, fontSize: 10, fontWeight: '800' },
  risks: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  riskChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8,
    paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(217,64,37,0.09)',
  },
  riskText: { color: Brand.danger, fontSize: 10, fontWeight: '700' },
  observation: { color: Brand.textDark, fontSize: 13, lineHeight: 19 },
  followupButton: {
    minHeight: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    gap: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: Brand.primary,
  },
  followupButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  historyRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#E8DCCA',
  },
  historyText: { flex: 1, minWidth: 0 },
  historyTitle: { color: Brand.textDark, fontSize: 12, fontWeight: '800' },
  historyMeta: { color: Brand.textMuted, fontSize: 11, marginTop: 2 },
  historyNote: { color: Brand.textDark, fontSize: 11, lineHeight: 16, marginTop: 4 },
  contacts: { gap: 8 },
  sectionTitle: { color: Brand.textDark, fontSize: 15, fontWeight: '900' },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8DCCA',
  },
  contactText: { flex: 1, minWidth: 0 },
  contactName: { color: Brand.textDark, fontSize: 13, fontWeight: '800' },
  contactMeta: { color: Brand.textMuted, fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  callButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, backgroundColor: Brand.secondary,
  },
});
