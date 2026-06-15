import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger'; 
  isLoading?: boolean; // Estado loading[cite: 5]
  disabled?: boolean; // Estado disabled[cite: 5]
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
}) => {
  // Altura mínima: 44dp para accesibilidad táctil[cite: 5]
  const baseStyle = "w-full py-3.5 px-4 rounded-button flex-row justify-center items-center min-h-[44px]";
  
  const variantStyles = {
    primary: "bg-primary-500 active:bg-primary-600",
    secondary: "bg-brand-lightBg active:bg-gray-300",
    success: "bg-urgency-low active:bg-emerald-700",
    danger: "bg-urgency-high active:bg-red-700",
  };

  const textStyles = {
    primary: "text-brand-white",
    secondary: "text-text-dark",
    success: "text-brand-white",
    danger: "text-brand-white",
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isLoading}
      className={`${baseStyle} ${variantStyles[variant]} ${disabled ? 'opacity-40' : ''}`}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#2C3E50' : '#FFFFFF'} />
      ) : (
        <Text className={`${textStyles[variant]} font-semibold text-base text-center`}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};