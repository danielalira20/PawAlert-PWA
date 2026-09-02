# Contrato de navegacion para un caso asignado

Este documento fija el comportamiento compartido entre backend, frontend,
OSRM, ubicacion del dispositivo y seguimiento operativo cuando un voluntario
ya confirmo la atencion de un reporte. Su objetivo es permitir que PawAlert
muestre y actualice una ruta dentro de la plataforma sin convertir el ruteo
en una nueva fuente de asignacion, sin exponer ubicaciones antes de tiempo y
sin prometer capacidades que una PWA no puede garantizar.

La navegacion comienza despues del despacho. No modifica el ranking de
voluntarios, Urgency Score, VROOM, la reserva de cobertura ni la confirmacion
del voluntario. Es una herramienta privada para ejecutar una asignacion que
la base de datos ya reconoce como valida.

| Campo | Valor |
|---|---|
| Version del contrato | `1` |
| Estado | Aprobado para implementar N0 y N1 |
| Baseline revisado | `daniela-dev` en `2e93c4b` |
| Alcance inmediato | Ruta embebida `driving` en primer plano |

Este archivo describe el destino de implementacion. La presencia de un campo,
endpoint o fase en el contrato no significa que ya exista en produccion.

### Estado actual del repositorio

Ya existe:

- cliente OSRM para matrices y rutas `driving`;
- geometria completa GeoJSON con `overview=full`;
- persistencia de duracion, distancia, geometria, origen y destino en la
  propuesta confirmada;
- seleccion del ultimo avistamiento validado como destino del calculo;
- exposicion de la ruta al voluntario asignado;
- resumen de minutos y kilometros en el detalle del caso;
- enlaces externos a Google Maps y Waze;
- componentes web y nativos capaces de dibujar `Polyline`.

Todavia no existe:

- endpoint de navegacion desde GPS actual;
- endpoint de capacidades;
- pantalla dedicada de navegacion;
- uso visual de la geometria guardada en el caso;
- modos `cycling` y `walking` desplegados;
- maniobras normalizadas;
- deteccion de desvio o recalculo automatico;
- seguimiento nativo en segundo plano.

Ademas, los enlaces externos actuales toman las coordenadas originales del
reporte. N0 debe corregirlos para que usen el destino autoritativo de la ruta
cuando exista un avistamiento validado.

## 1. Objetivo funcional

El voluntario responsable debe poder abrir un caso confirmado y consultar:

- su ubicacion actual dentro del mapa;
- la ultima ubicacion autoritativa del animal;
- una ruta vial dibujada entre ambos puntos;
- distancia y tiempo estimados;
- fecha de calculo y estado de vigencia de la ruta;
- modo de traslado disponible;
- una accion para recalcular y otra para abrir una aplicacion externa.

La primera entrega debe ofrecer una vista de navegacion operativa. No debe
presentarse como equivalente a Google Maps, Waze o Rappi si todavia no tiene
trafico en vivo, navegacion en segundo plano, instrucciones por voz o mapas
sin conexion.

## 2. Alcance y exclusiones

### Incluido

- calculo desde el GPS actual del voluntario;
- destino basado en la ultima ubicacion validada del animal;
- geometria GeoJSON `LineString` dibujada dentro de PawAlert;
- resumen de tiempo y distancia;
- seleccion de un modo de traslado que el backend declare disponible;
- recarga manual y recalculo controlado;
- actualizacion ante un nuevo avistamiento validado;
- fallback visible cuando OSRM, GPS o la red no estan disponibles;
- enlace de respaldo a Google Maps o Waze;
- comportamiento equivalente en web y nativo dentro de las capacidades de
  cada plataforma.

### Fuera del alcance inicial

- trafico vial en tiempo real;
- calculo basado en cierres viales no presentes en el dataset de OSRM;
- seguimiento publico del voluntario;
- transmision continua de su GPS a asociaciones o administracion;
- voz, funcionamiento con la pantalla bloqueada y ubicacion permanente en
  segundo plano;
- descarga masiva de mapas para uso sin conexion;
- sustitucion automatica del hito `llegada_zona_reporte`;
- autoasignacion o cambio de voluntario a partir de la navegacion.

## 3. Relacion con OSRM, VROOM y matching

Las responsabilidades quedan separadas:

- matching decide que voluntarios son compatibles;
- OSRM Table calcula la matriz vial usada para clasificar parejas;
- VROOM optimiza el lote de asignaciones permitido;
- la reserva transaccional confirma quien atiende el caso;
- OSRM Route calcula la ruta privada de la asignacion confirmada;
- la navegacion muestra y, cuando corresponde, recalcula esa ruta.

VROOM no genera instrucciones ni geometria para el mapa. La navegacion no
debe volver a ejecutar matching o VROOM y tampoco puede cambiar el resultado
de una asignacion.

Este contrato complementa:

- [`contrato-ranking-despacho.md`](./contrato-ranking-despacho.md);
- [`contrato-adaptador-vroom.md`](./contrato-adaptador-vroom.md);
- [`contrato-capa6-push.md`](./contrato-capa6-push.md);
- [`contrato-resultados-rescate.md`](./contrato-resultados-rescate.md).

### Flujo nominal

```text
VROOM o fallback propone una asignacion
  -> la base de datos reserva la propuesta
  -> el voluntario confirma
  -> el reporte pasa a en_camino
  -> backend calcula y persiste una ruta canonica
  -> el voluntario abre Ver ruta en PawAlert
  -> frontend solicita GPS en primer plano
  -> backend valida usuario, propuesta y estado
  -> backend resuelve la ultima ubicacion autoritativa
  -> OSRM calcula la ruta del modo solicitado
  -> frontend dibuja geometria, ETA y distancia
  -> si cambia el avistamiento, se emite una nueva revision de destino
  -> el voluntario recalcula sin modificar su asignacion
```

La ruta canonica permite que el caso tenga una estimacion aun antes de abrir
la pantalla. La ruta de sesion permite partir del GPS actual sin construir un
historial de movimiento.

## 4. Actores y permisos

### Voluntario asignado

Puede solicitar la ruta exacta solamente cuando todas estas condiciones se
cumplen:

1. tiene una sesion autenticada;
2. existe una `propuestas_asignacion` para ese usuario y reporte;
3. la propuesta esta `confirmada`;
4. el reporte se encuentra en `en_camino` o `en_atencion`;
5. la asignacion no fue cancelada, reemplazada, expirada ni cerrada.

La validacion se realiza siempre en el backend. Ocultar un boton en el
frontend no constituye control de acceso.

### Voluntario en espera o con propuesta pendiente

No recibe coordenadas exactas, geometria, instrucciones ni enlaces con el
destino preciso. Conserva el nivel de ubicacion aproximada definido por el
flujo de asignacion.

### Asociacion coordinadora

Puede consultar el estado operativo y el ETA calculado para la asignacion si
sus permisos actuales lo permiten. No recibe la ubicacion GPS en vivo del
voluntario ni un historial de su recorrido. Una futura vista de monitoreo
requiere consentimiento, finalidad definida y un contrato independiente.

### Administracion

No obtiene seguimiento en vivo por defecto. El acceso excepcional para
soporte o seguridad debe ser auditable y no forma parte del MVP.

### Reportante y visitantes

Nunca reciben la ruta del voluntario, su origen, el modo de traslado ni su
posicion actual.

## 5. Estados que habilitan la navegacion

| Estado del caso | Confirmacion | Resultado |
|---|---|---|
| `asignado` | `esperando` | Sin ruta exacta; solo zona aproximada |
| `en_camino` | `confirmado` | Navegacion completa habilitada |
| `en_atencion` | `confirmado` | Ruta consultable mientras siga siendo operativamente necesaria |
| `rescatado` o `cerrado` | cualquiera | Navegacion finalizada |
| revision, duplicado o cancelado | cualquiera | Navegacion deshabilitada |

Una transicion a un estado no navegable invalida inmediatamente cualquier
ruta cargada. El frontend debe cerrar la navegacion o mostrar un mensaje de
caso finalizado; no debe seguir recalculando en segundo plano.

## 6. Fuentes autoritativas de ubicacion

### Origen para una ruta nueva

El origen preferido es el GPS actual del dispositivo que abre la navegacion.
Debe incluir:

- `latitude` y `longitude`;
- `accuracy_meters` cuando la plataforma lo proporcione;
- `captured_at` en UTC;
- origen declarado como `device_gps`.

Las coordenadas capturadas por el frontend no se consideran confiables para
autorizar la operacion. Solo sirven como origen despues de que el backend
valida identidad, asignacion y estado.

Si no existe permiso de GPS, la ruta calculada al confirmar la asignacion
puede mostrarse como vista previa desde la ubicacion operativa registrada en
`capacidades`. Debe etiquetarse claramente como `origen_registrado`, no como
ubicacion actual.

### Destino

El cliente nunca decide el destino enviando coordenadas del animal. El
backend lo resuelve en este orden:

1. ultimo registro de `avistamientos_animal` referenciado por
   `ultima_ubicacion_confirmada_id` y con `estado_validacion=validado`;
2. coordenadas originales del reporte si no existe un avistamiento valido.

La respuesta identifica la fuente como `validated_sighting` o
`initial_report` e incluye `confirmed_at` cuando exista. Esto permite mostrar
"Ultima ubicacion confirmada" sin afirmar que el animal sigue ahi.

### Cambio de destino

Cuando se valida un nuevo avistamiento:

- se actualiza la ubicacion autoritativa del reporte;
- la ruta persistida de la asignacion puede recalcularse mediante el flujo
  idempotente existente;
- una pantalla abierta debe detectar que su `destination_revision` cambio;
- se informa al voluntario antes de reemplazar visualmente la ruta;
- el siguiente calculo usa el nuevo destino.

El destino de Google Maps y Waze debe ser el mismo destino autoritativo que
uso OSRM. No debe seguir usando las coordenadas originales si ya existe un
avistamiento validado.

## 7. Modos de traslado

El contrato admite estos valores estables:

| Valor API | Etiqueta | Perfil OSRM |
|---|---|---|
| `driving` | Vehiculo | `car.lua` |
| `cycling` | Bicicleta | `bicycle.lua` |
| `walking` | A pie | `foot.lua` |

`motorcycle` no se declara disponible en la primera version. No debe
etiquetarse una ruta de automovil como una ruta especifica para motocicleta.
Para incorporarla debe aprobarse un perfil propio con velocidades, accesos y
restricciones documentados.

Los perfiles de OSRM se preparan sobre el dataset antes de recibir consultas.
Por ello, el backend mantiene una URL configurable por modo:

- `OSRM_DRIVING_BASE_URL`;
- `OSRM_CYCLING_BASE_URL`;
- `OSRM_WALKING_BASE_URL`.

Durante la transicion, `OSRM_BASE_URL` se conserva como compatibilidad para
`driving`. Un modo solo aparece habilitado cuando su proveedor responde al
healthcheck y el backend lo publica en `available_modes`.

El frontend no debe mostrar opciones falsas ni cambiar localmente la
velocidad de una ruta de automovil para simular bicicleta o caminata.

## 8. Contrato HTTP

### Calcular o recalcular una ruta

`POST /voluntarios/me/reportes/{reporte_id}/navegacion/ruta`

Headers:

```text
Authorization: Bearer <access_token>
Content-Type: application/json
```

Request:

```json
{
  "origin": {
    "latitude": 19.0412,
    "longitude": -98.2063,
    "accuracy_meters": 18.4,
    "captured_at": "2026-09-01T18:30:00Z"
  },
  "mode": "driving",
  "known_destination_revision": "sighting:8b17..."
}
```

`known_destination_revision` es opcional. Permite que el backend indique que
el destino cambio desde la ultima ruta sin confiar en coordenadas del cliente.

Response `200` cuando existe una ruta:

```json
{
  "contract_version": 1,
  "status": "complete",
  "report_id": "uuid",
  "mode": "driving",
  "available_modes": ["driving"],
  "origin": {
    "source": "device_gps",
    "latitude": 19.0412,
    "longitude": -98.2063,
    "accuracy_meters": 18.4,
    "captured_at": "2026-09-01T18:30:00Z"
  },
  "destination": {
    "source": "validated_sighting",
    "latitude": 19.0521,
    "longitude": -98.2148,
    "confirmed_at": "2026-09-01T18:27:00Z",
    "revision": "sighting:8b17..."
  },
  "route": {
    "duration_seconds": 725.4,
    "distance_meters": 5400.8,
    "geometry": {
      "type": "LineString",
      "coordinates": [[-98.2063, 19.0412], [-98.2148, 19.0521]]
    },
    "steps": []
  },
  "calculated_at": "2026-09-01T18:30:02Z",
  "expires_at": "2026-09-01T18:32:02Z",
  "source": "osrm",
  "warnings": []
}
```

Response controlada cuando no existe ruta:

```json
{
  "contract_version": 1,
  "status": "unavailable",
  "report_id": "uuid",
  "mode": "driving",
  "available_modes": ["driving"],
  "destination": {
    "source": "initial_report",
    "latitude": 19.0521,
    "longitude": -98.2148,
    "confirmed_at": null,
    "revision": "report:uuid"
  },
  "route": null,
  "calculated_at": "2026-09-01T18:30:02Z",
  "expires_at": null,
  "source": "osrm",
  "error_code": "provider_timeout",
  "retryable": true
}
```

### Semantica HTTP

| HTTP | Condicion | Respuesta |
|---:|---|---|
| `200` | Ruta calculada | `status=complete` |
| `200` | Proveedor caido, timeout o `NoRoute` | `status=unavailable`, sin deshacer la asignacion |
| `400` | JSON o modo fuera del contrato | `invalid_request` o `mode_unavailable` |
| `401` | Token ausente o invalido | `unauthorized` |
| `404` | Reporte inexistente o sin asignacion visible para el usuario | `navigation_not_found` |
| `409` | Asignacion conocida pero estado ya no navegable | `report_not_navigable` o `navigation_access_revoked` |
| `422` | GPS invalido, antiguo o sin precision suficiente | codigo especifico de origen |
| `429` | Recalculo repetido antes del intervalo permitido | `recalculation_rate_limited` |

`404` no distingue entre un reporte inexistente y uno ajeno. Esto evita usar
el endpoint para enumerar asignaciones de otros usuarios.

Una falla del proveedor se representa con `200/status=unavailable` porque la
solicitud fue autorizada y el cliente necesita conservar el destino y ofrecer
fallback. No se debe responder con un error sin forma conocida ni borrar una
ruta anterior que todavia pueda mostrarse como desactualizada.

### Validacion del origen

Antes de llamar a OSRM, el backend valida:

- latitud entre `-90` y `90`;
- longitud entre `-180` y `180`;
- `captured_at` valido y no futuro;
- antiguedad dentro de `NAVIGATION_GPS_MAX_AGE_SECONDS`;
- precision positiva y menor o igual al maximo configurado;
- modo presente en `available_modes`.

El cliente puede repetir una solicitud despues de obtener una nueva lectura.
No puede solicitar una excepcion a estos limites mediante flags adicionales.

### Obtener capacidades de navegacion

`GET /voluntarios/me/reportes/{reporte_id}/navegacion/capabilities`

Devuelve solamente despues de validar acceso:

```json
{
  "contract_version": 1,
  "navigation_enabled": true,
  "available_modes": ["driving"],
  "destination_revision": "sighting:8b17...",
  "foreground_tracking": true,
  "background_tracking": false,
  "voice_guidance": false,
  "live_traffic": false
}
```

Este endpoint evita que el frontend deduzca capacidades a partir de
variables publicas o del sistema operativo. `destination_revision` permite
detectar un avistamiento validado nuevo sin publicar coordenadas en esta
consulta; si cambia, el cliente solicita otra ruta al endpoint protegido.

## 9. Instrucciones de maniobra

La geometria y el resumen son obligatorios para `status=complete`. Las
instrucciones son opcionales en la primera entrega.

Cuando se habiliten, el backend solicita `steps=true` a OSRM y normaliza cada
paso al contrato de PawAlert:

```json
{
  "type": "turn",
  "modifier": "right",
  "street_name": "Avenida 11 Sur",
  "distance_meters": 320.0,
  "duration_seconds": 44.0,
  "location": [-98.2081, 19.0430]
}
```

El backend no genera una frase localizada. El frontend traduce la combinacion
`type + modifier` a un texto breve en espanol. Los valores desconocidos usan
una instruccion generica y nunca rompen la navegacion.

La guia por voz, la lectura automatica y los avisos con la pantalla bloqueada
requieren una fase nativa posterior.

## 10. Vigencia y recalculo

Valores iniciales configurables:

- `NAVIGATION_ROUTE_TTL_SECONDS=120`;
- `NAVIGATION_RECALC_MIN_INTERVAL_SECONDS=30`;
- `NAVIGATION_OFF_ROUTE_THRESHOLD_METERS=100`;
- `NAVIGATION_GPS_MAX_AGE_SECONDS=60`;
- `NAVIGATION_GPS_MAX_ACCURACY_METERS=100`.

Se solicita una ruta nueva cuando ocurre al menos una condicion:

- la persona abre la pantalla y no existe una ruta vigente;
- selecciona otro modo disponible;
- toca `Recalcular`;
- cambia `destination_revision`;
- la ruta supera su TTL y la persona se movio al menos 50 metros;
- la ubicacion actual se separa mas del umbral permitido de la geometria.

No se recalcula en cada lectura del GPS. El intervalo minimo protege bateria,
datos y proveedor. Una ruta que supera el TTL puede seguir dibujada con una
marca de `Actualizando`; no debe desaparecer mientras llega la respuesta.

La deteccion automatica de desvio pertenece a la segunda fase. El MVP debe
incluir como minimo recarga inicial, cambio de destino y recalculo manual.

## 11. Persistencia y privacidad

La ruta canonica calculada al confirmar la asignacion puede conservarse en
`propuestas_asignacion` con los campos existentes:

- `ruta_status`;
- `ruta_duracion_segundos`;
- `ruta_distancia_metros`;
- `ruta_geometria`;
- `ruta_error_codigo`;
- `ruta_calculada_at`;
- origen y destino del calculo.

Los recalculos frecuentes desde el GPS del dispositivo son efimeros. No
crean un historial de posiciones ni insertan una fila por lectura. El cliente
conserva la ruta actual solo durante la sesion y el backend puede mantener un
cache corto sin convertirlo en rastreo.

Reglas obligatorias:

- no registrar el body con coordenadas en logs;
- no incluir coordenadas en mensajes de error o analitica;
- no enviar la ruta por Push;
- no guardar un recorrido del voluntario sin consentimiento y contrato nuevo;
- no consultar OSRM directamente desde el frontend;
- no exponer `OSRM_*_BASE_URL` como variable `EXPO_PUBLIC_*`;
- no incluir rutas privadas en endpoints publicos del mapa;
- invalidar acceso al terminar o retirar la asignacion.

Metricas permitidas sin coordenadas:

- calculos completos y fallidos por modo;
- latencia del proveedor;
- codigos de error;
- cantidad de recalculos por sesion;
- uso de fallback externo.

## 12. Comportamiento de la interfaz

La navegacion vive en una pantalla dedicada, no dentro de una tarjeta pequena.
Debe poder abrirse desde el detalle del caso mediante `Ver ruta en PawAlert`.

La pantalla incluye:

- mapa como superficie principal;
- marcador `Tu ubicacion`;
- marcador `Ultima ubicacion confirmada`;
- linea de ruta con contraste suficiente;
- selector segmentado para modos realmente disponibles;
- resumen estable de ETA y distancia;
- indicador de cuando se calculo;
- boton de centrar ubicacion;
- boton de recalculo;
- acceso secundario a Google Maps y Waze;
- estado de carga sin eliminar el mapa anterior;
- mensajes comprensibles para GPS, red y ruta no disponible.

La aplicacion nunca muestra `El animal esta aqui`. Debe usar `Ultima ubicacion
confirmada` y, cuando corresponda, indicar hace cuanto se confirmo.

Los enlaces externos usan el destino autoritativo devuelto por navegacion. El
frontend no reconstruye el destino con `reporte.latitud` si la revision
vigente proviene de un avistamiento.

## 13. Llegada, GPS y resultados del rescate

La navegacion no registra llegada automaticamente. `Llegue a la zona` sigue
siendo una accion explicita y protegida por las reglas actuales del backend,
incluida la validacion de distancia de 500 metros.

La posicion mostrada en el mapa:

- puede ayudar a la persona a orientarse;
- no demuestra por si sola que encontro al animal;
- no certifica un rescate;
- no crea `animal_encontrado`, `animal_no_localizado` ni
  `animal_encontrado_sin_vida`;
- no cambia el estado del reporte.

Al registrar llegada, la navegacion puede permanecer abierta para apoyar la
busqueda, pero las acciones de resultado continuan en su flujo estructurado.

## 14. Fallos y degradacion controlada

| Situacion | Comportamiento |
|---|---|
| GPS denegado | Mostrar ruta previa desde origen registrado, si existe, y permitir reintento |
| GPS antiguo o impreciso | Solicitar nueva lectura; no recalcular silenciosamente con datos malos |
| OSRM timeout | Mantener ruta anterior como desactualizada, mostrar reintento y enlaces externos |
| Sin ruta entre puntos | Mostrar destino y linea recta punteada sin ETA vial |
| Sin internet | Conservar solo la ruta ya cargada en la sesion; no prometer uso offline |
| Destino actualizado | Avisar y recalcular contra la nueva revision |
| Modo no disponible | Deshabilitarlo u ocultarlo con explicacion; no simularlo |
| Caso cerrado o reasignado | Cerrar navegacion e invalidar coordenadas exactas |

Una linea recta de fallback nunca se etiqueta como ruta, no genera tiempo
estimado y no sirve para confirmar llegada.

Codigos de negocio previstos:

- `assignment_not_confirmed`;
- `report_not_navigable`;
- `navigation_access_revoked`;
- `navigation_not_found`;
- `invalid_origin`;
- `stale_origin`;
- `low_accuracy_origin`;
- `mode_unavailable`;
- `provider_timeout`;
- `provider_error`;
- `no_route`;
- `destination_changed`;
- `recalculation_rate_limited`.

Los fallos de OSRM no revierten una asignacion confirmada.

## 15. PWA y aplicacion nativa

### Web/PWA

La navegacion funciona mientras la pantalla esta abierta y el navegador
permite leer ubicacion. El sistema no promete:

- continuidad con la pantalla bloqueada;
- ejecucion permanente en segundo plano;
- instrucciones de voz confiables;
- deteccion continua de desvio cuando el navegador suspende la pagina.

La interfaz debe decir `Manten PawAlert abierta para actualizar tu
ubicacion`, sin asegurar seguimiento permanente.

### Nativo

La primera version nativa conserva el mismo contrato HTTP. Una fase posterior
puede agregar ubicacion en segundo plano, notificacion persistente, voz y
controles de bateria, siempre con permisos especificos y posibilidad de
detener el seguimiento.

## 16. Infraestructura y proveedores

La configuracion de repositorio puede conservar un proveedor de demostracion
para desarrollo, pero produccion no debe depender de un servicio publico sin
garantias operativas.

Antes de habilitar un modo en produccion debe existir:

- instancia OSRM propia o proveedor aprobado;
- dataset de la zona de operacion actualizado;
- perfil correcto para el modo;
- healthcheck;
- timeout y reintento acotados;
- limites de gasto y recursos;
- atribucion visible de OpenStreetMap y del proveedor de mapa;
- condiciones de licencia revisadas para los tiles utilizados.

El mapa base y el motor de rutas son dependencias distintas. Alojar OSRM no
otorga automaticamente un servicio de tiles para la interfaz.

## 17. Fronteras por componente

### Modelos backend

Definen enums, requests, responses, errores y validaciones estructurales. No
consultan Supabase ni llaman proveedores.

### Servicio de navegacion

Es la autoridad del caso de uso. Debe:

- validar usuario, propuesta y estado;
- resolver origen y destino;
- consultar capacidades por modo;
- aplicar limites de recalculo;
- llamar al adaptador OSRM;
- construir la respuesta sin filtrar datos de otros usuarios.

No ejecuta matching, VROOM, Push ni transiciones del reporte.

### Adaptador OSRM

Solo construye la peticion por perfil, interpreta el proveedor y devuelve un
resultado tipado. No conoce usuarios, propuestas, permisos ni estados.

### Router FastAPI

Autentica, delega al servicio y traduce errores de dominio a HTTP. No duplica
la seleccion del destino ni consulta tablas directamente.

### Hook frontend

Solicita permiso y lectura GPS, consume el endpoint, conserva el estado de la
ruta y controla los intervalos. No llama OSRM o Supabase directamente.

### Pantalla de navegacion

Presenta la experiencia, estados y acciones. No calcula distancias, no decide
permisos y no inventa modos disponibles.

### Mapa web y nativo

Reciben un modelo visual ya normalizado y se limitan a dibujar marcadores,
geometria y encuadre. Cada variante usa la biblioteca existente de su
plataforma.

### Infraestructura

Despliega datasets y perfiles, configura URLs privadas, healthchecks,
recursos y limites de gasto. No cambia el contrato del frontend.

## 18. Alcance de entrega por fases

### Fase N0: contrato y correcciones previas

- publicar este contrato;
- conservar el contrato actual de asignacion;
- exponer el destino autoritativo de la ruta;
- corregir enlaces externos para usar ese destino;
- fijar permisos y codigos de error;
- declarar capacidades reales del proveedor.

### Fase N1: ruta embebida demostrable

- modo `driving`;
- pantalla web y nativa;
- GPS actual en primer plano;
- geometria, origen, destino, ETA y distancia;
- recalculo manual;
- aviso por destino actualizado;
- Google Maps y Waze como respaldo;
- estados de carga, error y sin permiso;
- sin instrucciones de voz ni segundo plano.

### Fase N2: navegacion guiada en primer plano

- `steps=true` y maniobras normalizadas;
- instruccion siguiente;
- seguimiento de GPS mientras la pantalla esta abierta;
- deteccion de desvio;
- recalculo automatico con limites;
- metricas operativas sin coordenadas.

### Fase N3: modos adicionales

- infraestructura OSRM para `cycling` y `walking`;
- healthcheck por perfil;
- selector dinamico;
- pruebas de rutas reales de Puebla por modo;
- limites de recursos y costo observados.

### Fase N4: capacidades nativas avanzadas

- ubicacion consentida en segundo plano;
- notificacion persistente;
- guia por voz;
- manejo de bateria y cierre explicito de sesion;
- evaluacion separada de trafico en vivo y mapas offline.

## 19. Criterios de aceptacion del MVP N1

### Backend

- rechaza a un usuario no asignado aunque conozca el `reporte_id`;
- rechaza una propuesta pendiente o expirada;
- acepta al voluntario confirmado en `en_camino`;
- resuelve el ultimo avistamiento validado antes que el punto original;
- ignora coordenadas de destino enviadas por el cliente;
- devuelve GeoJSON con al menos dos coordenadas en una ruta completa;
- devuelve duracion y distancia no negativas;
- publica unicamente modos saludables;
- controla timeout, `NoRoute` y payload invalido sin propagar excepciones;
- no modifica asignacion, Urgency, matching o VROOM;
- no registra coordenadas del request en logs.

### Frontend

- dibuja la geometria respetando el orden GeoJSON `[longitud, latitud]`;
- distingue ubicacion actual, destino y ruta;
- ajusta el mapa para mostrar origen y destino;
- muestra ETA, distancia y antiguedad del calculo;
- no muestra modos no disponibles;
- conserva la ruta anterior mientras recalcula;
- explica permisos denegados y ofrece reintento;
- usa el destino autoritativo en Google Maps y Waze;
- cierra la navegacion si el caso deja de ser navegable;
- no bloquea los hitos del rescate si falla el mapa.

### Integracion

- una asignacion confirmada genera una ruta `driving` visible;
- un nuevo avistamiento validado cambia la revision y el destino;
- un fallo de OSRM conserva la asignacion y muestra fallback;
- un segundo usuario no puede consultar esa ruta;
- la vista funciona en un navegador movil y escritorio;
- la aplicacion nativa dibuja la misma geometria;
- la atribucion del mapa permanece visible.

## 20. Pruebas minimas

Backend:

- unitarias del adaptador OSRM con `steps=false` para N1 y `steps=true` para
  N2;
- permisos y estados del endpoint de navegacion;
- destino original contra avistamiento validado;
- modo disponible, no disponible y proveedor caido;
- expiracion y revocacion de acceso;
- no persistencia de lecturas GPS frecuentes.

Frontend:

- conversion GeoJSON a coordenadas Leaflet y React Native Maps;
- selector basado en `available_modes`;
- carga, ruta completa, `NoRoute`, timeout y GPS denegado;
- cambio de revision de destino;
- enlace externo con el destino correcto;
- desmontaje del observador GPS al salir de la pantalla.

E2E:

1. confirmar una asignacion;
2. abrir `Ver ruta en PawAlert`;
3. conceder ubicacion simulada;
4. comprobar linea, ETA y distancia;
5. simular fallo del proveedor y comprobar degradacion;
6. comprobar que otro usuario recibe `404` para no revelar la existencia de
   una asignacion privada;
7. registrar llegada mediante el endpoint existente, no desde la ruta.

La suite web aislada se ejecuta con `npm run test:e2e:navigation`. Levanta el
frontend, simula sesion, GPS y respuestas del backend, y recorre escritorio y
movil sin escribir en Supabase. Cubre la ruta confirmada, el recalculo manual,
la revocacion privada de acceso y la degradacion `NoRoute`. La prueba integrada
contra Railway se conserva como una validacion previa al merge y requiere una
asignacion de prueba controlada.

## 21. Decisiones cerradas y pendientes

### Cerradas

- la navegacion es posterior a la asignacion;
- la ruta exacta es privada;
- el destino lo decide el backend;
- el ultimo avistamiento validado tiene prioridad;
- el GPS en vivo no se convierte en historial;
- VROOM no participa en la navegacion;
- una falla de OSRM no deshace la asignacion;
- N1 comienza con `driving`;
- Google Maps y Waze permanecen como respaldo;
- la llegada sigue siendo un hito explicito.

### Pendientes antes de N3/N4

- proveedor o despliegue definitivo para `cycling` y `walking`;
- politica de actualizacion de datasets OSM;
- perfil futuro para motocicleta;
- proveedor y presupuesto si se requiere trafico en vivo;
- licencia definitiva del mapa base para produccion;
- consentimiento y finalidad para seguimiento nativo en segundo plano;
- necesidad real de voz y mapas offline.
