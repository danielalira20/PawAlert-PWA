# Contrato funcional y tecnico de eventos de asociaciones

Este documento fija la primera version de eventos publicos en PawAlert. Una
asociacion verificada puede publicar jornadas, campanias y actividades utiles
para la comunidad sin mezclarlas con reportes activos ni revelar ubicaciones
privadas de rescates, voluntarios o casas temporales.

Este contrato comparte autenticacion, auditoria y outbox con
[`contrato-adopciones.md`](./contrato-adopciones.md), pero conserva entidades y
estados completamente independientes.

## Decisiones obligatorias

- Solo asociaciones verificadas y activas, y su staff, pueden crear eventos.
- El evento pertenece a una asociacion organizadora responsable.
- La ubicacion publicada debe ser un establecimiento o punto autorizado para
  recibir asistentes; nunca se reutiliza la ubicacion de una custodia.
- Los eventos aparecen en una capa propia del mapa y no cuentan como reportes.
- Guardar un evento o marcar interes no reserva lugar ni equivale a registro.
- Para servicios clinicos se identifica al responsable profesional y se
  informa el alcance; PawAlert no garantiza disponibilidad ni diagnosticos.
- Una feria de adopcion puede enlazar perfiles publicados, pero no evita el
  proceso de solicitud, evaluacion y entrega.
- Los eventos no usan Urgency Score, matching, OSRM ni VROOM.

## Tipos iniciales

- `vacunacion`;
- `esterilizacion`;
- `feria_adopcion`;
- `identificacion`;
- `acopio`;
- `capacitacion`;
- `bienestar_animal`;
- `otro`.

`otro` exige una categoria publica y revision de la asociacion. Un evento no
puede anunciar venta de animales, practicas ilegales, servicios sin responsable
identificable ni actividades incompatibles con bienestar animal.

## Actores y permisos

| Accion | Visitante | Usuario | Asociacion | Admin | Aliado |
|---|---:|---:|---:|---:|---:|
| Ver evento publicado | Si | Si | Si | Si | Si |
| Guardar evento | No | Si | Si | Si | Si |
| Crear, editar y publicar | No | No | Propios | No | No |
| Cancelar | No | No | Propios | Intervencion | No |
| Vincular colaborador | No | No | Propios | No | Acepta |
| Suspender por seguridad | No | No | No | Si | No |

El backend comprueba rol, `asociacion_id`, `verificado = true` y
`activo = true` para cada escritura. Un `staff` solo opera eventos de su
asociacion. Perder la verificacion o quedar inactiva pausa las publicaciones
hasta una revision administrativa.

Un aliado puede aportar espacio, insumos o servicios mediante la Red de
Aliados, pero no se convierte por ello en organizador. Para aparecer como
colaborador debe existir una invitacion aceptada por su registro en
`perfil_apoyo`, con `verificado_admin = true`. No se usa `usuarios.rol_id`
para comprobar esta capacidad.

## Datos del evento

Campos obligatorios:

- asociacion organizadora;
- tipo, titulo y descripcion;
- fecha y hora de inicio y fin con zona horaria;
- nombre del lugar y direccion publica;
- coordenadas del lugar del evento;
- modalidad de acceso;
- especies o publico al que se dirige;
- requisitos para asistir;
- contacto institucional;
- costo o indicacion explicita `gratuito`;
- responsable operativo;
- fecha de ultima actualizacion.

Campos condicionales:

- cupo total, si existe limite;
- enlace externo, cuando la modalidad sea `registro_externo`;
- instrucciones de contacto, cuando sea `contacto_institucional`;
- cedula, institucion o responsable profesional para servicios clinicos;
- servicios, edades, condiciones excluidas y documentos requeridos;
- perfiles de adopcion vinculados para una feria;
- imagen publica y texto alternativo;
- indicaciones de accesibilidad y transporte.

No se puede publicar un evento cuyo fin sea anterior al inicio, que ya haya
terminado o que no tenga una ubicacion publica validable. El contacto personal
de un voluntario no debe usarse como contacto institucional.

Las fechas se almacenan en UTC y conservan la zona horaria elegida para
presentarlas correctamente. La interfaz no debe reinterpretarlas usando la
zona del dispositivo sin mostrar la zona del evento.

## Modalidades de acceso

- `sin_registro`: asistencia abierta, sujeta a las condiciones publicadas;
- `registro_externo`: PawAlert dirige al sitio oficial de la asociacion;
- `contacto_institucional`: la asociacion gestiona citas fuera de PawAlert.

La primera version no administra reservas ni pagos. El boton `Guardar evento`
solo crea una suscripcion para recibir cambios o cancelaciones y debe mostrar
claramente que no garantiza lugar.

## Estados del evento

`eventos_asociacion.estado` acepta:

- `borrador`: privado para la asociacion;
- `publicado`: visible antes y durante su vigencia;
- `pausado`: oculto temporalmente;
- `cancelado`: visible como cancelado desde enlaces ya compartidos;
- `finalizado`: termino su horario y permanece disponible por historial;
- `archivado`: deja de aparecer en consultas ordinarias;
- `suspendido_admin`: oculto por seguridad o moderacion.

Transiciones permitidas:

```text
borrador -> publicado | archivado
publicado -> pausado | cancelado | finalizado | suspendido_admin
pausado -> publicado | cancelado | archivado | suspendido_admin
finalizado -> archivado
suspendido_admin -> pausado | cancelado | archivado
```

`cancelado` y `archivado` son terminales para la asociacion. Restaurar un
evento suspendido requiere administracion. Un evento cancelado no se elimina:
su detalle conserva organizador, fecha, motivo publico y momento de cancelacion.

`cupo_estado` es un dato separado con valores `no_aplica`, `disponible` y
`agotado`. No debe mezclarse con `estado`.

## Publicacion y modificaciones

Publicar es una operacion atomica que valida datos, permisos, fechas y
requisitos condicionales. Debe registrar una version publica del evento para
que los cambios relevantes puedan auditarse.

Modificar titulo, ubicacion, fecha, horario, costo, requisitos o modalidad de
acceso despues de publicar debe:

1. guardar el cambio y su actor;
2. registrar `evento_actualizado` con los campos modificados;
3. notificar a los usuarios que guardaron el evento;
4. actualizar inmediatamente mapa y detalle.

Cambiar ubicacion o fecha cerca del inicio debe mostrar una advertencia
destacada. Cancelar exige motivo publico y encola una notificacion prioritaria.

## Capa del mapa

La interfaz incorpora una capa `Eventos`, independiente de reportes y de otros
recursos. Sus pines deben distinguirse por icono y no solamente por color.

La consulta del mapa devuelve solo eventos:

- `publicado`;
- dentro de la ventana configurable de proximos eventos;
- con coordenadas publicas validas;
- no suspendidos ni archivados.

La ventana inicial del mapa comprende eventos en curso y los que comienzan en
los siguientes 90 dias. La vista de la asociacion conserva todo su historial.

El pin muestra titulo, tipo, fecha, asociacion y estado de cupo. El detalle
completo se abre en una pantalla de evento. Los eventos no cambian el contador
de reportes activos, filtros de gravedad ni leyenda de condicion animal.

La ubicacion exacta de un evento es publica porque corresponde al lugar de la
actividad. Nunca debe calcularse copiando la ubicacion de un reporte, animal,
voluntario o custodia.

## Ferias de adopcion

Una feria puede vincular cero o mas `perfiles_adopcion` de la misma asociacion
o de una asociacion colaboradora que haya aceptado participar.

Solo se muestran perfiles en `publicado`. Si un perfil pasa a `en_proceso`,
`adoptado`, `retirado` o `fallecido`, deja de aparecer como disponible en el
evento sin alterar el evento.

Asistir, guardar el evento o conocer al animal no crea una solicitud de
adopcion. La accion visible sigue siendo `Solicitar adopcion` y utiliza el
contrato del modulo de adopciones.

## Entidades de persistencia

La implementacion debe separar como minimo:

- `eventos_asociacion`;
- `versiones_evento_asociacion`;
- `eventos_colaboradores`;
- `eventos_perfiles_adopcion`;
- `eventos_guardados`;
- `reportes_evento_asociacion`;
- `historial_evento`.

Restricciones minimas:

- cada evento tiene una sola asociacion organizadora;
- inicio menor que fin;
- coordenadas dentro de rangos validos;
- un usuario solo puede guardar una vez el mismo evento;
- un colaborador solo aparece publicamente cuando acepta;
- historial inmutable;
- claves idempotentes para publicacion, cancelacion y notificaciones.

Las tablas de aportaciones o necesidades de la Red de Aliados no sustituyen
`eventos_asociacion`: representan recursos, no publicaciones publicas con
horario y ubicacion.

## Contrato HTTP propuesto

### Estado de implementacion de JASS-02

La API base ya expone lectura publica, administracion del evento por su
asociacion y guardados del usuario. Sus modelos rechazan campos desconocidos,
fechas sin zona horaria, rangos invertidos y actualizaciones vacias. Los
errores conocidos de las RPC se traducen a respuestas `403`, `404`, `409` o
`422` sin devolver detalles internos de PostgreSQL.

La consulta `GET /events` pagina con `pagina` y `limite`, y admite `tipo`,
`asociacion_id`, `municipio`, `especie`, `gratuito`, `desde` y `hasta`.
`GET /events/map` usa una ventana maxima de 90 dias y permite acotar latitud y
longitud. Ambas consultas solo devuelven eventos publicados de asociaciones
activas y verificadas.

JASS-03 incorpora una imagen principal opcional por evento en el bucket
privado `pawalert-eventos-privado`. El backend valida y normaliza la imagen,
elimina metadatos, conserva solo su `storage_path` interno y entrega URLs
firmadas temporales junto con su expiracion. Reemplazar o retirar la imagen de
un evento publicado crea una nueva version, deja historial y notifica a sus
usuarios suscritos sin incluir rutas privadas.

Quedan fuera de JASS-02 los endpoints de reportes, colaboradores, perfiles de
adopcion vinculados y moderacion administrativa que se enumeran mas abajo.

Lectura publica:

```text
GET /events
GET /events/map
GET /events/{event_id}
```

Usuario autenticado:

```text
POST   /events/{event_id}/save
DELETE /events/{event_id}/save
POST   /events/{event_id}/report
GET    /me/saved-events
```

Asociacion verificada:

```text
GET   /associations/me/events
POST  /associations/me/events
PATCH /associations/me/events/{event_id}
PUT   /associations/me/events/{event_id}/image
DELETE /associations/me/events/{event_id}/image
POST  /associations/me/events/{event_id}/publish
POST  /associations/me/events/{event_id}/pause
POST  /associations/me/events/{event_id}/cancel
POST  /associations/me/events/{event_id}/collaborators
POST  /associations/me/events/{event_id}/adoption-profiles
```

Las escrituras basicas se apoyan en RPC atomicas versionadas en la migracion
`0097_eventos_operaciones_basicas.sql`:

- `crear_borrador_evento_asociacion`;
- `actualizar_evento_asociacion`;
- `publicar_evento_asociacion`;
- `pausar_evento_asociacion`;
- `cancelar_evento_asociacion`;
- `guardar_evento_asociacion`;
- `dejar_de_guardar_evento_asociacion`.

Las operaciones de asociacion bloquean el evento, validan nuevamente rol,
pertenencia, verificacion y actividad, y registran historial e idempotencia en
la misma transaccion. Publicar tambien crea un snapshot inmutable; editar un
evento que ya tuvo una version publica crea la siguiente version. Guardar un
evento es una suscripcion a cambios y nunca modifica el cupo.

Colaborador invitado:

```text
POST /events/{event_id}/collaborators/{collaboration_id}/respond
```

Administracion:

```text
GET  /admin/events/incidents
POST /admin/events/{event_id}/suspend
POST /admin/events/{event_id}/restore
```

Filtros publicos permitidos incluyen tipo, asociacion, fecha, municipio,
especie, gratuito y ventana geografica. La API no acepta filtros que revelen
datos privados de asistentes o custodias.

## Automatizacion y notificaciones

Un job idempotente ejecutado cada 15 minutos:

- mueve `publicado` a `finalizado` al superar la fecha de fin;
- archiva eventos finalizados 30 dias despues de su fecha de fin;
- no publica, cancela ni modifica eventos por su cuenta;
- encola avisos mediante outbox sin enviar dentro de la transaccion.

Eventos minimos de historial y notificacion:

- `evento_creado`;
- `evento_publicado`;
- `evento_actualizado`;
- `evento_pausado`;
- `evento_cancelado`;
- `evento_finalizado`;
- `evento_archivado`;
- `evento_guardado`;
- `colaborador_evento_invitado`;
- `colaborador_evento_aceptado`;
- `evento_suspendido_admin`.

Los usuarios que guardaron el evento reciben cambios relevantes y
cancelaciones. Las notificaciones no prometen cupo ni atencion y nunca incluyen
datos privados de terceros.

## Moderacion y seguridad

La aplicacion debe permitir reportar un evento por informacion falsa, servicio
riesgoso, ubicacion incorrecta, cobro no informado u otra causa. Administracion
puede suspenderlo sin borrar historial.

Para eventos clinicos, el perfil publico diferencia claramente entre:

- servicio confirmado por la organizacion;
- requisitos de elegibilidad;
- cupo informado;
- costos;
- datos profesionales declarados.

PawAlert no muestra como verificado un dato profesional que solo fue escrito
por la asociacion. La interfaz debe usar etiquetas distintas para `declarado`
y `verificado`.

## Fronteras con otros modulos

- No cambia reportes, Urgency, matching, cobertura ni asignaciones.
- No crea propuestas para voluntarios.
- No usa el radio aproximado de `Casos cerca de mi`.
- No convierte a un aliado en asociacion ni organizador.
- No asigna puntos por guardar o asistir a un evento.
- No comparte documentos de adopcion ni ubicaciones de custodia.
- El bot de reportes no crea ni modifica eventos en la primera version.

## Criterios minimos de aceptacion

- una asociacion no verificada recibe `403` al crear o publicar;
- un staff no puede editar eventos de otra asociacion;
- un borrador no aparece en mapa ni consultas publicas;
- un evento no aumenta el contador de reportes activos;
- cancelar conserva el detalle y notifica sin duplicados;
- guardar un evento no reserva cupo;
- un evento finalizado deja de aparecer como proximo;
- una feria no permite saltar la solicitud de adopcion;
- un colaborador no aparece antes de aceptar;
- ningun endpoint publico devuelve ubicaciones de rescate o custodia.

## Fuera de alcance inicial

- venta de boletos o cobros dentro de PawAlert;
- administracion de filas, turnos o expedientes clinicos;
- garantia automatica de cupo;
- eventos creados por particulares o aliados sin asociacion organizadora;
- rutas optimizadas hacia eventos;
- certificacion automatica de profesionales;
- chat publico entre asistentes.
