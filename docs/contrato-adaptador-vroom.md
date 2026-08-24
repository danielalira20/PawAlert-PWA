# Contrato de preparacion para VROOM

`dispatch_preparation_service.prepare_dispatch_optimization(report_ids)`
construye la entrada validada del optimizador. Esta fase no llama a VROOM ni
reserva casos.

## Entradas admitidas

Solo se incluyen reportes que:

- superaron validacion inicial;
- estan asignados a una asociacion y con cobertura abierta;
- no tienen voluntario confirmado;
- tienen Urgency Score vigente;
- cuentan con coordenadas originales u operativas completas.

Los candidatos internos provienen del top 3 con formula 30/25/20/15/10. Los
externos solo se incluyen para los reportes donde existe un ofrecimiento
vigente. El adaptador solicita ambos grupos sin calcular rutas individuales y
genera una sola matriz OSRM para todo el lote.

## Matching por pareja

`candidates` es la fuente autoritativa de compatibilidad y contiene:

- `report_id`;
- `volunteer_id`;
- `matching_score` ya calculado por PawAlert;
- `offered`, obligatorio para externos.

El `matching_score` de `volunteers` se conserva como resumen compatible y es
el maximo obtenido por ese voluntario en el lote. VROOM no debe usarlo para
habilitar combinaciones: una pareja que no aparezca en `candidates` esta
prohibida, aunque exista una celda en la matriz de viaje.

## Resultado controlado

Con todos los datos completos se devuelve `status=ready` y un
`DispatchOptimizationRequest` con trabajos, voluntarios, parejas candidatas y
matriz OSRM. No se entregan matrices parciales.

Si falta una precondicion, se devuelve `status=unavailable`, sin request, con
uno de estos codigos:

- `report_not_operational`;
- `urgency_unavailable`;
- `no_candidates`;
- `missing_coordinates`;
- `routing_unavailable`;
- `invalid_candidate_data`;
- `data_source_error`.

El siguiente adaptador de VROOM debe tratar este resultado como no optimizable
y conservar el flujo manual; nunca debe fabricar candidatos ni reservar casos
con una entrada incompleta.
