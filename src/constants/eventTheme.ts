import { Brand } from './theme';

/**
 * Tokens del módulo de eventos. Derivan de la identidad visual que ya usan
 * AssociationStatusScreen y MapScreen; no constituyen una paleta paralela.
 */
export const EventTheme = {
  colors: {
    primary: Brand.primary,
    primaryDark: Brand.primaryDark,
    secondary: Brand.secondary,
    accent: Brand.accent,
    background: '#FAF7F2',
    surface: '#FFFFFF',
    surfaceWarm: Brand.cardWarm,
    border: '#EADCCB',
    text: Brand.textDark,
    textMuted: Brand.textMuted,
    textFaint: Brand.textFaint,
    danger: Brand.danger,
    success: Brand.secondary,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radii: {
    chip: 30,
    control: 16,
    card: 24,
    sheet: 24,
  },
  typography: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semiBold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
    extraBold: 'Poppins_800ExtraBold',
  },
  layout: {
    maxContentWidth: 900,
    minimumTouchTarget: 44,
  },
} as const;

