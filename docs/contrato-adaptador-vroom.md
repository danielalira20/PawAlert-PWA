# Contrato de despacho entre PawAlert, OSRM y VROOM

Este documento fija la frontera entre la preparacion de Daniela y el
optimizador de Jass. El objetivo es que VROOM resuelva un lote global sin
recalcular matching, consultar Supabase ni tomar decisiones de producto que
pertenecen a PawAlert.

La entrada publica es `DispatchOptimizationRequest` y la salida publica es
`DispatchOptimizationResult`, ambos definidos en
`backend/app/models/dispatch.py`.

## Responsabilidades

`dispatch_preparation_service` debe:

- cargar y validar reportes operativos;
- obtener el top 3 interno y los ofrecimientos externos vigentes;
- conservar el `matching_score` calculado con 30/25/20/15/10;
- obtener una sola matriz rectangular de OSRM para el lote;
- clasificar cada pareja por su tiempo vial;
- entregar un request validado, sin reservar casos ni llamar a VROOM.

`dispatch_optimizer` debe:

- consumir solamente el request preparado;
- transformar la matriz rectangular al espacio cuadrado de VROOM;
- respetar las parejas permitidas y su elegibilidad automatica;
- comparar la solucion primaria con la ampliada;
- devolver un resultado tipado, sin consultar matching, cobertura, OSRM ni
  Supabase y sin reservar casos.

`escalamiento` debe:

- aplicar el modo operativo de la asociacion;
- reservar transaccionalmente cada propuesta elegible;
- conservar la decision final de la asociacion para externos;
- tratar un conflicto `409` como una senal para reevaluar el lote completo.

## Politica vial

El request incluye `routing_policy` con dos valores configurables:

- `candidate_window_minutes=5`;
- `secondary_max_eta_minutes=30`.

Sus variables de entorno son `VROOM_CANDIDATE_WINDOW_MINUTES` y
`VROOM_SECONDARY_MAX_ETA_MINUTES`. El limite de 30 minutos debe ser mayor que
la ventana de 5 minutos.

Para cada reporte se toma el menor ETA vial entre sus parejas candidatas como
`tiempo_min`. La clasificacion usa limites inclusivos:

- `primary`: ETA menor o igual a `tiempo_min + 5 minutos`;
- `secondary`: fuera de la ventana primaria, pero con ETA menor o igual a
  30 minutos;
- `manual_only`: ETA mayor a 30 minutos.

Una ruta inexistente no se convierte en cero ni en distancia en linea recta.
La pareja debe excluirse antes de construir el request. Si OSRM falla por
completo, no existe asignacion automatica: el caso conserva su flujo manual.
Si OSRM responde pero ninguna pareja conserva una ruta util, la preparacion
devuelve `error_code=no_viable_routes`, distinto de `routing_unavailable`.

La suma de voluntarios y reportes no puede superar
`OSRM_MAX_COORDINATES`. El lote no se divide automaticamente: superar el
limite devuelve `request_too_large` para que el coordinador reduzca el lote
antes de reintentar. Asi VROOM recibe una sola fotografia vial coherente y no
una mezcla de matrices calculadas en momentos distintos.

`DispatchPreparationResult.excluded_items` registra las exclusiones parciales
sin contaminar el request. Cada elemento indica `scope` (`report`, `volunteer`
o `candidate_pair`), `reason` y los identificadores correspondientes. Entre
las razones admitidas estan reporte no operativo, Urgency ausente, falta de
candidatos o coordenadas, datos invalidos, fallo de fuente y ruta inexistente.
Un resultado `ready` puede incluir exclusiones siempre que conserve al menos
un trabajo y una pareja validos.

Un registro candidato identificable pero malformado se excluye como
`candidate_pair/invalid_candidate_data`. Si no contiene un `volunteer_id`
auditable, se excluye el reporte completo con la misma razon. Una excepcion
al consultar matching u ofrecimientos se registra como
`report/data_source_error`; no se confunde con una lista vacia valida.

## Parejas candidatas

`candidates` es la fuente autoritativa de compatibilidad. Cada elemento lleva:

- `report_id`;
- `volunteer_id`;
- `matching_score` ya calculado por PawAlert;
- `offered`;
- `route_tier`;
- `automatic_eligible`.

Una pareja ausente esta prohibida aunque exista una celda vial en la matriz.
El campo `matching_score` de `volunteers` es solo el maximo de ese voluntario
en el lote y no sustituye el score por pareja.

Las combinaciones permitidas son:

| Tipo | Hizo ofrecimiento | Nivel vial | Elegible automaticamente |
|---|---:|---|---:|
| Interno | No | `primary` | Si |
| Interno | No | `secondary` | Si |
| Interno | No | `manual_only` | No |
| Externo | Si | cualquiera | No |

Un externo sin ofrecimiento vigente es invalido. Un interno no se marca como
`offered`. `automatic_eligible` describe elegibilidad tecnica; el modo manual
o semiautomatico de la asociacion se aplica despues, en escalamiento.

## Matriz e indices de VROOM

OSRM entrega una matriz rectangular `V x R`, con voluntarios como origenes y
reportes como destinos. VROOM usa un unico espacio de indices, por lo que el
optimizador debe construir una matriz cuadrada `(V + R) x (V + R)`:

- voluntarios: indices `0 .. V-1`;
- reportes: indices `V .. V+R-1`.

El cliente debe enviar `matrices.car` con `durations`, `distances` y `costs`.
No debe enviar la matriz rectangular directamente ni usar el campo singular
deprecado `matrix`. Antes de llamar al proveedor se validan dimensiones,
indices, enteros no negativos y tamano maximo del lote.

La matriz rectangular puede conservar `None` solamente en cruces que no
aparecen en `candidates`. Al construir la matriz cuadrada, el optimizador
reemplaza esos cruces prohibidos por un costo alto, finito y determinista;
nunca por cero. Las restricciones de `skills` siguen siendo la barrera que
impide que VROOM seleccione una pareja no autorizada.

## Dos soluciones sobre el lote completo

El optimizador calcula como maximo dos alternativas:

1. Solucion A, `primary`: solo parejas internas, automaticas y primarias.
2. Solucion B, `expanded`: parejas internas automaticas primarias y
   secundarias.

La segunda corrida vuelve a optimizar el lote completo. No se limita a los
reportes o voluntarios sobrantes de la primera solucion, porque eso impediria
reacomodar asignaciones para cubrir un caso mas urgente.

La solucion B solo reemplaza a A al comparar, en este orden:

1. mayor suma de `urgency.score` de los reportes cubiertos;
2. mayor cantidad total de reportes cubiertos;
3. menor cantidad de asignaciones `secondary`;
4. menor costo vial total;
5. identificadores estables como desempate final.

Por tanto, una pareja secundaria nunca desplaza a una primaria si no mejora
la prioridad cubierta o la cobertura total. Dentro de la ventana primaria,
el mayor `matching_score` tiene peso real; si empatan, gana el menor ETA y
despues el identificador estable del voluntario. Ningun score permite saltar
el limite vial de 30 minutos.

VROOM puede elegir una combinacion global distinta al ganador independiente
de cada reporte cuando eso permite atender mas urgencia o mas casos.

## Resultado del optimizador

Cada `DispatchAssignment` contiene `report_id`, `volunteer_id`, ETA,
distancia y `route_tier`. Una asignacion nunca puede ser `manual_only`.

`DispatchOptimizationResult` contiene:

- `assignments`;
- `unassigned_report_ids`;
- `source`: `vroom` o `local_fallback`;
- `optimization_pass`: `primary` o `expanded`;
- `used_secondary`;
- `calculated_at`.

`used_secondary=true` exige una asignacion secundaria y
`optimization_pass=expanded`. Un reporte no puede aparecer simultaneamente
como asignado y no asignado; tampoco se puede asignar dos veces un reporte o
un voluntario dentro de la misma corrida.

Los externos y las parejas `manual_only` permanecen disponibles como
recomendaciones para la asociacion, pero no forman parte de `assignments`.

## Fallos y concurrencia

- VROOM falla y OSRM es valido: usar fallback local determinista con las
  mismas parejas, niveles y reglas de comparacion.
- OSRM falla por completo: detener la asignacion automatica y conservar el
  flujo manual.
- Una pareja no tiene ruta: excluir solo esa pareja; no inventar un ETA.
- Un reporte o voluntario tiene datos invalidos: aislarlo del lote cuando sea
  posible y registrar la causa.
- La reserva devuelve conflicto: no sustituir inmediatamente al ganador con
  una solucion calculada sobre datos obsoletos; el siguiente ciclo prepara y
  optimiza nuevamente el lote.

La reserva en base de datos sigue siendo la autoridad final. Ningun resultado
de VROOM constituye por si mismo una asignacion confirmada.

El fallback vive en `dispatch_fallback_service.optimize_dispatch_fallback`.
Es una funcion pura sobre `DispatchOptimizationRequest`: no consulta
Supabase, matching, cobertura, OSRM ni VROOM. Resuelve el lote completo, no
reporte por reporte; ejecuta las alternativas primaria y ampliada, excluye
externos y parejas `manual_only`, y conserva los ETA y distancias de la matriz
preparada. El optimizador debe invocarlo solamente despues de tener un request
valido y recibir un fallo de VROOM.

## Criterios minimos de aceptacion

- request con 2 voluntarios y 2 reportes produce indices cuadrados distintos;
- una diferencia de hasta 5 minutos permite que decida el matching;
- una diferencia mayor a 5 y de hasta 30 minutos clasifica como secundaria;
- un ETA mayor a 30 minutos nunca se autoasigna;
- un externo ofrecido nunca se autoasigna;
- la solucion ampliada reoptimiza el lote completo;
- un fallo de VROOM activa el fallback con las mismas reglas;
- un fallo total de OSRM no activa fallback por distancia lineal;
- las respuestas con indices desconocidos, duplicados o dimensiones invalidas
  se rechazan;
- una prueba real contra Railway valida `GET /health` y `POST /` con una
  matriz cuadrada de 2 voluntarios y 2 reportes.
