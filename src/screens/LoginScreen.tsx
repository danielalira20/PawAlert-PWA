import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View, Platform, KeyboardAvoidingView } from 'react-native';
import { Toast, useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { validarPassword } from '../utils/validators';

// ─── FONTS & TOKENS ───────────────────────────────────────────────────────────
import { useFonts } from 'expo-font';
import { Fraunces_800ExtraBold } from '@expo-google-fonts/fraunces';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold } from '@expo-google-fonts/poppins';
import { Ionicons } from '@expo/vector-icons';

const C = {
  primary:       '#F5842B',
  primaryLight:  '#F1D5B6',
  secondary:     '#66C5BD',
  accent:        '#F6CE5B',
  neutralLight:  '#E8CCAD',
  text:          '#2E2A26',
  bg:            '#FFFFFF',
  bgSoft:        '#FDF8F4',
  muted:         '#9E8C7E',
};

const F = {
  displayBold: 'Fraunces_800ExtraBold',
  displaySemi: 'Fraunces_800ExtraBold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium:  'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
};
// ──────────────────────────────────────────────────────────────────────────────

type Tab = 'login' | 'register';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const { toast, translateY, showToast } = useToast();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'register' ? 'register' : 'login');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    Fraunces_800ExtraBold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [telefono, setTelefono] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPassword2, setRegPassword2] = useState('');

  // ─── Real-time validation handlers ──────────────────────────────────────
  const handleLoginEmailChange = (val: string) => {
    setEmail(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, email: 'El correo es obligatorio' }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, email: 'Ingresa un correo electrónico válido' }));
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  };

  const handleLoginPasswordChange = (val: string) => {
    setPassword(val);
    if (!val) {
      setErrors(prev => ({ ...prev, password: 'La contraseña es obligatoria' }));
    } else {
      setErrors(prev => ({ ...prev, password: '' }));
    }
  };

  const handleNombreChange = (val: string) => {
    setNombre(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, nombre: 'El nombre es obligatorio.' }));
    else if (/\d/.test(val)) setErrors(prev => ({ ...prev, nombre: 'El nombre no debe contener números.' }));
    else setErrors(prev => ({ ...prev, nombre: '' }));
  };

  const handleApellidoPaternoChange = (val: string) => {
    setApellidoPaterno(val);
    if (!val.trim()) setErrors(prev => ({ ...prev, apellidoPaterno: 'El apellido paterno es obligatorio.' }));
    else if (/\d/.test(val)) setErrors(prev => ({ ...prev, apellidoPaterno: 'El apellido no debe contener números.' }));
    else setErrors(prev => ({ ...prev, apellidoPaterno: '' }));
  };

  const handleApellidoMaternoChange = (val: string) => {
    setApellidoMaterno(val);
    if (/\d/.test(val)) setErrors(prev => ({ ...prev, apellidoMaterno: 'El apellido no debe contener números.' }));
    else setErrors(prev => ({ ...prev, apellidoMaterno: '' }));
  };

  const handleTelefonoChange = (val: string) => {
    setTelefono(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono es obligatorio.' }));
    } else if (/[a-zA-Z]/.test(val)) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono no puede contener letras.' }));
    } else if (!/^\d{10}$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, telefono: 'El teléfono debe tener exactamente 10 dígitos numéricos.' }));
    } else {
      setErrors(prev => ({ ...prev, telefono: '' }));
    }
  };

  const handleRegEmailChange = (val: string) => {
    setRegEmail(val);
    if (!val.trim()) {
      setErrors(prev => ({ ...prev, regEmail: 'El correo es obligatorio' }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setErrors(prev => ({ ...prev, regEmail: 'Correo inválido' }));
    } else {
      setErrors(prev => ({ ...prev, regEmail: '' }));
    }
  };

  const handleRegPasswordChange = (val: string) => {
    setRegPassword(val);
    if (!val) {
      setErrors(prev => ({ ...prev, regPassword: 'Contraseña es obligatoria' }));
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(val)) {
      setErrors(prev => ({ ...prev, regPassword: 'Debe tener 8+ caracteres, mayúscula, minúscula y número' }));
    } else {
      setErrors(prev => ({ ...prev, regPassword: '' }));
    }
    
    if (regPassword2 && val !== regPassword2) {
      setErrors(prev => ({ ...prev, regPassword2: 'Las contraseñas no coinciden' }));
    } else if (regPassword2) {
      setErrors(prev => ({ ...prev, regPassword2: '' }));
    }
  };

  const handleRegPassword2Change = (val: string) => {
    setRegPassword2(val);
    if (regPassword && val !== regPassword) {
      setErrors(prev => ({ ...prev, regPassword2: 'Las contraseñas no coinciden' }));
    } else {
      setErrors(prev => ({ ...prev, regPassword2: '' }));
    }
  };
  // ────────────────────────────────────────────────────────────────────────

  const showSuccessAndRedirect = (message: string, destino: string = '/') => {
    setSuccessMessage(message);
    setTimeout(() => {
      router.replace(destino as any);
    }, 1400);
  };

  const handleLogin = async () => {
    let hasErrors = false;
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'El correo es obligatorio';
      hasErrors = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Ingresa un correo electrónico válido';
      hasErrors = true;
    }

    if (!password) {
      newErrors.password = 'La contraseña es obligatoria';
      hasErrors = true;
    }

    if (hasErrors) {
      setErrors(prev => ({ ...prev, ...newErrors }));
      showToast({ type: 'warning', title: 'Datos incompletos', message: 'Revisa los campos marcados en rojo.' });
      return;
    }

    setIsLoading(true);
    try {
      const usuario = await login(email.trim(), password);
      // ✅ CAMBIO: Tanto admin como asociación van a /profile
      const destino = usuario.es_admin || usuario.asociacion_id ? '/profile' : '/';
      showSuccessAndRedirect('¡Bienvenida de vuelta! Redirigiendo...', destino);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'Error al iniciar sesión' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    let hasErrors = false;
    const newErrors: Record<string, string> = {};

    if (!nombre.trim()) { newErrors.nombre = 'El nombre es obligatorio.'; hasErrors = true; }
    else if (/\d/.test(nombre)) { newErrors.nombre = 'El nombre no debe contener números.'; hasErrors = true; }

    if (!apellidoPaterno.trim()) { newErrors.apellidoPaterno = 'El apellido paterno es obligatorio.'; hasErrors = true; }
    else if (/\d/.test(apellidoPaterno)) { newErrors.apellidoPaterno = 'El apellido no debe contener números.'; hasErrors = true; }

    if (/\d/.test(apellidoMaterno)) { newErrors.apellidoMaterno = 'El apellido no debe contener números.'; hasErrors = true; }

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
      const usuario = await register({
        email: regEmail.trim(),
        password: regPassword,
        nombre: nombre.trim(),
        apellido_paterno: apellidoPaterno.trim(),
        apellido_materno: apellidoMaterno.trim() || undefined,
        telefono: telefono.replace(/\s|-/g, ''),
      });
      // ✅ CAMBIO: Tanto admin como asociación van a /profile
      const destino = usuario.es_admin || usuario.asociacion_id ? '/profile' : '/';
      showSuccessAndRedirect('¡Cuenta creada! Redirigiendo...', destino);
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: error?.response?.data?.detail || 'Error al crear la cuenta' });
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    borderWidth: 1.5, borderColor: `${C.neutralLight}60`, borderRadius: 16,
    padding: 16, marginBottom: 12, color: C.text, fontSize: 15, fontFamily: F.bodyMedium,
    backgroundColor: C.bgSoft,
  };
  const labelStyle = { fontSize: 13, color: C.text, marginBottom: 6, fontFamily: F.bodySemiBold, letterSpacing: 0.3 };
  const errorStyle = { color: '#E74C3C', fontSize: 12, fontFamily: F.bodyRegular, marginBottom: 16, marginTop: -8 };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.bgSoft, justifyContent: 'center' }}><ActivityIndicator color={C.primary} size="large" /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgSoft }}>
      <Toast toast={toast} translateY={translateY} />
      {successMessage && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
          backgroundColor: C.secondary, paddingVertical: 14, paddingHorizontal: 20,
          alignItems: 'center', ...(Platform.OS === 'web' ? { position: 'fixed' } : {})
        }}>
          <Text style={{ color: C.bg, fontFamily: F.bodySemiBold, fontSize: 14 }}>
            ✓ {successMessage}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>

          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <Ionicons name="paw" size={48} color={C.primary} style={{ marginBottom: 16, opacity: 0.9 }} />
            <Text style={{ color: C.primary, fontFamily: F.displayBold, fontSize: 42, marginBottom: 8, letterSpacing: -1 }}>PawAlert</Text>
            <Text style={{ color: C.muted, fontSize: 16, textAlign: 'center', fontFamily: F.bodyRegular }}>
              {tab === 'login' ? 'Inicia sesión para reportar más rápido' : 'Únete a nuestra comunidad de rescate'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', backgroundColor: '#F1E9E0', padding: 6, borderRadius: 30, marginBottom: 32 }}>
            {(['login', 'register'] as Tab[]).map((t) => {
              const isActive = tab === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={{ 
                    flex: 1, paddingVertical: 14, borderRadius: 24, alignItems: 'center', 
                    backgroundColor: isActive ? C.bg : 'transparent',
                    ...(isActive ? (Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(46,42,38,0.08)' } : { elevation: 2 }) : {})
                  }}
                >
                  <Text style={{ fontFamily: isActive ? F.bodySemiBold : F.bodyMedium, color: isActive ? C.primary : C.muted, fontSize: 15 }}>
                    {t === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ 
            backgroundColor: C.bg, padding: 24, borderRadius: 24, 
            ...(Platform.OS === 'web' ? { boxShadow: '0 8px 30px rgba(46,42,38,0.06)' } : { elevation: 4 })
          }}>
            {tab === 'login' ? (
              <View>
                <Text style={labelStyle}>Correo electrónico *</Text>
                <TextInput placeholder="correo@ejemplo.com" placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none"
                  value={email} onChangeText={handleLoginEmailChange} style={errors.email ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle} />
                {errors.email ? <Text style={errorStyle}>{errors.email}</Text> : null}

                <Text style={labelStyle}>Contraseña *</Text>
                <TextInput placeholder="••••••••" placeholderTextColor={C.muted} secureTextEntry value={password} onChangeText={handleLoginPasswordChange}
                  style={errors.password ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC', marginBottom: 24 } : { ...inputStyle, marginBottom: 32 }} />
                {errors.password ? <Text style={errorStyle}>{errors.password}</Text> : null}
              </View>
            ) : (
              <View>
                <Text style={labelStyle}>Nombre(s) *</Text>
                <TextInput placeholder="Ej. Ana" placeholderTextColor={C.muted} value={nombre} onChangeText={handleNombreChange} style={errors.nombre ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle} />
                {errors.nombre ? <Text style={errorStyle}>{errors.nombre}</Text> : null}

                <Text style={labelStyle}>Apellido Paterno *</Text>
                <TextInput placeholder="Ej. Pérez" placeholderTextColor={C.muted} value={apellidoPaterno} onChangeText={handleApellidoPaternoChange} style={errors.apellidoPaterno ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle} />
                {errors.apellidoPaterno ? <Text style={errorStyle}>{errors.apellidoPaterno}</Text> : null}

                <Text style={labelStyle}>Apellido Materno (Opcional)</Text>
                <TextInput placeholder="Ej. López" placeholderTextColor={C.muted} value={apellidoMaterno} onChangeText={handleApellidoMaternoChange} style={errors.apellidoMaterno ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle} />
                {errors.apellidoMaterno ? <Text style={errorStyle}>{errors.apellidoMaterno}</Text> : null}

                <Text style={labelStyle}>Teléfono *</Text>
                <TextInput placeholder="10 dígitos" placeholderTextColor={C.muted} keyboardType="phone-pad" value={telefono} onChangeText={handleTelefonoChange} style={errors.telefono ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle} />
                {errors.telefono ? <Text style={errorStyle}>{errors.telefono}</Text> : null}

                <Text style={labelStyle}>Correo electrónico *</Text>
                <TextInput placeholder="correo@ejemplo.com" placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none"
                  value={regEmail} onChangeText={handleRegEmailChange} style={errors.regEmail ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle} />
                {errors.regEmail ? <Text style={errorStyle}>{errors.regEmail}</Text> : null}

                <Text style={labelStyle}>Contraseña *</Text>
                <TextInput placeholder="8+ caracteres, mayúscula, minúscula y número" placeholderTextColor={C.muted} secureTextEntry value={regPassword} onChangeText={handleRegPasswordChange} style={errors.regPassword ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC' } : inputStyle} />
                {errors.regPassword ? <Text style={errorStyle}>{errors.regPassword}</Text> : null}

                <Text style={labelStyle}>Confirmar Contraseña *</Text>
                <TextInput placeholder="Repite tu contraseña" placeholderTextColor={C.muted} secureTextEntry value={regPassword2} onChangeText={handleRegPassword2Change}
                  style={errors.regPassword2 ? { ...inputStyle, borderColor: '#E74C3C', backgroundColor: '#FDEDEC', marginBottom: 24 } : { ...inputStyle, marginBottom: 32 }} />
                {errors.regPassword2 ? <Text style={errorStyle}>{errors.regPassword2}</Text> : null}
              </View>
            )}

            <TouchableOpacity
              onPress={tab === 'login' ? handleLogin : handleRegister}
              disabled={isLoading}
              style={{ 
                backgroundColor: C.primary, paddingVertical: 18, borderRadius: 30, 
                alignItems: 'center', opacity: isLoading ? 0.7 : 1,
                ...(Platform.OS === 'web' ? { boxShadow: '0 4px 14px rgba(245,132,43,0.3)' } : { elevation: 3 })
              }}
            >
              {isLoading
                ? <ActivityIndicator color={C.bg} />
                : <Text style={{ color: C.bg, fontFamily: F.bodySemiBold, fontSize: 16 }}>
                    {tab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.replace('/')} style={{ alignItems: 'center', marginTop: 32, padding: 12 }}>
            <Text style={{ color: C.primary, fontFamily: F.bodySemiBold, fontSize: 15, textDecorationLine: 'underline' }}>
              Continuar como invitado
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
