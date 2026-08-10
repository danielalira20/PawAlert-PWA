import { render } from '@testing-library/react-native';
import axios from 'axios';

import { ReportanteInsigniasCard } from '../components/profile/ReportanteInsigniasCard';
import { useAuth } from '../context/AuthContext';

jest.mock('axios');
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedUseAuth = useAuth as jest.Mock;

// Ver SaldoReputacionCard.test.tsx: el árbol de test-renderer conserva el
// `type` de los host components de RN, así que se puede confirmar qué
// asset exacto (require) resolvió cada <Image> sin usar las queries
// UNSAFE_* (removidas en @testing-library/react-native v14) -- basta con
// inspeccionar `props.source.testUri` (mock de assetFileTransformer).
function encontrarImagenes(nodo: any): any[] {
  if (!nodo) return [];
  const raiz = Array.isArray(nodo) ? nodo : [nodo];
  return raiz.flatMap((n) => {
    const propia = n.type === 'Image' ? [n] : [];
    const hijas = (n.children || []).flatMap((hijo: any) => encontrarImagenes(hijo));
    return [...propia, ...hijas];
  });
}

describe('ReportanteInsigniasCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ token: 'token-prueba', isLoggedIn: true });
  });

  it('sin insignias obtenidas, muestra el texto de estado vacío', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });

    const view = await render(<ReportanteInsigniasCard />);

    expect(
      await view.findByText('Todavía no tienes insignias — sigue reportando para desbloquear la primera.'),
    ).toBeTruthy();
  });

  it('con vigia_comunitario nivel plata, renderiza "Vigía comunitario" y usa la imagen de plata (no cobre/oro)', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [{
        id: 'ins-1', rol: 'reportante', codigo_insignia: 'vigia_comunitario',
        nivel: 'plata', progreso: 5,
        obtenido_at: '2026-08-01T00:00:00+00:00', mejorado_at: null,
      }],
    });

    const view = await render(<ReportanteInsigniasCard />);

    expect(await view.findByText('Vigía comunitario')).toBeTruthy();

    const imagenes = encontrarImagenes(view.toJSON());
    const uris = imagenes.map((img) => img.props.source.testUri as string);
    expect(uris.some((uri) => uri.includes('vigia_comunitario_plata.png'))).toBe(true);
    expect(uris.some((uri) => uri.includes('vigia_comunitario_cobre.png'))).toBe(false);
    expect(uris.some((uri) => uri.includes('vigia_comunitario_oro.png'))).toBe(false);
  });

  it('evidencia_confiable siempre aparece en "Próximas metas", aunque venga como obtenida', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        {
          id: 'ins-1', rol: 'reportante', codigo_insignia: 'vigia_comunitario',
          nivel: 'cobre', progreso: 1,
          obtenido_at: '2026-08-01T00:00:00+00:00', mejorado_at: null,
        },
        // codigo_insignia bloqueado a propósito (CODIGOS_PENDIENTES_DE_BACKEND
        // en el propio componente) -- aunque el backend la reporte como
        // obtenida, la UI la sigue mostrando como "próxima meta".
        {
          id: 'ins-2', rol: 'reportante', codigo_insignia: 'evidencia_confiable',
          nivel: null, progreso: 5,
          obtenido_at: '2026-08-01T00:00:00+00:00', mejorado_at: null,
        },
      ],
    });

    const view = await render(<ReportanteInsigniasCard />);

    expect(await view.findByText('Próximas metas')).toBeTruthy();
    // Comportamiento intencional (CODIGOS_PENDIENTES_DE_BACKEND): como el
    // componente no excluye evidencia_confiable de "Obtenidas" cuando el
    // backend la reporta como obtenida, aparece en las DOS secciones a la
    // vez -- una vez porque vino en el arreglo de insignias, y otra porque
    // el código está forzado a seguir en `pendientes`.
    expect(view.getAllByText('Evidencia confiable')).toHaveLength(2);
  });
});
