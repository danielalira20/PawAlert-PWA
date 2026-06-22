import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { validarPassword } from '../utils/validators';

type Tab = 'login' | 'register';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'register' ? 'register' : 'login');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
      Alert.alert('Datos incompletos', 'Revisa los campos marcados en rojo.');
      return;
    }

    setIsLoading(true);
    try {
      const usuario = await login(email.trim(), password);
      // ¡CORRECCIÓN AQUÍ! Redirigir a '/profile' en lugar de '/perfil'
      const destino = usuario.es_admin ? '/profile' : (usuario.asociacion_id ? '/association-status' : '/');
      showSuccessAndRedirect('¡Bienvenida de vuelta! Redirigiendo...', destino);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'Correo o contraseña incorrectos');
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
      Alert.alert('Datos incompletos o inválidos', 'Revisa los campos marcados en rojo.');
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
      // ¡CORRECCIÓN AQUÍ! Redirigir a '/profile' en lugar de '/perfil'
      const destino = usuario.es_admin ? '/profile' : (usuario.asociacion_id ? '/association-status' : '/');
      showSuccessAndRedirect('¡Cuenta creada! Redirigiendo...', destino);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'Error al crear la cuenta');
      
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8,
    padding: 12, marginBottom: 12, color: '#2C3E50', fontSize: 14,
  };
  const labelStyle = { fontSize: 12, color: '#7F8C8D', marginBottom: 4, fontWeight: '600' as const };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      {successMessage && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
          backgroundColor: '#27AE60', paddingVertical: 14, paddingHorizontal: 20,
          alignItems: 'center',
        }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
            ✓ {successMessage}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>

        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ color: '#3498DB', fontWeight: 'bold', fontSize: 36, marginBottom: 8 }}>PawAlert</Text>
          <Text style={{ color: '#7F8C8D', fontSize: 14, textAlign: 'center' }}>
            Inicia sesión para reportar más fácil
          </Text>
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', padding: 4, borderRadius: 12, marginBottom: 24 }}>
          {(['login', 'register'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: tab === t ? '#3498DB' : 'transparent' }}
            >
              <Text style={{ fontWeight: '600', color: tab === t ? '#FFFFFF' : '#7F8C8D' }}>
                {t === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16 }}>
          {tab === 'login' ? (
            <View>
              <Text style={labelStyle}>Correo electrónico *</Text>
              <TextInput placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none"
                value={email} onChangeText={handleLoginEmailChange} style={errors.email ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : inputStyle} />
              {errors.email && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 12 }}>{errors.email}</Text>}
              <Text style={labelStyle}>Contraseña *</Text>
              <TextInput placeholder="••••••••" secureTextEntry value={password} onChangeText={handleLoginPasswordChange}
                style={errors.password ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : { ...inputStyle, marginBottom: 24 }} />
              {errors.password && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 24 }}>{errors.password}</Text>}
            </View>
          ) : (
            <View>
              <Text style={labelStyle}>Nombre(s) *</Text>
              <TextInput placeholder="Ej. Ana" value={nombre} onChangeText={handleNombreChange} style={errors.nombre ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : inputStyle} />
              {errors.nombre && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 12 }}>{errors.nombre}</Text>}
              <Text style={labelStyle}>Apellido Paterno *</Text>
              <TextInput placeholder="Ej. Pérez" value={apellidoPaterno} onChangeText={handleApellidoPaternoChange} style={errors.apellidoPaterno ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : inputStyle} />
              {errors.apellidoPaterno && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 12 }}>{errors.apellidoPaterno}</Text>}
              <Text style={labelStyle}>Apellido Materno (Opcional)</Text>
              <TextInput placeholder="Ej. López" value={apellidoMaterno} onChangeText={handleApellidoMaternoChange} style={errors.apellidoMaterno ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : inputStyle} />
              {errors.apellidoMaterno && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 12 }}>{errors.apellidoMaterno}</Text>}
              <Text style={labelStyle}>Teléfono *</Text>
              <TextInput placeholder="2221234567" keyboardType="phone-pad" value={telefono} onChangeText={handleTelefonoChange} style={errors.telefono ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : inputStyle} />
              {errors.telefono && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 12 }}>{errors.telefono}</Text>}
              <Text style={labelStyle}>Correo electrónico *</Text>
              <TextInput placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none"
                value={regEmail} onChangeText={handleRegEmailChange} style={errors.regEmail ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : inputStyle} />
              {errors.regEmail && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 12 }}>{errors.regEmail}</Text>}
              <Text style={labelStyle}>Contraseña *</Text>
              <TextInput placeholder="8+ caracteres, mayúscula, minúscula y número" secureTextEntry value={regPassword} onChangeText={handleRegPasswordChange} style={errors.regPassword ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : inputStyle} />
              {errors.regPassword && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 12 }}>{errors.regPassword}</Text>}
              <Text style={labelStyle}>Confirmar Contraseña *</Text>
              <TextInput placeholder="Repite tu contraseña" secureTextEntry value={regPassword2} onChangeText={handleRegPassword2Change}
                style={errors.regPassword2 ? { ...inputStyle, borderColor: '#E74C3C', marginBottom: 4 } : { ...inputStyle, marginBottom: 24 }} />
              {errors.regPassword2 && <Text style={{ color: '#E74C3C', fontSize: 12, marginBottom: 24 }}>{errors.regPassword2}</Text>}
            </View>
          )}

          <TouchableOpacity
            onPress={tab === 'login' ? handleLogin : handleRegister}
            disabled={isLoading}
            style={{ backgroundColor: '#3498DB', paddingVertical: 14, borderRadius: 8, alignItems: 'center', opacity: isLoading ? 0.6 : 1 }}
          >
            {isLoading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                  {tab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.replace('/')} style={{ alignItems: 'center', marginTop: 20 }}>
          <Text style={{ color: '#7F8C8D', fontSize: 14 }}>Continuar como invitado</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}