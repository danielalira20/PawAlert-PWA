import { fireEvent, render } from '@testing-library/react-native';

import { SinVidaModal } from '../components/staff-dashboard/SinVidaModal';


jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

const propsBase = {
  visible: true,
  animales: [
    {
      id: 'animal-1',
      tipo_animal: 'perro',
      condicion: 'herido',
      tamanio: 'mediano',
      sexo: null,
      edad_aproximada: null,
      descripcion: null,
      es_grupo: false,
      cantidad: 1,
    },
    {
      id: 'animal-2',
      tipo_animal: 'gato',
      condicion: 'estable',
      tamanio: 'pequeño',
      sexo: null,
      edad_aproximada: null,
      descripcion: null,
      es_grupo: true,
      cantidad: 4,
    },
  ],
  cantidades: {},
  fotoLista: false,
  ubicacionLista: false,
  obteniendoGPS: false,
  puedeEsperarSeguro: null,
  riesgoVial: false,
  riesgoSanitario: false,
  identificacion: '',
  notas: '',
  motivoRetiro: '',
  isSubmitting: false,
  onSeleccionarAnimal: jest.fn(),
  onCambiarCantidad: jest.fn(),
  onCapturarFoto: jest.fn(),
  onCapturarUbicacion: jest.fn(),
  onCambiarPuedeEsperar: jest.fn(),
  onCambiarRiesgoVial: jest.fn(),
  onCambiarRiesgoSanitario: jest.fn(),
  onCambiarIdentificacion: jest.fn(),
  onCambiarNotas: jest.fn(),
  onCambiarMotivoRetiro: jest.fn(),
  onCancel: jest.fn(),
  onConfirm: jest.fn(),
};

describe('SinVidaModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('permite seleccionar una ficha concreta del reporte', async () => {
    const view = await render(<SinVidaModal {...propsBase} />);

    await fireEvent.press(view.getByText('perro 1'));

    expect(propsBase.onSeleccionarAnimal).toHaveBeenCalledWith('animal-1', 1);
  });

  it('permite ajustar la cantidad cuando la ficha representa un grupo', async () => {
    const view = await render(
      <SinVidaModal {...propsBase} cantidades={{ 'animal-2': 2 }} />,
    );

    expect(view.getByText('2 de 4')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Aumentar cantidad'));

    expect(propsBase.onCambiarCantidad).toHaveBeenCalledWith('animal-2', 3, 4);
  });

  it('solo habilita el envío cuando están completos los campos obligatorios', async () => {
    const incompleto = await render(<SinVidaModal {...propsBase} />);
    expect(
      incompleto.getByLabelText('Registrar resultado sin vida').props.accessibilityState.disabled,
    ).toBe(true);

    const completo = await render(
      <SinVidaModal
        {...propsBase}
        cantidades={{ 'animal-1': 1 }}
        fotoLista
        ubicacionLista
        puedeEsperarSeguro
      />,
    );
    expect(
      completo.getByLabelText('Registrar resultado sin vida').props.accessibilityState.disabled,
    ).toBe(false);
  });
});
