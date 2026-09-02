/** Identidad visual del mapa web: una superficie operativa, cálida y serena. */
export const MapTheme = {
  colors: {
    rescueOrange: '#F07C2B',
    rescueOrangePressed: '#D96317',
    aqua: '#4FAFA7',
    canvas: '#F7F5F1',
    surface: '#FFFEFC',
    ink: '#24211E',
    muted: '#756D65',
    subtle: '#A09991',
    hairline: '#E8E3DC',
  },
  radius: {
    control: 12,
    card: 18,
    panel: 24,
    pill: 999,
  },
  shadow: {
    card: '0 2px 10px rgba(50, 39, 29, 0.06)',
    raised: '0 14px 38px rgba(50, 39, 29, 0.14)',
    floating: '0 18px 46px rgba(50, 39, 29, 0.18)',
  },
  motion: {
    quick: 140,
    standard: 280,
    slow: 460,
    apple: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  },
} as const;
