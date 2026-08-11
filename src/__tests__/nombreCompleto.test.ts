import { separarNombreCompleto } from '../utils/nombreCompleto';

describe('separarNombreCompleto', () => {
  it('conserva un apellido compuesto con partícula', () => {
    expect(separarNombreCompleto('Carlos de Alba Goméz')).toEqual({
      nombre: 'Carlos',
      apellidoPaterno: 'de Alba',
      apellidoMaterno: 'Goméz',
    });
  });

  it('conserva nombres compuestos y dos apellidos', () => {
    expect(separarNombreCompleto('Juan Carlos Pérez López')).toEqual({
      nombre: 'Juan Carlos',
      apellidoPaterno: 'Pérez',
      apellidoMaterno: 'López',
    });
  });

  it('acepta un nombre con un solo apellido', () => {
    expect(separarNombreCompleto('Carlos Alba')).toEqual({
      nombre: 'Carlos',
      apellidoPaterno: 'Alba',
      apellidoMaterno: undefined,
    });
  });

  it('indica cuando falta el apellido', () => {
    expect(separarNombreCompleto('Carlos')).toEqual({
      nombre: 'Carlos',
      apellidoPaterno: '',
    });
  });
});
