import { construirResultadoRevision } from '../utils/reportSubmission';

describe('construirResultadoRevision', () => {
  it('explica la coincidencia pHash y que aún no existe asignación', () => {
    const resultado = construirResultadoRevision(['phash_coincidencia']);

    expect(resultado.titulo).toBe('Reporte recibido y en revisión');
    expect(resultado.estado).toBe('revision');
    expect(resultado.mensaje).toContain('coincide con evidencia');
    expect(resultado.mensaje).toContain('administrador');
    expect(resultado.mensaje).toContain('no se ha enviado a una asociación');
  });

  it('usa una explicación segura cuando el backend no envía un motivo conocido', () => {
    const resultado = construirResultadoRevision(['motivo_nuevo']);

    expect(resultado.mensaje).toContain('verificar la evidencia');
  });
});
