import { getBlockingIdentity, type TargetAction } from '../utils/roleGuard';

// Matriz de permisos acordada para el guard del LandingScreen (7 identidades
// posibles x 6 targets). Se duplica aquí a propósito, en vez de importarla
// de utils/roleGuard.ts: el objetivo de este archivo es blindar la tabla
// ACORDADA contra una edición accidental de BLOCKED_BY, no solo validar que
// getBlockingIdentity lea correctamente lo que sea que tenga ese objeto.
const MATRIZ_BLOQUEO: Record<TargetAction, string[]> = {
  voluntario_interno: ['voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  voluntario_externo: ['voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  donante_comunitario: ['asociacion', 'aliado_local', 'patrocinador_institucional'],
  aliado_local: ['reportante', 'voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  patrocinador_institucional: ['reportante', 'voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  asociacion: ['reportante', 'voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
};

const TODAS_LAS_IDENTIDADES = [
  'reportante',
  'voluntario_interno',
  'voluntario_externo',
  'asociacion',
  'staff',
  'aliado_local',
  'patrocinador_institucional',
] as const;

const TODOS_LOS_TARGETS = Object.keys(MATRIZ_BLOQUEO) as TargetAction[];

describe('getBlockingIdentity — matriz de permisos (7 identidades x 6 targets)', () => {
  describe.each(TODOS_LOS_TARGETS)('target = %s', (target) => {
    test.each(TODAS_LAS_IDENTIDADES)('rol=%s', (identidad) => {
      const debeBloquear = MATRIZ_BLOQUEO[target].includes(identidad);
      expect(getBlockingIdentity(target, { rol: identidad })).toBe(debeBloquear ? identidad : null);
    });
  });
});

describe('getBlockingIdentity — casos borde', () => {
  it('no bloquea a un usuario no logueado (sin objeto user)', () => {
    expect(getBlockingIdentity('asociacion', null)).toBeNull();
    expect(getBlockingIdentity('asociacion', undefined)).toBeNull();
  });

  it('no bloquea a un usuario sin rol ni tipo_perfil_apoyo (cuenta nueva)', () => {
    expect(getBlockingIdentity('voluntario_interno', {})).toBeNull();
    expect(getBlockingIdentity('voluntario_interno', { rol: null, tipo_perfil_apoyo: null })).toBeNull();
  });

  it('revisa tipo_perfil_apoyo cuando no hay rol (aliado_local/patrocinador con rol_id NULL)', () => {
    expect(getBlockingIdentity('donante_comunitario', { rol: null, tipo_perfil_apoyo: 'aliado_local' })).toBe('aliado_local');
    expect(getBlockingIdentity('voluntario_interno', { rol: null, tipo_perfil_apoyo: 'patrocinador_institucional' })).toBe('patrocinador_institucional');
  });

  it('revisa rol primero y, si no bloquea, cae a tipo_perfil_apoyo', () => {
    // reportante no bloquea donante_comunitario, pero aliado_local sí.
    expect(getBlockingIdentity('donante_comunitario', { rol: 'reportante', tipo_perfil_apoyo: 'aliado_local' })).toBe('aliado_local');
  });

  it('usuario con rol Y tipo_perfil_apoyo simultáneos: puede volver a postularse a donante_comunitario sin bloqueo', () => {
    // rol='voluntario_interno' bloquea 'voluntario_interno'/'voluntario_externo'
    // pero NO 'donante_comunitario' (donante_comunitario no se bloquea a sí
    // mismo, y voluntario_interno no está en su lista de bloqueo).
    const user = { rol: 'voluntario_interno', tipo_perfil_apoyo: 'donante_comunitario' };
    expect(getBlockingIdentity('donante_comunitario', user)).toBeNull();
    // pero sí sigue bloqueado para volver a postularse como voluntario interno/externo.
    expect(getBlockingIdentity('voluntario_interno', user)).toBe('voluntario_interno');
    expect(getBlockingIdentity('voluntario_externo', user)).toBe('voluntario_interno');
  });
});
