import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../constants/api';
import { Toast, useToast } from '../components/Toast';

const COLORS = {
  bgTeal: '#66BCB4',
  bgWhite: '#FFFFFF',
  primary: '#EC802B',
  secondary: '#EDC55B',
  textDark: '#4A3728',
  textLight: '#8C7A6B',
  danger: '#E74C3C',
  success: '#1F7A70',
  grayLight: '#F3F4F6',
  border: '#E5E7EB',
};

const FORM_MAX_WIDTH = 460;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Paso = 'correo' | 'codigo' | 'nueva_password';

interface Props {
  visible?: boolean;
  onClose?: () => void;
}

function evaluarFortaleza(password: string) {
  return {
    longitud: password.length >= 6,
    mayuscula: /[A-Z]/.test(password),
    numero: /[0-9]/.test(password),
  };
}

function ReglaFortaleza({ cumple, texto }: { cumple: boolean; texto: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Ionicons
        name={cumple ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={cumple ? COLORS.success : COLORS.textLight}
      />
      <Text style={{ fontSize: 12, color: cumple ? COLORS.success : COLORS.textLight, fontWeight: cumple ? '700' : '500' }}>
        {texto}
      </Text>
    </View>
  );
}

export default function ForgotPasswordFlowScreen({ visible = true, onClose }: Props) {
  const { toast, translateY, showToast } = useToast();

  const [paso, setPaso] = useState<Paso>('correo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');

  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);

  const [sesionTemporal, setSesionTemporal] = useState<{
    accessToken: string;
    refreshToken: string;
  } | null>(null);

  const fortaleza = evaluarFortaleza(nuevaPassword);
  const cumpleTodasLasReglas = fortaleza.longitud && fortaleza.mayuscula && fortaleza.numero;

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const handleEnviarCodigo = async () => {
    const nuevosErrores: { [key: string]: string } = {};
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      nuevosErrores.email = 'Ingresa un correo electrónico válido.';
    }
    setErrors(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email: email.trim() });
      setCodigo('');
      setSesionTemporal(null);
      showToast({
        type: 'success',
        title: 'Revisa tu correo',
        message: 'Si el correo existe, te enviamos un código de 8 dígitos.',
      });
      setPaso('codigo');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message: err?.response?.data?.detail || 'No pudimos procesar tu solicitud. Intenta de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerificarCodigo = async () => {
    const nuevosErrores: { [key: string]: string } = {};
    const codigoLimpio = codigo.trim();
    if (codigoLimpio.length !== 8 || !/^\d{8}$/.test(codigoLimpio)) {
      nuevosErrores.codigo = 'El código debe tener exactamente 8 dígitos.';
    }
    setErrors(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    setIsSubmitting(true);
    try {
      const res = await axios.post(`${API_URL}/auth/verify-reset-code`, {
        email: email.trim(),
        codigo: codigoLimpio,
      });
      setSesionTemporal({
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
      });
      setPaso('nueva_password');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Código inválido',
        message: err?.response?.data?.detail || 'El código no es válido o ya expiró.',
      });
      setCodigo('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestablecer = async () => {
    const nuevosErrores: { [key: string]: string } = {};
    if (!cumpleTodasLasReglas) {
      nuevosErrores.nuevaPassword = 'La contraseña no cumple con los requisitos.';
    }
    if (confirmarPassword !== nuevaPassword) {
      nuevosErrores.confirmarPassword = 'Las contraseñas no coinciden.';
    }
    setErrors(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    if (!sesionTemporal) {
      showToast({
        type: 'error',
        title: 'Sesión expirada',
        message: 'Tu verificación expiró. Solicita un nuevo código.',
      });
      setPaso('correo');
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        access_token: sesionTemporal.accessToken,
        refresh_token: sesionTemporal.refreshToken,
        nueva_password: nuevaPassword,
      });
      showToast({
        type: 'success',
        title: '¡Listo!',
        message: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.',
      });
      setNuevaPassword('');
      setConfirmarPassword('');
      setCodigo('');
      setSesionTemporal(null);
      setTimeout(() => {
        if (onClose) onClose();
        router.replace('/login' as any);
      }, 1200);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Error',
        message:
          err?.response?.data?.detail ||
          'No se pudo restablecer la contraseña. El código pudo haber expirado.',
      });
      setNuevaPassword('');
      setConfirmarPassword('');
      setSesionTemporal(null);
      setPaso('correo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tituloPorPaso: Record<Paso, string> = {
    correo: '¿Olvidaste tu contraseña?',
    codigo: 'Revisa tu correo',
    nueva_password: 'Nueva contraseña',
  };

  const subtituloPorPaso: Record<Paso, string> = {
    correo: 'Escribe tu correo y te enviaremos un código.',
    codigo: `Código de 8 dígitos enviado a ${email.trim()}.`,
    nueva_password: 'Escribe y confirma tu nueva contraseña.',
  };

  if (!visible) return null;

  return (
    <View
      style={
        [
          {
            position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            ...(Platform.OS === 'web'
              ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }
              : {}),
          },
        ] as any
      }
    >
      <Toast toast={toast} translateY={translateY} />

      <View style={{ width: '100%', maxWidth: FORM_MAX_WIDTH, maxHeight: '90%', alignSelf: 'center' }}>
        <View
          style={{
            backgroundColor: COLORS.bgWhite,
            borderRadius: 32,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 15,
          }}
        >
          <View
            style={{
              paddingHorizontal: 28,
              paddingTop: 26,
              paddingBottom: 40,
              backgroundColor: COLORS.bgTeal,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                zIndex: 10,
              }}
            >
              <View style={{ flex: 1, zIndex: 10, paddingRight: 12 }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.bgWhite }}>
                  {tituloPorPaso[paso]}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.bgWhite, opacity: 0.9, marginTop: 6, lineHeight: 18 }}>
                  {subtituloPorPaso[paso]}
                </Text>
              </View>
              <TouchableOpacity
                onPress={paso === 'correo' ? handleClose : () => setPaso('correo')}
                style={{ backgroundColor: 'rgba(255,255,255,0.3)', padding: 8, borderRadius: 20, zIndex: 10 }}
              >
                <Ionicons name={paso === 'correo' ? 'close' : 'arrow-back'} size={22} color={COLORS.bgWhite} />
              </TouchableOpacity>
            </View>

            <Image
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3047/3047928.png' }}
              style={{ width: 80, height: 80, position: 'absolute', bottom: -16, right: 24, opacity: 0.35, zIndex: 0 }}
              resizeMode="contain"
            />
          </View>

          <ScrollView
            style={{
              backgroundColor: COLORS.bgWhite,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              marginTop: -20,
            }}
            contentContainerStyle={{ padding: 28, paddingTop: 30 }}
            showsVerticalScrollIndicator={false}
          >
            {paso === 'correo' && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>
                  Correo electrónico
                </Text>
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  placeholder="tucorreo@ejemplo.com"
                  placeholderTextColor={COLORS.textLight}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  maxLength={254}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.email ? COLORS.danger : COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 15,
                    color: COLORS.textDark,
                    marginBottom: errors.email ? 6 : 20,
                  }}
                />
                {errors.email && (
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '600', marginBottom: 16 }}>
                    {errors.email}
                  </Text>
                )}

                <TouchableOpacity
                  onPress={handleEnviarCodigo}
                  disabled={isSubmitting}
                  style={{
                    backgroundColor: COLORS.primary,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.bgWhite} />
                  ) : (
                    <Text style={{ color: COLORS.bgWhite, fontWeight: '800', fontSize: 15 }}>Enviar código</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {paso === 'codigo' && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>
                  Código de 8 dígitos
                </Text>
                <TextInput
                  value={codigo}
                  onChangeText={(v) => {
                    setCodigo(v.replace(/[^0-9]/g, '').slice(0, 8));
                    setErrors((prev) => ({ ...prev, codigo: '' }));
                  }}
                  placeholder="00000000"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad"
                  maxLength={8}
                  style={{
                    borderWidth: 1,
                    borderColor: errors.codigo ? COLORS.danger : COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    fontSize: 22,
                    letterSpacing: 8,
                    textAlign: 'center',
                    color: COLORS.textDark,
                    fontWeight: '800',
                    marginBottom: errors.codigo ? 6 : 20,
                  }}
                />
                {errors.codigo && (
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '600', marginBottom: 16 }}>
                    {errors.codigo}
                  </Text>
                )}

                <TouchableOpacity
                  onPress={handleVerificarCodigo}
                  disabled={isSubmitting}
                  style={{
                    backgroundColor: COLORS.primary,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.bgWhite} />
                  ) : (
                    <Text style={{ color: COLORS.bgWhite, fontWeight: '800', fontSize: 15 }}>Verificar código</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={handleEnviarCodigo} style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.textLight, fontSize: 13, fontWeight: '600' }}>
                    ¿No te llegó? Reenviar código
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {paso === 'nueva_password' && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>
                  Nueva contraseña
                </Text>
                <View style={{ position: 'relative', marginBottom: 12 }}>
                  <TextInput
                  value={nuevaPassword}
                  maxLength={128}
                    onChangeText={(v) => {
                      setNuevaPassword(v);
                      setErrors((prev) => ({
                        ...prev,
                        nuevaPassword: '',
                        confirmarPassword:
                          confirmarPassword && confirmarPassword !== v ? 'Las contraseñas no coinciden.' : '',
                      }));
                    }}
                    placeholder="Escribe tu nueva contraseña"
                    placeholderTextColor={COLORS.textLight}
                    secureTextEntry={!mostrarNueva}
                    style={{
                      borderWidth: 1,
                      borderColor: errors.nuevaPassword ? COLORS.danger : COLORS.border,
                      borderRadius: 14,
                      paddingHorizontal: 16,
                      paddingRight: 46,
                      paddingVertical: 14,
                      fontSize: 15,
                      color: COLORS.textDark,
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => setMostrarNueva((v) => !v)}
                    style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={mostrarNueva ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={COLORS.textLight}
                    />
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    backgroundColor: COLORS.grayLight,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <ReglaFortaleza cumple={fortaleza.longitud} texto="Al menos 6 caracteres" />
                  <ReglaFortaleza cumple={fortaleza.mayuscula} texto="Al menos una letra mayúscula" />
                  <ReglaFortaleza cumple={fortaleza.numero} texto="Al menos un número" />
                </View>

                {errors.nuevaPassword && (
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '600', marginBottom: 10, marginTop: -8 }}>
                    {errors.nuevaPassword}
                  </Text>
                )}

                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>
                  Confirmar contraseña
                </Text>
                <View style={{ position: 'relative', marginBottom: errors.confirmarPassword ? 6 : 8 }}>
                  <TextInput
                  value={confirmarPassword}
                  maxLength={128}
                    onChangeText={(v) => {
                      setConfirmarPassword(v);
                      setErrors((prev) => ({
                        ...prev,
                        confirmarPassword: v && v !== nuevaPassword ? 'Las contraseñas no coinciden.' : '',
                      }));
                    }}
                    placeholder="Repite tu nueva contraseña"
                    placeholderTextColor={COLORS.textLight}
                    secureTextEntry={!mostrarConfirmar}
                    style={{
                      borderWidth: 1,
                      borderColor: errors.confirmarPassword
                        ? COLORS.danger
                        : confirmarPassword && confirmarPassword === nuevaPassword
                        ? COLORS.success
                        : COLORS.border,
                      borderRadius: 14,
                      paddingHorizontal: 16,
                      paddingRight: 46,
                      paddingVertical: 14,
                      fontSize: 15,
                      color: COLORS.textDark,
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => setMostrarConfirmar((v) => !v)}
                    style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={mostrarConfirmar ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={COLORS.textLight}
                    />
                  </TouchableOpacity>
                </View>
                {errors.confirmarPassword ? (
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '600', marginBottom: 16 }}>
                    {errors.confirmarPassword}
                  </Text>
                ) : confirmarPassword && confirmarPassword === nuevaPassword ? (
                  <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: '600', marginBottom: 16 }}>
                    ✓ Las contraseñas coinciden.
                  </Text>
                ) : (
                  <View style={{ marginBottom: 16 }} />
                )}

                <TouchableOpacity
                  onPress={handleRestablecer}
                  disabled={isSubmitting}
                  style={{
                    backgroundColor: COLORS.primary,
                    borderRadius: 18,
                    paddingVertical: 16,
                    alignItems: 'center',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.bgWhite} />
                  ) : (
                    <Text style={{ color: COLORS.bgWhite, fontWeight: '800', fontSize: 15 }}>
                      Restablecer contraseña
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
