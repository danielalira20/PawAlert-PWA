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
  animales: [
    { id: 'animal-1', tipo_animal: 'perro', orden: 1 } as never,
    { id: 'animal-2', tipo_animal: 'gato', orden: 2 } as never,
  ],
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

  it('renderiza para el reportante dueño y navega con reporteId y animales', async () => {
    mockUsuario = { id: 'user-reportante', rol: 'reportante' };
    const view = await render(<AvistamientoEntryButton reporte={REPORTE} />);

    const boton = view.getByLabelText('Registrar avistamiento');
    expect(boton).toBeTruthy();

    fireEvent.press(boton);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const destino = mockPush.mock.calls[0][0];
    expect(destino.pathname).toBe('/registrar-avistamiento');
    expect(destino.params.reporteId).toBe('rep-1');
    expect(JSON.parse(destino.params.animales)).toEqual([
      { id: 'animal-1', tipo_animal: 'perro', orden: 1 },
      { id: 'animal-2', tipo_animal: 'gato', orden: 2 },
    ]);
  });

  it('renderiza para la asociación asignada', async () => {
    mockUsuario = { id: 'user-aso', rol: 'asociacion', asociacion_id: 'aso-1' };
    const view = await render(<AvistamientoEntryButton reporte={REPORTE} />);

    expect(view.getByLabelText('Registrar avistamiento')).toBeTruthy();
  });
});
