import { expect, test } from '@playwright/test';

import {
  createReport,
  credentials,
  login,
  requireWritableTestEnvironment,
} from './helpers';

test.beforeAll(() => requireWritableTestEnvironment());

test('registro e inicio de sesión', async ({ request }) => {
  const suffix = `${Date.now()}`.slice(-7);
  const account = {
    email: `e2e.${Date.now()}@example.test`,
    password: 'Pawalert123!',
  };
  const register = await request.post('/auth/register', {
    data: {
      ...account,
      nombre: 'Prueba',
      apellido_paterno: 'E2E',
      telefono: `22${suffix}1`.slice(0, 10),
    },
  });
  expect(register.status(), await register.text()).toBe(201);

  const session = await login(request, account);
  expect(session.usuario.id).toBeTruthy();
});

test('creación de reporte y disponibilidad para el mapa', async ({ request }) => {
  const author = await login(request, credentials('E2E_AUTHOR'));
  const report = await createReport(request, author.access_token);

  const mapResponse = await request.get('/reports');
  expect(mapResponse.ok(), await mapResponse.text()).toBeTruthy();
  const visibleReports = await mapResponse.json();
  expect(visibleReports.some((item: { id: string }) => item.id === report.id)).toBeTruthy();
});

test('tres denuncias envían a moderación y el admin puede aprobar', async ({ request }) => {
  const author = await login(request, credentials('E2E_AUTHOR'));
  const report = await createReport(request, author.access_token);

  for (const prefix of ['E2E_REPORTER_1', 'E2E_REPORTER_2', 'E2E_REPORTER_3']) {
    const reporter = await login(request, credentials(prefix));
    const complaint = await request.post(`/reports/${report.id}/denuncias`, {
      headers: { Authorization: `Bearer ${reporter.access_token}` },
      data: { motivo: 'informacion_falsa', detalle: 'Validación automática E2E' },
    });
    expect(complaint.status(), await complaint.text()).toBe(201);
  }

  const hidden = await request.get('/reports');
  expect((await hidden.json()).some((item: { id: string }) => item.id === report.id)).toBeFalsy();

  const admin = await login(request, credentials('E2E_ADMIN'));
  const queue = await request.get('/admin/reportes-moderacion', {
    headers: { Authorization: `Bearer ${admin.access_token}` },
  });
  expect(queue.ok(), await queue.text()).toBeTruthy();
  expect((await queue.json()).some((item: { id: string }) => item.id === report.id)).toBeTruthy();

  const approval = await request.patch(`/admin/reportes-moderacion/${report.id}`, {
    headers: { Authorization: `Bearer ${admin.access_token}` },
    data: { decision: 'aprobar', notas: 'Aprobado por prueba E2E' },
  });
  expect(approval.ok(), await approval.text()).toBeTruthy();

  const visibleAgain = await request.get('/reports');
  expect((await visibleAgain.json()).some((item: { id: string }) => item.id === report.id)).toBeTruthy();
});
