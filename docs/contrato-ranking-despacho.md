# Contrato de ranking de voluntarios y prioridad de despacho

Este documento fija la separacion entre el ranking de candidatos y la
prioridad operativa de los reportes. Ninguna integracion de OSRM, VROOM,
Urgency o Push debe redefinir estos pesos por su cuenta.

## Ranking vigente de voluntarios

La formula aprobada para ordenar candidatos es:

| Componente | Peso |
|---|---:|
| Proximidad | 30% |
| Disponibilidad | 25% |
| Experiencia | 20% |
| Movilidad | 15% |
| Carga actual | 10% |

La suma es 100%. La misma escala se usa para:

- el top 3 de voluntarios internos de la asociacion;
- la evaluacion separada de voluntarios externos que se ofrecieron.

Los externos no se incorporan automaticamente al top 3. Su ofrecimiento
continua siendo un requisito previo y la asociacion conserva la decision
final.

La fuente ejecutable de verdad es `MATCHING_WEIGHTS` en
`backend/app/models/dispatch.py`. El servicio
`backend/app/services/matching.py` debe consumir esa constante y no mantener
una copia propia de los pesos.

## Urgency Score

Urgency Score prioriza que casos deben despacharse primero. No es un sexto
componente del score del voluntario y no sustituye disponibilidad, movilidad
ni carga.

VROOM podra consumir la prioridad del reporte junto con la matriz de tiempos
de OSRM, pero debe recibir el `matching_score` ya calculado con la formula
30/25/20/15/10. No debe recalcular los pesos del candidato. Para lotes con
varios reportes, la lista `candidates` del contrato VROOM conserva el score
por pareja reporte-voluntario; el score incluido en `volunteers` es solo un
resumen compatible.

## Estimacion vial de candidatos

Despues de ordenar el top 3 interno, OSRM anade `ruta_estimada` a cada
candidato. Los voluntarios externos ofrecidos reciben el mismo bloque, pero
se mantienen en su lista separada. La estimacion no modifica el score ni el
orden aprobado.

`ruta_estimada` contiene:

- `status`: `complete` o `unavailable`;
- `duration_seconds`: tiempo vial o `null`;
- `distance_meters`: distancia vial o `null`;
- `error_code`: causa controlada cuando no hay estimacion;
- `calculated_at`: fecha de calculo;
- `source`: `osrm`.

Si OSRM falla, el candidato se conserva y el matching continua usando sus
reglas vigentes. La disponibilidad de un proveedor de rutas nunca bloquea
la presentacion ni la asignacion manual de candidatos.

## Filtros previos

Antes de calcular el ranking se excluyen candidatos incompatibles por rol,
pertenencia, especies, tamanio, radio, horario, capacidad, restricciones,
rechazos, bloqueos o falta de disponibilidad para urgencias criticas. Estos
filtros no agregan porcentajes a la formula.

## Formula retirada

La formula 40/30/20/10 que incluia Urgency dentro del ranking de candidatos
pertenece a una propuesta anterior y queda retirada. No debe implementarse ni
utilizarse como referencia para pruebas E2E.
