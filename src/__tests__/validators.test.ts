import { validarPassword, validarTelefono, validarEmail, validarNombre } from '../utils/validators';

describe('validarPassword', () => {
  it('rechaza contraseña menor a 8 caracteres', () => {
    const result = validarPassword('Ab1');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('8 caracteres');
  });

  it('rechaza contraseña sin mayúscula', () => {
    const result = validarPassword('abcdefg1');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('mayúscula');
  });

  it('rechaza contraseña sin minúscula', () => {
    const result = validarPassword('ABCDEFG1');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('minúscula');
  });

  it('rechaza contraseña sin número', () => {
    const result = validarPassword('Abcdefgh');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('número');
  });

  it('acepta contraseña válida', () => {
    const result = validarPassword('Segura123');
    expect(result.valido).toBe(true);
    expect(result.mensaje).toBe('');
  });
});

describe('validarTelefono', () => {
  it('acepta teléfono de 10 dígitos', () => {
    expect(validarTelefono('5512345678')).toBe(true);
  });

  it('rechaza teléfono con menos de 10 dígitos', () => {
    expect(validarTelefono('551234')).toBe(false);
  });

  it('rechaza teléfono con letras', () => {
    expect(validarTelefono('55abcd5678')).toBe(false);
  });

  it('rechaza teléfono con más de 10 dígitos', () => {
    expect(validarTelefono('55123456789')).toBe(false);
  });
});

describe('validarNombre', () => {
  it('rechaza vacío cuando es requerido (default)', () => {
    const result = validarNombre('');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('obligatorio');
  });

  it('rechaza solo espacios cuando es requerido', () => {
    const result = validarNombre('   ');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('obligatorio');
  });

  it('acepta vacío cuando requerido es false', () => {
    const result = validarNombre('', { requerido: false });
    expect(result.valido).toBe(true);
    expect(result.mensaje).toBe('');
  });

  it('rechaza 1 caracter', () => {
    const result = validarNombre('A');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('al menos 3 caracteres');
  });

  it('rechaza 2 caracteres', () => {
    const result = validarNombre('An');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('al menos 3 caracteres');
  });

  it('acepta exactamente 3 caracteres', () => {
    const result = validarNombre('Ana');
    expect(result.valido).toBe(true);
    expect(result.mensaje).toBe('');
  });

  it('acepta exactamente 30 caracteres', () => {
    const nombre30 = 'A'.repeat(30);
    const result = validarNombre(nombre30);
    expect(result.valido).toBe(true);
  });

  it('rechaza 31 caracteres', () => {
    const nombre31 = 'A'.repeat(31);
    const result = validarNombre(nombre31);
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('más de 30 caracteres');
  });

  it('rechaza dígitos', () => {
    const result = validarNombre('Ana2');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('solo puede contener letras y espacios');
  });

  it('rechaza símbolos (%, #, @)', () => {
    expect(validarNombre('An%').valido).toBe(false);
    expect(validarNombre('An#a').valido).toBe(false);
    expect(validarNombre('An@a').valido).toBe(false);
  });

  it('rechaza guion', () => {
    const result = validarNombre('Ana-Luz');
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('solo puede contener letras y espacios');
  });

  it('rechaza apóstrofe', () => {
    const result = validarNombre("O'Brian");
    expect(result.valido).toBe(false);
    expect(result.mensaje).toContain('solo puede contener letras y espacios');
  });

  it('acepta acentos y ñ/Ñ válidos', () => {
    expect(validarNombre('áéíóú').valido).toBe(true);
    expect(validarNombre('ÁÉÍÓÚ').valido).toBe(true);
    expect(validarNombre('Muñoz').valido).toBe(true);
    expect(validarNombre('Ñoño').valido).toBe(true);
    expect(validarNombre('Güemes').valido).toBe(true);
  });

  it('acepta nombre compuesto con espacio', () => {
    const result = validarNombre('María José');
    expect(result.valido).toBe(true);
    expect(result.mensaje).toBe('');
  });

  it('usa la etiqueta dada en el mensaje de campo obligatorio', () => {
    const result = validarNombre('', { etiqueta: 'apellido paterno' });
    expect(result.mensaje).toBe('El apellido paterno es obligatorio.');
  });

  it('usa "nombre" como etiqueta por defecto', () => {
    const result = validarNombre('');
    expect(result.mensaje).toBe('El nombre es obligatorio.');
  });
});

describe('validarEmail', () => {
  it('acepta email válido', () => {
    expect(validarEmail('usuario@correo.com')).toBe(true);
  });

  it('rechaza email sin @', () => {
    expect(validarEmail('usuariocorreo.com')).toBe(false);
  });

  it('rechaza email sin dominio', () => {
    expect(validarEmail('usuario@')).toBe(false);
  });

  it('rechaza email con espacios', () => {
    expect(validarEmail('usuario @correo.com')).toBe(false);
  });
});
