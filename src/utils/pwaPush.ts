interface PwaPushEnvironment {
  userAgent: string;
  navigatorStandalone?: boolean;
  displayModeStandalone?: boolean;
}

export function pwaPushSetupMessage({
  userAgent,
  navigatorStandalone = false,
  displayModeStandalone = false,
}: PwaPushEnvironment): string | null {
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  if (isIos && !navigatorStandalone && !displayModeStandalone) {
    return "En iPhone, agrega PawAlert a la pantalla de inicio y ábrela desde su icono para activar las notificaciones.";
  }
  return null;
}
