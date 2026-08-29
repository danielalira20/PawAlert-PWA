# Auditoria de esquema para adopciones y eventos

Fecha de revision: 2026-08-28.

Esta auditoria cierra la subfase 1.0 previa a las migraciones de adopciones y
eventos. Se compararon las migraciones versionadas, los modelos y servicios del
backend, el esquema de referencia proporcionado y los metadatos OpenAPI que
expone actualmente PostgREST en el proyecto configurado de Supabase.

La consulta remota fue exclusivamente de metadatos, roles y configuracion de
buckets. No se leyeron registros de usuarios, reportes, asociaciones ni
animales.

## Resultado general

- Las tablas base existen en Supabase, pero su `CREATE TABLE` original no esta
  completamente versionado en el repositorio.
- Las migraciones posteriores si describen los cambios relevantes desde
  multi-animal, custodia, Push, moderacion y Urgency.
- La siguiente numeracion disponible en `daniela-dev` es `0086`, pero debe
  confirmarse otra vez inmediatamente antes de integrar ramas.
- Adopciones y eventos deben operar mediante el backend y funciones de base de
  datos. No dependeran de escrituras directas de Supabase desde el frontend.
- Las tablas nuevas nacen con RLS habilitado y sin permisos para `anon` o
  `authenticated`; `service_role` sera la unica escritura inicial.

## Tablas base confirmadas

| Tabla | Llave y relaciones relevantes | Decision para el modulo |
|---|---|---|
| `usuarios` | `id`; `rol_id -> roles`; `asociacion_id -> asociaciones`; `auth_user_id` nullable | El solicitante debe tener cuenta autenticada. Staff se limita por `asociacion_id`. |
| `roles` | `id`, `nombre`, `activo` | Se usan `asociacion`, `staff`, `voluntario_externo` y `admin` con sus nombres actuales. |
| `asociaciones` | `id`, `verificado`, `activo`, ubicacion y responsable | Publicar exige `verificado = true` y `activo = true`. |
| `reportes` | `id`, `asociacion_asignada_id`, estados operativos y ubicacion | Solo aporta procedencia. Adopcion y eventos no cambian el reporte. |
| `animal` | `id -> reportes`; catalogos; `es_grupo`; `cantidad`; `orden` | Es procedencia opcional del perfil. Los grupos requieren indice individual. |
| `animal_fotos` | `animal_id -> animal`; fotos y analisis | No se copian automaticamente como publicas; la asociacion elige fotos autorizadas. |
| `custodias_temporales` | `reporte_id`; `voluntario_id`; `asociacion_coordinadora_id`; `estado` | La custodia es del reporte, no del animal. Cada propuesta debe identificar `animal_id`. |
| `perfil_casa_temporal` | `voluntario_id`; domicilio, ubicacion y documentos | No se consulta ni expone desde endpoints publicos de adopcion. |
| `notificaciones_push` | `usuario_id`; FKs de reporte, propuesta y custodia; idempotencia | Se ampliara con referencias de adopcion y evento, sin romper las actuales. |
| `historial_reporte` | Requiere `reporte_id` | No sirve para ingresos formales sin reporte. Se crean historiales separados. |

## Roles observados

El catalogo actual contiene:

- `admin` activo;
- `asociacion` activo;
- `reportante` activo;
- `staff` activo;
- `voluntario_externo` activo;
- `voluntario_interno` activo;
- `aliado_local` inactivo;
- `patrocinador_institucional` inactivo.

Los aliados se autorizan mediante `perfil_apoyo.tipo` y
`perfil_apoyo.verificado_admin`, no mediante el rol inactivo. Por ello,
`eventos_colaboradores` debe referenciar `perfil_apoyo.id`.

## Relacion exacta con custodia

`custodias_temporales` tiene una FK a `reportes`, no a `animal`. Un reporte
puede contener varios animales y una ficha `animal` puede representar un grupo.

Para evitar ambiguedad:

- `solicitudes_ingreso_adopcion` guarda `custodia_id`, `reporte_id`,
  `animal_id` y `origen_individuo`;
- el backend comprueba que el animal pertenece al reporte de la custodia;
- para `es_grupo = false`, `origen_individuo` siempre vale 1;
- para `es_grupo = true`, el valor esta entre 1 y `cantidad`;
- el indice unico de perfil activo usa `(animal_id, origen_individuo)`;
- un ingreso formal sin reporte deja estas referencias en `NULL`.

La adopcion no modifica `custodias_temporales.estado`. Al completar una entrega
solo produce un comando para el servicio de custodia, que conserva sus propias
validaciones y transacciones.

## Asociacion coordinadora y propiedad

La propiedad operativa se determina asi:

- propuesta desde custodia: `asociacion_coordinadora_id` de la custodia;
- ingreso formal: asociacion del usuario que crea el perfil;
- solicitud de adoptante: usuario autenticado propietario de la solicitud;
- evento: asociacion organizadora del usuario autenticado;
- colaboracion: `perfil_apoyo` verificado que acepta la invitacion.

Una asociacion debe estar verificada y activa al crear, aprobar, publicar,
seleccionar, programar o cancelar. Si pierde cualquiera de esas condiciones:

- sus perfiles publicados pasan a una pausa operativa mediante una funcion
  controlada;
- sus eventos publicados se ocultan o pausan;
- una entrega en curso no se cancela automaticamente;
- administracion recibe un caso para resolver la continuidad.

## Almacenamiento confirmado

Existen dos buckets:

| Bucket | Publico | Uso actual |
|---|---:|---|
| `pawalert-fotos` | Si | Fotografias ordinarias de la plataforma |
| `pawalert-evidencias-privadas` | No | Evidencias sensibles de rescate |

Ninguno tiene limites globales de tamanio o MIME configurados. Modificarlos
podria afectar flujos existentes, por lo que no se cambiaran.

Plan para los modulos nuevos:

- fotos publicas de perfiles: `pawalert-fotos/adopciones/perfiles/...`;
- imagenes publicas de eventos: `pawalert-fotos/eventos/...`;
- crear `pawalert-adopciones-privado` para identificaciones, comprobantes,
  acuerdos, entregas y seguimientos;
- validar MIME y tamanio en el backend por tipo de documento;
- almacenar rutas internas, no URLs firmadas permanentes;
- firmar accesos privados solo despues de comprobar permisos.

Separar el bucket de adopciones evita alterar la retencion o permisos de las
evidencias sensibles del flujo de rescate.

## Outbox e historial

`notificaciones_push` ya implementa:

- estado `pendiente`, `enviada`, `fallida` u `omitida`;
- reintentos;
- error sanitizado;
- unicidad `(usuario_id, idempotency_key)`;
- RLS y acceso exclusivo de `service_role`.

Se reutilizara el mismo outbox. La migracion de operaciones agregara como
maximo `perfil_adopcion_id` y `evento_id` opcionales. Las solicitudes,
entregas o seguimientos concretos viajaran dentro del `payload`, sin incluir
documentos ni datos sensibles.

No se reutiliza `historial_reporte`, porque exige `reporte_id` y los ingresos
formales o eventos pueden no tenerlo. Se crean `historial_adopcion` e
`historial_evento`, ambos inmutables.

## Estrategia de seguridad acordada

Cada migracion que cree tablas debe incluir inmediatamente:

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.<tabla> FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.<tabla> TO service_role;
```

Las funciones criticas usan `SECURITY DEFINER`, `SET search_path = public`,
bloqueos de fila cuando exista concurrencia, y permisos:

```sql
REVOKE ALL ON FUNCTION public.<funcion>(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<funcion>(...) TO service_role;
```

La lectura publica tambien pasara inicialmente por FastAPI. Esto permite
devolver solamente campos publicables y evita depender de joins RLS complejos
durante la primera version.

## Estructura reservada para las siguientes migraciones

### `0086_adopciones_ingreso_perfiles.sql`

- `solicitudes_ingreso_adopcion`;
- `perfiles_adopcion`;
- `fotos_perfil_adopcion`;
- `historial_adopcion`;
- bucket privado de adopciones;
- indices unicos parciales;
- RLS denegado por defecto.

### `0087_adopciones_solicitudes_requisitos.sql`

- plantillas y preguntas de requisitos;
- solicitudes y respuestas;
- versionado de requisitos;
- referencias de documentos privados.

### `0088_adopciones_entregas_seguimientos.sql`

- entregas;
- confirmaciones;
- seguimientos 7, 30 y 90;
- alertas de bienestar.

### `0089_eventos_asociacion.sql`

- eventos;
- colaboradores;
- perfiles vinculados;
- eventos guardados;
- historial y RLS.

### `0090_adopciones_eventos_infraestructura_operativa.sql`

- ampliacion segura del outbox;
- validadores compartidos de asociacion y administracion;
- ejecuciones y claims idempotentes para cron;
- permisos de funciones.

### `0091_adopciones_ingreso_perfiles_operaciones.sql`

- propuesta idempotente desde una custodia activa;
- respuesta de aclaraciones y cancelacion por el custodio;
- resolucion por la asociacion, con un solo borrador al aprobar;
- creacion de perfiles por ingreso formal de la asociacion;
- publicacion con foto, revision y requisitos versionados;
- pausa y reanudacion auditadas;
- avisos de ingreso vinculados al outbox.

### `0092_adopciones_editor_fotografias_operaciones.sql`

- edicion de campos publicables en borrador o pausa;
- invalidacion de revisiones cuando cambia el perfil;
- registro privado de fotografias con metadatos verificados;
- revision explicita de fotografias publicables;
- retiro auditado y limpieza posterior del objeto en Storage.

### Migraciones operativas posteriores

- solicitudes, seleccion, entregas y seguimientos;
- publicacion, cambios y ciclo de vida de eventos.

Estas transiciones se separan para que cada grupo pueda probarse e integrarse
sin mezclar estados de adopcion, custodia y eventos en una sola operacion.

## Riesgos detectados y respuesta

| Riesgo | Respuesta acordada |
|---|---|
| Esquema base incompleto en Git | Las nuevas migraciones no recrean tablas base; usan las FKs confirmadas. |
| Numeros de migracion duplicados existentes | Confirmar el siguiente numero antes de cada integracion. |
| Custodia ligada al reporte completo | Exigir `animal_id` y `origen_individuo`. |
| Aliados con roles inactivos | Validar `perfil_apoyo.verificado_admin`. |
| Bucket publico sin limites | Validar archivos en backend y usar prefijos. |
| Evidencias de rescate y adopcion con distinta retencion | Crear bucket privado separado. |
| Outbox sin referencias nuevas | Agregar FKs opcionales sin cambiar las existentes. |
| Asociacion verificada pero inactiva | Exigir ambas condiciones en cada escritura. |

## Criterios de cierre de la subfase 1.0

- tablas y FKs necesarias confirmadas contra Supabase;
- roles reales identificados;
- propiedad de cada entidad definida;
- estrategia para grupos multi-animal definida;
- buckets publicos y privados identificados;
- estrategia RLS y backend-only definida;
- integracion con outbox e historiales definida;
- numeracion y contenido de migraciones siguientes reservados.

Con estos puntos, `0086_adopciones_ingreso_perfiles.sql` puede disenarse sin
esperar cambios de frontend ni del modulo de eventos.
