# Estado de integración: Persona 4 y Persona 5

**Proyecto:** PawAlert — Gamificación y Trust Score  
**Fecha de revisión:** 9 de agosto de 2026  
**Rama revisada:** `miguel-dev`, integrada con `origin/daniela-dev` hasta `0fe9a53` y publicada en `03c96a0`

## Objetivo

Este documento aclara:

- Qué correspondía originalmente a Persona 4 (Miguel).
- Qué ya está implementado.
- Qué se agregó para desbloquear a Persona 5 (Magui).
- Qué continúa siendo responsabilidad de Persona 5.
- Qué dependencias deben verificarse en Supabase antes de integrar el canje completo.

## Alcance original de Persona 4

Persona 4 es responsable de la creación y administración de recompensas por aliados locales y patrocinadores institucionales verificados, así como de las insignias de aliados.

Su alcance incluye:

- Modelo y persistencia de recompensas.
- Elegibilidad y permisos en backend.
- Formulario de creación.
- Costos calculados por backend.
- Vigencia, inventario y estados.
- Panel del patrocinador.
- Métricas de impacto asociadas a recompensas.
- Insignias de aliados.
- Pruebas del flujo.

El documento original de asignación no menciona literalmente una ruta llamada `GET /recompensas/catalogo`. El catálogo y el flujo del usuario que canjea aparecen dentro de Persona 5. Sin embargo, como Persona 4 es propietaria del recurso `recompensas`, se acordó entregar el endpoint público de lectura para desbloquear el frontend de Persona 5.

## Entregas terminadas de Persona 4

### Recompensas y elegibilidad

- Aliado local verificado puede crear recompensas.
- Patrocinador institucional verificado puede crear recompensas.
- Donante comunitario es rechazado.
- Perfil pendiente o rechazado es bloqueado.
- Asociación desde su panel institucional es bloqueada.
- Los permisos se validan en backend.
- Las categorías y subcategorías deben pertenecer a las declaradas en el perfil.

### Datos y reglas

- Propietario.
- Tipo: descuento, producto o servicio.
- Categoría y subcategoría.
- Nombre y descripción.
- Nivel.
- Costo calculado en backend:
  - Pequeña: 100 puntos.
  - Mediana: 250 puntos.
  - Grande: 600 puntos.
- Unidades totales y disponibles.
- Inicio y vencimiento.
- Lugar, horario y forma de entrega.
- Condiciones.
- Confirmación de inventario separado.
- Estados: borrador, activa, pausada, agotada, vencida y archivada.
- Vigencia permitida de 30 a 90 días.
- Inventario en cero cambia la recompensa a agotada.
- Pausar o archivar no modifica las condiciones guardadas en códigos emitidos.
- Una recompensa con canjes no puede eliminarse.
- No existe renovación automática.
- No requiere aprobación administrativa adicional para publicarse.

### Panel del patrocinador

El frontend del aliado/patrocinador permite:

- Crear recompensas.
- Consultar recompensas propias.
- Filtrar activas, pausadas, agotadas y vencidas.
- Publicar, pausar, reactivar y archivar.
- Consultar unidades disponibles.
- Consultar canjes confirmados.
- Consultar personas beneficiadas.
- Mostrar la etiqueta “Ofrece beneficios”.
- Confirmar manualmente un código de canje.

### Insignias de aliados

Están implementadas:

- Aliado de impacto: cobre, plata y oro.
- Apoyo crítico.
- Constancia solidaria.
- Recurso multiplicado.
- Comunidad que recompensa.

También se agregó reevaluación idempotente al consultar el panel, de modo que contribuciones históricas confirmadas antes de existir el motor puedan generar sus insignias sin crear duplicados.

## Endpoint público entregado para Persona 5

### Ruta

```http
GET /recompensas/catalogo
```

### Autenticación

No requiere token. Es un endpoint público de solo lectura.

La lectura se realiza desde el backend; no se abren permisos públicos directos sobre las tablas protegidas por RLS.

### Filtros

Solo devuelve recompensas:

- Con estado `activa`.
- Con fecha de inicio menor o igual a la fecha actual.
- Con vencimiento mayor o igual a la fecha actual.
- Con `unidades_disponibles > 0`.
- Propiedad de un aliado local o patrocinador institucional.
- Con perfil verificado por administración.

### Contrato definitivo

```json
[
  {
    "id": "uuid-recompensa",
    "propietario_id": "uuid-perfil-apoyo",
    "patrocinador_nombre": "Patrocinador Ejemplo AC",
    "patrocinador_tipo": "patrocinador_institucional",
    "tipo": "producto",
    "categoria": "alimentos",
    "subcategoria": "croquetas",
    "nombre": "Bolsa de croquetas",
    "descripcion": "Bolsa de alimento para mascota.",
    "nivel": "pequena",
    "costo": 100,
    "unidades_disponibles": 4,
    "inicio": "2026-08-01",
    "vencimiento": "2026-09-30",
    "sucursal_lugar": "Sucursal Centro",
    "horario": "L-V 9-18h",
    "forma_entrega": "Presentar QR",
    "condiciones": "Una por persona",
    "ubicacion_publica": {
      "lugar": "Sucursal Centro"
    },
    "estado": "activa"
  }
]
```

Los siguientes campos pueden ser `null`:

- `subcategoria`.
- `sucursal_lugar`.
- `horario`.
- `condiciones`.
- `ubicacion_publica.lugar`.

Por privacidad, el endpoint no expone `zona_cobertura`, coordenadas ni domicilio privado del perfil. `ubicacion_publica` contiene únicamente el lugar proporcionado expresamente al crear la recompensa.

### Estado de verificación

- Pruebas específicas del módulo: aprobadas.
- Regresión completa del backend: `524 passed`.
- Contrato registrado en OpenAPI.
- Consulta de solo lectura contra el Supabase configurado: ejecutada correctamente.
- La consulta regresó cero elementos porque actualmente no existen recompensas que cumplan todos los filtros; no fue un error del endpoint.

### Estado de publicación

El endpoint fue incluido en el commit `03c96a0` (`feat(recompensas): agregar catalogo publico para canjes`) y ya está publicado en `origin/miguel-dev`, por lo que Magui puede integrarlo desde Git.

## Base existente que Persona 5 puede reutilizar

Persona 4 ya proporciona:

- Tabla `recompensas`.
- Tabla básica `canjes_recompensa`.
- Inventario reservado de manera atómica mediante `emitir_canje_recompensa`.
- Confirmación básica mediante `confirmar_canje_recompensa`.
- Snapshots de costo, condiciones y forma de entrega.
- Validación de propiedad al confirmar códigos.
- Cambio automático a agotada cuando el inventario llega a cero.
- Métricas de canjes y personas beneficiadas.
- Evaluación de “Comunidad que recompensa” después de confirmaciones.
- Endpoint público del catálogo.

Esta base no representa el flujo completo de Persona 5.

## Pendientes que corresponden a Persona 5

### Backend y base de datos de canjes

- Integrar `reservar_puntos` al crear un canje.
- Confirmar definitivamente los puntos reservados al completar el canje.
- Devolver puntos cuando un canje expire o sea cancelado.
- Incorporar vencimiento de 48 horas.
- Incorporar estados reservado/emitido, confirmado, expirado, cancelado y reembolsado de acuerdo con el contrato final del equipo.
- Registrar motivo de cancelación o reembolso.
- Guardar el patrocinador que confirmó.
- Validar que el usuario sea reportante o voluntario elegible.
- Impedir más de un QR activo por usuario.
- Aplicar máximo global de dos canjes en 30 días.
- Aplicar límites por patrocinador según el nivel: 30, 90 o 365 días.
- Crear cron idempotente de expiración.
- Devolver inventario cuando corresponda.
- Implementar reembolsos administrativos idempotentes.
- Evitar reutilización del QR.

### Frontend de Persona 5

- Pantalla del catálogo.
- Filtros del catálogo.
- Reserva desde el usuario.
- Pantalla de QR y temporizador de 48 horas.
- Mis canjes activos y anteriores.
- Estados de canje visibles.
- Escáner con cámara del patrocinador.
- Centro de reputación completo.
- Historial de movimientos.
- Insignias separadas por rol.
- Integración final de accesos en el perfil.

La captura manual de un código ya existe en el panel del patrocinador, pero no sustituye el escáner QR completo de Persona 5.

## Elementos del análisis anterior que ya están desactualizados

El análisis anterior indicaba que:

- No existía `GET /recompensas/catalogo`.
- Los hooks de reputación no se utilizaban en ninguna pantalla.
- El perfil no mostraba saldo ni insignias de gamificación.

Estado actual:

- El endpoint del catálogo ya fue implementado y publicado en `origin/miguel-dev`.
- `SaldoReputacionCard` ya está integrado en `LoggedInProfile`.
- Las insignias del reportante se integraron mediante `ImpactoInsigniasToggle` y `ReportanteInsigniasCard`.
- Aún falta un Centro de Reputación completo y el frontend de catálogo/canjes de Persona 5.

## Dependencias compartidas por confirmar

Los archivos de migración `0052_confirmar_liberar_puntos.sql` y `0053_confirmar_regla_segura.sql` existen en Git.

La presencia del archivo no demuestra que la migración se haya ejecutado en Supabase. Jass o la persona responsable del despliegue debe confirmar su aplicación antes de que Persona 5 dependa de:

- `confirmar_puntos_reservados_atomico`.
- El cálculo atómico del saldo desglosado.
- La corrección segura de reglas en la confirmación.

## Conclusión de responsabilidades

### Miguel / Persona 4

Su alcance original de recompensas, panel del patrocinador e insignias está implementado. También se agregó el endpoint público del catálogo como contrato de integración para desbloquear a Magui.

### Magui / Persona 5

Continúa siendo responsable del ciclo del usuario que canjea: puntos, reserva, QR, expiración, límites, devoluciones, reembolsos, catálogo visual, escáner y Centro de Reputación.

### Mensaje breve para el equipo

> Persona 4 ya entrega la gestión completa de recompensas, panel del patrocinador, insignias de aliados y `GET /recompensas/catalogo`. El endpoint del catálogo no estaba nombrado explícitamente en el checklist original de Persona 4, pero se agregó para desbloquear la integración. Persona 5 conserva la responsabilidad del ciclo de canje: puntos, reserva, QR de 48 horas, expiraciones, límites, devoluciones, reembolsos y frontend del usuario. Las migraciones 0052/0053 existen en Git, pero debe confirmarse si ya fueron ejecutadas en Supabase.
