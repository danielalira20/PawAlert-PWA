import React from 'react';
import { Text, TextInput, TextInputProps, View } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string; // Label opcional[cite: 5]
  error?: string; // Error opcional[cite: 5]Card.tsx
  required?: boolean; // Required opcional[cite: 5]
}

export const Input: React.FC<InputProps> = ({ label, error, required, ...props }) => {
  return (
    <View className="w-full mb-4">
      {label && (
        <Text className="text-text-dark font-semibold text-sm mb-1.5">
          {label} {required && <Text className="text-urgency-high">*</Text>}
        </Text>
      )}
      {/* Altura mínima: 44dp[cite: 5] */}
      <TextInput
        placeholderTextColor="#7F8C8D"
        className={`w-full bg-brand-white px-4 py-3 rounded-button border text-base text-text-dark min-h-[44px]
          ${error ? 'border-urgency-high' : 'border-brand-lightBg focus:border-primary-500'}`}
        {...props}
      />
      {error && (
        <Text className="text-urgency-high text-xs mt-1 font-medium">
           {error}
        </Text>
      )}
    </View>
  );
};