import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../constants/api';
import { Toast, useToast } from '../components/Toast';
import { useStaffReports } from '../hooks/useStaffReports';
import { StaffHeader } from '../components/staff-dashboard/StaffHeader';
import { StatsRow, type StatItem } from '../components/staff-dashboard/StatsRow';
import { MapCard } from '../components/staff-dashboard/MapCard';
import { StatusPanel } from '../components/staff-dashboard/StatusPanel';
import { ReportCard } from '../components/staff-dashboard/ReportCard';
import { ReportDetailModal } from '../components/staff-dashboard/ReportDetailModal';
import { EncontreModal } from '../components/staff-dashboard/EncontreModal';
import { RefugioModal } from '../components/staff-dashboard/RefugioModal';
import { VeterinariaModal } from '../components/staff-dashboard/VeterinariaModal';
import { Brand } from '../constants/theme';
import type { AceptarSugerenciaResponse, ReporteStaff, SugerenciaAliado } from '../types/reportestaff';
import { getAnimales, animalMasGrave, totalAnimales } from '../types/reporte';

interface Props {
  onClose?: () => void;
}

// A partir de este ancho se usa el layout de 2 columnas (web/desktop).
// Por debajo, se queda el layout de una sola columna que ya tenían en móvil.
const DESKTOP_BREAKPOINT = 900;
const DESKTOP_MAX_WIDTH = 1200;
const MOBILE_MAX_WIDTH = 800;

export default function StaffDashboardScreen({ onClose }: Props) {
  const { user, token } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const esHogarTemporal = user?.rol === 'voluntario_externo';
  const puedeRegistrarHitos =
    user?.rol === 'voluntario_interno' ||
    user?.rol === 'voluntario_externo' ||
    user?.rol === 'staff';

  const {
    reportesEsperandoConfirmacion,
    confirmarAsignacion,
    rechazarAsignacionVoluntario,
    isConfirmando,
    reportesPendientes,
    reportesEnAccion,
    reportesCompletados,
    isLoading,
    cargarReportesAsignados,
    ubicacionActual,
    obteniendoGPS,
    obtenerUbicacionGPS,
    usarCamara,
    handlePickFoto,
    estadoEncontre,
    setEstadoEncontre,
    notasEncontre,
    setNotasEncontre,
    fotoEncontre,
    setFotoEncontre,
    registrarEncontre,
    resetEncontre,
    OPCIONES_ENCONTRE,
    estadoRefugio,
    setEstadoRefugio,
    notasRefugio,
    setNotasRefugio,
    fotoRefugio,
    setFotoRefugio,
    registrarRefugio,
    resetRefugio,
    OPCIONES_REFUGIO,
    notasVeterinaria,
    setNotasVeterinaria,
    fotoVeterinaria,
    setFotoVeterinaria,
    registrarLlegadaVeterinaria,
    resetVeterinaria,
    isSubmitting,
  } = useStaffReports(showToast);

  // ── UI state: qué está seleccionado / qué modal está abierto ──────────
  const [reporteSeleccionado, setReporteSeleccionado] = useState<ReporteStaff | null>(null);
  const [showDetalles, setShowDetalles] = useState(false);
  const [showEncontreModal, setShowEncontreModal] = useState(false);
  const [showRefugioModal, setShowRefugioModal] = useState(false);
  const [showVeterinariaModal, setShowVeterinariaModal] = useState(false);
  const [sugerenciaAliado, setSugerenciaAliado] = useState<SugerenciaAliado | null>(null);
  const [isAceptandoSugerencia, setIsAceptandoSugerencia] = useState(false);
  const [seguimientoAliado, setSeguimientoAliado] = useState<AceptarSugerenciaResponse | null>(null);

  // ── UI state: confirmar/rechazar una asignación nueva de voluntario ───
  const [reporteAConfirmar, setReporteAConfirmar] = useState<ReporteStaff | null>(null);
  const [showAceptarModal, setShowAceptarModal] = useState(false);
  const [showRechazarModal, setShowRechazarModal] = useState(false);

  useEffect(() => {
    cargarReportesAsignados();
  }, [cargarReportesAsignados]);

  const abrirDetalle = (reporte: ReporteStaff) => {
    setReporteSeleccionado(reporte);
    setShowDetalles(true);
  };

  const abrirEncontre = (reporte: ReporteStaff) => {
    setReporteSeleccionado(reporte);
    setShowDetalles(false);
    setShowEncontreModal(true);
  };

  const abrirRefugio = (reporte: ReporteStaff) => {
    setReporteSeleccionado(reporte);
    setShowDetalles(false);
    setShowRefugioModal(true);
  };

  const abrirVeterinaria = (reporte: ReporteStaff) => {
    setReporteSeleccionado(reporte);
    setShowDetalles(false);
    setShowVeterinariaModal(true);
  };

  const confirmarEncontre = async () => {
    if (!reporteSeleccionado) return;
    const { exito, sugerenciaAliado: sugerencia } = await registrarEncontre(reporteSeleccionado.id);
    if (!exito) return;
    if (sugerencia) {
      setSugerenciaAliado(sugerencia);
      return;
    }
    setShowEncontreModal(false);
    setReporteSeleccionado(null);
  };

  const aceptarSugerenciaAliado = async () => {
    if (!reporteSeleccionado || !sugerenciaAliado) return;
    setIsAceptandoSugerencia(true);
    try {
      const res = await axios.post<AceptarSugerenciaResponse>(
        `${API_URL}/reports/${reporteSeleccionado.id}/hitos/aceptar-sugerencia`,
        { oferta_id: sugerenciaAliado.oferta_id },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // No cierra de inmediato: muestra el seguimiento (contacto + ubicación
      // del aliado) hasta que el staff confirme que ya entendió a dónde llevar el caso.
      setSugerenciaAliado(null);
      setSeguimientoAliado(res.data);
    } catch (error: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: error?.response?.data?.detail || 'No pudimos acercar el caso a la veterinaria.',
      });
    } finally {
      setIsAceptandoSugerencia(false);
    }
  };

  const cerrarSeguimientoAliado = () => {
    setSeguimientoAliado(null);
    setShowEncontreModal(false);
    setReporteSeleccionado(null);
  };

  const descartarSugerenciaAliado = () => {
    setSugerenciaAliado(null);
    setShowEncontreModal(false);
    setReporteSeleccionado(null);
  };

  const cancelarEncontre = () => {
    setShowEncontreModal(false);
    setSugerenciaAliado(null);
    setSeguimientoAliado(null);
    resetEncontre();
    setReporteSeleccionado(null);
  };

  const confirmarRefugio = async () => {
    if (!reporteSeleccionado) return;
    const ok = await registrarRefugio(reporteSeleccionado.id);
    if (ok) {
      setShowRefugioModal(false);
      setReporteSeleccionado(null);
    }
  };

  const cancelarRefugio = () => {
    setShowRefugioModal(false);
    resetRefugio();
    setReporteSeleccionado(null);
  };

  const confirmarVeterinaria = async () => {
    if (!reporteSeleccionado) return;
    const ok = await registrarLlegadaVeterinaria(reporteSeleccionado.id);
    if (ok) {
      setShowVeterinariaModal(false);
      setReporteSeleccionado(null);
    }
  };

  const cancelarVeterinaria = () => {
    setShowVeterinariaModal(false);
    resetVeterinaria();
    setReporteSeleccionado(null);
  };

  const capturarFotoEncontre = async () => {
    const uri = esHogarTemporal ? await usarCamara() : await handlePickFoto();
    if (uri) setFotoEncontre(uri);
  };

  const capturarFotoRefugio = async () => {
    const uri = await usarCamara();
    if (uri) setFotoRefugio(uri);
  };

  const capturarFotoVeterinaria = async () => {
    const uri = await usarCamara();
    if (uri) setFotoVeterinaria(uri);
  };

  // ── Confirmar/rechazar una asignación nueva ("¿Aceptas este caso?") ──
  const abrirAceptar = (reporte: ReporteStaff) => {
    setReporteAConfirmar(reporte);
    setShowAceptarModal(true);
  };

  const abrirRechazar = (reporte: ReporteStaff) => {
    setReporteAConfirmar(reporte);
    setShowRechazarModal(true);
  };

  const confirmarAceptarAsignacion = async () => {
    if (!reporteAConfirmar) return;
    const ok = await confirmarAsignacion(reporteAConfirmar.id);
    if (ok) {
      setShowAceptarModal(false);
      setReporteAConfirmar(null);
    }
  };

  const confirmarRechazarAsignacion = async () => {
    if (!reporteAConfirmar) return;
    const ok = await rechazarAsignacionVoluntario(reporteAConfirmar.id);
    if (ok) {
      setShowRechazarModal(false);
      setReporteAConfirmar(null);
    }
  };

  const abrirMapaReporte = (reporte: ReporteStaff) => {
    if (reporte.latitud && reporte.longitud) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${reporte.latitud},${reporte.longitud}`);
    }
  };

  // ── Stats resumidos ─────────────────────────────────────────────────
  const totalReportes =
    reportesEsperandoConfirmacion.length +
    reportesPendientes.length +
    reportesEnAccion.length +
    reportesCompletados.length;
  const enCaminoCount = reportesEnAccion.filter((r) => r.estado_reporte === 'en_camino').length;

  const stats: StatItem[] = [
    {
      label: 'Casos activos',
      value: reportesEsperandoConfirmacion.length + reportesPendientes.length + reportesEnAccion.length,
      icon: 'pulse',
      color: Brand.primary,
      primary: true,
    },
    { label: 'En camino', value: enCaminoCount, icon: 'navigate', color: Brand.secondary },
    { label: 'Completados', value: reportesCompletados.length, icon: 'checkmark-circle', color: Brand.accent },
  ];

  // Reportes con coordenadas para el mapa y para el resumen de condiciones
  // (pendientes + en acción, no cerrados)
  const reportesActivos = [...reportesPendientes, ...reportesEnAccion];

  // ── Sección "Esperando tu confirmación" — se repite en desktop y móvil ──
  const seccionEsperandoConfirmacion = reportesEsperandoConfirmacion.length > 0 && (
    <View style={[styles.section, styles.sectionSpacing]}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupBar, { backgroundColor: Brand.primary }]} />
        <Text style={styles.groupTitle}>Esperando tu confirmación</Text>
        <View style={[styles.groupCount, { backgroundColor: Brand.primary }]}>
          <Text style={styles.groupCountText}>{reportesEsperandoConfirmacion.length}</Text>
        </View>
      </View>

      {reportesEsperandoConfirmacion.map((reporte) => {
        const animalesR = getAnimales(reporte);
        const grave = animalMasGrave(animalesR);
        const totalCaso = totalAnimales(animalesR);
        return (
        <View key={reporte.id} style={confirmStyles.card}>
          {reporte.foto_url && (
            <Image source={{ uri: reporte.foto_url }} style={confirmStyles.photo} resizeMode="contain" />
          )}
          <View style={confirmStyles.body}>
            <Text style={confirmStyles.title}>{grave?.tipo_animal || 'Animal'}{totalCaso > 1 ? ` · ${totalCaso} animales` : ''}</Text>
            <View style={confirmStyles.metaRow}>
              <Ionicons name="location-outline" size={13} color={Brand.primary} />
              <Text style={confirmStyles.metaText} numberOfLines={1}>
                {[reporte.calle, reporte.colonia, reporte.municipio].filter(Boolean).join(', ') ||
                  'Ubicación no disponible'}
              </Text>
            </View>

            {typeof reporte.distancia_km === 'number' && (
              <View style={confirmStyles.metaRow}>
                <Ionicons name="navigate-outline" size={13} color={Brand.primary} />
                <Text style={confirmStyles.metaText}>{reporte.distancia_km} km de tu ubicación</Text>
              </View>
            )}

            <View style={confirmStyles.chipsRow}>
              {[grave?.condicion, grave?.tamanio, grave?.sexo, grave?.edad_aproximada]
                .filter(Boolean)
                .map((dato, i) => (
                  <View key={i} style={confirmStyles.chip}>
                    <Text style={confirmStyles.chipText}>{dato}</Text>
                  </View>
                ))}
            </View>

            {reporte.latitud && reporte.longitud && (
              <TouchableOpacity onPress={() => abrirMapaReporte(reporte)} style={confirmStyles.mapaBtn}>
                <Ionicons name="map-outline" size={14} color={Brand.accent} />
                <Text style={confirmStyles.mapaBtnText}>Ver ubicación en el mapa</Text>
              </TouchableOpacity>
            )}

            <View style={confirmStyles.actionsRow}>
              <TouchableOpacity onPress={() => abrirRechazar(reporte)} style={confirmStyles.rechazarBtn}>
                <Text style={confirmStyles.rechazarBtnText}>Rechazar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => abrirAceptar(reporte)} style={confirmStyles.aceptarBtn}>
                <Text style={confirmStyles.aceptarBtnText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.centeredContent, { maxWidth: isDesktop ? DESKTOP_MAX_WIDTH : MOBILE_MAX_WIDTH }]}>
        <StaffHeader
          nombre={user?.nombre ?? ''}
          apellidoPaterno={user?.apellido_paterno ?? ''}
          notificacionesCount={0}
        />

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Brand.primary} />
            <Text style={styles.loadingText}>Cargando tus casos...</Text>
          </View>
        ) : totalReportes === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No tienes casos asignados en este momento</Text>
          </View>
        ) : isDesktop ? (
          // ── Layout de escritorio: 2 columnas ──────────────────────────
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.desktopScrollContent}>
            <View style={styles.desktopRow}>
              <View style={styles.leftCol}>
                <StatsRow stats={stats} />

                <View>
                  <Text style={styles.sectionTitle}>Mapa de casos</Text>
                  <MapCard reportes={reportesActivos} onSelectReporte={abrirDetalle} />
                </View>

                <StatusPanel reportes={reportesActivos} />
              </View>

              <View style={styles.rightCol}>
                <View style={styles.rightHeaderRow}>
                  <View>
                    <Text style={styles.rightHeaderTitle}>Reportes asignados</Text>
                  </View>
                  <View style={styles.countBadgeBig}>
                    <Text style={styles.countBadgeBigText}>{reportesActivos.length}</Text>
                  </View>
                </View>

                {seccionEsperandoConfirmacion}

                <ReportesGroup
                  titulo="Pendientes"
                  color={Brand.accent}
                  reportes={reportesPendientes}
                  onOpenDetail={abrirDetalle}
                  onQuickEncontre={abrirEncontre}
                  onQuickRefugio={abrirRefugio}
                  layout="grid"
                  puedeRegistrarHitos={puedeRegistrarHitos}
                  esHogarTemporal={esHogarTemporal}
                />
                <ReportesGroup
                  titulo="En antención"
                  color={Brand.secondary}
                  reportes={reportesEnAccion}
                  onOpenDetail={abrirDetalle}
                  onQuickEncontre={abrirEncontre}
                  onQuickRefugio={abrirRefugio}
                  layout="grid"
                  puedeRegistrarHitos={puedeRegistrarHitos}
                  esHogarTemporal={esHogarTemporal}
                />
                <ReportesGroup
                  titulo="Completados"
                  color={Brand.textFaint}
                  reportes={reportesCompletados}
                  onOpenDetail={abrirDetalle}
                  onQuickEncontre={abrirEncontre}
                  onQuickRefugio={abrirRefugio}
                  layout="grid"
                  esUltimo
                  puedeRegistrarHitos={puedeRegistrarHitos}
                  esHogarTemporal={esHogarTemporal}
                />
              </View>
            </View>
          </ScrollView>
        ) : (
          // ── Layout móvil: 1 columna (igual al que ya tenían) ──────────
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <StatsRow stats={stats} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mapa de casos</Text>
              <MapCard reportes={reportesActivos} onSelectReporte={abrirDetalle} />
            </View>

            {seccionEsperandoConfirmacion}

            <ReportesGroup
              titulo="Pendientes"
              color={Brand.accent}
              reportes={reportesPendientes}
              onOpenDetail={abrirDetalle}
              onQuickEncontre={abrirEncontre}
              onQuickRefugio={abrirRefugio}
              layout="stack"
              puedeRegistrarHitos={puedeRegistrarHitos}
              esHogarTemporal={esHogarTemporal}
            />
            <ReportesGroup
              titulo="En acción"
              color={Brand.secondary}
              reportes={reportesEnAccion}
              onOpenDetail={abrirDetalle}
              onQuickEncontre={abrirEncontre}
              onQuickRefugio={abrirRefugio}
              layout="stack"
              puedeRegistrarHitos={puedeRegistrarHitos}
              esHogarTemporal={esHogarTemporal}
            />
            <ReportesGroup
              titulo="Completados"
              color={Brand.textFaint}
              reportes={reportesCompletados}
              onOpenDetail={abrirDetalle}
              onQuickEncontre={abrirEncontre}
              onQuickRefugio={abrirRefugio}
              layout="stack"
              esUltimo
              puedeRegistrarHitos={puedeRegistrarHitos}
              esHogarTemporal={esHogarTemporal}
            />
          </ScrollView>
        )}
      </View>

      <ReportDetailModal
        visible={showDetalles}
        reporte={reporteSeleccionado}
        onClose={() => setShowDetalles(false)}
        onEncontre={() => reporteSeleccionado && abrirEncontre(reporteSeleccionado)}
        onRefugio={() => reporteSeleccionado && abrirRefugio(reporteSeleccionado)}
        onVeterinaria={() => reporteSeleccionado && abrirVeterinaria(reporteSeleccionado)}
        puedeRegistrarHitos={puedeRegistrarHitos}
        esHogarTemporal={esHogarTemporal}
      />

      <EncontreModal
        visible={showEncontreModal}
        opciones={OPCIONES_ENCONTRE}
        estado={estadoEncontre}
        onSelectEstado={setEstadoEncontre}
        notas={notasEncontre}
        onChangeNotas={setNotasEncontre}
        tieneFoto={!!fotoEncontre}
        onPickFoto={capturarFotoEncontre}
        isSubmitting={isSubmitting}
        onCancel={cancelarEncontre}
        onConfirm={confirmarEncontre}
        sugerenciaAliado={sugerenciaAliado}
        isAceptandoSugerencia={isAceptandoSugerencia}
        onAceptarSugerencia={aceptarSugerenciaAliado}
        onDescartarSugerencia={descartarSugerenciaAliado}
        seguimientoAliado={seguimientoAliado}
        onCerrarSeguimiento={cerrarSeguimientoAliado}
      />

      <RefugioModal
        visible={showRefugioModal}
        opciones={
          esHogarTemporal
            ? ['Animal bajo resguardo en hogar temporal']
            : OPCIONES_REFUGIO
        }
        estado={estadoRefugio}
        onSelectEstado={setEstadoRefugio}
        notas={notasRefugio}
        onChangeNotas={setNotasRefugio}
        ubicacionActual={ubicacionActual}
        obteniendoGPS={obteniendoGPS}
        onCapturarUbicacion={obtenerUbicacionGPS}
        foto={fotoRefugio}
        onCapturarFoto={capturarFotoRefugio}
        isSubmitting={isSubmitting}
        onCancel={cancelarRefugio}
        onConfirm={confirmarRefugio}
        esHogarTemporal={esHogarTemporal}
      />

      <VeterinariaModal
        visible={showVeterinariaModal}
        notas={notasVeterinaria}
        onChangeNotas={setNotasVeterinaria}
        ubicacionActual={ubicacionActual}
        obteniendoGPS={obteniendoGPS}
        onCapturarUbicacion={obtenerUbicacionGPS}
        foto={fotoVeterinaria}
        onCapturarFoto={capturarFotoVeterinaria}
        isSubmitting={isSubmitting}
        onCancel={cancelarVeterinaria}
        onConfirm={confirmarVeterinaria}
      />

      {/* ── Modal: aceptar asignación de voluntario (nuevo) ── */}
      <Modal visible={showAceptarModal} transparent animationType="fade">
        <View style={confirmStyles.modalOverlay}>
          <View style={confirmStyles.modalCard}>
            <Ionicons name="paw" size={36} color={Brand.primary} style={{ marginBottom: 12 }} />
            <Text style={confirmStyles.modalTitle}>¿Aceptas este caso?</Text>
            <Text style={confirmStyles.modalText}>
              Al aceptar, se te marcará como en camino y deberás registrar los hitos de "encontré al
              animal" y "llegué al refugio".
            </Text>
            <View style={confirmStyles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setShowAceptarModal(false);
                  setReporteAConfirmar(null);
                }}
                style={confirmStyles.modalCancelBtn}
              >
                <Text style={confirmStyles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarAceptarAsignacion} style={confirmStyles.modalConfirmBtn}>
                {isConfirmando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={confirmStyles.modalConfirmText}>Sí, acepto</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: rechazar asignación de voluntario (nuevo) ── */}
      <Modal visible={showRechazarModal} transparent animationType="fade">
        <View style={confirmStyles.modalOverlay}>
          <View style={confirmStyles.modalCard}>
            <Ionicons name="close-circle-outline" size={36} color={Brand.danger} style={{ marginBottom: 12 }} />
            <Text style={confirmStyles.modalTitle}>¿Rechazar este caso?</Text>
            <Text style={confirmStyles.modalText}>
              El caso regresará a la asociación para que se lo ofrezca a otro voluntario.
            </Text>
            <View style={confirmStyles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setShowRechazarModal(false);
                  setReporteAConfirmar(null);
                }}
                style={confirmStyles.modalCancelBtn}
              >
                <Text style={confirmStyles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarRechazarAsignacion} style={confirmStyles.modalRejectBtn}>
                {isConfirmando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={confirmStyles.modalConfirmText}>Sí, rechazar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Toast translateY={translateY} toast={toast} />
    </View>
  );
}

// Agrupa una sección de reportes (Pendientes / En acción / Completados) con
// su encabezado de color. `layout="stack"` = una columna (móvil),
// `layout="grid"` = 2 columnas con wrap (desktop).
function ReportesGroup({
  titulo,
  color,
  reportes,
  onOpenDetail,
  onQuickEncontre,
  onQuickRefugio,
  layout,
  esUltimo,
  puedeRegistrarHitos,
  esHogarTemporal,
}: {
  titulo: string;
  color: string;
  reportes: ReporteStaff[];
  onOpenDetail: (r: ReporteStaff) => void;
  onQuickEncontre: (r: ReporteStaff) => void;
  onQuickRefugio: (r: ReporteStaff) => void;
  layout: 'stack' | 'grid';
  esUltimo?: boolean;
  puedeRegistrarHitos: boolean;
  esHogarTemporal: boolean;
}) {
  if (reportes.length === 0) return null;

  return (
    <View style={[styles.section, !esUltimo && styles.sectionSpacing]}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupBar, { backgroundColor: color }]} />
        <Text style={styles.groupTitle}>{titulo}</Text>
        <View style={[styles.groupCount, { backgroundColor: color }]}>
          <Text style={styles.groupCountText}>{reportes.length}</Text>
        </View>
      </View>

      <View style={layout === 'grid' ? styles.gridWrap : undefined}>
        {reportes.map((reporte, index) => (
          <View key={reporte.id} style={layout === 'grid' ? styles.gridItem : undefined}>
            <ReportCard
              reporte={reporte}
              index={index}
              onOpenDetail={onOpenDetail}
              onQuickEncontre={onQuickEncontre}
              onQuickRefugio={onQuickRefugio}
              puedeRegistrarHitos={puedeRegistrarHitos}
              esHogarTemporal={esHogarTemporal}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.backgroundWarm },
  centeredContent: { flex: 1, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, color: Brand.textMuted, fontSize: 14 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Brand.textMuted, textAlign: 'center' },

  // Layout móvil (1 columna)
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 4 },

  // Layout desktop (2 columnas)
  desktopScrollContent: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 },
  desktopRow: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  leftCol: { width: 340, gap: 20 },
  rightCol: { flex: 1, minWidth: 0 },
  rightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  rightHeaderTitle: { fontSize: 20, fontWeight: '900', color: Brand.textDark },
  countBadgeBig: { backgroundColor: Brand.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  countBadgeBigText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  // Compartido
  section: { marginBottom: 20 },
  sectionSpacing: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Brand.textDark, marginBottom: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  groupBar: { width: 4, height: 20, borderRadius: 2 },
  groupTitle: { fontSize: 16, fontWeight: '800', color: Brand.textDark, flex: 1 },
  groupCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  groupCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Grid de 2 columnas para las cards en desktop
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridItem: { width: '48%' },
});

// ── Estilos de la sección/tarjeta nueva "Esperando tu confirmación" ──
const confirmStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Brand.cardWarm,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Brand.primary,
  },
  photo: { width: 90, height: '100%', minHeight: 100 },
  body: { flex: 1, padding: 12, gap: 6 },
  title: { fontSize: 15, fontWeight: '800', color: Brand.textDark },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: Brand.textMuted, flexShrink: 1 },
  mapaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  mapaBtnText: { fontSize: 12, color: Brand.accent, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { backgroundColor: 'rgba(74,55,40,0.06)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  chipText: { fontSize: 10, color: Brand.textDark, textTransform: 'capitalize', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  rechazarBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E74C3C',
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  rechazarBtnText: { color: '#E74C3C', fontWeight: '700', fontSize: 13 },
  aceptarBtn: { flex: 1, backgroundColor: Brand.primary, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  aceptarBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Brand.textDark, textAlign: 'center' },
  modalText: {
    fontSize: 13,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 19,
  },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 18, backgroundColor: '#E5E7EB', alignItems: 'center' },
  modalCancelText: { color: Brand.textMuted, fontWeight: 'bold' },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 18, backgroundColor: Brand.primary, alignItems: 'center' },
  modalRejectBtn: { flex: 1, paddingVertical: 14, borderRadius: 18, backgroundColor: '#E74C3C', alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: 'bold' },
});
