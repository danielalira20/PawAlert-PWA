const PARTICULAS_APELLIDO = new Set([
  'da',
  'de',
  'del',
  'do',
  'dos',
  'la',
  'las',
  'los',
  'san',
  'santa',
  'van',
  'von',
  'y',
]);

export interface NombreCompletoSeparado {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
}

function extraerApellido(partes: string[]): string {
  const base = partes.pop();
  if (!base) return '';

  const apellido = [base];
  while (
    partes.length > 0 &&
    PARTICULAS_APELLIDO.has(partes[partes.length - 1].toLocaleLowerCase('es-MX'))
  ) {
    apellido.unshift(partes.pop()!);
  }
  return apellido.join(' ');
}

export function separarNombreCompleto(valor: string): NombreCompletoSeparado {
  const partes = valor.trim().split(/\s+/).filter(Boolean);

  if (partes.length < 2) {
    return { nombre: partes[0] || '', apellidoPaterno: '' };
  }

  // Se extraen grupos desde la derecha para conservar partículas como
  // "de Alba", "de la Cruz" o "de León" dentro del apellido.
  const apellidoMaterno = partes.length >= 3 ? extraerApellido(partes) : undefined;
  const apellidoPaterno = extraerApellido(partes);

  return {
    nombre: partes.join(' '),
    apellidoPaterno,
    apellidoMaterno,
  };
}
