export function validarPassword(password: string): { valido: boolean; mensaje: string } {
  if (password.length < 8) {
    return { valido: false, mensaje: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valido: false, mensaje: 'La contraseña debe incluir al menos una letra mayúscula.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valido: false, mensaje: 'La contraseña debe incluir al menos una letra minúscula.' };
  }
  if (!/\d/.test(password)) {
    return { valido: false, mensaje: 'La contraseña debe incluir al menos un número.' };
  }
  return { valido: true, mensaje: '' };
}

const REGEX_SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ\s]+$/;

export function validarNombre(
  valor: string,
  opciones?: { requerido?: boolean; etiqueta?: string }
): { valido: boolean; mensaje: string } {
  const requerido = opciones?.requerido !== false;
  const etiqueta = opciones?.etiqueta ?? 'nombre';
  const val = valor.trim();

  if (!val) {
    if (requerido) {
      return { valido: false, mensaje: `El ${etiqueta} es obligatorio.` };
    }
    return { valido: true, mensaje: '' };
  }
  if (val.length < 3) {
    return { valido: false, mensaje: `El ${etiqueta} debe tener al menos 3 caracteres.` };
  }
  if (val.length > 30) {
    return { valido: false, mensaje: `El ${etiqueta} no puede tener más de 30 caracteres.` };
  }
  if (!REGEX_SOLO_LETRAS.test(val)) {
    return { valido: false, mensaje: `El ${etiqueta} solo puede contener letras y espacios.` };
  }
  return { valido: true, mensaje: '' };
}

export function validarTelefono(telefono: string): boolean {
  return /^\d{10}$/.test(telefono.trim());
}

export function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
