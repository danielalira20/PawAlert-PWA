import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
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
import { GeneralStatsStrip } from './GeneralStatsStrip';
import { ReporterImpactStats } from './ReporterImpactStats';
import { AssociationImpactStats } from './AssociationImpactStats';
import { AdminSupervisionCard } from './AdminSupervisionCard';
import { StaffImpactStats } from './StaffImpactStats';

const DESKTOP_BREAKPOINT = 900;

interface Props {
  onOpenMisReportes: () => void;
  onOpenAdminPanel: () => void;
  onOpenAssociationPanel: () => void;
  onOpenStaffPanel: () => void;
  onOpenPostulacion: () => void; // <-- NUEVA PROP
  onOpenCapacidades: () => void; // <-- NUEVA PROP
  onLogout: () => void;
}

export function LoggedInProfile({
  onOpenMisReportes,
  onOpenAdminPanel,
  onOpenAssociationPanel,
  onOpenStaffPanel,
  onOpenPostulacion, // <-- NUEVA PROP
  onOpenCapacidades, // <-- NUEVA PROP
  onLogout,
}: Props) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  
  const esAdmin = !!user?.es_admin;
  const esAsociacion = !!user?.asociacion_id && user?.rol === 'asociacion';
  const esStaff = !!user?.asociacion_id && user?.rol === 'staff';
  // Validamos si es voluntario interno
  const esVoluntarioInterno = user?.rol === 'voluntario_interno';

  const { impacto, isLoading: isLoadingReportes } = useRecentReports();
  const { impacto: impactoAsociacion, isLoading: isLoadingAsociacion } = useAssociationImpact(esAsociacion);
  const { pendientes, totalPendientes, isLoading: isLoadingAdmin } = useAdminSupervision(esAdmin);
  const { impacto: impactoStaff, isLoading: isLoadingStaff } = useStaffImpact(esStaff);

  if (!user) return null;

  const nombreCompleto = `${user.nombre ?? ''} ${user.apellido_paterno ?? ''}`.trim();

  // Los 4 roles ya tienen su propia versión.
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
  ) : (
    <ReporterImpactStats impacto={impacto} isLoading={isLoadingReportes} />
  );

  const rolBadgeElement = esAdmin ? (
    <RoleBadge rol="admin" variant="onWhite" />
  ) : esAsociacion ? (
    <RoleBadge rol="asociacion" variant="onWhite" />
  ) : esStaff ? (
    <RoleBadge rol="staff" variant="onWhite" />
  ) : null;

  // Actualizamos los accesos agregando los de voluntario
  const accesos = (
    <>
      <AccessRow 
        icon="clipboard-outline" 
        label="Mis Reportes" 
        onPress={onOpenMisReportes} 
        isLast={!esAdmin && !esAsociacion && !esStaff && !esVoluntarioInterno} 
      />
      {esAdmin && (
        <AccessRow icon="shield-checkmark-outline" label="Panel de administrador" onPress={onOpenAdminPanel} isLast />
      )}
      {esAsociacion && (
        <AccessRow icon="business-outline" label="Panel de asociación" onPress={onOpenAssociationPanel} isLast />
      )}
      {esStaff && (
        <AccessRow icon="briefcase-outline" label="Panel de staff" onPress={onOpenStaffPanel} isLast />
      )}
      {esVoluntarioInterno && (
        <>
          <AccessRow icon="document-text-outline" label="Mi postulación" onPress={onOpenPostulacion} />
          <AccessRow icon="construct-outline" label="Termina de completar tu perfil" onPress={onOpenCapacidades} isLast />
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
                    <View style={styles.avatarWrap}>
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
                {impactStatsElement}
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
      </LinearGradient>

      <View style={styles.mobileCentered}>
        <View style={styles.section}>
          <AccountDataCard telefono={user.telefono} email={user.email} />
        </View>

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
          {impactStatsElement}
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