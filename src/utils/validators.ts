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
  if (password.length > 128) {
    return { valido: false, mensaje: 'La contraseña no puede tener más de 128 caracteres.' };
  }
  return { valido: true, mensaje: '' };
}

const REGEX_NOMBRE = /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+(?:[ '\-’][A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+)*$/;

/** Normaliza mientras se escribe: solo letras y separadores de nombres,
 * nunca espacios repetidos o al inicio. El espacio final se conserva para
 * permitir continuar un nombre compuesto y se elimina al enviar. */
export function normalizarNombreEntrada(valor: string, maxLength = 30): string {
  return valor
    .replace(/[\t\n\r\f\v\u00a0]+/g, ' ')
    .replace(/[^A-Za-zÁÉÍÓÚÜáéíóúüÑñ '\-’]/g, '')
    .replace(/^\s+/, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, maxLength);
}

export function normalizarTelefonoMX(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, 10);
}

export function normalizarEntero(valor: string, maxDigits = 9): string {
  return valor.replace(/\D/g, '').slice(0, maxDigits);
}

export function normalizarDecimal(valor: string, enteros = 9, decimales = 2): string {
  const limpio = valor.replace(',', '.').replace(/[^0-9.]/g, '');
  const [parteEntera = '', ...resto] = limpio.split('.');
  const decimal = resto.join('').slice(0, decimales);
  const entero = parteEntera.slice(0, enteros);
  return limpio.includes('.') ? `${entero}.${decimal}` : entero;
}

export function normalizarEmailEntrada(valor: string): string {
  return valor.replace(/\s/g, '').slice(0, 254);
}

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
  if (!REGEX_NOMBRE.test(val)) {
    return { valido: false, mensaje: `El ${etiqueta} solo puede contener letras y separadores simples.` };
  }
  return { valido: true, mensaje: '' };
}

export function validarTelefono(telefono: string): boolean {
  return /^\d{10}$/.test(telefono.trim());
}

export function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
