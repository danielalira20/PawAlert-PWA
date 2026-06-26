import { validarPassword, validarTelefono, validarEmail } from '../utils/validators';

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
