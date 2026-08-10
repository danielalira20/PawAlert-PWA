import { render, waitFor } from '@testing-library/react-native';
import axios from 'axios';

import { SaldoReputacionCard } from '../components/profile/SaldoReputacionCard';
import { useAuth } from '../context/AuthContext';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
// `@expo/vector-icons` está declarado como dependencia de `expo` pero no
// existe físicamente en node_modules en este entorno (gap de instalación
// preexistente, no relacionado con este componente) -- se mockea al
// límite del módulo para no depender de que se resuelva de verdad.
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseAuth = useAuth as jest.Mock;

// El árbol de test-renderer conserva el `type` de los componentes nativos de
// RN (ActivityIndicator, Image, etc.) tal cual -- ver assetFileTransformer/
// jest-preset de react-native. Se usa para confirmar que el ActivityIndicator
// realmente está montado, sin depender de las queries UNSAFE_* (removidas en
// @testing-library/react-native v14).
function encontrarPorTipo(nodo: any, tipo: string): any[] {
  if (!nodo) return [];
  const raiz = Array.isArray(nodo) ? nodo : [nodo];
  return raiz.flatMap((n) => {
    const propio = n.type === tipo ? [n] : [];
    const hijos = (n.children || []).flatMap((hijo: any) => encontrarPorTipo(hijo, tipo));
    return [...propio, ...hijos];
  });
}

describe('SaldoReputacionCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: 'token-prueba', isLoggedIn: true });
  });

  it('muestra el ActivityIndicator mientras carga', async () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {})); // nunca resuelve

    const view = await render(<SaldoReputacionCard rol="reportante" />);

    expect(encontrarPorTipo(view.toJSON(), 'ActivityIndicator')).toHaveLength(1);
    expect(view.queryByText('Tus puntos')).toBeNull();
  });

  it('con saldo y sin restricción activa, muestra "Tus puntos" y el número, sin aviso', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        roles: [{
          rol: 'reportante', saldo_disponible: 70, saldo_reservado: 30,
          saldo_total: 100, restriccion_activa: false, mensaje_restriccion: null,
        }],
      },
    });

    const view = await render(<SaldoReputacionCard rol="reportante" />);

    expect(await view.findByText('Tus puntos')).toBeTruthy();
    expect(view.getByText('70 pts')).toBeTruthy();
  });

  it('con restriccion_activa y mensaje_restriccion, muestra el mensaje tal cual', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        roles: [{
          rol: 'voluntario_externo', saldo_disponible: 5, saldo_reservado: 0,
          saldo_total: 5, restriccion_activa: true,
          mensaje_restriccion: 'No puedes recibir nuevas asignaciones por ahora. Puedes finalizar tus casos activos.',
        }],
      },
    });

    const view = await render(<SaldoReputacionCard rol="voluntario_externo" />);

    expect(
      await view.findByText('No puedes recibir nuevas asignaciones por ahora. Puedes finalizar tus casos activos.'),
    ).toBeTruthy();
  });

  it('sin datos (saldo=null tras error), no renderiza nada visible', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network error'));

    const view = await render(<SaldoReputacionCard rol="reportante" />);

    await waitFor(() => {
      expect(encontrarPorTipo(view.toJSON(), 'ActivityIndicator')).toHaveLength(0);
    });
    expect(view.toJSON()).toBeNull();
  });
});
