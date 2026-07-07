import React from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { Brand } from '../../constants/theme';
import { AssocAvatar } from '../admin-dashboard/AssocAvatar';
import { RoleBadge } from './RoleBadge';
import { AccountDataCard } from './AccountDataCard';
import { AccessRow } from './AccessRow';
import { PawPatternBackground } from './PawPatternBackground';
import { DecoPaw } from './DecoPaw';

const DESKTOP_BREAKPOINT = 900;
const PETS_ILLUSTRATION = require('../../../assets/images/profile-hero.jpg');

interface Props {
  onOpenMisReportes: () => void;
  onOpenAdminPanel: () => void;
  onOpenAssociationPanel: () => void;
  onOpenStaffPanel: () => void;
  onLogout: () => void;
}

export function LoggedInProfile({
  onOpenMisReportes,
  onOpenAdminPanel,
  onOpenAssociationPanel,
  onOpenStaffPanel,
  onLogout,
}: Props) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  if (!user) return null;

  const esAdmin = !!user.es_admin;
  const esAsociacion = !!user.asociacion_id && user.rol === 'asociacion';
  const esStaff = !!user.asociacion_id && user.rol === 'staff';
  const esReportante = !esAdmin && !esAsociacion && !esStaff;

  const nombreCompleto = `${user.nombre ?? ''} ${user.apellido_paterno ?? ''}`.trim();

  const accountAndAccess = (
    <>
      <View style={styles.section}>
        <AccountDataCard telefono={user.telefono} email={user.email} />
      </View>

      <View style={styles.section}>
        <View style={styles.accessCard}>
          <Text style={styles.accessTitle}>Accesos</Text>

          {esReportante && (
            <AccessRow icon="clipboard-outline" label="Mis Reportes" onPress={onOpenMisReportes} isLast />
          )}
          {esAdmin && (
            <AccessRow
              icon="shield-checkmark-outline"
              label="Panel de administrador"
              onPress={onOpenAdminPanel}
              isLast
            />
          )}
          {esAsociacion && (
            <AccessRow
              icon="business-outline"
              label="Panel de asociación"
              onPress={onOpenAssociationPanel}
              isLast
            />
          )}
          {esStaff && (
            <AccessRow icon="briefcase-outline" label="Panel de staff" onPress={onOpenStaffPanel} isLast />
          )}
        </View>
      </View>

      <TouchableOpacity onPress={onLogout} activeOpacity={0.8} style={styles.logoutButton}>
        <Ionicons name="log-out-outline" size={18} color={Brand.danger} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </>
  );

  // ── DESKTOP: card blanca de siempre, badge de color sólido ────────────
  if (isDesktop) {
    return (
      <View style={styles.screen}>
        <PawPatternBackground />
        <DecoPaw top={90} left={40} size={130} rotate={-20} opacity={0.22} />
        <DecoPaw top={160} right={70} size={90} rotate={16} color="#E0B98C" opacity={0.26} />
        <DecoPaw bottom={80} left={90} size={150} rotate={10} color="#D4A97A" opacity={0.18} />
        <DecoPaw bottom={120} right={50} size={110} rotate={-12} opacity={0.24} />

        <ScrollView contentContainerStyle={styles.desktopScrollContent}>
          <View style={styles.desktopInner}>
            <Text style={styles.pageTitle}>Mi Perfil</Text>
            <View style={styles.desktopRow}>
              <View style={styles.desktopLeft}>
                <View style={styles.whiteCard}>
                  <AssocAvatar nombre={nombreCompleto || 'Usuario'} logoUrl={null} size="lg" />
                  <Text style={styles.nombreOnWhite}>{nombreCompleto || 'Usuario'}</Text>
                  <Text style={styles.emailOnWhite}>{user.email}</Text>
                  {esAdmin && <RoleBadge rol="admin" variant="onWhite" />}
                  {esAsociacion && <RoleBadge rol="asociacion" variant="onWhite" />}
                  {esStaff && <RoleBadge rol="staff" variant="onWhite" />}
                </View>

              </View>
              <View style={styles.desktopRight}>{accountAndAccess}</View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── MÓVIL: banner con degradado, full-bleed ───────────────────────────
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

      <View style={styles.mobileCentered}>{accountAndAccess}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.backgroundWarm, position: 'relative' },

  mobileCentered: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16 },

  desktopScrollContent: { paddingHorizontal: 40, paddingTop: 32, paddingBottom: 40 },
  desktopInner: { width: '100%', maxWidth: 1000, alignSelf: 'center' },
  pageTitle: { fontSize: 30, fontWeight: '900', color: Brand.textDark, marginBottom: 24 },
  desktopRow: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  desktopLeft: { width: 320 },
  desktopRight: { flex: 1 },

  // Card blanca de escritorio (sin degradado)
  whiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  nombreOnWhite: { fontSize: 19, fontWeight: '800', color: Brand.textDark, marginTop: 14, textAlign: 'center' },
  emailOnWhite: { fontSize: 13, color: Brand.textMuted, marginTop: 2, textAlign: 'center' },

  // Banner degradado de móvil
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

  petsSticker: {
    width: '100%',
    height: 130,
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  petsStickerImage: { width: '100%', height: '100%' },
});