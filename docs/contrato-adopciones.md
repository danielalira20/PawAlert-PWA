# Contrato funcional y tecnico del modulo de adopciones

Este documento fija la primera version del modulo de adopciones de PawAlert.
Su objetivo es permitir que un animal rescatado o recibido formalmente por una
asociacion llegue a un hogar definitivo mediante un proceso trazable, sin
confundir la adopcion con el cierre de un reporte o de una custodia temporal.

## Decisiones obligatorias

- Solo una asociacion verificada puede coordinar y publicar una adopcion.
- Cada perfil de adopcion representa a un solo animal. Un reporte grupal debe
  individualizar a cada animal antes de publicarlo.
- Un voluntario o casa temporal puede proponer un ingreso, pero no publicar,
  revisar solicitantes, seleccionar adoptante ni confirmar la adopcion solo.
- La custodia fisica no cambia por crear, aprobar o publicar un perfil.
- La adopcion no es una resolucion de `custodias_temporales` ni un estado del
  reporte. La migracion `0044_retirar_adopcion_cierre_custodia.sql` continua
  vigente.
- No se publica la ubicacion exacta del animal, documentos personales,
  telefonos privados ni datos del hogar temporal.
- La entrega requiere seleccion previa, confirmacion de quien entrega y de
  quien recibe. Si entrega una casa temporal, la asociacion tambien valida el
  resultado. Una aprobacion administrativa no demuestra que hubo entrega.
- Gemini puede ayudar a revisar calidad o consistencia de fotografias, pero no
  decide idoneidad, seleccion ni rechazo de una persona.
- La adopcion no usa Urgency Score, matching, OSRM ni VROOM.

## Alcance de la primera version

Se admiten dos origenes:

- `custodia_pawalert`: animal vinculado a una custodia temporal y a una
  asociacion coordinadora;
- `ingreso_formal_asociacion`: animal que una asociacion verificada ya tiene
  bajo su responsabilidad, aunque no provenga de un reporte de PawAlert.

No se admiten publicaciones particulares. Una persona que quiera entregar un
animal debe ser canalizada a una asociacion; no puede crear directamente un
perfil publico.

## Actores y permisos

| Accion | Visitante | Solicitante | Casa temporal | Asociacion | Admin |
|---|---:|---:|---:|---:|---:|
| Ver galeria y perfil publicado | Si | Si | Si | Si | Si |
| Guardar borrador de solicitud | No | Si | No | No | No |
| Enviar solicitud de adopcion | No | Si | No | No | No |
| Proponer ingreso desde su custodia | No | No | Si | No | No |
| Crear ingreso formal | No | No | No | Si | No |
| Aprobar ingreso y publicar perfil | No | No | No | Si | No |
| Consultar solicitudes y documentos | No | Propios | No | Propios | Auditoria |
| Seleccionar adoptante | No | No | No | Si | No |
| Confirmar recepcion | No | Si | No | No | Intervencion |
| Registrar entrega fisica | No | No | Si | Si | Intervencion |
| Validar entrega coordinada | No | No | No | Si | Intervencion |
| Suspender por seguridad | No | No | No | Perfil propio | Si |

`Asociacion` incluye al rol `asociacion` y a su `staff`, siempre que el usuario
pertenezca a la misma asociacion y esta conserve `verificado = true`. El
backend debe comprobar rol, pertenencia y verificacion en cada accion; no es
suficiente ocultar botones.

Administracion modera y resuelve incidentes. No sustituye a la asociacion en
la evaluacion ordinaria ni selecciona adoptantes, salvo una intervencion
registrada por riesgo, abandono del proceso o perdida de verificacion.

## Solicitud de ingreso desde custodia

La accion visible se llama `Proponer para adopcion` y vive en la custodia
existente. Solo se habilita si:

- el usuario es el custodio activo;
- la custodia esta en `activo` o `extension_pendiente`;
- existe una asociacion coordinadora verificada;
- el animal esta localizado, con vida y no tiene un resultado incompatible;
- no hay otra solicitud de ingreso abierta para el mismo animal;
- el animal no tiene ya un perfil no terminal.

Si no existe coordinadora, la interfaz muestra `Solicitar coordinacion para
adopcion`. Esa accion crea un caso administrativo de vinculacion, pero no una
publicacion ni una solicitud de ingreso aprobable.

La propuesta solicita:

- animal individual al que corresponde;
- nombre temporal, si existe;
- fotografias recientes;
- salud y tratamientos conocidos;
- temperamento y comportamiento observados;
- compatibilidad observada, sin presentarla como garantia;
- motivo de la propuesta;
- fecha hasta la que el custodio puede continuar;
- autorizacion para que la asociacion solicite aclaraciones.

La propuesta no modifica el estado del reporte, la custodia, el responsable,
la fecha limite ni los seguimientos ya programados.

## Estados de ingreso

`solicitudes_ingreso_adopcion.estado` acepta:

- `pendiente`: enviada y aun no revisada;
- `requiere_informacion`: la asociacion pidio una aclaracion;
- `aprobada`: se autorizo crear el perfil en borrador;
- `rechazada`: no procede, con motivo obligatorio;
- `cancelada`: el proponente la retiro antes de una decision;
- `no_elegible`: un cambio medico, legal o de custodia impide continuar.

Transiciones permitidas:

```text
pendiente -> requiere_informacion | aprobada | rechazada | cancelada | no_elegible
requiere_informacion -> pendiente | aprobada | rechazada | cancelada | no_elegible
```

`aprobada`, `rechazada`, `cancelada` y `no_elegible` son terminales. Aprobar
debe crear exactamente un perfil `borrador` en la misma transaccion.

## Perfil de adopcion

Un perfil guarda como minimo:

- `asociacion_id` responsable;
- origen, y referencias a reporte, animal o custodia cuando existan;
- nombre publico, especie, sexo, edad aproximada y tamanio;
- descripcion y personalidad observada;
- salud conocida, tratamientos y necesidades especiales;
- vacunacion, esterilizacion y revision medica con estado verificable;
- compatibilidad declarada y nivel de certeza;
- fotografias publicables ordenadas;
- zona general, nunca coordenadas o domicilio del custodio;
- requisitos base y version de requisitos de la asociacion;
- fecha de publicacion y ultima actualizacion.

Estados de `perfiles_adopcion`:

- `borrador`: solo visible para la asociacion y actores autorizados;
- `publicado`: visible y abierto a solicitudes;
- `pausado`: oculto temporalmente y sin solicitudes nuevas;
- `en_proceso`: existe una solicitud seleccionada y no se aceptan nuevas;
- `adoptado`: entrega confirmada por ambas partes;
- `retirado`: la asociacion retiro definitivamente la publicacion;
- `fallecido`: el animal ya no es elegible.

Transiciones permitidas:

```text
borrador -> publicado | retirado | fallecido
publicado -> pausado | en_proceso | retirado | fallecido
pausado -> publicado | en_proceso | retirado | fallecido
en_proceso -> publicado | pausado | adoptado | retirado | fallecido
```

Los estados `adoptado`, `retirado` y `fallecido` son terminales. Una correccion
posterior requiere una operacion administrativa auditada, no una edicion
directa.

Antes de publicar, la asociacion debe confirmar que reviso la situacion medica
y juridica disponible. `Desconocido` es valido para un dato clinico que aun no
se conoce, pero debe mostrarse como tal; nunca se convierte en `completo` por
omision.

## Requisitos de adopcion

PawAlert mantiene requisitos base que una asociacion no puede eliminar:

- identidad y mayoria de edad;
- domicilio y medio de contacto verificables;
- composicion del hogar y consentimiento de sus integrantes;
- condiciones de vivienda y seguridad;
- animales que ya habitan en el hogar;
- capacidad y compromiso de atencion veterinaria;
- aceptacion de seguimiento y devolucion responsable;
- declaracion de veracidad y tratamiento de datos.

La asociacion puede agregar preguntas propias de tipo texto corto, texto largo,
seleccion unica, seleccion multiple, booleano, fecha o documento. Cada pregunta
debe indicar si es obligatoria y por que se solicita.

Al enviar una solicitud se guarda una copia versionada de los requisitos y
preguntas vigentes. Cambiar la plantilla no altera solicitudes ya enviadas.

## Estados de solicitud del adoptante

`solicitudes_adopcion.estado` acepta:

- `borrador`;
- `enviada`;
- `requiere_informacion`;
- `en_evaluacion`;
- `entrevista_programada`;
- `seleccionada`;
- `rechazada`;
- `retirada`;
- `vencida`;
- `cerrada_por_adopcion`;
- `adopcion_confirmada`.

El solicitante puede editar solo un `borrador`, responder una aclaracion o
retirar una solicitud que aun no tenga entrega completada. Una solicitud
enviada conserva sus respuestas originales y agrega aclaraciones separadas.

El rechazo exige un motivo interno y una categoria comunicable. No deben
enviarse al usuario notas sensibles, comparaciones con otras personas ni
acusaciones no revisadas.

## Seleccion y concurrencia

Seleccionar una solicitud es una operacion atomica que debe:

1. bloquear el perfil y comprobar que sigue `publicado` o `pausado`;
2. comprobar que la solicitud pertenece al perfil y sigue vigente;
3. mover el perfil a `en_proceso`;
4. mover la solicitud elegida a `seleccionada`;
5. conservar las demas en evaluacion hasta la entrega, sin rechazarlas todavia;
6. registrar actor, fecha y evento de historial;
7. encolar las notificaciones mediante outbox.

Un segundo intento concurrente debe devolver `409 conflicto` sin cambios
parciales. Si la seleccion se cancela, la asociacion decide si el perfil vuelve
a `publicado` o `pausado`; solo entonces puede seleccionar otra solicitud.

## Entrega y relacion con custodia

La entrega se registra por separado con:

- solicitud seleccionada;
- fecha y ventana acordadas;
- lugar privado o modalidad autorizada;
- custodio que entrega;
- representante de la asociacion;
- confirmacion del adoptante;
- acuerdo y evidencias privadas permitidas.

Estados de `entregas_adopcion`:

- `por_programar`;
- `programada`;
- `confirmacion_parcial`;
- `completada`;
- `cancelada`.

El actor que entrega y el adoptante confirman con marcas independientes. Si la
asociacion realiza la entrega, su confirmacion tambien constituye la validacion
de coordinacion. Si entrega una casa temporal, la asociacion debe validar el
resultado antes de completarlo.

Cuando existen las confirmaciones requeridas, una operacion atomica:

1. mueve la entrega a `completada`;
2. mueve la solicitud elegida a `adopcion_confirmada`;
3. mueve el perfil a `adoptado`;
4. cierra las demas solicitudes no terminales como
   `cerrada_por_adopcion`, con la categoria publica `animal_adoptado`;
5. crea los seguimientos posteriores;
6. registra historial y notificaciones una sola vez.

Si el animal estaba en casa temporal, completar la adopcion crea una solicitud
de finalizacion o transferencia para el flujo de custodia. La custodia solo se
cierra mediante su operacion autorizada y nunca por una actualizacion directa
desde adopciones. Si una confirmacion falta, la custodia permanece activa.

## Seguimientos posteriores

Al completar la entrega se programan seguimientos a los 7, 30 y 90 dias. Cada
seguimiento puede quedar:

- `pendiente`;
- `respondido`;
- `validado`;
- `requiere_contacto`;
- `vencido`;
- `cerrado`.

En la fecha objetivo se avisa al adoptante. A las 48 horas sin respuesta se
repite el aviso y se informa a la asociacion. A los 7 dias se marca `vencido` y
se crea una tarea para la asociacion. Un seguimiento rutinario vencido no
genera por si solo una sancion ni una visita.

Una alerta explicita de bienestar se notifica inmediatamente a la asociacion.
Si no se registra atencion en 48 horas, se escala a administracion. No reabre
automaticamente el reporte ni la custodia original.

## Entidades de persistencia

La implementacion debe separar como minimo:

- `solicitudes_ingreso_adopcion`;
- `perfiles_adopcion`;
- `fotos_perfil_adopcion`;
- `plantillas_requisitos_adopcion`;
- `solicitudes_adopcion`;
- `respuestas_solicitud_adopcion`;
- `entregas_adopcion`;
- `seguimientos_adopcion`;
- `historial_adopcion`.

Las relaciones a `reporte_id`, `animal_id` y `custodia_id` son opcionales para
un ingreso formal, pero obligatorias cuando el origen es `custodia_pawalert`.
La asociacion responsable siempre es obligatoria.

Restricciones minimas de base de datos:

- una solicitud de ingreso abierta por animal;
- un perfil no terminal por animal de PawAlert;
- una solicitud no terminal por persona y perfil;
- una solicitud seleccionada por perfil;
- una entrega activa por perfil;
- historial inmutable;
- claves idempotentes para comandos y notificaciones.

## Contrato HTTP propuesto

Lectura publica:

```text
GET /adoptions
GET /adoptions/{profile_id}
```

Solicitante autenticado:

```text
POST  /adoptions/{profile_id}/applications/draft
PATCH /adoption-applications/{application_id}/draft
POST  /adoption-applications/{application_id}/submit
POST  /adoption-applications/{application_id}/withdraw
GET   /me/adoption-applications
POST  /adoption-deliveries/{delivery_id}/confirm-recipient
POST  /adoption-deliveries/{delivery_id}/confirm-handover
POST  /adoption-followups/{followup_id}/respond
```

Casa temporal:

```text
POST /custody/{custody_id}/adoption-intake-requests
GET  /custody/{custody_id}/adoption-intake-request
POST /adoption-intake-requests/{request_id}/clarifications
POST /adoption-intake-requests/{request_id}/cancel
```

Asociacion verificada:

```text
GET   /associations/me/adoption-intake-requests
POST  /adoption-intake-requests/{request_id}/resolve
POST  /associations/me/adoptions
PATCH /associations/me/adoptions/{profile_id}
POST  /associations/me/adoptions/{profile_id}/publish
POST  /associations/me/adoptions/{profile_id}/pause
GET   /associations/me/adoptions/{profile_id}/applications
POST  /adoption-applications/{application_id}/request-information
POST  /adoption-applications/{application_id}/select
POST  /adoption-applications/{application_id}/reject
POST  /adoption-deliveries/{delivery_id}/schedule
POST  /adoption-deliveries/{delivery_id}/confirm-association
POST  /adoption-deliveries/{delivery_id}/validate-coordination
```

Administracion:

```text
GET  /admin/adoptions/incidents
POST /admin/adoptions/{profile_id}/suspend
POST /admin/adoptions/{profile_id}/restore
```

Los nombres pueden agruparse en routers distintos, pero no debe cambiar su
semantica, autoridad ni efectos transaccionales.

## Respuestas y errores comunes

- `401`: no existe una sesion valida;
- `403`: rol, asociacion, pertenencia o verificacion insuficiente;
- `404`: el recurso no existe o no es visible para ese actor;
- `409`: estado incompatible, solicitud duplicada o seleccion concurrente;
- `422`: datos incompletos, requisitos sin responder o transicion invalida.

Las respuestas de escritura incluyen `id`, `estado`, `updated_at` y un
`event_id` o clave idempotente para reconciliar reintentos del frontend.

## Privacidad y almacenamiento

Las fotografias aprobadas del perfil pueden ser publicas. Permanecen privadas:

- identificaciones y comprobantes de domicilio;
- contratos y firmas;
- ubicacion del animal o del hogar temporal;
- notas internas y motivos sensibles;
- evidencias de entrega y seguimiento que contengan datos personales.

Los documentos privados se entregan mediante URLs firmadas de corta duracion.
El backend valida permiso antes de firmar cada acceso. Las notificaciones no
incluyen documentos, coordenadas, domicilios ni notas internas.

## Historial y notificaciones

Eventos minimos:

- `adopcion_ingreso_propuesto`;
- `adopcion_ingreso_requiere_informacion`;
- `adopcion_ingreso_aprobado`;
- `adopcion_ingreso_rechazado`;
- `perfil_adopcion_publicado`;
- `perfil_adopcion_pausado`;
- `solicitud_adopcion_enviada`;
- `solicitud_adopcion_seleccionada`;
- `entrega_adopcion_programada`;
- `entrega_adopcion_confirmacion_parcial`;
- `adopcion_entrega_confirmada`;
- `seguimiento_adopcion_vencido`;
- `alerta_bienestar_adopcion`;
- `perfil_adopcion_suspendido_admin`.

Cada evento registra entidad, actor, asociacion, estado anterior, estado nuevo,
fecha y motivo. Las notificaciones se generan mediante el patron outbox y su
falla no revierte la operacion principal.

## Fronteras con otros modulos

- No modifica Urgency, cobertura, candidatos ni asignaciones.
- No publica al animal en `Casos cerca de mi`.
- No agrega animales adoptables como pines de rescate.
- Una feria puede enlazar perfiles `publicado`, pero no selecciona ni entrega.
- No concede puntos por publicar o seleccionar. Cualquier recompensa futura
  requiere una entrega completada y una regla idempotente independiente.
- Un fallecimiento pausa o termina el perfil, pero se resuelve en el flujo
  correspondiente; adopciones no certifica fallecimientos.

## Criterios minimos de aceptacion

- un voluntario no puede publicar ni consultar solicitantes;
- una asociacion no verificada no puede operar perfiles;
- proponer o publicar no cambia la custodia ni el reporte;
- un reporte grupal no se publica como si fuera un solo animal;
- dos selecciones simultaneas producen una ganadora y un `409`;
- los requisitos quedan versionados al enviar la solicitud;
- visitantes nunca reciben datos privados;
- una sola confirmacion no marca la adopcion como completada;
- una entrega hecha por la casa temporal exige validacion de la asociacion;
- completar la adopcion no salta las reglas de cierre de custodia;
- reintentos no duplican perfiles, historial ni notificaciones.

## Fuera de alcance inicial

- publicaciones directas de particulares;
- pagos, cuotas o donativos dentro de la solicitud;
- firma electronica con validez juridica avanzada;
- ranking automatico de adoptantes;
- aprobacion automatica mediante IA;
- visitas domiciliarias transmitidas en vivo;
- adopcion como resultado directo del bot de reportes.
