import React, { useRef, useEffect, useState } from 'react';
import { Animated, View, Text, TouchableOpacity, Image, Platform, Dimensions, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import AdminDashboardScreen from '../../screens/AdminDashboardScreen';
import AssociationStatusScreen from '../../screens/AssociationStatusScreen';
import MisReportesScreen from '../../screens/MisReportesScreen';
import StaffDashboardScreen from '../../screens/StaffDashboardScreen';
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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // Si la sesión termina (logout manual, o automático porque el refresh_token
  // también expiró), cerramos cualquier modal que haya quedado abierto en vez
  // de dejar el estado "pegado" para la próxima vez que se vuelva a loguear.
  useEffect(() => {
    if (!isLoggedIn) {
      setIsMisReportesVisible(false);
      setIsAdminVisible(false);
      setIsAssociationVisible(false);
      setIsStaffVisible(false);
    }
  }, [isLoggedIn]);

  if (!isLoggedIn || !user) {
    return (
      <LoggedOutProfile />
    );
  }
  const initials = `${user.nombre?.[0] ?? ''}${user.apellido_paterno?.[0] ?? ''}`.toUpperCase();
  return (
     <>
      <LoggedInProfile
        onOpenMisReportes={() => setIsMisReportesVisible(true)}
        onOpenAdminPanel={() => setIsAdminVisible(true)}
        onOpenAssociationPanel={() => setIsAssociationVisible(true)}
        onOpenStaffPanel={() => setIsStaffVisible(true)}
        onLogout={logout}
      />
      {/* Modal: Mis Reportes */}
      <Modal visible={isMisReportesVisible} animationType="slide" transparent onRequestClose={() => setIsMisReportesVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom:40 }}>
          <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>
            {isMisReportesVisible && (
              <MisReportesScreen onClose={() => setIsMisReportesVisible(false)} />
            )}
          </View>
        </View>
      </Modal>
      {/* Modal: Panel de Administrador */}
      <AppModal visible={isAdminVisible} onClose={() => setIsAdminVisible(false)} maxWidth={1100}>
        {isAdminVisible && <AdminDashboardScreen onClose={() => setIsAdminVisible(false)} />}
      </AppModal>
      {/* Modal: Panel de Asociación */}
      <AppModal visible={isAssociationVisible} onClose={() => setIsAssociationVisible(false)}>
        {isAssociationVisible && (
          <AssociationStatusScreen onClose={() => setIsAssociationVisible(false)} />
        )}
      </AppModal>
      {/* Modal: Panel de Staff */}
      <AppModal visible={isStaffVisible} onClose={() => setIsStaffVisible(false)}>
        {isStaffVisible && <StaffDashboardScreen onClose={() => setIsStaffVisible(false)} />}
      </AppModal>
    </>
  );
}