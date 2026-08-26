# Contrato de resultados del rescate: animal encontrado sin vida

Este documento fija el comportamiento funcional y técnico cuando un
voluntario confirmado encuentra aparentemente sin vida a uno o más animales
de un reporte. Su objetivo es permitir una respuesta inmediata sin certificar
el fallecimiento de forma automática, sin penalizar al voluntario y sin cerrar
por error la atención de otros animales del mismo reporte.

## Principios obligatorios

- El resultado pertenece a cada `animal`, no al reporte completo.
- El contacto y la orientación se muestran inmediatamente; la revisión humana
  no obliga al voluntario a permanecer en el lugar.
- La revisión humana sí es necesaria antes de un cierre terminal.
- Gemini Vision puede aportar señales, pero nunca certifica el fallecimiento.
- Una fotografía sensible no se publica ni se incluye en notificaciones.
- Encontrar un animal sin vida no reduce Trust Score ni otorga puntos de
  rescate exitoso.
- El sistema no se cierra automáticamente por el transcurso del tiempo.
- La seguridad del voluntario tiene prioridad sobre esperar o tomar evidencia
  adicional.

## Actores y permisos

El hito inicial solo puede registrarlo el voluntario confirmado para el caso.
Debe haber registrado previamente `llegada_zona_reporte` con GPS y hora.

La evidencia sensible solo puede consultarla:

- el voluntario responsable;
- la asociación coordinadora;
- administración.

La asociación coordinadora revisa el resultado. Si el reporte no tiene una
asociación coordinadora, la revisión corresponde a administración. Solo la
asociación coordinadora o administración pueden confirmar, cuestionar o pedir
información adicional sobre el resultado.

## Registro del hito

El evento canónico es `animal_encontrado_sin_vida`. El request debe incluir
una lista explícita `animales`, cuyos elementos contienen `animal_id` y
`cantidad_reportada`; nunca se atribuye el evento al primer animal del reporte
por omisión.

Datos obligatorios:

- `animales`, sin identificadores duplicados y pertenecientes al reporte;
- cantidad encontrada sin vida por cada ficha seleccionada; para una ficha de
  grupo nunca puede superar `animal.cantidad`;
- `latitud` y `longitud` actuales;
- evidencia fotográfica tomada desde la cámara;
- `puede_esperar_seguro`.

Datos opcionales:

- `comentario`;
- `riesgo_vial`;
- `riesgo_sanitario`;
- `identificacion_observada` para collar, placa u otra identificación;
- motivo por el que el voluntario necesita retirarse.

El registro debe ser idempotente por animal. Un animal no puede conservar dos
resultados activos contradictorios. Un reintento equivalente debe devolver el
resultado existente sin duplicar historial, evidencia o notificaciones.

## Estados por animal

El primer registro deja al animal en `sin_vida_reportado`. La revisión humana
produce uno de estos resultados:

- `sin_vida_confirmado`: la evidencia es consistente con lo reportado;
- `duda_estado_critico`: existe una duda genuina y debe reactivarse la atención;
- `evidencia_insuficiente`: se requiere información adicional.

`sin_vida_reportado` no equivale a una certificación clínica. Los textos de la
interfaz deben usar expresiones como "aparentemente sin vida" mientras no
exista revisión humana.

## Agregación de un reporte con varios animales

Las propuestas, los ofrecimientos, la cobertura y la asignación actuales están
vinculados al reporte completo. Por lo tanto, no se cancelan cuando solo uno
de varios animales es encontrado sin vida.

Mientras exista al menos un animal vivo o sin resolver:

- el reporte conserva su estado operativo;
- la cobertura y la asignación se conservan;
- las propuestas y ofrecimientos del reporte no se cancelan;
- Urgency Score se recalcula excluyendo únicamente a los animales con
  resultado `sin_vida_reportado` o `sin_vida_confirmado`;
- el contacto para el animal encontrado sin vida se muestra como una acción
  secundaria que no bloquea el rescate de los demás.

Una ficha con `es_grupo = true` solo se considera completamente resuelta
cuando `cantidad_reportada` alcanza `animal.cantidad`. Un resultado parcial
del grupo conserva el reporte y Urgency activos para los individuos restantes.

Cuando todos los animales estén en `sin_vida_reportado` o
`sin_vida_confirmado`, una operación transaccional debe:

1. mover el reporte a `pendiente_seguimiento_fallecimiento`;
2. pausar y limpiar Urgency Score operativo y clínico;
3. cancelar propuestas activas con motivo `todos_animales_sin_vida`;
4. expirar ofrecimientos vigentes o seleccionados con el mismo motivo;
5. limpiar responsable, confirmación y estado de cobertura que ya no sean
   operativos;
6. conservar la asociación coordinadora para revisión y seguimiento;
7. registrar un solo evento de transición en `historial_reporte`;
8. encolar las notificaciones correspondientes mediante el patrón outbox.

Esta transición debe rechazar resultados parciales o animales que no
pertenezcan al reporte. También debe soportar concurrencia entre dos requests
sin ejecutar dos veces la limpieza.

## Contactos de retiro animal

El sistema consulta un catálogo separado llamado `contactos_retiro_animal`.
Cada contacto debe incluir como mínimo:

- municipio o zona de cobertura;
- nombre del servicio;
- teléfono;
- tipo de servicio;
- horario, cuando se conozca;
- estado activo;
- fuente y fecha de última verificación.

La aplicación muestra los contactos en cuanto se registra el hito, sin esperar
la revisión. Si hay riesgo vial o sanitario, debe priorizar servicios de
emergencia y recordar que el voluntario no debe ponerse en peligro ni manipular
al animal.

Si no existe un contacto verificado, se muestra orientación estática y
cuidadosa. PawAlert no debe recomendar que el voluntario disponga del animal,
lo lleve a su domicilio o decida un destino por cuenta propia.

## Seguimiento realizado

El evento canónico es `seguimiento_retiro_animal`. El actor registra una de
estas acciones:

- `contacto_oficial_realizado`;
- `autoridad_se_presento`;
- `tercero_responsable_se_hizo_cargo`;
- `retiro_gestionado_con_indicaciones`;
- `sin_comunicacion`;
- `sin_contacto_disponible`;
- `retiro_por_seguridad`.

Puede adjuntar de forma opcional:

- folio o número de atención;
- nombre del servicio o institución;
- destino informado;
- nota libre;
- fotografía del lugar despejado, sin mostrar al animal.

`retiro_gestionado_con_indicaciones` exige identificar el servicio, asociación
o institución que proporcionó las indicaciones. El seguimiento nunca pide una
segunda fotografía sensible.

Registrar el seguimiento no equivale por sí solo a
`retiro_digno_confirmado`. Solamente se usa `retiro_confirmado` cuando la
evidencia disponible permite afirmar que el animal ya no permanece en el
lugar.

## Revisión humana en paralelo

La revisión empieza junto con el flujo de contacto, pero no bloquea llamadas,
seguimiento ni la salida del voluntario por seguridad.

La revisión produce uno de estos eventos:

- `revision_fallecimiento_confirmada`;
- `revision_fallecimiento_con_duda`;
- `revision_fallecimiento_insuficiente`.

Si existe duda antes del cierre terminal, una operación transaccional debe:

1. cancelar `pendiente_seguimiento_fallecimiento` cuando corresponda;
2. devolver el animal a un estado activo crítico;
3. reactivar el reporte si no quedan otros estados que lo impidan;
4. recalcular Urgency Score desde cero;
5. reabrir cobertura y matching de acuerdo con las reglas vigentes;
6. registrar `reporte_reactivado_por_duda`.

Nunca se restaura un score anterior. Si la duda aparece después de un cierre
administrativo, se crea una alerta para administración y no se reabre el caso
automáticamente.

## Ventanas de seguimiento

De 0 a 24 horas, el voluntario registra el seguimiento y la asociación revisa
la evidencia en paralelo.

A las 24 horas, si falta el seguimiento o la revisión:

- se notifica a la asociación coordinadora;
- la asociación contacta al voluntario original o al servicio correspondiente;
- la asociación puede registrar un seguimiento institucional, identificando
  al actor que realizó la acción;
- no se crea una nueva propuesta para otro voluntario en esta versión.

A las 48 horas, si todavía existe una tarea pendiente:

- se encola una alerta para administración;
- administración revisa evidencia, intentos de contacto e historial;
- administración decide entre cierre documentado, solicitud de información o
  reactivación crítica.

Los jobs deben ser idempotentes y usar una clave de outbox estable para no
duplicar notificaciones.

## Cierre terminal

El estado terminal recomendado es `muerto`, ya existente en el contrato de
reportes. La conclusión estructurada es
`fallecido_antes_de_llegada`.

El cierre exige:

- todos los animales revisados;
- ninguna duda crítica pendiente;
- al menos un seguimiento registrado;
- autorización de la asociación coordinadora o administración.

El cierre conserva un resultado de seguimiento independiente, por ejemplo:

- `contacto_realizado`;
- `autoridad_atendio`;
- `retiro_reportado`;
- `retiro_confirmado`;
- `sin_contacto_disponible`;
- `voluntario_se_retiro_por_seguridad`.

El sistema no debe afirmar que hubo retiro cuando solo existe una llamada o un
intento de contacto.

## Reportante, privacidad y reputación

Cuando todos los animales sean reportados sin vida, el reportante recibe un
mensaje cuidadoso, sin fotografías ni detalles gráficos. Primero se informa
que el resultado está en revisión y después se comunica la conclusión final.

El resultado:

- no reduce Trust Score;
- no penaliza el tiempo de llegada;
- no penaliza retirarse de una zona insegura;
- no otorga puntos de rescate exitoso.

Las fotografías y coordenadas exactas deben conservar los permisos y URLs
temporales de la evidencia privada existente.

## Eventos mínimos de historial

- `animal_encontrado_sin_vida`;
- `contactos_retiro_mostrados`;
- `seguimiento_retiro_animal`;
- `revision_fallecimiento_confirmada`;
- `revision_fallecimiento_con_duda`;
- `revision_fallecimiento_insuficiente`;
- `reporte_reactivado_por_duda`;
- `seguimiento_fallecimiento_escalado`;
- `reporte_cerrado_fallecimiento`.

Cada evento debe registrar actor, fecha, animales afectados, datos relevantes
y motivo. Los eventos sensibles no deben copiar la URL de evidencia en textos
de notificación.

## Fronteras de implementación

La primera versión no incluye:

- una asignación nueva para retiro físico;
- publicación del retiro en `Casos cerca de mí`;
- certificación clínica o legal del fallecimiento;
- instrucciones para disponer del animal;
- cierre automático por timeout.

La migración y el servicio backend deben ser la autoridad de estados. El
frontend no puede cancelar cobertura, reactivar matching ni cerrar el reporte
mediante actualizaciones directas.

## Criterios mínimos de aceptación

- un reporte con dos animales conserva cobertura cuando solo uno se marca sin
  vida;
- al marcar todos, la transición de reporte y la limpieza ocurren una sola vez;
- un animal ajeno al reporte produce error y no deja cambios parciales;
- un request repetido no duplica historial ni notificaciones;
- el contacto se muestra aunque la revisión siga pendiente;
- una duda reactiva el caso y recalcula Urgency Score;
- el timeout de 24 horas notifica a la asociación y el de 48 a administración;
- ningún timeout cierra automáticamente;
- un voluntario no asignado no puede registrar el hito;
- fotos sensibles no aparecen en endpoints públicos, mapas ni push;
- el cierre terminal exige revisión y seguimiento;
- Trust Score y puntos permanecen sin cambios.
