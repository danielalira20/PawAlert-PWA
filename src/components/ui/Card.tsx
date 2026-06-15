import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  variant?: 'default' | 'success' | 'warning' | 'danger'; 
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ variant = 'default', children, className = '', ...props }) => {
  const variantStyles = {
    default: "bg-brand-white border border-brand-lightBg",
    success: "bg-brand-successLight border border-urgency-low",
    warning: "bg-brand-warningLight border border-urgency-medium",
    danger: "bg-brand-errorLight border border-urgency-high",
  };

  return (
    <View 
      className={`p-4 rounded-card shadow-sm mb-4 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </View>
  );
};