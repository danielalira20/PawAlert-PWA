import React, { useRef, useEffect, useState } from 'react';
import { Animated, View, Text, TouchableOpacity, Image, Platform, Dimensions, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import AdminDashboardScreen from '../../screens/AdminDashboardScreen';
import AssociationStatusScreen from '../../screens/AssociationStatusScreen';
import MisReportesScreen from '../../screens/MisReportesScreen';
import StaffDashboardScreen from '../../screens/StaffDashboardScreen';
import StaffAsignacionScreen from '../../screens/StaffAsignacionScreen';
// Asegúrate de que las rutas a estas pantallas sean correctas según tu proyecto
import MiPostulacionScreen from '../../screens/MiPostulacionScreen'; 
import CapacidadesFormScreen from '../../screens/CapacidadesFormScreen';
import ExternalVolunteerFormScreen from '../../screens/ExternalVolunteerFormScreen';
import { AppModal } from '@/components/AppModal';
import { LoggedOutProfile } from '../../components/profile/LoggedOutProfile';
import { LoggedInProfile } from '../../components/profile/LoggedInProfile';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

export default function ProfileScreen() {
  const { user, isLoggedIn, logout } = useAuth();
  
  const [isAdminVisible, setIsAdminVisible] = useState(false);
  const [isAssociationVisible, setIsAssociationVisible] = useState(false);
  const [isMisReportesVisible, setIsMisReportesVisible] = useState(false);
  const [isStaffVisible, setIsStaffVisible] = useState(false);
  // Panel de asignación de staff (candidatos, modo de asignación,
  // postulaciones, mis voluntarios) — distinto de isStaffVisible, que abre
  // StaffDashboardScreen ("mis casos", compartido con voluntario_interno/externo).
  const [isStaffAsignacionVisible, setIsStaffAsignacionVisible] = useState(false);
  
  // 1. Nuevos estados para los modales del voluntario
  const [isPostulacionVisible, setIsPostulacionVisible] = useState(false);
  const [isCapacidadesVisible, setIsCapacidadesVisible] = useState(false);
  const [isExternalRetryVisible, setIsExternalRetryVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  /// estado para refrescar pantallas 
  const [capacidadesRefreshKey, setCapacidadesRefreshKey] = useState(0);

  
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsMisReportesVisible(false);
      setIsAdminVisible(false);
      setIsAssociationVisible(false);
      setIsStaffVisible(false);
      setIsStaffAsignacionVisible(false);
      // 2. Limpiar estados al cerrar sesión
      setIsPostulacionVisible(false);
      setIsCapacidadesVisible(false);
      setIsExternalRetryVisible(false);
    }
  }, [isLoggedIn]);

  if (!isLoggedIn || !user) {
    return <LoggedOutProfile />;
  }

  const initials = `${user.nombre?.[0] ?? ''}${user.apellido_paterno?.[0] ?? ''}`.toUpperCase();

  
  return (
     <>
      <LoggedInProfile
        onOpenMisReportes={() => setIsMisReportesVisible(true)}
        onOpenAdminPanel={() => setIsAdminVisible(true)}
        onOpenAssociationPanel={() => setIsAssociationVisible(true)}
        onOpenStaffPanel={() => setIsStaffVisible(true)}
        onOpenStaffAsignacion={() => setIsStaffAsignacionVisible(true)}
        // 3. Pasar las funciones de apertura al componente
        onOpenPostulacion={() => setIsPostulacionVisible(true)}
        onOpenCapacidades={() => setIsCapacidadesVisible(true)}
        onLogout={logout}
        capacidadesRefreshKey={capacidadesRefreshKey}
      />
      
      {isMisReportesVisible && (
        <MisReportesScreen onClose={() => setIsMisReportesVisible(false)} />
      )}
      
      <AppModal visible={isAdminVisible} onClose={() => setIsAdminVisible(false)} maxWidth={1100}>
        {isAdminVisible && <AdminDashboardScreen onClose={() => setIsAdminVisible(false)} />}
      </AppModal>
      
      <AppModal visible={isAssociationVisible} onClose={() => setIsAssociationVisible(false)}>
        {isAssociationVisible && (
          <AssociationStatusScreen onClose={() => setIsAssociationVisible(false)} />
        )}
      </AppModal>
      
      <AppModal visible={isStaffVisible} onClose={() => setIsStaffVisible(false)}>
        {isStaffVisible && <StaffDashboardScreen onClose={() => setIsStaffVisible(false)} />}
      </AppModal>

      <AppModal visible={isStaffAsignacionVisible} onClose={() => setIsStaffAsignacionVisible(false)}>
        {isStaffAsignacionVisible && (
          <StaffAsignacionScreen onClose={() => setIsStaffAsignacionVisible(false)} />
        )}
      </AppModal>

      {/* 4. Modales para las pantallas de Voluntario */}
      <AppModal visible={isPostulacionVisible} onClose={() => setIsPostulacionVisible(false)}>
        {isPostulacionVisible && (
          <MiPostulacionScreen
            onClose={() => setIsPostulacionVisible(false)}
            onRetryExternal={() => {
              setIsPostulacionVisible(false);
              setIsExternalRetryVisible(true);
            }}
          />
        )}
      </AppModal>

      <Modal
        visible={isExternalRetryVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsExternalRetryVisible(false)}
      >
        {isExternalRetryVisible && (
          <ExternalVolunteerFormScreen
            modoReintento
            onClose={() => setIsExternalRetryVisible(false)}
          />
        )}
      </Modal>

      <AppModal visible={isCapacidadesVisible} onClose={() => setIsCapacidadesVisible(false)}>
        {isCapacidadesVisible && (
          <CapacidadesFormScreen 
            onClose={() => {
              setIsCapacidadesVisible(false)
              setCapacidadesRefreshKey((k) => k + 1);
            }}
            fromProfile={true} 
          />
        )}
      </AppModal>
    </>
  );
}
