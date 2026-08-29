/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */


import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;



{/* ESTILOS PARA DASHBOARD STAFF*/}

export const Brand = {
  primary: '#EC802B', // naranja — CTAs, acentos principales, stat card hero
  primaryDark: '#D4621A', // para degradados (LinearGradient) con el naranja
  secondary: '#66BCB4', // verde-azulado — acciones positivas, "ver detalle"
  accent: '#EDC55B', // amarillo — destacados, badges medios
  backgroundWarm: '#E8CCAD', // crema — fondo cálido de pantalla
  cardWarm: '#F5EAD8', // crema más claro — fondo de cards sobre el fondo cálido
  textDark: '#2E2A26', // texto principal sobre fondos cálidos
  textMuted: '#7A6A5E', // texto secundario sobre fondos cálidos
  textFaint: '#9B8B7E', // texto terciario (labels chicos)
  danger: '#D94025', // rojo — condición grave, alertas
  info: '#4285F4', // azul — punto "estoy aquí" (ubicación en vivo, personal), sin otro uso hoy
} as const;

export const CondicionColors = {
  estable: Brand.secondary,
  herido: Brand.accent,
  grave: Brand.danger,
} as const;

export type Condicion = keyof typeof CondicionColors;

export const EstadoReporteColors = {
  pendiente: '#94A3B8',
  asignado: Brand.primary,
  en_camino: Brand.secondary,
  en_atencion: Brand.accent,
  cerrado: '#9B8B7E',
  sin_cobertura: Brand.danger,
} as const;

export type EstadoReporte = keyof typeof EstadoReporteColors;

export function normalizeCondicion(raw: string | null | undefined): Condicion | null {
  const v = raw?.toLowerCase().trim();
  if (v === 'estable' || v === 'herido' || v === 'grave') return v;
  return null;
}