import React, { useRef, useEffect, useState } from 'react';
import { Animated, View, Text, TouchableOpacity, Image, Platform, Dimensions, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import AdminDashboardScreen from '../../screens/AdminDashboardScreen';
import AssociationStatusScreen from '../../screens/AssociationStatusScreen';
import MisReportesScreen from '../../screens/MisReportesScreen';
import StaffDashboardScreen from '../../screens/StaffDashboardScreen';

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

  if (!isLoggedIn || !user) {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: '#F8FAFC', opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={{ backgroundColor: '#0F172A', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="person-outline" size={32} color="rgba(255,255,255,0.6)" />
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>Mi perfil</Text>
          <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '500', marginTop: 4 }}>Inicia sesión para acceder a tu cuenta</Text>
        </View>

        <View style={{ padding: 24, gap: 12 }}>
          <TouchableOpacity
            onPress={() => router.push('/login')}
            style={{
              backgroundColor: '#1F77B4',
              paddingVertical: 16,
              borderRadius: 16,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              ...(isWeb ? { boxShadow: '0 8px 24px rgba(31,119,180,0.3)' } : { elevation: 4 }),
            } as any}
            activeOpacity={0.85}
          >
            <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Iniciar sesión</Text>
          </TouchableOpacity>

          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginTop: 16, borderWidth: 1, borderColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>¿Por qué crear cuenta?</Text>
            {[
              { icon: 'paw-outline', text: 'Reporta animales en peligro' },
              { icon: 'notifications-outline', text: 'Recibe actualizaciones de tus reportes' },
              { icon: 'heart-outline', text: 'Sigue el rescate en tiempo real' },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 14 : 0 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.icon as any} size={18} color="#1F77B4" />
                </View>
                <Text style={{ fontSize: 14, color: '#334155', fontWeight: '500' }}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </Animated.View>
    );
  }

  const initials = `${user.nombre?.[0] ?? ''}${user.apellido_paterno?.[0] ?? ''}`.toUpperCase();

  return (
    <Animated.View style={{ flex: 1, backgroundColor: '#F8FAFC', opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Header con avatar */}
      <View style={{ backgroundColor: '#0F172A', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 28, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#1F77B4', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '800' }}>{initials}</Text>
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>
          {user.nombre} {user.apellido_paterno}
        </Text>
        <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '500', marginTop: 4 }}>{user.email}</Text>
        {user.es_admin && (
          <View style={{ backgroundColor: 'rgba(31,119,180,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 100, alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: 'rgba(31,119,180,0.3)' }}>
            <Text style={{ color: '#93C5FD', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Administrador</Text>
          </View>
        )}
        {user.asociacion_id && user.rol === 'staff' && (
          <View style={{ backgroundColor: 'rgba(243,156,18,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 100, alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: 'rgba(243,156,18,0.3)' }}>
            <Text style={{ color: '#FCD34D', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Staff</Text>
          </View>
        )}
        {user.asociacion_id && user.rol === 'asociacion' && (
          <View style={{ backgroundColor: 'rgba(39,174,96,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 100, alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: 'rgba(39,174,96,0.3)' }}>
            <Text style={{ color: '#86EFAC', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Asociación</Text>
          </View>
        )}
        </View>

      <View style={{ padding: 24, gap: 12 }}>
        {/* Info card */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#F1F5F9' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>Datos de cuenta</Text>
          {[
            { icon: 'call-outline', label: 'Teléfono', value: user.telefono },
            { icon: 'mail-outline', label: 'Correo', value: user.email },
          ].map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: i < 1 ? 14 : 0 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={row.icon as any} size={17} color="#64748B" />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>{row.label}</Text>
                <Text style={{ fontSize: 14, color: '#1E293B', fontWeight: '600', marginTop: 1 }}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Mis Reportes — visible para todos los usuarios logueados */}
        {(!user.asociacion_id && !user.es_admin) && (
        <TouchableOpacity
          onPress={() => setIsMisReportesVisible(true)}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DBEAFE' }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="paw-outline" size={18} color="#1F77B4" />
            </View>
            <Text style={{ fontSize: 15, color: '#1E293B', fontWeight: '700' }}>Mis Reportes</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>
        )}
        
        {/* Panel de Administrador */}
        {user.es_admin && (
          <TouchableOpacity
            onPress={() => setIsAdminVisible(true)}
            style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DBEAFE' }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#1F77B4" />
              </View>
              <Text style={{ fontSize: 15, color: '#1E293B', fontWeight: '700' }}>Panel de administrador</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {/* Panel de Asociación */}
        {user.asociacion_id && user.rol === 'asociacion' && (
          <TouchableOpacity
            onPress={() => setIsAssociationVisible(true)}
            style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#D1FAE5' }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="business-outline" size={18} color="#27AE60" />
              </View>
              <Text style={{ fontSize: 15, color: '#1E293B', fontWeight: '700' }}>Panel de asociación</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {/* Panel para staff  (falta actualiza panel)*/}
        {user.rol === 'staff' && (
        <TouchableOpacity
            onPress={() => setIsStaffVisible(true)} // <-- CAMBIO AQUÍ
            style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#D1FAE5' }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="business-outline" size={18} color="#27AE60" />
              </View>
              <Text style={{ fontSize: 15, color: '#1E293B', fontWeight: '700' }}>Panel de staff</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {/* Logout */}
        <TouchableOpacity
          onPress={logout}
          style={{ backgroundColor: '#FEF2F2', borderRadius: 16, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#FECACA', marginTop: 8 }}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '700' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: Mis Reportes */}
      <Modal visible={isMisReportesVisible} animationType="slide" transparent onRequestClose={() => setIsMisReportesVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>
            {isMisReportesVisible && (
              <MisReportesScreen onClose={() => setIsMisReportesVisible(false)} />
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: Panel de Administrador */}
      <Modal visible={isAdminVisible} animationType="slide" transparent onRequestClose={() => setIsAdminVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            {isAdminVisible && (
              <AdminDashboardScreen onClose={() => setIsAdminVisible(false)} />
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: Panel de Asociación */}
      <Modal visible={isAssociationVisible} animationType="slide" transparent onRequestClose={() => setIsAssociationVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            {isAssociationVisible && (
              <AssociationStatusScreen onClose={() => setIsAssociationVisible(false)} />
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: Panel de Staff */}
      <Modal visible={isStaffVisible} animationType="slide" transparent onRequestClose={() => setIsStaffVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16, paddingTop: 60, paddingBottom: 40 }}>
          <View style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, overflow: 'hidden' }}>
            {isStaffVisible && (
              <StaffDashboardScreen onClose={() => setIsStaffVisible(false)} />
            )}
          </View>
        </View>
      </Modal>

    </Animated.View>
  );
}