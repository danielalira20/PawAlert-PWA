import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
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
import { Brand } from '../constants/theme';
import type { ReporteStaff } from '../types/reportestaff';

interface Props {
  onClose?: () => void;
}

// A partir de este ancho se usa el layout de 2 columnas (web/desktop).
// Por debajo, se queda el layout de una sola columna que ya tenían en móvil.
const DESKTOP_BREAKPOINT = 900;
const DESKTOP_MAX_WIDTH = 1200;
const MOBILE_MAX_WIDTH = 800;

export default function StaffDashboardScreen({ onClose }: Props) {
  const { user } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const {
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
    isSubmitting,
  } = useStaffReports(showToast);

  // ── UI state: qué está seleccionado / qué modal está abierto ──────────
  const [reporteSeleccionado, setReporteSeleccionado] = useState<ReporteStaff | null>(null);
  const [showDetalles, setShowDetalles] = useState(false);
  const [showEncontreModal, setShowEncontreModal] = useState(false);
  const [showRefugioModal, setShowRefugioModal] = useState(false);

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

  const confirmarEncontre = async () => {
    if (!reporteSeleccionado) return;
    const ok = await registrarEncontre(reporteSeleccionado.id);
    if (ok) {
      setShowEncontreModal(false);
      setReporteSeleccionado(null);
    }
  };

  const cancelarEncontre = () => {
    setShowEncontreModal(false);
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

  const capturarFotoEncontre = async () => {
    const uri = await handlePickFoto();
    if (uri) setFotoEncontre(uri);
  };

  const capturarFotoRefugio = async () => {
    const uri = await usarCamara();
    if (uri) setFotoRefugio(uri);
  };

  // ── Stats resumidos ─────────────────────────────────────────────────
  const totalReportes =
    reportesPendientes.length + reportesEnAccion.length + reportesCompletados.length;
  const enCaminoCount = reportesEnAccion.filter((r) => r.estado_reporte === 'en_camino').length;

  const stats: StatItem[] = [
    {
      label: 'Casos activos',
      value: reportesPendientes.length + reportesEnAccion.length,
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

                <ReportesGroup
                  titulo="Pendientes"
                  color={Brand.accent}
                  reportes={reportesPendientes}
                  onOpenDetail={abrirDetalle}
                  onQuickEncontre={abrirEncontre}
                  onQuickRefugio={abrirRefugio}
                  layout="grid"
                />
                <ReportesGroup
                  titulo="En acción"
                  color={Brand.secondary}
                  reportes={reportesEnAccion}
                  onOpenDetail={abrirDetalle}
                  onQuickEncontre={abrirEncontre}
                  onQuickRefugio={abrirRefugio}
                  layout="grid"
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

            <ReportesGroup
              titulo="Pendientes"
              color={Brand.accent}
              reportes={reportesPendientes}
              onOpenDetail={abrirDetalle}
              onQuickEncontre={abrirEncontre}
              onQuickRefugio={abrirRefugio}
              layout="stack"
            />
            <ReportesGroup
              titulo="En acción"
              color={Brand.secondary}
              reportes={reportesEnAccion}
              onOpenDetail={abrirDetalle}
              onQuickEncontre={abrirEncontre}
              onQuickRefugio={abrirRefugio}
              layout="stack"
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
      />

      <RefugioModal
        visible={showRefugioModal}
        opciones={OPCIONES_REFUGIO}
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
      />

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
}: {
  titulo: string;
  color: string;
  reportes: ReporteStaff[];
  onOpenDetail: (r: ReporteStaff) => void;
  onQuickEncontre: (r: ReporteStaff) => void;
  onQuickRefugio: (r: ReporteStaff) => void;
  layout: 'stack' | 'grid';
  esUltimo?: boolean;
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