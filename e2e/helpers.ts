import { APIRequestContext, expect } from '@playwright/test';

export type Credentials = { email: string; password: string };

export function requireWritableTestEnvironment() {
  const url = process.env.E2E_API_URL || 'http://127.0.0.1:8000';
  if (process.env.E2E_ALLOW_WRITES !== 'true') {
    throw new Error('Los E2E escriben datos. Define E2E_ALLOW_WRITES=true en un ambiente de pruebas.');
  }
  if (!/(localhost|127\.0\.0\.1|test|staging|preview)/i.test(url)) {
    throw new Error(`E2E_API_URL no parece un ambiente seguro de pruebas: ${url}`);
  }
}

export function credentials(prefix: string): Credentials {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`Faltan ${prefix}_EMAIL y ${prefix}_PASSWORD`);
  return { email, password };
}

export async function login(request: APIRequestContext, account: Credentials) {
  const response = await request.post('/auth/login', { data: account });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  expect(body.access_token).toBeTruthy();
  return body as { access_token: string; usuario: { id: string } };
}

export async function createReport(request: APIRequestContext, token: string) {
  const unique = Date.now();
  const response = await request.post('/reports', {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      animales: JSON.stringify([{
        condicion: 'estable',
        tipo_animal: 'perro',
        tamanio: 'pequeno',
        sexo: 'desconocido',
        edad_aproximada: 'desconocido',
        descripcion: `Caso automático E2E ${unique}`,
        orden: 1,
        cantidad: 1,
      }]),
      latitud: '19.0414',
      longitud: '-98.2063',
      municipio: 'Puebla',
      estado_ubicacion: 'Puebla',
      referencia: `E2E-${unique}`,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  expect(body.id).toBeTruthy();
  return body as { id: string };
}
