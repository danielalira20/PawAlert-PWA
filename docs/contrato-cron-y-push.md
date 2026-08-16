# Contrato: Arquitectura de Tareas Programadas (Cron) y Notificaciones Push

Este documento describe la arquitectura implementada en la fase 4 para el envío de notificaciones Push (FCM), el cálculo de urgencia por lotes, y la solicitud de confirmaciones de permanencia.

## 1. Patrón Outbox para Notificaciones Push
Para evitar que un fallo en el proveedor (Firebase) afecte la integridad de la base de datos o retrase las transacciones del negocio, usamos el **Patrón Outbox**:
- **Escritura Transaccional:** Cuando ocurre un evento (ej. propuesta asignada, expiración), se inserta un registro en la tabla `notificaciones_push` (junto con la actualización del negocio en la misma transacción).
- **Cola de Mensajes:** Los registros nacen con estado `pendiente`. Se incluye una `idempotency_key` para evitar duplicados en caso de reintentos en el negocio.
- **Despacho asíncrono:** Un endpoint interno (`/internal/push/run`) invocado frecuentemente por cron lee las notificaciones `pendiente` (o `fallida` con `intento < 3`), las envía por FCM a todos los dispositivos activos del usuario (`dispositivos_push`), y actualiza el estado a `enviada`, `fallida`, u `omitida`. Si hay tokens inválidos devueltos por FCM, se desactivan automáticamente (`active = false`).

## 2. Endpoints Internos de Cron
Para facilitar la depuración y evitar dependencias entre distintas tareas pesadas, se definieron endpoints independientes en `backend/app/api/internal.py`. Todos están protegidos por el header `X-Cron-Secret`.

- `POST /internal/urgency/run`: Reclama un lote de reportes (usando concurrencia segura con `FOR UPDATE SKIP LOCKED` en `urgency_report_claims`) y recalcula su nivel de urgencia, clasificando si el reporte fue `updated` o `degraded` (falla de cache). Se mantiene un log en `urgency_scheduler_runs`.
- `POST /internal/push/run`: Despacha las notificaciones Push pendientes (límite de 100 por ejecución).
- `POST /internal/reporter-confirmations/run`: *(En desarrollo)* Evaluará los reportes con más de 6 horas sin actividad ("hitos") para solicitarle al Reportante confirmación sobre la permanencia del animal.

**Nota para producción:** El administrador debe configurar Supabase (o `pg_cron`) para hacer llamadas HTTP POST a estos endpoints cada 5 minutos.

## 3. Dispositivos Push (FCM Tokens)
- Los dispositivos se guardan en la tabla `dispositivos_push`.
- **Unicidad:** La clave única es global por `(provider, token)`. Si un usuario nuevo inicia sesión en el mismo dispositivo, el upsert actualiza el `usuario_id` adueñándose del token, lo que previene que le sigan llegando notificaciones a la sesión anterior.
- El frontend llama a `POST /users/me/push-devices` tras iniciar sesión y a `DELETE /users/me/push-devices/{token}` al cerrar sesión.

## 4. Dependencias Críticas (Bloqueadas temporalmente)
El proceso de **Confirmación de Permanencia** está pausado y no debe activarse hasta resolver tres reglas de negocio con el equipo (D-1 a D-3):
1. La transición centralizada cuando un reporte "aprobado" se envía a "revisión manual".
2. La definición y exclusión de reportes con "recursos vinculados" activos.
3. El flujo técnico para los Reportantes Invitados (sin cuenta) que deben recibir el aviso de confirmación.
