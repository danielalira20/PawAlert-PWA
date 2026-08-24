import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  useWindowDimensions, TextInput, ActivityIndicator, Platform,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { Brand } from '../../constants/theme';
import { DesktopHeroPanel } from './DesktopHeroPanel';
import { BenefitsRow } from './BenefitsRow';
import { useAuth } from '../../context/AuthContext';
import { Toast, useToast } from '../Toast';
import { consumeAuthIntent } from '../../utils/authIntent';
import { getPostAuthDestination, getPostAuthExplanation } from '../../utils/postAuthNavigation';
import { validarNombre } from '../../utils/validators';
import ForgotPasswordFlowScreen from '../../screens/ForgotPasswordFlowScreen';
import { isNetworkUnavailable } from '../../utils/networkError';

// ─── Tokens visuales (idénticos a LoginScreen) ───────────────────────────────
const C = {
  primary: '#F5842B',
  primaryLight: '#F1D5B6',
  secondary: '#66C5BD',
  accent: '#F6CE5B',
  neutralLight: '#E8CCAD',
  text: '#2E2A26',
  bg: '#FFFFFF',
  bgSoft: '#FDF8F4',   // ← mismo fondo que LoginScreen
  muted: '#9E8C7E',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};
// ─────────────────────────────────────────────────────────────────────────────

const DESKTOP_BREAKPOINT = 900;
type Tab = 'login' | 'register';
type AuthView = 'landing' | 'auth';

export function LoggedOutProfile() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const { login, register } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [modalCuentaExistente, setModalCuentaExistente] = useState<{ tipo: 'correo' | 'telefono'; valor: string } | null>(null);

  // Oculta el ojo nativo del browser en campos type="password" (Chrome/Edge)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const styleId = 'hide-pw-reveal';
    if (document.getElementById(styleId)) return;
    const el = document.createElement('style');
    el.id = styleId;
    el.textContent = [
      'input[type="password"]::-ms-reveal { display: none !important; }',
      'input[type="password"]::-ms-clear { display: none !important; }',
      'input[type="password"]::-webkit-contacts-auto-fill-button { display: none !important; }',
      'input[type="password"]::-webkit-credentials-auto-fill-button { display: none !important; }',
    ].join('\n');
    document.head.appendChild(el);
  }, []);

  const [fontsLoaded] = useFonts({
    Fraunces_800ExtraBold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const params = useLocalSearchParams<{ tab?: string; returnTo?: string }>();
  const intent = consumeAuthIntent();

  const requestedTab = params.tab || intent;

  const [view, setView] = useState<AuthView>(
    requestedTab === 'login' || requestedTab === 'register' ? 'auth' : 'landing'
  );
  const [tab, setTab] = useState<Tab>(
    requestedTab === 'register' ? 'register' : 'login'
  );
  const postAuthExplanation = getPostAuthExplanation(params.returnTo);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ─── Visibilidad contraseñas ────────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegPassword2, setShowRegPassword2] = useState(false);

  // ─── Campos login ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ─── Campos registro ───────────────────────────────────────────────────────
  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [telefono, setTelefono] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPassword2, setRegPassword2] = useState('');

  // ─── Validadores en tiempo real (idénticos a LoginScreen) ─────────────────
  const handleLoginEmailChange = (val: string) => {
    setEmail(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, email: 'El correo es obligatorio' }));
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) setErrors(prev => ({ ...prev, email: 'Ingresa un correo electrónico válido' }));
    else setErrors(prev => ({ ...prev, email: '' }));
  };

  const handleLoginPasswordChange = (val: string) => {
    setPassword(val);
    if (!val) setErrors(prev => ({ ...prev, password: 'La contraseña es obligatoria' }));
    else setErrors(prev => ({ ...prev, password: '' }));
  };

  const handleNombreChange = (val: string) => {
    setNombre(val);
    setErrors(prev => ({ ...prev, nombre: validarNombre(val, { etiqueta: 'nombre' }).mensaje }));
  };

  const handleApellidoPaternoChange = (val: string) => {
    setApellidoPaterno(val);
    setErrors(prev => ({ ...prev, apellidoPaterno: validarNombre(val, { etiqueta: 'apellido paterno' }).mensaje }));
  };

  const handleApellidoMaternoChange = (val: string) => {
    setApellidoMaterno(val);
    setErrors(prev => ({
      ...prev,
      apellidoMaterno: validarNombre(val, { requerido: false, etiqueta: 'apellido materno' }).mensaje,
    }));
  };

  const handleTelefonoChange = (val: string) => {
    setTelefono(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, telefono: 'El teléfono es obligatorio.' }));
    else if (/[a-zA-Z]/.test(val)) setErrors(prev => ({ ...prev, telefono: 'El teléfono no puede contener letras.' }));
    else if (!/^\d{10}$/.test(val.trim())) setErrors(prev => ({ ...prev, telefono: 'El teléfono debe tener exactamente 10 dígitos numéricos.' }));
    else setErrors(prev => ({ ...prev, telefono: '' }));
  };

  const handleRegEmailChange = (val: string) => {
    setRegEmail(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, regEmail: 'El correo es obligatorio' }));
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) setErrors(prev => ({ ...prev, regEmail: 'Correo inválido' }));
    else setErrors(prev => ({ ...prev, regEmail: '' }));
  };

  const handleRegPasswordChange = (val: string) => {
    setRegPassword(val);
    if (!val) setErrors(prev => ({ ...prev, regPassword: 'Contraseña es obligatoria' }));
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(val)) setErrors(prev => ({ ...prev, regPassword: 'Debe tener 8+ caracteres, mayúscula, minúscula y número' }));
    else setErrors(prev => ({ ...prev, regPassword: '' }));
    if (regPassword2 && val !== regPassword2) setErrors(prev => ({ ...prev, regPassword2: 'Las contraseñas no coinciden' }));
    else if (regPassword2) setErrors(prev => ({ ...prev, regPassword2: '' }));
  };

  const handleRegPassword2Change = (val: string) => {
    setRegPassword2(val);
    if (regPassword && val !== regPassword) setErrors(prev => ({ ...prev, regPassword2: 'Las contraseñas no coinciden' }));
    else setErrors(prev => ({ ...prev, regPassword2: '' }));
  };

  // ─── Submit login ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    let hasErrors = false;
    const newErrors: Record<string, string> = {};
    if (!email.trim()) { newErrors.email = 'El correo es obligatorio'; hasErrors = true; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { newErrors.email = 'Ingresa un correo electrónico válido'; hasErrors = true; }
    if (!password) { newErrors.password = 'La contraseña es obligatoria'; hasErrors = true; }
    if (hasErrors) {
      setErrors(prev => ({ ...prev, ...newErrors }));
      showToast({ type: 'warning', title: 'Datos incompletos', message: 'Revisa los campos marcados en rojo.' });
      return;
    }
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      if (params.returnTo) {
        const destino = getPostAuthDestination(params.returnTo, '/profile');
        router.replace(destino as any);
      } else {
        setSuccessMessage('¡Bienvenida de vuelta!');
      }
    } catch (error: any) {
      if (isNetworkUnavailable(error)) {
        showToast({ type: 'warning', title: 'Sin conexión', message: 'Revisa tu red para poder iniciar sesión.' }, 4200);
      } else {
        showToast({ type: 'error', title: 'No pudimos iniciar sesión', message: error?.response?.data?.detail || 'Correo o contraseña incorrectos.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Submit registro ───────────────────────────────────────────────────────
  const handleRegister = async () => {
    let hasErrors = false;
    const newErrors: Record<string, string> = {};
    const nombreCheck = validarNombre(nombre, { etiqueta: 'nombre' });
    if (!nombreCheck.valido) { newErrors.nombre = nombreCheck.mensaje; hasErrors = true; }
    const apellidoPaternoCheck = validarNombre(apellidoPaterno, { etiqueta: 'apellido paterno' });
    if (!apellidoPaternoCheck.valido) { newErrors.apellidoPaterno = apellidoPaternoCheck.mensaje; hasErrors = true; }
    const apellidoMaternoCheck = validarNombre(apellidoMaterno, { requerido: false, etiqueta: 'apellido materno' });
    if (!apellidoMaternoCheck.valido) { newErrors.apellidoMaterno = apellidoMaternoCheck.mensaje; hasErrors = true; }
    if (!telefono.trim()) { newErrors.telefono = 'El teléfono es obligatorio.'; hasErrors = true; }
    else if (/[a-zA-Z]/.test(telefono)) { newErrors.telefono = 'El teléfono no puede contener letras.'; hasErrors = true; }
    else if (!/^\d{10}$/.test(telefono.trim())) { newErrors.telefono = 'El teléfono debe tener exactamente 10 dígitos numéricos.'; hasErrors = true; }
    if (!regEmail.trim()) { newErrors.regEmail = 'El correo es obligatorio'; hasErrors = true; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) { newErrors.regEmail = 'Correo inválido'; hasErrors = true; }
    if (!regPassword) { newErrors.regPassword = 'Contraseña es obligatoria'; hasErrors = true; }
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(regPassword)) { newErrors.regPassword = 'Debe tener 8+ caracteres, mayúscula, minúscula y número'; hasErrors = true; }
    if (regPassword !== regPassword2) { newErrors.regPassword2 = 'Las contraseñas no coinciden'; hasErrors = true; }
    if (hasErrors) {
      setErrors(prev => ({ ...prev, ...newErrors }));
      showToast({ type: 'warning', title: 'Datos incompletos o inválidos', message: 'Revisa los campos marcados en rojo.' });
      return;
    }
    setIsLoading(true);
    try {
      await register({
        email: regEmail.trim(),
        password: regPassword,
        nombre: nombre.trim(),
        apellido_paterno: apellidoPaterno.trim(),
        apellido_materno: apellidoMaterno.trim() || undefined,
        telefono: telefono.replace(/\s|-/g, ''),
      });
      if (params.returnTo) {
        const destino = getPostAuthDestination(params.returnTo, '/profile');
        router.replace(destino as any);
      } else {
        setSuccessMessage('¡Cuenta creada!');
      }
    } catch (error: any) {
      const detalle = error?.response?.data?.detail || '';
      if (error?.response?.status === 409) {
        if (detalle.includes('correo')) {
          setModalCuentaExistente({ tipo: 'correo', valor: regEmail.trim() });
        } else if (detalle.includes('teléfono')) {
          setModalCuentaExistente({ tipo: 'telefono', valor: telefono.replace(/\s|-/g, '') });
        } else {
          showToast({ type: 'error', title: 'Ya tienes una cuenta', message: detalle });
        }
      } else {
        showToast({ type: 'error', title: 'Error', message: detalle || 'Error al crear la cuenta' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Estilos de inputs (idénticos a LoginScreen) ──────────────────────────
  const inputStyle = {
    borderWidth: 1.5,
    borderColor: `${C.neutralLight}60`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    color: C.text,
    fontSize: 15,
    fontFamily: F.bodyMedium,
    backgroundColor: C.bgSoft,
  };
  const labelStyle = {
    fontSize: 13,
    color: C.text,
    marginBottom: 6,
    fontFamily: F.bodySemiBold,
    letterSpacing: 0.3,
  };
  const errorStyle = {
    color: '#E74C3C',
    fontSize: 12,
    fontFamily: F.bodyRegular,
    marginBottom: 16,
    marginTop: -8,
  };

  if (!fontsLoaded) return null;

  // ─── Formulario de auth embebido (login + registro) ───────────────────────
  const renderAuthPanel = () => (
    <View style={{ flex: 1 }}>
    <Toast toast={toast} translateY={translateY} />

    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgSoft }}
      contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}
      showsVerticalScrollIndicator={false}
    >
    
      {successMessage && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
          backgroundColor: C.secondary, paddingVertical: 14, paddingHorizontal: 20,
          alignItems: 'center', ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}),
        }}>
          <Text style={{ color: C.bg, fontFamily: F.bodySemiBold, fontSize: 14 }}>
            ✓ {successMessage}
          </Text>
        </View>
      )}

      <View style={{ width: '100%', maxWidth: 440 }}>

        {postAuthExplanation && (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            backgroundColor: '#FFF4E8', borderWidth: 1, borderColor: '#F1D5B6',
            borderRadius: 18, padding: 16, marginBottom: 20,
          }}>
            <Ionicons name="information-circle-outline" size={22} color={C.primary} />
            <Text style={{ flex: 1, color: C.text, fontFamily: F.bodyMedium, fontSize: 13, lineHeight: 20 }}>
              {postAuthExplanation}
            </Text>
          </View>
        )}

        {/* Encabezado con botón volver */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Ionicons name="paw" size={40} color={C.primary} style={{ marginBottom: 12, opacity: 0.9 }} />
          <Text style={{ color: C.primary, fontFamily: F.displayBold, fontSize: 36, marginBottom: 6, letterSpacing: -1 }}>
            PawAlert
          </Text>
          <Text style={{ color: C.muted, fontSize: 15, textAlign: 'center', fontFamily: F.bodyRegular }}>
            {tab === 'login' ? 'Inicia sesión para reportar más rápido' : 'Únete a nuestra comunidad de rescate'}
          </Text>
        </View>

        {/* Pestañas login / registro */}
        <View style={{ flexDirection: 'row', backgroundColor: '#F1E9E0', padding: 6, borderRadius: 30, marginBottom: 28 }}>
          {(['login', 'register'] as Tab[]).map((t) => {
            const isActive = tab === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => { setTab(t); setErrors({}); }}
                style={{
                  flex: 1, paddingVertical: 14, borderRadius: 24, alignItems: 'center',
                  backgroundColor: isActive ? C.bg : 'transparent',
                  ...(isActive
                    ? (Platform.OS === 'web'
                      ? { boxShadow: '0 4px 12px rgba(46,42,38,0.08)' } as any
                      : { elevation: 2 })
                    : {}),
                }}
              >
                <Text style={{ fontFamily: isActive ? F.bodySemiBold : F.bodyMedium, color: isActive ? C.primary : C.muted, fontSize: 15 }}>
                  {t === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Card del formulario */}
        <View style={{
          backgroundColor: C.bg, padding: 28, borderRadius: 28,
          borderWidth: 1, borderColor: `${C.neutralLight}30`,
          ...(Platform.OS === 'web'
            ? { boxShadow: '0 12px 40px rgba(46,42,38,0.08)' } as any
            : { elevation: 5 }),
        }}>

          {/* ── FORMULARIO LOGIN ── */}
          {tab === 'login' && (
            <View>
              <Text style={labelStyle}>Correo electrónico *</Text>
              <TextInput
                placeholder="correo@ejemplo.com"
                placeholderTextColor={C.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={handleLoginEmailChange}
                style={errors.email ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle}
              />
              {errors.email ? <Text style={errorStyle}>{errors.email}</Text> : null}

              <Text style={labelStyle}>Contraseña *</Text>
              <View style={{ position: 'relative', marginBottom: errors.password ? 0 : 0 }}>
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor={C.muted}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={handleLoginPasswordChange}
                  style={[
                    errors.password
                      ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC', marginBottom: 0 }
                      : { ...inputStyle, marginBottom: 0 },
                    { paddingRight: 48 },
                  ]}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  hitSlop={8}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setShowForgotPassword(true)} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                <Text style={{ color: '#EC802B', fontSize: 13, fontWeight: '600' }}>
                  ¿Olvidaste tu contraseña?
                </Text>
              </TouchableOpacity>
              {errors.password ? <Text style={{ ...errorStyle, marginTop: 4 }}>{errors.password}</Text> : <View style={{ marginBottom: 28 }} />}
                  
            </View>

            

            
          )}

          {/* ── FORMULARIO REGISTRO ── */}
          {tab === 'register' && (
            <View>
              <Text style={labelStyle}>Nombre(s) *</Text>
              <TextInput
                placeholder="Ej. Ana"
                placeholderTextColor={C.muted}
                value={nombre}
                onChangeText={handleNombreChange}
                style={errors.nombre ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle}
              />
              {errors.nombre ? <Text style={errorStyle}>{errors.nombre}</Text> : null}

              <Text style={labelStyle}>Apellido Paterno *</Text>
              <TextInput
                placeholder="Ej. Pérez"
                placeholderTextColor={C.muted}
                value={apellidoPaterno}
                onChangeText={handleApellidoPaternoChange}
                style={errors.apellidoPaterno ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle}
              />
              {errors.apellidoPaterno ? <Text style={errorStyle}>{errors.apellidoPaterno}</Text> : null}

              <Text style={labelStyle}>Apellido Materno (Opcional)</Text>
              <TextInput
                placeholder="Ej. López"
                placeholderTextColor={C.muted}
                value={apellidoMaterno}
                onChangeText={handleApellidoMaternoChange}
                style={errors.apellidoMaterno ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle}
              />
              {errors.apellidoMaterno ? <Text style={errorStyle}>{errors.apellidoMaterno}</Text> : null}

              <Text style={labelStyle}>Teléfono *</Text>
              <TextInput
                placeholder="10 dígitos"
                placeholderTextColor={C.muted}
                keyboardType="phone-pad"
                value={telefono}
                onChangeText={handleTelefonoChange}
                style={errors.telefono ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle}
              />
              {errors.telefono ? <Text style={errorStyle}>{errors.telefono}</Text> : null}

              <Text style={labelStyle}>Correo electrónico *</Text>
              <TextInput
                placeholder="correo@ejemplo.com"
                placeholderTextColor={C.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={regEmail}
                onChangeText={handleRegEmailChange}
                style={errors.regEmail ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle}
              />
              {errors.regEmail ? <Text style={errorStyle}>{errors.regEmail}</Text> : null}

              <Text style={labelStyle}>Contraseña *</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  placeholder="8+ caracteres, mayúscula, minúscula y número"
                  placeholderTextColor={C.muted}
                  secureTextEntry={!showRegPassword}
                  value={regPassword}
                  onChangeText={handleRegPasswordChange}
                  style={[
                    errors.regPassword ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC', marginBottom: 0 } : { ...inputStyle, marginBottom: 0 },
                    { paddingRight: 48 },
                  ]}
                />
                <TouchableOpacity
                  onPress={() => setShowRegPassword(v => !v)}
                  style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  hitSlop={8}
                >
                  <Ionicons name={showRegPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
                </TouchableOpacity>
              </View>
              {errors.regPassword ? <Text style={{ ...errorStyle, marginTop: 4 }}>{errors.regPassword}</Text> : <View style={{ marginBottom: 12 }} />}

              <Text style={labelStyle}>Confirmar Contraseña *</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  placeholder="Repite tu contraseña"
                  placeholderTextColor={C.muted}
                  secureTextEntry={!showRegPassword2}
                  value={regPassword2}
                  onChangeText={handleRegPassword2Change}
                  style={[
                    errors.regPassword2
                      ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC', marginBottom: 0 }
                      : { ...inputStyle, marginBottom: 0 },
                    { paddingRight: 48 },
                  ]}
                />
                <TouchableOpacity
                  onPress={() => setShowRegPassword2(v => !v)}
                  style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                  hitSlop={8}
                >
                  <Ionicons name={showRegPassword2 ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
                </TouchableOpacity>
              </View>
              {errors.regPassword2 ? <Text style={{ ...errorStyle, marginTop: 4 }}>{errors.regPassword2}</Text> : <View style={{ marginBottom: 28 }} />}
            </View>
          )}

          {/* Botón submit */}
          <TouchableOpacity
            onPress={tab === 'login' ? handleLogin : handleRegister}
            disabled={isLoading}
            style={{
              backgroundColor: C.primary, paddingVertical: 18, borderRadius: 30,
              alignItems: 'center', opacity: isLoading ? 0.7 : 1,
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 4px 14px rgba(245,132,43,0.3)' } as any
                : { elevation: 3 }),
            }}
          >

            {isLoading
              ? <ActivityIndicator color={C.bg} />
              : <Text style={{ color: C.bg, fontFamily: F.bodySemiBold, fontSize: 16 }}>
                {tab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </Text>
            }
          </TouchableOpacity>

           <ForgotPasswordFlowScreen
                visible={showForgotPassword}
                onClose={() => setShowForgotPassword(false)}
            />
        </View>

        {/* Volver a la vista inicial */}
        <TouchableOpacity
          onPress={() => { setView('landing'); setErrors({}); }}
          style={{ alignItems: 'center', marginTop: 24, padding: 10 }}
        >
          <Text style={{ color: C.primary, fontFamily: F.bodySemiBold, fontSize: 15, textDecorationLine: 'underline' }}>
            ← Volver
          </Text>
        </TouchableOpacity>

        {/* Continuar como invitado */}
        <TouchableOpacity onPress={() => router.replace('/')} style={{ alignItems: 'center', marginTop: 8, padding: 10 }}>
          <Text style={{ color: C.muted, fontFamily: F.bodyRegular, fontSize: 14 }}>
            Continuar como invitado
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    <Modal visible={!!modalCuentaExistente} transparent animationType="fade">
  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
    <View style={{ backgroundColor: C.bg, borderRadius: 28, padding: 28, width: '100%', maxWidth: 380, alignItems: 'center' }}>
      <Text style={{ fontFamily: F.displayBold, fontSize: 20, color: C.text, textAlign: 'center', marginBottom: 10 }}>
        Ya tienes una cuenta
      </Text>
      <Text style={{ fontFamily: F.bodyRegular, fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
        Encontramos una cuenta existente con este {modalCuentaExistente?.tipo === 'correo' ? 'correo' : 'número de teléfono'}.
      </Text>

      <TouchableOpacity
        onPress={() => {
          if (modalCuentaExistente?.tipo === 'correo') setEmail(modalCuentaExistente.valor);
          setModalCuentaExistente(null);
          setTab('login');
        }}
        style={{ backgroundColor: C.primary, paddingVertical: 14, borderRadius: 20, alignItems: 'center', width: '100%', marginBottom: 10 }}
      >
        <Text style={{ color: C.bg, fontFamily: F.bodySemiBold, fontSize: 15 }}>Iniciar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setModalCuentaExistente(null)}
        style={{ paddingVertical: 12 }}
      >
        <Text style={{ color: C.muted, fontFamily: F.bodyMedium, fontSize: 13 }}>
          Usar otro {modalCuentaExistente?.tipo === 'correo' ? 'correo' : 'teléfono'}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>

    </View>
  );

  // ─── Vista landing ─────────────────────────────────────────────────────────
  const contenido = (
    <View style={[styles.contentInner, isDesktop && styles.contentInnerDesktop]}>
      <View style={styles.iconCircleBig}>
        <Ionicons name="person-outline" size={38} color={Brand.textMuted} />
      </View>

      <Text style={styles.title}>¡Hola! Aún no has iniciado sesión</Text>
      <Text style={styles.subtitle}>
        Inicia sesión para ver tu perfil, reportar animales y mucho más.
      </Text>

      <TouchableOpacity
        onPress={() => { setTab('login'); setView('auth'); }}
        style={[styles.loginButton, isDesktop && styles.loginButtonDesktop, { marginBottom: 12 }]}
        activeOpacity={0.85}
      >
        <Ionicons name="log-in-outline" size={19} color="#fff" />
        <Text style={styles.loginButtonText}>Iniciar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { setTab('register'); setView('auth'); }} style={{ padding: 10, marginBottom: 32 }}>
        <Text style={styles.newHereText}>
          ¿No tienes cuenta? <Text style={styles.newHereLink}>Regístrate</Text>
        </Text>
      </TouchableOpacity>

      <View style={styles.benefitsWrap}>
        <BenefitsRow />
      </View>
    </View>
  );

  // ─── Render final ──────────────────────────────────────────────────────────
  if (view === 'auth') {
    if (isDesktop) {
      return (
        <View style={styles.desktopRow}>
          <View style={styles.desktopLeft}>
            <DesktopHeroPanel />
          </View>
          {renderAuthPanel()}
        </View>
      );
    }
    return renderAuthPanel();
  }

  // Landing (vista inicial)
  if (isDesktop) {
    return (
      <View style={styles.desktopRow}>
        <View style={styles.desktopLeft}>
          <DesktopHeroPanel />
        </View>
        <ScrollView style={[styles.desktopRight, { backgroundColor: C.bgSoft }]} contentContainerStyle={styles.desktopRightContent}>
          {contenido}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bgSoft }}
      contentContainerStyle={styles.mobileScrollContent}
    >
      {contenido}
    </ScrollView>
  );

  
}

const styles = StyleSheet.create({
  desktopRow: { flex: 1, flexDirection: 'row' },
  desktopLeft: { flex: 1 },
  desktopRight: { flex: 1 },
  desktopRightContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  mobileScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 40,
    justifyContent: 'center',
  },

  contentInner: { alignItems: 'center', paddingHorizontal: 4, paddingTop: 20, paddingBottom: 24 },
  contentInnerDesktop: { width: '100%', maxWidth: 480, paddingTop: 0 },

  iconCircleBig: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Brand.textDark,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: Brand.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Brand.primary,
    borderRadius: 28,
    paddingVertical: 17,
    width: '100%',
    shadowColor: Brand.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 38,
  },
  loginButtonDesktop: { maxWidth: 440 },
  loginButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  benefitsWrap: { width: '100%' },
  newHereText: { fontSize: 13, color: Brand.textMuted },
  newHereLink: { color: Brand.primary, fontWeight: '700' },
});

