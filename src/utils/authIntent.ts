/**
 * authIntent.ts
 *
 * Variable efímera (vive solo en memoria) que permite pasar la intención
 * de autenticación entre componentes sin exponerla en la URL.
 *
 * AuthGateModal escribe el valor antes de navegar a /profile.
 * LoggedOutProfile lo lee al montarse y lo borra inmediatamente.
 */

type AuthIntent = 'login' | 'register' | null;

let _intent: AuthIntent = null;

export function setAuthIntent(intent: AuthIntent): void {
  _intent = intent;
}

/** Lee y consume el intent (lo borra después de leerlo). */
export function consumeAuthIntent(): AuthIntent {
  const val = _intent;
  _intent = null;
  return val;
}
