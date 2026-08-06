// Guard de identidad para las tarjetas de rol/aliado del LandingScreen —
// evita que una cuenta con una identidad ya asignada (rol o perfil_apoyo)
// pueda postularse/registrarse otra vez como algo que ya es o que choca
// con lo que ya es (ver backend/app/api/voluntarios.py y
// backend/app/api/perfiles_apoyo.py para el guard equivalente en backend).

export type TargetAction =
  | 'voluntario_interno'
  | 'voluntario_externo'
  | 'donante_comunitario'
  | 'aliado_local'
  | 'patrocinador_institucional'
  | 'asociacion';

export const BLOCKED_BY: Record<TargetAction, string[]> = {
  voluntario_interno: ['voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  voluntario_externo: ['voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  donante_comunitario: ['asociacion', 'aliado_local', 'patrocinador_institucional'],
  aliado_local: ['reportante', 'voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  patrocinador_institucional: ['reportante', 'voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
  asociacion: ['reportante', 'voluntario_interno', 'voluntario_externo', 'asociacion', 'staff', 'aliado_local', 'patrocinador_institucional'],
};

export interface UserIdentity {
  rol?: string | null;
  tipo_perfil_apoyo?: string | null;
}

/** Regresa la primera identidad del usuario (rol, luego tipo_perfil_apoyo) que
 * bloquea el target dado, o null si no hay bloqueo. */
export function getBlockingIdentity(target: TargetAction, user: UserIdentity | null | undefined): string | null {
  if (!user) return null;

  const identidades = [user.rol, user.tipo_perfil_apoyo].filter(
    (identidad): identidad is string => !!identidad
  );
  const bloqueadas = BLOCKED_BY[target];

  for (const identidad of identidades) {
    if (bloqueadas.includes(identidad)) {
      return identidad;
    }
  }

  return null;
}
