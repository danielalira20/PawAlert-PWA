// src/utils/theme.ts
export const theme = {
  colors: {
    urgency: {
      critical: '#E63946', // Rojo: Casos críticos, alertas importantes
      attention: '#F77F00', // Amarillo: Casos moderados, advertencias
      stable: '#06A77D', // Verde: Casos controlados, confirmaciones
    },
    ui: {
      primary: '#1F77B4', // Azul Primario: Botones principales[cite: 5]
      primaryPressed: '#1A5F8F', // Azul Presionado: Estado activo[cite: 5]
    },
    text: {
      main: '#2C3E50', // Principal[cite: 5]
      secondary: '#7F8C8D', // Texto Secundario[cite: 5]
    },
    background: {
      light: '#ECF0F1', // Fondo Claro[cite: 5]
      white: '#FFFFFF', // Blanco[cite: 5]
    },
    status: {
      error: '#FADBD8', // Error[cite: 5]
      success: '#D5F4E6', // Éxito[cite: 5]
      warning: '#FEF3C7', // Advertencia[cite: 5]
    }
  },
  typography: {
    sizes: {
      h1: 36, //[cite: 5]
      h2: 30, //[cite: 5]
      h3: 24, //[cite: 5]
      h4: 20, //[cite: 5]
      bodyLarge: 18, //[cite: 5]
      body: 16, //[cite: 5]
      small: 14, //[cite: 5]
      label: 12, //[cite: 5]
    },
    weights: {
      regular: '400', //[cite: 5]
      medium: '500', //[cite: 5]
      semiBold: '600', //[cite: 5]
      bold: '700', //[cite: 5]
    }
  },
  spacing: {
    xs: 4, //[cite: 5]
    sm: 8, //[cite: 5]
    md: 16, //[cite: 5]
    lg: 24, //[cite: 5]
    xl: 32, //[cite: 5]
  },
  borderRadius: {
    button: 8, //[cite: 5]
    input: 8, //[cite: 5]
    card: 12, //[cite: 5]
  }
};