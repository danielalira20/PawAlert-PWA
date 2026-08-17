import { fireEvent, render } from '@testing-library/react-native';
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

// Mismo cálculo que formatFechaCorta en el componente. Se recalcula aquí
// en vez de fijar el string a mano porque new Date(iso).toLocaleDateString
// sin timeZone explícito usa la zona horaria de la máquina que corre el
// test -- fijar "Ago 2026" a mano rompe en cualquier máquina/CI en otro
// huso horario donde esa misma fecha ISO cae en otro mes local.
function formatFechaEsperada(iso: string): string {
  const fecha = new Date(iso);
  const mes = fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${fecha.getFullYear()}`;
}

// encontrarImagenes() lee de view.toJSON() -- sirve para inspeccionar
// props (source/style) pero devuelve nodos JSON planos, no instancias
// vivas: fireEvent.press() sobre ellos no hace nada (isInstanceMounted
// falla en silencio). Para presionar un badge hace falta la instancia
// real del árbol de test-renderer, vía view.root.queryAll().
function buscarBadgeVivo(view: { root: any }, fragmentoAsset: string): any {
  return view.root!.queryAll(
    (n: any) => n.type === 'Image' && (n.props.source?.testUri as string | undefined)?.includes(fragmentoAsset),
  )[0];
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

  it('con vigia_comunitario nivel plata, usa la imagen de plata (no cobre/oro) -- el nombre ya NO se muestra en la tarjeta principal, ahora vive solo en el modal', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [{
        id: 'ins-1', rol: 'reportante', codigo_insignia: 'vigia_comunitario',
        nivel: 'plata', progreso: 5,
        obtenido_at: '2026-08-01T00:00:00+00:00', mejorado_at: null,
      }],
    });

    const view = await render(<ReportanteInsigniasCard />);
    await view.findByText('Obtenidas · 1 insignias');

    // Removido a propósito en una iteración de diseño posterior al test
    // original -- el nombre/descripción ya no van en la tarjeta principal.
    expect(view.queryByText('Vigía comunitario')).toBeNull();

    const imagenes = encontrarImagenes(view.toJSON());
    const uris = imagenes.map((img) => img.props.source.testUri as string);
    expect(uris.some((uri) => uri.includes('vigia_comunitario_plata.png'))).toBe(true);
    expect(uris.some((uri) => uri.includes('vigia_comunitario_cobre.png'))).toBe(false);
    expect(uris.some((uri) => uri.includes('vigia_comunitario_oro.png'))).toBe(false);
  });

  it('evidencia_confiable siempre aparece en "Próximas metas" (bloqueada), aunque el backend la reporte como obtenida', async () => {
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

    // El nombre ya no sirve como señal (vive en el modal) -- se confirma
    // por imagen: debe aparecer 2 veces, una sin bloquear en "Obtenidas"
    // (vino en el arreglo de insignias) y otra bloqueada en "Próximas
    // metas" (forzada ahí por CODIGOS_PENDIENTES_DE_BACKEND).
    const imagenes = encontrarImagenes(view.toJSON());
    const evidenciaImgs = imagenes.filter((img) =>
      (img.props.source.testUri as string).includes('evidencia_confiable.png'),
    );
    expect(evidenciaImgs).toHaveLength(2);

    const estaBloqueada = (img: any) => {
      const estilos = Array.isArray(img.props.style) ? img.props.style : [img.props.style];
      return estilos.some((s: any) => s && s.opacity === 0.45);
    };
    expect(evidenciaImgs.filter(estaBloqueada)).toHaveLength(1);
    expect(evidenciaImgs.filter((img) => !estaBloqueada(img))).toHaveLength(1);
  });

  it('las imágenes bloqueadas NO están envueltas en ningún círculo -- imagen plana con opacity reducida, mismo tamaño que las obtenidas', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] }); // sin obtenidas -> las 3 quedan pendientes

    const view = await render(<ReportanteInsigniasCard />);
    await view.findByText('Próximas metas');

    const imagenes = encontrarImagenes(view.toJSON());
    expect(imagenes).toHaveLength(3);
    imagenes.forEach((img) => {
      const estilos = Array.isArray(img.props.style) ? img.props.style : [img.props.style];
      const plano = Object.assign({}, ...estilos);
      expect(plano.width).toBe(180);
      expect(plano.height).toBe(180);
      expect(plano.opacity).toBe(0.45);
    });
  });

  it('al tocar una insignia obtenida con nivel, abre el modal con nombre, nivel, progreso y fecha -- sin "Última mejora" cuando mejorado_at es igual a obtenido_at', async () => {
    const obtenidoAt = '2026-08-01T00:00:00+00:00';
    mockedAxios.get.mockResolvedValueOnce({
      data: [{
        id: 'ins-1', rol: 'reportante', codigo_insignia: 'vigia_comunitario',
        nivel: 'oro', progreso: 15,
        obtenido_at: obtenidoAt, mejorado_at: obtenidoAt,
      }],
    });

    const view = await render(<ReportanteInsigniasCard />);
    expect(view.queryByText('Vigía comunitario')).toBeNull(); // cerrado antes de tocar

    const badge = buscarBadgeVivo(view, 'vigia_comunitario_oro.png');
    await fireEvent.press(badge);

    expect(await view.findByText('Vigía comunitario')).toBeTruthy();
    expect(view.getByText('Nivel: Oro')).toBeTruthy();
    expect(view.getByText('15 reportes válidos en total')).toBeTruthy();
    expect(view.getByText(`✓ Obtenida en ${formatFechaEsperada(obtenidoAt)}`)).toBeTruthy();
    expect(view.queryByText(/Última mejora/)).toBeNull();
  });

  it('al tocar una insignia obtenida sin nivel (impacto_real), usa el formatProgreso de desenlaces y muestra "Última mejora" cuando mejorado_at difiere de obtenido_at', async () => {
    const obtenidoAt = '2026-01-15T00:00:00+00:00';
    const mejoradoAt = '2026-06-15T00:00:00+00:00';
    mockedAxios.get.mockResolvedValueOnce({
      data: [{
        id: 'ins-1', rol: 'reportante', codigo_insignia: 'impacto_real',
        nivel: null, progreso: 3,
        obtenido_at: obtenidoAt, mejorado_at: mejoradoAt,
      }],
    });

    const view = await render(<ReportanteInsigniasCard />);
    const badge = buscarBadgeVivo(view, 'impacto_real.png');
    await fireEvent.press(badge);

    expect(await view.findByText('Impacto real')).toBeTruthy();
    // impacto_real no tiene nivel -> no debe mostrar la línea "Nivel: ..."
    expect(view.queryByText(/^Nivel:/)).toBeNull();
    // formatProgreso distinto del de vigia_comunitario ("desenlace confirmado" vs. "reporte válido")
    expect(view.getByText('3 reportes con desenlace confirmado')).toBeTruthy();
    expect(view.getByText(`✓ Obtenida en ${formatFechaEsperada(obtenidoAt)}`)).toBeTruthy();
    expect(view.getByText(`Última mejora: ${formatFechaEsperada(mejoradoAt)}`)).toBeTruthy();
  });

  it('al tocar una insignia bloqueada (pendiente), el modal muestra "Aún no obtenida" sin fecha ni nivel', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });

    const view = await render(<ReportanteInsigniasCard />);
    const badge = buscarBadgeVivo(view, 'vigia_comunitario_cobre.png');
    await fireEvent.press(badge);

    expect(await view.findByText('Vigía comunitario')).toBeTruthy();
    expect(view.getByText('Aún no obtenida')).toBeTruthy();
    expect(view.queryByText(/Obtenida en/)).toBeNull();
    expect(view.queryByText(/Última mejora/)).toBeNull();
    expect(view.queryByText(/^Nivel:/)).toBeNull();
  });

  it('cierra el modal al tocar "Cerrar"', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    const view = await render(<ReportanteInsigniasCard />);
    const badge = buscarBadgeVivo(view, 'vigia_comunitario_cobre.png');
    await fireEvent.press(badge);
    expect(await view.findByText('Aún no obtenida')).toBeTruthy();

    await fireEvent.press(view.getByText('Cerrar'));
    expect(view.queryByText('Aún no obtenida')).toBeNull();
    expect(view.queryByText('Vigía comunitario')).toBeNull();
  });

  it('cierra el modal al tocar el overlay (fuera de la tarjeta de detalle)', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    const view = await render(<ReportanteInsigniasCard />);
    const badge = buscarBadgeVivo(view, 'vigia_comunitario_cobre.png');
    await fireEvent.press(badge);
    expect(await view.findByText('Aún no obtenida')).toBeTruthy();

    const overlay = view.root!.queryAll(
      (n) => n.type === 'View' && n.props.style?.backgroundColor === 'rgba(46, 42, 38, 0.45)',
    )[0];
    await fireEvent.press(overlay);
    expect(view.queryByText('Aún no obtenida')).toBeNull();
  });
});
