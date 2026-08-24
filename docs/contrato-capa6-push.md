# Contrato: Coordinación Push — Capa 6 (Magui)

Este documento describe los cambios implementados y las decisiones de diseño de la Capa 6,
cuya responsabilidad es la coordinación asincrónica de notificaciones Push hacia los distintos
actores del sistema (voluntarios, asociaciones, reportantes, custodios).

Los destinatarios candidatos provienen del ranking definido en
[`contrato-ranking-despacho.md`](./contrato-ranking-despacho.md). Push no modifica sus pesos
ni incorpora Urgency Score al score del voluntario.

---

## 1. Contexto

La infraestructura base del Patrón Outbox ya estaba documentada en
[`contrato-cron-y-push.md`](./contrato-cron-y-push.md). Esta Capa 6 extiende ese contrato
con tres áreas:

1. **Corrección de credenciales Firebase** (bloqueo de producción resuelto).
2. **Notificación proactiva a candidatos** al momento de activar un reporte.
3. **Control de fatiga** para evitar spam de notificaciones al mismo voluntario.

---

## 2. Fix: Credenciales Firebase en producción (Bug D)

### Problema
El código original llamaba `firebase_admin.initialize_app()` sin argumentos cuando
`firebase_service_account_json` estaba vacío. Esto **solo funciona dentro de GCP**
(Google Cloud). En Railway, Render u otros proveedores el proceso fallaba silenciosamente
y ninguna notificación Push llegaba a los dispositivos.

La variable de entorno `GOOGLE_APPLICATION_CREDENTIALS` que se agregó al `.env` local
era leída por la SDK de Google, pero **Pydantic no la exporta al entorno del sistema**,
por lo que la SDK tampoco la encontraba.

### Solución implementada
La función `_init_firebase()` en
`backend/app/services/push_notification_service.py` ahora sigue un orden de prioridad
explícito:

| Prioridad | Variable de entorno | Cuándo usarla |
|-----------|---------------------|---------------|
| 1 | `FIREBASE_SERVICE_ACCOUNT_JSON` | Producción (Railway, Render). Pegar el JSON completo del Service Account como valor de la variable. |
| 2 | `GOOGLE_APPLICATION_CREDENTIALS` | Desarrollo local. Ruta al archivo `pawalert-firebase.json` descargado de Firebase Console. |
| 3 | Application Default | Último recurso. Solo funciona si el proceso corre dentro de GCP. |

### Impacto en compañeros
- **Diego / Daniela / Jass:** ningún cambio visible. El comportamiento externo es idéntico.
- **Administración de Railway:** agregar `FIREBASE_SERVICE_ACCOUNT_JSON` con el contenido
  del archivo `pawalert-firebase.json` (el JSON como valor de texto) para que funcione en
  producción sin subir archivos al repositorio.

### Archivos modificados
- `backend/app/services/push_notification_service.py` — función `_init_firebase()`
- `backend/tests/test_push_notification_service.py` — 2 tests: JSON desde env y ruta de archivo

---

## 3. Feature: Notificar candidatos al activar un reporte (Tarea A)

### Problema
Cuando un reporte se activa y pasa la compuerta de validación (`activar_reporte`), el sistema
ya calculaba el top-3 de candidatos internos mediante `matching.obtener_candidatos()`.
Sin embargo, **nunca les avisaba** a esos voluntarios que existía un nuevo caso compatible
con su perfil. Tenían que abrir la app manualmente para descubrirlo.

### Solución implementada
En `backend/app/services/report_activation_service.py`, justo después de calcular y guardar
`candidatos_iniciales`, se itera sobre cada candidato y se llama a `queue_and_send_push`
con el evento `nuevo_caso_cercano`.

**Idempotencia:** La `idempotency_key` tiene el formato
`nuevo_caso_cercano:{reporte_id}:{usuario_id}`, lo que garantiza que si el cron de activación
reintenta, no se envíe un duplicado.

**Control de fatiga:** Antes de encolar, se llama a `puede_notificar(usuario_id, "nuevo_caso_cercano")`
para asegurar que ese voluntario no recibió el mismo tipo de evento en las últimas 4 horas.
Esto evita que un voluntario cercano a muchos reportes reciba spam.

**No bloquea la activación:** Si `queue_and_send_push` falla (base de datos caída, etc.),
el error se captura con un `[WARN]` y el reporte sigue activándose normalmente.

### Flujo completo del evento
```
Reporte aprobado
  → activar_reporte()
      → matching.obtener_candidatos()   [ya existía]
      → para cada candidato:
          → puede_notificar(uid, "nuevo_caso_cercano")   [nuevo]
              → si True: queue_and_send_push(tipo="nuevo_caso_cercano")   [nuevo]
  → cron /internal/push/run
      → dispatch_pending_pushes()
          → FCM → dispositivo del voluntario
```

---

## 4. Feature: Control de fatiga de notificaciones (Tarea B)

Nueva función pública `puede_notificar(usuario_id, tipo_evento, ventana_horas=4)` en
`push_notification_service.py`. Consulta la tabla `notificaciones_push` y retorna `False`
si ya existe una notificación del mismo tipo y usuario en estado `pendiente` o `enviada`
en la ventana de tiempo configurada.

**Fail-open:** Si la consulta falla, la función retorna `True` y permite la notificación.

---

## 5. Fix: Push FCM faltante en seguimientos de custodia (Tarea C)

En `custody.py`, el segundo bucle (seguimiento próximo/vencido) insertaba en
`notificaciones_custodia` pero **no llamaba a `queue_and_send_push`**. El custodio no
recibía push al celular. Se agrega FCM con tipo `seguimiento_vencido` o `seguimiento_proximo`.

---

## 7. Tabla de eventos Push registrados (estado actualizado)

| `tipo_evento` | Destinatario | Disparado en |
|---|---|---|
| `nueva_propuesta` | Voluntario seleccionado | `coverage_service.reservar_cobertura()` |
| `voluntario_confirmo` | Staff de la asociación | `coverage_service.responder_propuesta()` |
| `voluntario_rechazo` | Staff de la asociación | `coverage_service.responder_propuesta()` |
| `propuesta_vencida` | Voluntario (expirado) | `coverage_service.expirar_propuestas_vencidas()` |
| `propuesta_vencida_asoc` | Staff de la asociación | `coverage_service.expirar_propuestas_vencidas()` |
| `seguimiento_custodia_proximo` | Voluntario custodio | `custody.generar_notificaciones_vencimiento()` |
| `seguimiento_vencido` | Voluntario custodio | `custody.generar_notificaciones_vencimiento()` *(Tarea C)* |
| `seguimiento_proximo` | Voluntario custodio | `custody.generar_notificaciones_vencimiento()` *(Tarea C)* |
| `confirmacion_permanencia_solicitada` | Reportante autenticado | `permanencia_service._crear_solicitud()` |
| `reporte_en_revision` | Reportante + voluntario con propuesta | `permanencia._notificar_revision()` |
| `nuevo_caso_cercano` | Candidatos top del ranking (internos) | `report_activation_service.activar_reporte()` *(Tarea A)* |
| `caso_cercano` | Voluntarios externos en radio geográfico | `coverage_service.notificar_externos_caso_cercano()` |
| `lista_espera_activada` | Candidatos no-ganadores del pool | `escalamiento._llenar_pool_y_notificar_espera()` *(Tarea 1)* |

### Payload de `nueva_propuesta`

La reserva se confirma primero en base de datos y despues se consulta OSRM.
El push siempre incluye `route_status`. Cuando OSRM devuelve una ruta valida,
tambien incluye `duration_seconds` y `distance_meters`, y el mensaje muestra
los minutos estimados. Una falla de ruteo no revierte ni bloquea la propuesta.

---

## 8. Feature: Pool de interesados y lista de espera (Tarea 1)

### Problema
Cuando el voluntario seleccionado no respondía a la propuesta, el sistema
(`expirar_propuestas_vencidas`) liberaba el reporte, pero **no tenía memoria de
quién seguía en la lista**. El caso quedaba abierto y esperaba el próximo ciclo
de escalamiento automático para asignar a alguien más.

### Solución implementada

**Base de datos — migración `0077_pool_interesados_reporte.sql`:**

Nueva tabla `pool_interesados_reporte`:
```
reporte_id    → FK reportes (CASCADE DELETE)
voluntario_id → FK voluntarios (RESTRICT)
usuario_id    → FK usuarios (RESTRICT)
posicion      → INTEGER (1=ganador, 2,3,...=lista de espera)
estado        → 'propuesta_enviada' | 'en_espera' | 'descartado' | 'aceptado' | 'vencido'
```
Restricción `UNIQUE (reporte_id, voluntario_id)` garantiza que un voluntario
aparece una sola vez por reporte. El `UPSERT` permite re-calcular el pool sin
duplicados si el escalamiento vuelve a correr.

**Backend — `escalamiento.py:_llenar_pool_y_notificar_espera()`:**

Función privada nueva que se llama inmediatamente después de `reservar_cobertura()`
en el for-loop de `evaluar_escalamientos()`. Flujo:

```
reservar_cobertura()  [ganador escogido]
  → _llenar_pool_y_notificar_espera(reporte_id, volunteer_id_ganador)
      → matching.obtener_candidatos()  [lista completa, misma llamada que ya existía]
      → UPSERT en pool_interesados_reporte
          posicion=1, estado='propuesta_enviada'  → ganador
          posicion>1, estado='en_espera'          → lista de espera
      → para cada candidato en lista de espera:
          → puede_notificar(uid, "lista_espera_activada")
              → si True: queue_and_send_push(tipo="lista_espera_activada")
```

**Garantías:**
- Si la función falla (BD caída, etc.), solo se imprime `[WARN]` —  la propuesta
  ya enviada al ganador **nunca se revierte**.
- Idempotente: si escalamiento vuelve a correr sobre el mismo reporte, el UPSERT
  actualiza sin duplicar filas.
- Control de fatiga: `puede_notificar()` (ventana 4 h por defecto) evita spam
  si el mismo voluntario está en lista de espera de múltiples casos simultáneos.

### Impacto en compañeros
- **Diego:** cuando conecte el panel de asociaciones para mostrar la lista de
  candidatos, puede leer `pool_interesados_reporte` ordenado por `posicion` para
  mostrar quién está en espera sin requerir recalcular el ranking.
- **Jass:** cuando los avistamientos actualicen la ubicación del animal (Capa 8),
  el pool puede recalcularse con una nueva llamada a `obtener_candidatos()` y
  un UPSERT que sobreescriba las posiciones.
- **Daniela / Miguel:** ningún cambio visible en contratos existentes.

### Archivos modificados
ni incorpora Urgency Score al score del voluntario.

---

## 1. Contexto

La infraestructura base del Patrón Outbox ya estaba documentada en
[`contrato-cron-y-push.md`](./contrato-cron-y-push.md). Esta Capa 6 extiende ese contrato
con tres áreas:

1. **Corrección de credenciales Firebase** (bloqueo de producción resuelto).
2. **Notificación proactiva a candidatos** al momento de activar un reporte.
3. **Control de fatiga** para evitar spam de notificaciones al mismo voluntario.

---

## 2. Fix: Credenciales Firebase en producción (Bug D)

### Problema
El código original llamaba `firebase_admin.initialize_app()` sin argumentos cuando
`firebase_service_account_json` estaba vacío. Esto **solo funciona dentro de GCP**
(Google Cloud). En Railway, Render u otros proveedores el proceso fallaba silenciosamente
y ninguna notificación Push llegaba a los dispositivos.

La variable de entorno `GOOGLE_APPLICATION_CREDENTIALS` que se agregó al `.env` local
era leída por la SDK de Google, pero **Pydantic no la exporta al entorno del sistema**,
por lo que la SDK tampoco la encontraba.

### Solución implementada
La función `_init_firebase()` en
`backend/app/services/push_notification_service.py` ahora sigue un orden de prioridad
explícito:

| Prioridad | Variable de entorno | Cuándo usarla |
|-----------|---------------------|---------------|
| 1 | `FIREBASE_SERVICE_ACCOUNT_JSON` | Producción (Railway, Render). Pegar el JSON completo del Service Account como valor de la variable. |
| 2 | `GOOGLE_APPLICATION_CREDENTIALS` | Desarrollo local. Ruta al archivo `pawalert-firebase.json` descargado de Firebase Console. |
| 3 | Application Default | Último recurso. Solo funciona si el proceso corre dentro de GCP. |

### Impacto en compañeros
- **Diego / Daniela / Jass:** ningún cambio visible. El comportamiento externo es idéntico.
- **Administración de Railway:** agregar `FIREBASE_SERVICE_ACCOUNT_JSON` con el contenido
  del archivo `pawalert-firebase.json` (el JSON como valor de texto) para que funcione en
  producción sin subir archivos al repositorio.

### Archivos modificados
- `backend/app/services/push_notification_service.py` — función `_init_firebase()`
- `backend/tests/test_push_notification_service.py` — 2 tests: JSON desde env y ruta de archivo

---

## 3. Feature: Notificar candidatos al activar un reporte (Tarea A)

### Problema
Cuando un reporte se activa y pasa la compuerta de validación (`activar_reporte`), el sistema
ya calculaba el top-3 de candidatos internos mediante `matching.obtener_candidatos()`.
Sin embargo, **nunca les avisaba** a esos voluntarios que existía un nuevo caso compatible
con su perfil. Tenían que abrir la app manualmente para descubrirlo.

### Solución implementada
En `backend/app/services/report_activation_service.py`, justo después de calcular y guardar
`candidatos_iniciales`, se itera sobre cada candidato y se llama a `queue_and_send_push`
con el evento `nuevo_caso_cercano`.

**Idempotencia:** La `idempotency_key` tiene el formato
`nuevo_caso_cercano:{reporte_id}:{usuario_id}`, lo que garantiza que si el cron de activación
reintenta, no se envíe un duplicado.

**Control de fatiga:** Antes de encolar, se llama a `puede_notificar(usuario_id, "nuevo_caso_cercano")`
para asegurar que ese voluntario no recibió el mismo tipo de evento en las últimas 4 horas.
Esto evita que un voluntario cercano a muchos reportes reciba spam.

**No bloquea la activación:** Si `queue_and_send_push` falla (base de datos caída, etc.),
el error se captura con un `[WARN]` y el reporte sigue activándose normalmente.

### Flujo completo del evento
```
Reporte aprobado
  → activar_reporte()
      → matching.obtener_candidatos()   [ya existía]
      → para cada candidato:
          → puede_notificar(uid, "nuevo_caso_cercano")   [nuevo]
              → si True: queue_and_send_push(tipo="nuevo_caso_cercano")   [nuevo]
  → cron /internal/push/run
      → dispatch_pending_pushes()
          → FCM → dispositivo del voluntario
```

---

## 4. Feature: Control de fatiga de notificaciones (Tarea B)

Nueva función pública `puede_notificar(usuario_id, tipo_evento, ventana_horas=4)` en
`push_notification_service.py`. Consulta la tabla `notificaciones_push` y retorna `False`
si ya existe una notificación del mismo tipo y usuario en estado `pendiente` o `enviada`
en la ventana de tiempo configurada.

**Fail-open:** Si la consulta falla, la función retorna `True` y permite la notificación.

---

## 5. Fix: Push FCM faltante en seguimientos de custodia (Tarea C)

En `custody.py`, el segundo bucle (seguimiento próximo/vencido) insertaba en
`notificaciones_custodia` pero **no llamaba a `queue_and_send_push`**. El custodio no
recibía push al celular. Se agrega FCM con tipo `seguimiento_vencido` o `seguimiento_proximo`.

---

## 7. Tabla de eventos Push registrados (estado actualizado)

| `tipo_evento` | Destinatario | Disparado in |
|---|---|---|
| `nueva_propuesta` | Voluntario seleccionado | `coverage_service.reservar_cobertura()` |
| `voluntario_confirmo` | Staff de la asociación | `coverage_service.responder_propuesta()` |
| `voluntario_rechazo` | Staff de la asociación | `coverage_service.responder_propuesta()` |
| `propuesta_vencida` | Voluntario (expirado) | `coverage_service.expirar_propuestas_vencidas()` |
| `propuesta_vencida_asoc` | Staff de la asociación | `coverage_service.expirar_propuestas_vencidas()` |
| `seguimiento_custodia_proximo` | Voluntario custodio | `custody.generar_notificaciones_vencimiento()` |
| `seguimiento_vencido` | Voluntario custodio | `custody.generar_notificaciones_vencimiento()` *(Tarea C)* |
| `seguimiento_proximo` | Voluntario custodio | `custody.generar_notificaciones_vencimiento()` *(Tarea C)* |
| `confirmacion_permanencia_solicitada` | Reportante autenticado | `permanencia_service._crear_solicitud()` |
| `reporte_en_revision` | Reportante + voluntario con propuesta | `permanencia._notificar_revision()` |
| `nuevo_caso_cercano` | Candidatos top del ranking (internos) | `report_activation_service.activar_reporte()` *(Tarea A)* |
| `caso_cercano` | Voluntarios externos en radio geográfico | `coverage_service.notificar_externos_caso_cercano()` |
| `lista_espera_activada` | Candidatos no-ganadores del pool | `escalamiento._llenar_pool_y_notificar_espera()` *(Tarea 1)* |

### Payload de `nueva_propuesta`

La reserva se confirma primero en base de datos y despues se consulta OSRM.
El push siempre incluye `route_status`. Cuando OSRM devuelve una ruta valida,
tambien incluye `duration_seconds` y `distance_meters`, y el mensaje muestra
los minutos estimados. Una falla de ruteo no revierte ni bloquea la propuesta.

---

## 8. Feature: Pool de interesados y lista de espera (Tarea 1)

### Problema
Cuando el voluntario seleccionado no respondía a la propuesta, el sistema
(`expirar_propuestas_vencidas`) liberaba el reporte, pero **no tenía memoria de
quién seguía en la lista**. El caso quedaba abierto y esperaba el próximo ciclo
de escalamiento automático para asignar a alguien más.

### Solución implementada

**Base de datos — migración `0077_pool_interesados_reporte.sql`:**

Nueva tabla `pool_interesados_reporte`:
```
reporte_id    → FK reportes (CASCADE DELETE)
voluntario_id → FK voluntarios (RESTRICT)
usuario_id    → FK usuarios (RESTRICT)
posicion      → INTEGER (1=ganador, 2,3,...=lista de espera)
estado        → 'propuesta_enviada' | 'en_espera' | 'descartado' | 'aceptado' | 'vencido'
```
Restricción `UNIQUE (reporte_id, voluntario_id)` garantiza que un voluntario
aparece una sola vez por reporte. El `UPSERT` permite re-calcular el pool sin
duplicados si el escalamiento vuelve a correr.

**Backend — `escalamiento.py:_llenar_pool_y_notificar_espera()`:**

Función privada nueva que se llama inmediatamente después de `reservar_cobertura()`
en el for-loop de `evaluar_escalamientos()`. Flujo:

```
reservar_cobertura()  [ganador escogido]
  → _llenar_pool_y_notificar_espera(reporte_id, volunteer_id_ganador)
      → matching.obtener_candidatos()  [lista completa, misma llamada que ya existía]
      → UPSERT en pool_interesados_reporte
          posicion=1, estado='propuesta_enviada'  → ganador
          posicion>1, estado='en_espera'          → lista de espera
      → para cada candidato en lista de espera:
          → puede_notificar(uid, "lista_espera_activada")
              → si True: queue_and_send_push(tipo="lista_espera_activada")
```

**Garantías:**
- Si la función falla (BD caída, etc.), solo se imprime `[WARN]` —  la propuesta
  ya enviada al ganador **nunca se revierte**.
- Idempotente: si escalamiento vuelve a correr sobre el mismo reporte, el UPSERT
  actualiza sin duplicar filas.
- Control de fatiga: `puede_notificar()` (ventana 4 h por defecto) evita spam
  si el mismo voluntario está en lista de espera de múltiples casos simultáneos.

### Impacto en compañeros
- **Diego:** cuando conecte el panel de asociaciones para mostrar la lista de
  candidatos, puede leer `pool_interesados_reporte` ordenado por `posicion` para
  mostrar quién está en espera sin requerir recalcular el ranking.
- **Jass:** cuando los avistamientos actualicen la ubicación del animal (Capa 8),
  el pool puede recalcularse con una nueva llamada a `obtener_candidatos()` y
  un UPSERT que sobreescriba las posiciones.
- **Daniela / Miguel:** ningún cambio visible en contratos existentes.

### Archivos modificados
- `backend/migrations/0077_pool_interesados_reporte.sql` — tabla nueva, RLS, índice
- `backend/app/services/escalamiento.py` — llamada a `_llenar_pool_y_notificar_espera()` en el for-loop + función privada nueva

---

## 9. Tareas pendientes

| Tarea | Estado | Descripción |
|---|---|---|
| Pool de interesados | ✅ **Implementado (Tarea 1)** | `0077` + `escalamiento.py` |
| Lista de espera (`lista_espera_activada`) | ✅ **Implementado (Tarea 1)** | Dentro de `_llenar_pool_y_notificar_espera()` |
| Dead Man's Switch (15 min + aviso 3 min antes) | ✅ **Implementado (Tarea 2)** | Migración `0078`, `coverage_service.py` y `internal.py` (`/push/alerta-vencimiento`) |
| Notificar reemplazo al siguiente en lista | ✅ **Implementado (Tarea 3)** | `coverage_service.expirar_propuestas_vencidas()` |
| Push diferenciado con carga ≥ 3 casos | ⏳ **Tarea 4 — próxima** | `coverage_service.reservar_cobertura()` |
| Alertas de bienestar (Fase 5) | ❓ **Pendiente definición** | Confirmar con equipo qué significa exactamente |
