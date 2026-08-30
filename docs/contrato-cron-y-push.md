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
- `POST /internal/reporter-confirmations/run`: Evalúa reportes con más de 6 horas sin actividad (hitos) para solicitar confirmación de permanencia. Excluye reportes con "recursos vinculados" (custodias activas o contribuciones) mediante la función `obtener_reportes_inactivos_permanencia()`. Genera tokens seguros de 1 solo uso para los invitados, encola Pushes para los autenticados, y mueve a revisión manual a aquellos que caducan sin respuesta.
- `POST /internal/deceased-followups/run`: Escala seguimientos sensibles sin cerrar el reporte. A las 24 horas cambia la responsabilidad operativa a la asociación coordinadora y a las 48 horas lo presenta a administración. Cada transición y cada aviso usan claves idempotentes.

**Nota para producción:** El administrador debe configurar un programador externo para hacer llamadas HTTP POST con `X-Cron-Secret`. Urgency, push y confirmaciones pueden ejecutarse cada 5 minutos; el escalamiento de resultados sensibles puede ejecutarse cada 15 minutos. El endpoint de WhatsApp mantiene su frecuencia de un minuto para los recordatorios de seguridad existentes.

## 3. Dispositivos Push (FCM Tokens)
- Los dispositivos se guardan en la tabla `dispositivos_push`.
- **Unicidad:** La clave única es global por `(provider, token)`. Si un usuario nuevo inicia sesión en el mismo dispositivo, el upsert actualiza el `usuario_id` adueñándose del token, lo que previene que le sigan llegando notificaciones a la sesión anterior.
- El frontend llama a `POST /users/me/push-devices` tras iniciar sesión y a `DELETE /users/me/push-devices/{token}` al cerrar sesión.

## 4. Dependencias Críticas (Resueltas en Fase 2)
El proceso de **Confirmación de Permanencia** fue completado implementando:
1. La transición centralizada cuando un reporte "aprobado" se envía a "revisión manual" (Regla D-1).
2. La definición y exclusión de reportes con "recursos vinculados" activos a través de una función segura en BD (`obtener_reportes_inactivos_permanencia`) (Regla D-2).
3. El flujo técnico para los Reportantes Invitados (sin cuenta), generando un hash de `token_urlsafe` validado posteriormente en el endpoint público `/reports/invitados/confirmacion-permanencia` (Regla D-3).

## 5. Inyección de Push Notifications (Ciclo de Vida)
Para cumplir con los Eventos Push obligatorios del producto, se han inyectado de forma segura (usando `queue_and_send_push` con el Patrón Outbox) las siguientes notificaciones:
- **Nueva propuesta:** Disparada en `reservar_cobertura` (dirigida al voluntario seleccionado).
- **Respuesta a propuesta (Confirmación / Rechazo):** Disparada en `responder_propuesta` (dirigida al staff de la asociación asignada al reporte).
- **Seguimiento próximo de custodia:** Disparada por el cron en `generar_notificaciones_vencimiento` (dirigida al voluntario custodio cuando faltan ≤72h).
