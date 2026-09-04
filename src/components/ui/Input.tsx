import React, { useState } from 'react';
import { Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends TextInputProps {
  label?: string; // Label opcional[cite: 5]
  error?: string; // Error opcional[cite: 5]Card.tsx
  required?: boolean; // Required opcional[cite: 5]
}

export const Input: React.FC<InputProps> = ({ label, error, required, secureTextEntry, style, maxLength, multiline, ...props }) => {
  // Ojito para mostrar/ocultar contraseña — solo aparece cuando el campo
  // ya venía marcado con secureTextEntry (ej. AssociationFormScreen), así
  // que ningún otro Input existente cambia de comportamiento.
  const [mostrarTexto, setMostrarTexto] = useState(false);
  const esCampoPassword = !!secureTextEntry;

  return (
    <View className="w-full mb-4">
      {label && (
        <Text className="text-text-dark font-semibold text-sm mb-1.5">
          {label}
          {required && <Text className="text-urgency-high">{' *'}</Text>}
        </Text>
      )}
      {/* Altura mínima: 44dp[cite: 5] */}
      <View className="w-full" style={{ position: 'relative', justifyContent: 'center' }}>
        <TextInput
          accessibilityLabel={props.accessibilityLabel ?? label}
          accessibilityHint={error || props.accessibilityHint}
          placeholderTextColor="#7F8C8D"
          className={`w-full bg-brand-white px-4 py-3 rounded-button border text-base text-text-dark min-h-[44px]
            ${error ? 'border-urgency-high' : 'border-brand-lightBg focus:border-primary-500'}`}
          style={[esCampoPassword ? { paddingRight: 44 } : undefined, style]}
          secureTextEntry={esCampoPassword && !mostrarTexto}
          multiline={multiline}
          maxLength={maxLength ?? (esCampoPassword ? 128 : multiline ? 4000 : 254)}
          {...props}
        />
        {esCampoPassword && (
          <TouchableOpacity
            onPress={() => setMostrarTexto((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={mostrarTexto ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={mostrarTexto ? 'eye-off' : 'eye'} size={20} color="#7F8C8D" />
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text accessibilityLiveRegion="polite" className="text-urgency-high text-xs mt-1 font-medium">
           {error}
        </Text>
      )}
    </View>
  );
};
