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

export function validarTelefono(telefono: string): boolean {
  return /^\d{10}$/.test(telefono.trim());
}

export function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
