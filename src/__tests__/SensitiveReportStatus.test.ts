import { getEstadoPreview } from '../components/profile/condicionEstadoColors';


describe('estados sensibles del resultado del rescate', () => {
  it('presenta la revisión sin exponer la clave técnica', () => {
    expect(getEstadoPreview('pendiente_seguimiento_fallecimiento').label)
      .toBe('Resultado en revisión');
  });

  it('presenta la conclusión con lenguaje cuidadoso', () => {
    expect(getEstadoPreview('muerto').label).toBe('Seguimiento concluido');
  });
});
