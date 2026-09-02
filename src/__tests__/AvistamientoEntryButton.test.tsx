import { fireEvent, render } from '@testing-library/react-native';

import {
  AvistamientoEntryButton,
  puedeRegistrarAvistamiento,
} from '../components/avistamientos/AvistamientoEntryButton';

const mockPush = jest.fn();
let mockUsuario: any = null;

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUsuario }),
}));

const REPORTE = {
  id: 'rep-1',
  usuario_id: 'user-reportante',
  staff_asignado_id: 'user-voluntario-asignado',
  asociacion_asignada_id: 'aso-1',
};

describe('puedeRegistrarAvistamiento — visibilidad por rol', () => {
  it('oculta el punto de entrada al voluntario asignado (su camino son los hitos)', () => {
    expect(
      puedeRegistrarAvistamiento(REPORTE, {
        id: 'user-voluntario-asignado',
        rol: 'voluntario_interno',
      }),
    ).toBe(false);
  });

  it('lo muestra al reportante dueño del caso', () => {
    expect(
      puedeRegistrarAvistamiento(REPORTE, { id: 'user-reportante', rol: 'reportante' }),
    ).toBe(true);
  });

  it('lo muestra a la asociación coordinadora del caso', () => {
    expect(
      puedeRegistrarAvistamiento(REPORTE, {
        id: 'user-aso',
        rol: 'asociacion',
        asociacion_id: 'aso-1',
      }),
    ).toBe(true);
  });

  it('lo oculta a una asociación distinta a la asignada', () => {
    expect(
      puedeRegistrarAvistamiento(REPORTE, {
        id: 'user-aso',
        rol: 'asociacion',
        asociacion_id: 'aso-OTRA',
      }),
    ).toBe(false);
  });

  it('lo oculta a la asociación vieja de un caso ya reasignado a otra', () => {
    // El panel de la asociación aso-1 sigue mostrando este caso por una fila
    // histórica de asignación, pero la coordinadora vigente es aso-2.
    const reasignado = { ...REPORTE, asociacion_asignada_id: 'aso-2' };
    expect(
      puedeRegistrarAvistamiento(reasignado, {
        id: 'user-aso',
        rol: 'asociacion',
        asociacion_id: 'aso-1',
      }),
    ).toBe(false);
  });

  it('lo muestra al voluntario externo verificado', () => {
    expect(
      puedeRegistrarAvistamiento(REPORTE, { id: 'user-ext', rol: 'voluntario_externo' }),
    ).toBe(true);
  });

  it('lo oculta a un rol no relacionado con el caso', () => {
    expect(
      puedeRegistrarAvistamiento(REPORTE, { id: 'user-otro', rol: 'reportante' }),
    ).toBe(false);
  });

  it('lo oculta cuando no hay sesión', () => {
    expect(puedeRegistrarAvistamiento(REPORTE, null)).toBe(false);
  });

  it('prioriza "voluntario asignado" aunque además sea el dueño del reporte', () => {
    expect(
      puedeRegistrarAvistamiento(
        { ...REPORTE, usuario_id: 'user-doble', staff_asignado_id: 'user-doble' },
        { id: 'user-doble', rol: 'voluntario_interno' },
      ),
    ).toBe(false);
  });
});

describe('AvistamientoEntryButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsuario = null;
  });

  it('no renderiza nada para el voluntario asignado', async () => {
    mockUsuario = { id: 'user-voluntario-asignado', rol: 'voluntario_interno' };
    const view = await render(<AvistamientoEntryButton reporte={REPORTE} />);

    expect(view.queryByLabelText('Registrar avistamiento')).toBeNull();
  });

  it('no renderiza nada para un rol no relacionado', async () => {
    mockUsuario = { id: 'user-otro', rol: 'reportante' };
    const view = await render(<AvistamientoEntryButton reporte={REPORTE} />);

    expect(view.queryByLabelText('Registrar avistamiento')).toBeNull();
  });

  it('renderiza para el reportante dueño y navega solo con reporteId en la URL', async () => {
    mockUsuario = { id: 'user-reportante', rol: 'reportante' };
    const view = await render(<AvistamientoEntryButton reporte={REPORTE} />);

    const boton = view.getByLabelText('Registrar avistamiento');
    expect(boton).toBeTruthy();

    fireEvent.press(boton);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const destino = mockPush.mock.calls[0][0];
    expect(destino.pathname).toBe('/registrar-avistamiento');
    expect(destino.params).toEqual({ reporteId: 'rep-1' });
  });

  it('llama onBeforeNavigate antes de navegar (cerrar el modal padre)', async () => {
    mockUsuario = { id: 'user-reportante', rol: 'reportante' };
    const orden: string[] = [];
    const onBeforeNavigate = jest.fn(() => orden.push('cerrar'));
    mockPush.mockImplementation(() => orden.push('push'));

    const view = await render(
      <AvistamientoEntryButton reporte={REPORTE} onBeforeNavigate={onBeforeNavigate} />,
    );
    fireEvent.press(view.getByLabelText('Registrar avistamiento'));

    expect(onBeforeNavigate).toHaveBeenCalledTimes(1);
    expect(orden).toEqual(['cerrar', 'push']);
  });

  it('renderiza para la asociación asignada', async () => {
    mockUsuario = { id: 'user-aso', rol: 'asociacion', asociacion_id: 'aso-1' };
    const view = await render(<AvistamientoEntryButton reporte={REPORTE} />);

    expect(view.getByLabelText('Registrar avistamiento')).toBeTruthy();
  });

  it('no renderiza nada para la asociación vieja de un caso reasignado', async () => {
    mockUsuario = { id: 'user-aso', rol: 'asociacion', asociacion_id: 'aso-1' };
    const view = await render(
      <AvistamientoEntryButton reporte={{ ...REPORTE, asociacion_asignada_id: 'aso-2' }} />,
    );

    expect(view.queryByLabelText('Registrar avistamiento')).toBeNull();
  });
});
