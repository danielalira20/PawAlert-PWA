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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [nombre, setNombre] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [telefono, setTelefono] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPassword2, setRegPassword2] = useState('');

  const showSuccessAndRedirect = (message: string, destino: string = '/') => {
    setSuccessMessage(message);
    setTimeout(() => {
      router.replace(destino as any);
    }, 1400);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Datos incompletos', 'Ingresa tu correo y contraseña.');
      return;
    }
    setIsLoading(true);
    try {
      const usuario = await login(email.trim(), password);
      const destino = usuario.asociacion_id ? '/association-status' : '/';
      showSuccessAndRedirect('¡Bienvenida de vuelta! Redirigiendo...', destino);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'Correo o contraseña incorrectos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!nombre.trim() || !apellidoPaterno.trim() || !telefono.trim() || !regEmail.trim() || !regPassword.trim()) {
      Alert.alert('Datos incompletos', 'Llena todos los campos requeridos.');
      return;
    }
    if (regPassword !== regPassword2) {
      Alert.alert('Error', 'Las contraseñas no coinciden.');
      return;
    }
    const resultadoPassword = validarPassword(regPassword);
    if (!resultadoPassword.valido) {
      Alert.alert('Error', resultadoPassword.mensaje);
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
      const destino = usuario.asociacion_id ? '/association-status' : '/';
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
                value={email} onChangeText={setEmail} style={inputStyle} />
              <Text style={labelStyle}>Contraseña *</Text>
              <TextInput placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword}
                style={{ ...inputStyle, marginBottom: 24 }} />
            </View>
          ) : (
            <View>
              <Text style={labelStyle}>Nombre(s) *</Text>
              <TextInput placeholder="Ej. Ana" value={nombre} onChangeText={setNombre} style={inputStyle} />
              <Text style={labelStyle}>Apellido Paterno *</Text>
              <TextInput placeholder="Ej. Pérez" value={apellidoPaterno} onChangeText={setApellidoPaterno} style={inputStyle} />
              <Text style={labelStyle}>Apellido Materno (Opcional)</Text>
              <TextInput placeholder="Ej. López" value={apellidoMaterno} onChangeText={setApellidoMaterno} style={inputStyle} />
              <Text style={labelStyle}>Teléfono *</Text>
              <TextInput placeholder="2221234567" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} style={inputStyle} />
              <Text style={labelStyle}>Correo electrónico *</Text>
              <TextInput placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none"
                value={regEmail} onChangeText={setRegEmail} style={inputStyle} />
              <Text style={labelStyle}>Contraseña *</Text>
              <TextInput placeholder="8+ caracteres, mayúscula, minúscula y número" secureTextEntry value={regPassword} onChangeText={setRegPassword} style={inputStyle} />
              <Text style={labelStyle}>Confirmar Contraseña *</Text>
              <TextInput placeholder="Repite tu contraseña" secureTextEntry value={regPassword2} onChangeText={setRegPassword2}
                style={{ ...inputStyle, marginBottom: 24 }} />
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
