import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { Toast, useToast } from '../components/Toast';
import { router } from 'expo-router';

interface Props {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  telefono: string;
  email?: string;
  onClose: () => void;
  petzen: any;
}

type Paso = 'verificando' | 'prompt' | 'ya_existe' | 'codigo' | 'password';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mismas reglas que valida el backend en /auth/register (validar_password)
function evaluarFortaleza(password: string) {
  return {
    longitud: password.length >= 6,
    mayuscula: /[A-Z]/.test(password),
    numero: /[0-9]/.test(password),
  };
}

function ReglaFortaleza({ cumple, texto, petzen }: { cumple: boolean; texto: string; petzen: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Ionicons
        name={cumple ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={cumple ? '#1F7A70' : petzen.colors.textSecondary}
      />
      <Text style={{ fontSize: 12, color: cumple ? '#1F7A70' : petzen.colors.textSecondary, fontWeight: cumple ? '700' : '400' }}>
        {texto}
      </Text>
    </View>
  );
}

export default function CrearCuentaInvitadoFlow({
  nombre,
  apellidoPaterno,
  apellidoMaterno,
  telefono,
  email,
  onClose,
  petzen,
}: Props) {
  const { login } = useAuth();
  const { toast, translateY, showToast } = useToast();

  const [paso, setPaso] = useState<Paso>('verificando');
  const [codigoTelefono, setCodigoTelefono] = useState('');
  const [emailCuenta, setEmailCuenta] = useState(email || '');
  const [passwordCuenta, setPasswordCuenta] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [erroresCuenta, setErroresCuenta] = useState<{ email?: string; password?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Al montar, verificamos si este teléfono ya tiene una cuenta REAL antes
  // de ofrecer "crear cuenta" — evita gastar un SMS y confundir a alguien
  // que ya se registró antes.
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/telefono-existe`, { params: { telefono } });
        setPaso(res.data.existe_cuenta ? 'ya_existe' : 'prompt');
      } catch {
        setPaso('prompt'); // si falla la consulta, no bloqueamos — dejamos seguir normal
      }
    })();
  }, [telefono]);

  const fortaleza = evaluarFortaleza(passwordCuenta);
  const cumpleTodasLasReglas = fortaleza.longitud && fortaleza.mayuscula && fortaleza.numero;

  const handleEnviarCodigo = async () => {
    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/enviar-codigo-telefono`, { telefono });
      showToast({ type: 'success', title: 'Código enviado', message: 'Revisa tus mensajes SMS.' });
      setPaso('codigo');
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: err?.response?.data?.detail || 'No pudimos enviar el código.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerificarCodigo = async () => {
    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/verificar-codigo-telefono`, { telefono, codigo: codigoTelefono });
      setPaso('password');
    } catch (err: any) {
      showToast({ type: 'error', title: 'Código inválido', message: err?.response?.data?.detail || 'Intenta de nuevo.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCrearCuenta = async () => {
    const nuevosErrores: { email?: string; password?: string } = {};
    if (!emailCuenta.trim() || !EMAIL_REGEX.test(emailCuenta.trim())) {
      nuevosErrores.email = 'Ingresa un correo electrónico válido.';
    }
    if (!cumpleTodasLasReglas) {
      nuevosErrores.password = 'La contraseña no cumple con los requisitos.';
    }
    setErroresCuenta(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/register`, {
        email: emailCuenta.trim(),
        password: passwordCuenta,
        nombre,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno || undefined,
        telefono,
      });
      await login(emailCuenta.trim(), passwordCuenta);
      showToast({ type: 'success', title: '¡Listo!', message: 'Tu cuenta fue creada correctamente.' });
      setTimeout(onClose, 800);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: err?.response?.data?.detail || 'No pudimos crear tu cuenta.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: petzen.colors.background, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <Toast toast={toast} translateY={translateY} />

      {paso === 'verificando' && <ActivityIndicator color={petzen.colors.orange} />}

      {paso === 'ya_existe' && (
        <>
          <Text style={{ fontFamily: petzen.fonts.extraBold, fontSize: 22, color: petzen.colors.textDark, textAlign: 'center', marginBottom: 12 }}>
            Ya tienes una cuenta
          </Text>
          <Text style={{ fontFamily: petzen.fonts.regular, fontSize: 15, color: petzen.colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            Ya existe una cuenta con este número de teléfono. Inicia sesión para ver tu historial completo.
          </Text>

          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push('/login' as any);
            }}
            style={{ backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: petzen.radii.pill, alignItems: 'center', width: '100%', marginBottom: 12 }}
          >
            <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Iniciar sesión</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12 }}>
            <Text style={{ fontFamily: petzen.fonts.medium, color: petzen.colors.textSecondary, fontSize: 14 }}>Entendido</Text>
          </TouchableOpacity>
        </>
      )}

      {paso === 'prompt' && (
        <>
          <Text style={{ fontFamily: petzen.fonts.extraBold, fontSize: 24, color: petzen.colors.textDark, textAlign: 'center', marginBottom: 12 }}>
            ¿Quieres crear tu cuenta?
          </Text>
          <Text style={{ fontFamily: petzen.fonts.regular, fontSize: 15, color: petzen.colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            Guarda tu historial de reportes y accede a más funciones de PawAlert.
          </Text>
          <TouchableOpacity
            onPress={handleEnviarCodigo}
            disabled={isSubmitting}
            style={{ backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: petzen.radii.pill, alignItems: 'center', marginBottom: 12, width: '100%' }}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Sí, crear cuenta</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12 }}>
            <Text style={{ fontFamily: petzen.fonts.medium, color: petzen.colors.textSecondary, fontSize: 14 }}>Ahora no</Text>
          </TouchableOpacity>
        </>
      )}

      {paso === 'codigo' && (
        <>
          <Text style={{ fontFamily: petzen.fonts.extraBold, fontSize: 22, color: petzen.colors.textDark, textAlign: 'center', marginBottom: 8 }}>
            Verifica tu número
          </Text>
          <Text style={{ fontFamily: petzen.fonts.regular, fontSize: 14, color: petzen.colors.textSecondary, textAlign: 'center', marginBottom: 24 }}>
            Te enviamos un código de 6 dígitos a {telefono}
          </Text>
          <TextInput
            value={codigoTelefono}
            onChangeText={(v) => setCodigoTelefono(v.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, fontSize: 22, letterSpacing: 8, textAlign: 'center', width: '100%', marginBottom: 20 }}
          />
          <TouchableOpacity
            onPress={handleVerificarCodigo}
            disabled={isSubmitting}
            style={{ backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: petzen.radii.pill, alignItems: 'center', width: '100%' }}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Verificar código</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleEnviarCodigo} disabled={isSubmitting} style={{ paddingVertical: 14 }}>
            <Text style={{ fontFamily: petzen.fonts.medium, color: petzen.colors.textSecondary, fontSize: 13 }}>
              ¿No te llegó? Reenviar código
            </Text>
          </TouchableOpacity>
        </>
      )}

      {paso === 'password' && (
        <>
          <Text style={{ fontFamily: petzen.fonts.extraBold, fontSize: 22, color: petzen.colors.textDark, textAlign: 'center', marginBottom: 20 }}>
            Completa tu cuenta
          </Text>

          {!email?.trim() && (
            <>
              <TextInput
                value={emailCuenta}
                onChangeText={(v) => {
                  setEmailCuenta(v);
                  if (v.trim() && !EMAIL_REGEX.test(v.trim())) {
                    setErroresCuenta((prev) => ({ ...prev, email: 'Ingresa un correo electrónico válido.' }));
                  } else {
                    setErroresCuenta((prev) => ({ ...prev, email: '' }));
                  }
                }}
                placeholder="Tu correo electrónico"
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: erroresCuenta.email ? '#E74C3C' : '#E5E7EB',
                  borderRadius: 14,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  fontSize: 15,
                  width: '100%',
                  marginBottom: erroresCuenta.email ? 6 : 16,
                }}
              />
              {erroresCuenta.email ? (
                <Text style={{ color: '#E74C3C', fontSize: 12, fontWeight: '600', marginBottom: 16 }}>{erroresCuenta.email}</Text>
              ) : null}
            </>
          )}

          <View style={{ width: '100%', position: 'relative', marginBottom: 12 }}>
            <TextInput
              value={passwordCuenta}
              onChangeText={(v) => {
                setPasswordCuenta(v);
                setErroresCuenta((prev) => ({ ...prev, password: '' }));
              }}
              placeholder="Crea una contraseña"
              secureTextEntry={!mostrarPassword}
              style={{
                borderWidth: 1,
                borderColor: erroresCuenta.password ? '#E74C3C' : '#E5E7EB',
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
                paddingRight: 46,
                fontSize: 15,
                width: '100%',
              }}
            />
            <TouchableOpacity
              onPress={() => setMostrarPassword((v) => !v)}
              style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
              hitSlop={8}
            >
              <Ionicons
                name={mostrarPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={petzen.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <View style={{ backgroundColor: '#F3F4F6', borderRadius: 14, padding: 14, width: '100%', marginBottom: 24 }}>
            <ReglaFortaleza cumple={fortaleza.longitud} texto="Al menos 6 caracteres" petzen={petzen} />
            <ReglaFortaleza cumple={fortaleza.mayuscula} texto="Al menos una letra mayúscula" petzen={petzen} />
            <ReglaFortaleza cumple={fortaleza.numero} texto="Al menos un número" petzen={petzen} />
          </View>

          <TouchableOpacity
            onPress={handleCrearCuenta}
            disabled={isSubmitting}
            style={{ backgroundColor: petzen.colors.orange, paddingVertical: 16, borderRadius: petzen.radii.pill, alignItems: 'center', width: '100%' }}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: petzen.fonts.bold, color: '#FFFFFF', fontSize: 16 }}>Crear mi cuenta</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}