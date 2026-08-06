export type PostAuthFlow = 'join-association' | 'external-volunteer';

export function isPostAuthFlow(value: unknown): value is PostAuthFlow {
  return value === 'join-association' || value === 'external-volunteer';
}

export function getPostAuthDestination(value: unknown, fallback: string): string {
  if (value === 'join-association') return '/(tabs)/join-association';
  if (value === 'external-volunteer') return '/?abrirPostulacionExterna=true';
  return fallback;
}

export function getPostAuthExplanation(value: unknown): string | null {
  if (value === 'join-association') {
    return 'Inicia sesión o crea una cuenta para elegir una asociación. Al terminar, te regresaremos a tu postulación.';
  }
  if (value === 'external-volunteer') {
    return 'Inicia sesión o crea una cuenta para postularte como casa temporal. Al terminar, abriremos tu formulario.';
  }
  return null;
}
