jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// React 19 usa esta señal para envolver correctamente las actualizaciones
// asíncronas de componentes dentro de `act` durante las pruebas.
global.IS_REACT_ACT_ENVIRONMENT = true;
