import { puedeOfrecerDisponibilidadAbierta } from '../utils/aliadoPermissions';

describe('puedeOfrecerDisponibilidadAbierta', () => {
  it.each(['aliado_local', 'patrocinador_institucional'])(
    'permite el modo proactivo a %s',
    (tipo) => {
      expect(puedeOfrecerDisponibilidadAbierta(tipo)).toBe(true);
    },
  );

  it.each(['donante_comunitario', null, undefined])(
    'oculta el modo proactivo a %s',
    (tipo) => {
      expect(puedeOfrecerDisponibilidadAbierta(tipo)).toBe(false);
    },
  );
});
