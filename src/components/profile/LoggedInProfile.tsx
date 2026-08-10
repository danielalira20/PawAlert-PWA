import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../constants/api';
import { Brand } from '../../constants/theme';
import { AssocAvatar } from '../admin-dashboard/AssocAvatar';
import { RoleBadge } from './RoleBadge';
import { AccountDataCard } from './AccountDataCard';
import { AccessRow } from './AccessRow';
import { PawPatternBackground } from './PawPatternBackground';
import { useRecentReports } from '../../hooks/useRecentReports';
import { useAssociationImpact } from '../../hooks/useAssociationImpact';
import { useAdminSupervision } from '../../hooks/useAdminSupervision';
import { useStaffImpact } from '../../hooks/useStaffImpact';
import { useAliadoImpact } from '../../hooks/useAliadoImpact';
import { GeneralStatsStrip } from './GeneralStatsStrip';
import { ReporterImpactStats } from './ReporterImpactStats';
import { AssociationImpactStats } from './AssociationImpactStats';
import { AdminSupervisionCard } from './AdminSupervisionCard';
import { StaffImpactStats } from './StaffImpactStats';
import { AliadoImpactStats } from './AliadoImpactStats';
import { OperationalAvailabilityCard } from './OperationalAvailabilityCard';
import { SaldoReputacionCard } from './SaldoReputacionCard';
import { ImpactoInsigniasToggle } from './ImpactoInsigniasToggle';

const DESKTOP_BREAKPOINT = 900;

interface Props {
  onOpenMisReportes: () => void;
  onOpenAdminPanel: () => void;
  onOpenAssociationPanel: () => void;
  onOpenStaffPanel: () => void;
  onOpenVerificaciones: () => void;
  // Abre el panel de ASIGNACIÓN de staff (candidatos, modo de asignación,
  // postulaciones, mis voluntarios) — distinto de onOpenStaffPanel, que
  // abre "mis casos" (StaffDashboardScreen, compartido con voluntarios).
  onOpenStaffAsignacion: () => void;
  onOpenPostulacion: () => void; // <-- NUEVA PROP
  onOpenCapacidades: () => void; // <-- NUEVA PROP
  onOpenAliadoForm: () => void;
  onOpenAliadoDashboard: () => void;
  onOpenCustodyDashboard: () => void;
  onLogout: () => void;
  capacidadesRefreshKey?: number;
}

export function LoggedInProfile({
  onOpenMisReportes,
  onOpenAdminPanel,
  onOpenAssociationPanel,
  onOpenStaffPanel,
  onOpenVerificaciones,
  onOpenStaffAsignacion,
  onOpenPostulacion, // <-- NUEVA PROP
  onOpenCapacidades, // <-- NUEVA PROP
  onOpenAliadoForm,
  onOpenAliadoDashboard,
  onOpenCustodyDashboard,
  onLogout,
  capacidadesRefreshKey,
}: Props) {
  const { user , token } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  
  const esAdmin = !!user?.es_admin;
  const esAsociacion = !!user?.asociacion_id && user?.rol === 'asociacion';
  const esStaff = !!user?.asociacion_id && user?.rol === 'staff';
  const esAliadoLocal = user?.rol === 'aliado_local';
  const esPatrocinadorInstitucional = user?.rol === 'patrocinador_institucional';
  
  // Validamos si es voluntario interno o externo. Ambos pueden ver sus
  // casos asignados en el mismo dashboard (StaffDashboardScreen, migrado a
  // GET /voluntarios/me/reportes) — la pantalla internamente restringe los
  // hitos de campo solo a interno, pero la vista de "mis casos" aplica a
  // los dos por igual.
  const esVoluntarioInterno = user?.rol === 'voluntario_interno';
  const esVoluntarioExterno = user?.rol === 'voluntario_externo';
  const esVoluntarioActivo = esVoluntarioInterno || esVoluntarioExterno;

  // Reputación (Persona 1): solo reportante y voluntario activo participan
  // del sistema de puntos/trust score -- asociación/admin/staff no tienen
  // rol de gamificación (ver reputacion_service.py: ROL_REPORTANTE /
  // ROL_VOLUNTARIO_INTERNO / ROL_VOLUNTARIO_EXTERNO, sin equivalente para
  // esos tres), así que el bloque de saldo no se les muestra.
  const rolParaSaldo = esVoluntarioInterno
    ? 'voluntario_interno'
    : esVoluntarioExterno
      ? 'voluntario_externo'
      : 'reportante';
  const muestraSaldoReputacion = !esAdmin && !esAsociacion && !esStaff;

  const [tieneCapacidades, setTieneCapacidades] = useState<boolean | null>(null);
  const [tienePerfilVoluntario, setTienePerfilVoluntario] = useState<boolean | null>(null);
  const [estadoVoluntario, setEstadoVoluntario] = useState<string | null>(null);

  // FRONT03/BACK04 — perfil_apoyo (donante/aliado/patrocinador) es una
  // identidad independiente del rol principal, así que este chequeo corre
  // para todos los roles salvo asociación: sería inconsistente que quien
  // publica necesidades (porque necesita ayuda) también aparezca como quien
  // dona — son roles opuestos en el mismo intercambio. `tipo` no se guarda
  // aparte: AliadoImpactStats ya lo recibe dentro de `impacto` (GET
  // /red-aliados/me/impacto), no hace falta duplicarlo aquí.
  const [tienePerfilApoyo, setTienePerfilApoyo] = useState<boolean | null>(user?.tiene_perfil_apoyo ?? null);
  // Tipo real de perfil_apoyo (donante_comunitario/aliado_local/patrocinador_institucional)
  // — necesario para el badge principal de una cuenta sin rol_id (ver esAliadoPuro).
  const [tipoPerfilApoyo, setTipoPerfilApoyo] = useState<string | null>(user?.tipo_perfil_apoyo ?? null);

  useFocusEffect(
    useCallback(() => {
      if (!token || esAsociacion) {
        setTienePerfilApoyo(null);
        setTipoPerfilApoyo(null);
        return;
      }
      let cancelado = false;
      (async () => {
        try {
          const res = await axios.get(`${API_URL}/red-aliados/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelado) {
            setTienePerfilApoyo(!!res.data?.tiene_perfil_apoyo);
            setTipoPerfilApoyo(res.data?.tipo ?? null);
          }
        } catch {
          if (!cancelado) {
            setTienePerfilApoyo(null);
            setTipoPerfilApoyo(null);
          }
        }
      })();
      return () => {
        cancelado = true;
      };
    }, [token, esAsociacion])
  );

  const { impacto: impactoAliado, isLoading: isLoadingAliado } = useAliadoImpact(tienePerfilApoyo === true);

useFocusEffect(
  useCallback(() => {
    if (!token || esAdmin || esAsociacion || esStaff) {
      setTienePerfilVoluntario(null);
      setEstadoVoluntario(null);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/voluntarios/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelado) {
          setTienePerfilVoluntario(!!res.data?.tiene_perfil_voluntario);
          setEstadoVoluntario(res.data?.estado || null);
          setTieneCapacidades(!!res.data?.tiene_capacidades);
        }
      } catch {
        if (!cancelado) {
          setTienePerfilVoluntario(null);
          setEstadoVoluntario(null);
          setTieneCapacidades(null);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token, esAdmin, esAsociacion, esStaff, capacidadesRefreshKey])
);

  const { impacto, isLoading: isLoadingReportes } = useRecentReports();
  const { impacto: impactoAsociacion, isLoading: isLoadingAsociacion } = useAssociationImpact(esAsociacion);
  const { pendientes, totalPendientes, isLoading: isLoadingAdmin } = useAdminSupervision(esAdmin);
  const { impacto: impactoStaff, isLoading: isLoadingStaff } = useStaffImpact(esStaff);

  if (!user) return null;

  const nombreCompleto = `${user.nombre ?? ''} ${user.apellido_paterno ?? ''}`.trim();

  // Camino B: cuenta sin ningún rol de rescate (rol_id NULL de verdad — ver
  // auth.py/users.py) cuyo perfil_apoyo es su única identidad. Excluye
  // explícitamente donante_comunitario: por diseño esa cuenta SIEMPRE nace
  // sobre un rol_id existente (Camino A), así que nunca debería tener
  // user.rol vacío — pero si por algún motivo llegara a pasar, un
  // donante_comunitario conserva su badge de rol original, nunca lo
  // reemplaza (safeguard explícito, no una suposición).
  const esAliadoPuro =
    !esAdmin && !esAsociacion && !esStaff && !esVoluntarioActivo &&
    !user?.rol && tienePerfilApoyo === true &&
    (tipoPerfilApoyo === 'aliado_local' || tipoPerfilApoyo === 'patrocinador_institucional');

  // Los 4 roles ya tienen su propia versión.
  // NOTA: esVoluntarioActivo aún no tiene su propia tarjeta de impacto —
  // por ahora cae al default (ReporterImpactStats). Pendiente crear una
  // tarjeta específica de impacto de voluntario más adelante.
  const impactStatsElement = esAsociacion ? (
    <AssociationImpactStats impacto={impactoAsociacion} isLoading={isLoadingAsociacion} />
  ) : esAdmin ? (
    <AdminSupervisionCard
      pendientes={pendientes}
      totalPendientes={totalPendientes}
      isLoading={isLoadingAdmin}
      onOpenAdminPanel={onOpenAdminPanel}
    />
  ) : esStaff ? (
    <StaffImpactStats impacto={impactoStaff} isLoading={isLoadingStaff} />
  ) : esVoluntarioExterno ? (
    <ReporterImpactStats impacto={impacto} isLoading={isLoadingReportes} />
  ) : (
    <ImpactoInsigniasToggle
      impactoElement={<ReporterImpactStats impacto={impacto} isLoading={isLoadingReportes} />}
      rol={user?.rol}
    />
  );

  // Segundo bloque INDEPENDIENTE del ternario de arriba — se muestra ADEMÁS
  // del bloque del rol principal (FRONT03), excepto para esAliadoPuro: ahí
  // los sitios de render (desktop/móvil) deciden mostrar solo este bloque,
  // en vez de impactStatsElement + este. El elemento en sí no cambia.
  const aliadoImpactElement = tienePerfilApoyo ? (
    <AliadoImpactStats impacto={impactoAliado} isLoading={isLoadingAliado} resumen />
  ) : null;

  const puedeVerPostulacion = esVoluntarioActivo || tienePerfilVoluntario === true;
  const avisoPostulacion =
    estadoVoluntario === 'rechazado'
      ? 'Tu postulación ya fue revisada. Consulta el resultado y el motivo indicado por la asociación.'
      : estadoVoluntario === 'postulacion_pendiente'
        ? 'Tu postulación está en revisión. Aquí podrás consultar cualquier cambio.'
        : null;

  const rolBadgeElement = esAdmin ? (
  <RoleBadge rol="admin" variant="onWhite" />
) : esAsociacion ? (
  <RoleBadge rol="asociacion" variant="onWhite" />
) : esStaff ? (
  <RoleBadge rol="staff" variant="onWhite" />
) : esVoluntarioInterno ? (
  <RoleBadge rol="voluntario_interno" variant="onWhite" />
) : esVoluntarioExterno ? (
  <RoleBadge rol="voluntario_externo" variant="onWhite" />
) : esAliadoLocal ? (
  <RoleBadge rol="aliado_local" variant="onWhite" />
) : esPatrocinadorInstitucional ? (
  <RoleBadge rol="patrocinador_institucional" variant="onWhite" />
) : esAliadoPuro ? (
  <RoleBadge rol={tipoPerfilApoyo as 'aliado_local' | 'patrocinador_institucional'} variant="onWhite" />
) : (
  <RoleBadge rol="reportante" variant="onWhite" />
);

  // Actualizamos los accesos agregando los de voluntario
  const accesos = (
    <>
      <AccessRow 
        icon="clipboard-outline" 
        label="Mis Reportes" 
        onPress={onOpenMisReportes} 
        isLast={!esAdmin && !esAsociacion && !esStaff && !puedeVerPostulacion && (user?.tiene_perfil_apoyo === true)}
      />
      {user && !user.tiene_perfil_apoyo && !esAsociacion && (
        <AccessRow
          icon="star-outline"
          label="Quiero ser parte de la Red de Aliados"
          onPress={onOpenAliadoForm}
          isLast={!esAdmin && !esAsociacion && !esStaff && !puedeVerPostulacion}
        />
      )}
      {tienePerfilApoyo === true && (
        <AccessRow
          icon="grid-outline"
          label="Mis donaciones"
          onPress={onOpenAliadoDashboard}
          isLast={!esAdmin && !esAsociacion && !esStaff && !puedeVerPostulacion}
        />
      )}
      {esAdmin && (
        <AccessRow icon="shield-checkmark-outline" label="Panel de administrador" onPress={onOpenAdminPanel} isLast />
      )}
      {esAsociacion && (
        <>
          <AccessRow icon="business-outline" label="Panel de asociación" onPress={onOpenAssociationPanel} />
          <AccessRow icon="pulse-outline" label="Seguimiento regional" onPress={onOpenCustodyDashboard} isLast />
        </>
      )}
      {esStaff && (
        <>
          <AccessRow icon="briefcase-outline" label="Panel de staff" onPress={onOpenAssociationPanel} />
          <AccessRow icon="list-outline" label="Mis casos" onPress={onOpenStaffPanel} />
          <AccessRow icon="pulse-outline" label="Seguimiento regional" onPress={onOpenCustodyDashboard} isLast />
        </>
      )}
      {esVoluntarioActivo && (
        <AccessRow icon="briefcase-outline" label="Mis casos" onPress={onOpenStaffPanel} />
      )}
      {esVoluntarioExterno && (
        <AccessRow icon="heart-circle-outline" label="Mis custodias temporales" onPress={onOpenCustodyDashboard} />
      )}
      {esVoluntarioInterno && (
        <AccessRow
          icon="home-outline"
          label="Mis verificaciones"
          onPress={onOpenVerificaciones}
        />
      )}
      {puedeVerPostulacion && (
        <>
          <AccessRow
            icon={estadoVoluntario === 'rechazado' ? 'alert-circle-outline' : 'document-text-outline'}
            label="Mi postulación"
            onPress={onOpenPostulacion}
            isLast={!esVoluntarioActivo || tieneCapacidades !== false}
          />
          {!!avisoPostulacion && (
            <Text
              style={[
                styles.postulacionBanner,
                estadoVoluntario === 'rechazado' && styles.postulacionBannerRejected,
              ]}
            >
              {avisoPostulacion}
            </Text>
          )}
        </>
      )}
      {esVoluntarioActivo && (
        <>
          {tieneCapacidades === false && (
            <>
              <AccessRow
                icon="home-outline"
                label="Mi Casa Temporal"
                onPress={onOpenCapacidades}
                isLast
                locked
              />
              <Text style={styles.capacidadesBanner}>
                Se completa y verifica como parte de tu postulación a una asociación.
              </Text>
            </>
          )}
        </>
      )}
    </>
  );

  // ── DESKTOP: sidebar + impacto (en fila), estadísticas generales debajo
  //    de TODO, a lo ancho completo de la página ─────────────────────────
  if (isDesktop) {
    return (
      <View style={styles.screen}>
        <PawPatternBackground />

        <ScrollView contentContainerStyle={styles.desktopScrollContent}>
          <View style={styles.desktopInner}>

            {/* Encabezado de página */}
            <View style={styles.pageHeader}>
              <LinearGradient
                colors={[Brand.primary, Brand.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.pageHeaderIcon}
              >
                <Ionicons name="paw" size={20} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={styles.pageTitle}>Mi Perfil</Text>
                <Text style={styles.pageSubtitle}>PawAlert · Gestión de cuenta</Text>
              </View>
            </View>

            {/* Fila de 2 columnas: sidebar + tu impacto */}
            <View style={styles.desktopRow}>
              <View style={styles.desktopLeft}>
                <View style={styles.unifiedCard}>
                  <View style={styles.avatarSection}>
                    <View style={[styles.avatarWrap, esVoluntarioExterno && styles.avatarWrapVoluntarioExterno]}>
                      <AssocAvatar nombre={nombreCompleto || 'Usuario'} logoUrl={null} size="lg" />
                      {rolBadgeElement && (
                        <View style={styles.badgeFloating}>
                          {React.cloneElement(rolBadgeElement, { style: styles.badgeFloatingInner })}
                        </View>
                      )}
                    </View>
                    <Text style={styles.nombreOnWhite}>{nombreCompleto || 'Usuario'}</Text>
                    <Text style={styles.emailOnWhite}>{user.email}</Text>
                  </View>

                  {muestraSaldoReputacion && (
                    <View style={styles.sectionPadding}>
                      <SaldoReputacionCard rol={rolParaSaldo} />
                    </View>
                  )}

                  <View style={styles.divider} />

                  <View style={styles.sectionPadding}>
                    <AccountDataCard telefono={user.telefono} email={user.email} bare />
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.sectionPadding}>
                    <Text style={styles.accessTitle}>Accesos</Text>
                    {accesos}
                  </View>
                </View>

                <TouchableOpacity onPress={onLogout} activeOpacity={0.8} style={styles.logoutButton}>
                  <Ionicons name="log-out-outline" size={18} color={Brand.danger} />
                  <Text style={styles.logoutText}>Cerrar sesión</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.desktopRight}>
                {esVoluntarioActivo && token && (
                  <OperationalAvailabilityCard token={token} />
                )}
                {esAliadoPuro ? aliadoImpactElement : (
                  <>
                    {impactStatsElement}
                    {aliadoImpactElement}
                  </>
                )}
              </View>
            </View>

            {/* Estadísticas generales — FUERA de desktopRow a propósito, para
                que su contenedor padre sea desktopInner (ancho completo de
                1100px) y no desktopRight (más angosto por el sidebar). */}
            <GeneralStatsStrip />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── MÓVIL: sin cambios estructurales ────────────────────────────────
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <LinearGradient
        colors={[Brand.primary, Brand.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.mobileBanner}
      >
        <View style={styles.avatarRing}>
          <AssocAvatar nombre={nombreCompleto || 'Usuario'} logoUrl={null} size="lg" />
        </View>
        <Text style={styles.nombreOnColor}>{nombreCompleto || 'Usuario'}</Text>
        <Text style={styles.emailOnColor}>{user.email}</Text>
        {esAdmin && <RoleBadge rol="admin" variant="onColor" />}
        {esAsociacion && <RoleBadge rol="asociacion" variant="onColor" />}
        {esStaff && <RoleBadge rol="staff" variant="onColor" />}
        {esVoluntarioInterno && <RoleBadge rol="voluntario_interno" variant="onColor" />}
        {esVoluntarioExterno && <RoleBadge rol="voluntario_externo" variant="onColor" />}
        {esAliadoPuro && (
          <RoleBadge rol={tipoPerfilApoyo as 'aliado_local' | 'patrocinador_institucional'} variant="onColor" />
        )}
        {!esAdmin && !esAsociacion && !esStaff && !esVoluntarioInterno && !esVoluntarioExterno && !esAliadoPuro && (
          <RoleBadge rol="reportante" variant="onColor" />
        )}
      </LinearGradient>

      <View style={styles.mobileCentered}>
        {muestraSaldoReputacion && (
          <View style={styles.section}>
            <SaldoReputacionCard rol={rolParaSaldo} />
          </View>
        )}

        <View style={styles.section}>
          <AccountDataCard telefono={user.telefono} email={user.email} />
        </View>

        {esVoluntarioActivo && token && (
          <OperationalAvailabilityCard token={token} />
        )}

        <View style={styles.section}>
          <View style={styles.accessCard}>
            <Text style={styles.accessTitle}>Accesos</Text>
            {accesos}
          </View>
        </View>

        <TouchableOpacity onPress={onLogout} activeOpacity={0.8} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color={Brand.danger} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        {/* Estadísticas — a propósito AL FINAL, debajo de Cerrar sesión, para
            no desplazar la estructura móvil que ya funcionaba bien */}
        <View style={{ marginTop: 24 }}>
          {esAliadoPuro ? aliadoImpactElement : (
            <>
              {impactStatsElement}
              {aliadoImpactElement}
            </>
          )}
        </View>
        <GeneralStatsStrip />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.backgroundWarm, position: 'relative' },

  mobileCentered: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16 },
  mobileBanner: {
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 26,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: Brand.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 4,
  },
  avatarRing: { padding: 4, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.9)' },
  nombreOnColor: { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 14, textAlign: 'center' },
  emailOnColor: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2, textAlign: 'center' },
  section: { marginBottom: 16, marginTop: 16 },
  accessCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  desktopScrollContent: { paddingHorizontal: 40, paddingTop: 32, paddingBottom: 40 },
  desktopInner: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  pageHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  pageTitle: { fontSize: 26, fontWeight: '900', color: Brand.textDark, lineHeight: 30 },
  pageSubtitle: { fontSize: 12, fontWeight: '700', color: '#B0966E', marginTop: 2 },

  desktopRow: { flexDirection: 'row', gap: 24, alignItems: 'flex-start', marginBottom: 20 },
  desktopLeft: { width: 320, gap: 12 },
  desktopRight: { flex: 1, minWidth: 0 },

  unifiedCard: {
    backgroundColor: Brand.cardWarm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,42,38,0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  avatarSection: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  avatarWrap: { position: 'relative', marginBottom: 20 },
  avatarWrapVoluntarioExterno: { marginBottom: 34 },
  badgeFloating: {
    position: 'absolute',
    bottom: -10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  badgeFloatingInner: { marginTop: 0, borderWidth: 2, borderColor: '#fff' },
  nombreOnWhite: { fontSize: 15, fontWeight: '800', color: Brand.textDark, textAlign: 'center' },
  emailOnWhite: { fontSize: 13, color: Brand.textFaint, marginTop: 4, textAlign: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(46,42,38,0.08)', marginHorizontal: 20 },
  sectionPadding: { paddingHorizontal: 20, paddingVertical: 20 },

  capacidadesBanner: {
    fontSize: 12,
    color: Brand.textFaint,
    marginTop: 8,
    lineHeight: 17,
  },
  postulacionBanner: {
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(102,188,180,0.12)',
    color: Brand.textDark,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  postulacionBannerRejected: {
    backgroundColor: 'rgba(217,64,37,0.09)',
    color: Brand.danger,
  },
  accessTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Brand.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(217,64,37,0.08)',
    borderRadius: 20,
    paddingVertical: 15,
  },
  logoutText: { color: Brand.danger, fontWeight: '800', fontSize: 14 },
});
