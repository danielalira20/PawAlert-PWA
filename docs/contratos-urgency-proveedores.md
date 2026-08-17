# Contratos de proveedores para Urgency Score

Estos contratos permiten desarrollar clima, riesgo vial y duplicados sin
modificar la activacion, el matching ni la formula de urgencia.

La fuente ejecutable de verdad esta en `backend/app/models/urgency.py`. Los
servicios deben devolver instancias de esos modelos, no diccionarios con
campos adicionales o nombres alternativos.

## Versionado y limites de cada entrega

- `0058` ya pertenece a la compuerta de activacion de reportes.
- `0059` queda reservado para la persistencia del Urgency Score y no debe
  usarse en las ramas de proveedores.
- `0060` queda reservado para la funcion PostGIS de duplicados de Persona 3.
- Weather no necesita una migracion propia.
- Las ramas de proveedores no deben editar `report_service.py`, matching,
  cobertura, estados del reporte ni la formula central de urgencia.

## Weather - Persona 2

Archivo esperado: `backend/app/services/weather_service.py`.

Firma publica obligatoria:

```python
def get_weather(latitude: float, longitude: float) -> WeatherResult:
    ...
```

Reglas de salida:

- `score` solo puede ser `0`, `50`, `100` o `None`.
- `None` se usa exclusivamente con `status="unavailable"`.
- Un fallo nunca se traduce a `score=0`.
- `complete`, `cached` y `stale_cache` requieren `observed_at`.
- `unavailable` requiere un `error_code` del catalogo compartido.
- El servicio clasifica el clima; no aplica pesos ni calcula urgencia total.
- Timeout, reintento y cache pertenecen al servicio de Weather.
- La sustitucion provisional de una senal ausente pertenece a
  `urgency_service`, no a Weather.

Clasificacion obligatoria; si se cumplen varias reglas, gana el score mayor:

- `100`: temperatura menor a 5 C o mayor a 35 C.
- `100`: tormenta electrica o lluvia fuerte/extrema segun el codigo de
  OpenWeather.
- `50`: lluvia moderada.
- `0`: ninguna condicion anterior.

Comportamiento operativo:

- La llave se lee unicamente desde `OPENWEATHER_API_KEY` en el backend.
- Timeout total de 5 segundos por intento y maximo un reintento.
- Cache por coordenadas redondeadas a 2 decimales durante 15 minutos.
- Ante un fallo se puede usar el ultimo valor de cache con
  `status="stale_cache"` hasta 30 minutos despues de su observacion.
- Sin cache util, se devuelve `status="unavailable"`; no se inventa un
  clima normal.
- HTTP `401` se traduce a `unauthorized`, `429` a `rate_limited`, respuestas
  `5xx` a `provider_error` y cuerpos incompletos a `invalid_response`.

Ejemplo disponible:

```python
WeatherResult(
    score=100,
    status="complete",
    temperature_c=37.2,
    precipitation_mm_h=0,
    condition_code=800,
    observed_at=observed_at,
    evaluated_at=evaluated_at,
)
```

Ejemplo no disponible:

```python
WeatherResult(
    score=None,
    status="unavailable",
    evaluated_at=evaluated_at,
    error_code="timeout",
)
```

Pruebas minimas de la entrega:

- clima normal, lluvia moderada, lluvia fuerte y temperatura extrema;
- gana la condicion mas grave cuando coinciden varias;
- timeout con cache reciente, cache obsoleto util y sin cache;
- API sin configurar, `401`, `429`, `5xx` y respuesta invalida;
- nunca se devuelve `score=0` ante un error tecnico.

## Riesgo vial - Persona 3

Archivo esperado: `backend/app/services/road_risk_service.py`.

Firma publica obligatoria:

```python
def get_road_risk(latitude: float, longitude: float) -> RoadRiskResult:
    ...
```

Reglas de salida:

- `score=100` requiere tipo de via y distancia de hasta 50 metros.
- Los tipos permitidos son `primary`, `trunk` y `motorway`.
- `score=0` significa que la consulta termino y no encontro esas vias.
- Un fallo devuelve `score=None`, `status="unavailable"` y `error_code`.
- El servicio no aplica el peso de 10% ni calcula urgencia total.
- El resultado se calculara una vez por ubicacion y se persistira durante la
  integracion; no debe consultarse Overpass en cada recalculo.

Comportamiento operativo:

- Consultar OpenStreetMap mediante Overpass alrededor de las coordenadas.
- Buscar solamente `highway=primary`, `highway=trunk` y
  `highway=motorway`, incluyendo sus enlaces `*_link` pero normalizando el
  resultado al tipo principal correspondiente.
- `score=100` si la via mas cercana esta a 50 metros o menos; en otro caso,
  `score=0`.
- Timeout total de 8 segundos y maximo un reintento.
- Una respuesta HTTP fallida, sin datos interpretables o incompleta no
  equivale a `score=0`.

Pruebas minimas de la entrega:

- cada tipo de via permitido dentro del radio;
- via exactamente a 50 metros, fuera de 50 metros y ausencia de vias;
- normalizacion de `primary_link`, `trunk_link` y `motorway_link`;
- timeout, error HTTP y respuesta invalida;
- nunca se devuelve `score=0` ante un error tecnico.

No se permite modificar activacion, matching, cobertura ni decidir si un
reporte pasa a revision.

## Duplicados geograficos - Persona 3

Archivo esperado: `backend/app/services/duplicate_service.py` y una migracion
reservada con numero `0060`.

Firma publica obligatoria:

```python
def find_geographic_duplicates(
    search: DuplicateSearchInput,
) -> list[DuplicateCandidate]:
    ...
```

La consulta PostGIS solo puede devolver candidatos que cumplan todo esto:

- Distancia maxima de 150 metros.
- Diferencia maxima de 120 minutos.
- Al menos una especie compartida.
- El reporte existente no tiene estado `cerrado`,
  `cancelado_por_reportante`, `duplicado`, `duplicado_vinculable` ni
  `duplicado_informativo`.
- El reporte existente no tiene `estado_moderacion="rechazado"`.
- El reporte actual se excluye cuando `report_id` esta presente.
- Los resultados se ordenan por distancia ascendente y despues por diferencia
  de tiempo ascendente.

La migracion `0060` debe crear una funcion SQL/RPC llamada
`buscar_duplicados_geograficos`. La distancia debe evaluarse en metros con
`ST_DWithin(...::geography, ...::geography, 150)`, no comparando municipio o
colonia. La ventana temporal es inclusiva: se aceptan exactamente 150 metros
y 120 minutos.

La deteccion no fusiona, rechaza ni activa reportes. Devuelve candidatos y la
compuerta central decide si hace falta confirmacion humana.

Pruebas minimas de la entrega:

- candidato dentro de 150 metros y 120 minutos con especie compartida;
- limites exactos de 150 metros y 120 minutos;
- exclusion por distancia, tiempo, especie, mismo `report_id`, estado terminal
  y moderacion rechazada;
- reporte con varios animales y coincidencia parcial de especies;
- orden estable por distancia y tiempo.

## Codigos de error compartidos

- `not_configured`
- `timeout`
- `unauthorized`
- `rate_limited`
- `provider_error`
- `invalid_response`
- `no_data`

Los errores tecnicos no deben incluir secretos, URLs con llaves ni respuestas
completas del proveedor en logs o mensajes al usuario.
