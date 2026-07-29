# Flujo de voluntarios externos

Esta guía describe cómo habilitar y probar el flujo de cobertura coordinada,
qué comportamiento ya está disponible y cómo se divide el trabajo restante.

## Preparación

1. Aplicar completas y en orden las migraciones
   `backend/migrations/0019_flujo_cobertura_voluntarios_externos.sql` y
   `backend/migrations/0020_ofrecimientos_externos_transaccionales.sql` desde
   el SQL Editor de Supabase. Si `0019` ya estaba instalada, ejecutar solamente
   `0020`.
2. Confirmar que el backend tenga `SUPABASE_SERVICE_KEY`. Esta llave nunca debe
   exponerse en Expo ni usar el prefijo `EXPO_PUBLIC_`.
3. Reiniciar el backend después de actualizar el código.
4. Preparar tres cuentas:
   - una persona del staff de una asociación verificada;
   - un voluntario interno activo de esa asociación;
   - un voluntario externo con verificación nivel 2 activa.
5. El externo debe tener disponibilidad, ubicación, radio, capacidad, especies
   y tamaños compatibles, además de un hogar temporal verificado para probar
   la llegada a resguardo.

## Comprobación de la migración

Ejecutar en Supabase:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'reportes'
  and column_name = 'estado_cobertura';

select to_regclass('public.voluntario_ofrecimientos') as ofrecimientos,
       to_regclass('public.propuestas_asignacion') as propuestas,
       to_regclass('public.custodias_temporales') as custodias;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'reservar_cobertura_reporte',
    'responder_propuesta_cobertura'
  );
```

Cada consulta debe regresar los objetos solicitados. Si la migración falla,
`BEGIN` y `COMMIT` evitan que quede aplicada a medias.

## Prueba manual de punta a punta

### 1. Caso disponible

1. Crear un reporte compatible y dentro del radio del externo.
2. Verificar que el reporte tenga asociación coordinadora.
3. Consultar:

```sql
select id, folio, estado_reporte, asociacion_asignada_id,
       staff_asignado_id, estado_cobertura
from public.reportes
where id = '<REPORTE_ID>';
```

Resultado esperado:

- `estado_reporte = 'asignado'`;
- `asociacion_asignada_id` no es nulo;
- `staff_asignado_id` es nulo;
- `estado_cobertura = 'abierto'`.

### 2. Casos cerca de mí

1. Iniciar sesión como externo.
2. Abrir **Casos cerca de mí**.
3. Confirmar que se muestra distancia redondeada, especie, tamaño, condición,
   urgencia y tiempo transcurrido.
4. Confirmar que no se muestra la calle, referencia ni coordenada exacta.
5. Probar con un externo sin nivel 2, sin disponibilidad o incompatible: el
   caso no debe aparecer.

### 3. Ofrecimiento

1. Tocar **Quiero ayudar**.
2. Confirmar que el botón cambia a estado ofrecido y permite retirarse.
3. Consultar:

```sql
select estado, ofrecido_at
from public.voluntario_ofrecimientos
where reporte_id = '<REPORTE_ID>';

select staff_asignado_id, estado_cobertura
from public.reportes
where id = '<REPORTE_ID>';
```

Resultado esperado:

- existe un ofrecimiento `vigente`;
- `staff_asignado_id` sigue nulo;
- `estado_cobertura` sigue `abierto`.

### 4. Panel de la asociación

1. Iniciar sesión como staff de la asociación coordinadora.
2. Abrir el panel de candidatos.
3. Confirmar dos secciones independientes:
   - **Equipo interno sugerido**, con máximo tres internos;
   - **Voluntarios externos que se ofrecieron**.
4. Confirmar que el externo nunca aparece en el top 3.
5. Seleccionar al externo ofrecido.

Resultado esperado:

- se crea una propuesta `activa`;
- el ofrecimiento cambia a `seleccionado`;
- `estado_cobertura` cambia a `propuesta_enviada`;
- el caso desaparece de **Casos cerca de mí**;
- los demás controles de selección quedan bloqueados.

### 5. Rechazo y reaparición

1. Rechazar la propuesta desde la cuenta seleccionada.
2. Confirmar que el reporte regresa a `estado_cobertura = 'abierto'`.
3. Confirmar que el caso reaparece para externos elegibles.
4. Confirmar que el ofrecimiento seleccionado vuelve a `vigente`.

### 6. Confirmación y privacidad

1. Enviar nuevamente la propuesta y aceptarla.
2. Confirmar `estado_cobertura = 'confirmado'` y
   `estado_reporte = 'en_camino'`.
3. Confirmar que la persona seleccionada ahora recibe la ubicación exacta.
4. Confirmar que los demás ofrecimientos quedan `no_seleccionado`.

### 7. Rescate y hogar temporal

1. Registrar llegada a la zona con GPS.
2. Registrar al animal encontrado con fotografía de cámara, GPS, condición y
   observaciones.
3. Registrar llegada al hogar temporal con fotografía del animal, fotografía
   del entorno y GPS.
4. Confirmar:

```sql
select estado_reporte, estado_cobertura
from public.reportes
where id = '<REPORTE_ID>';

select estado, inicio_at, proximo_seguimiento_at
from public.custodias_temporales
where reporte_id = '<REPORTE_ID>';
```

Resultado esperado:

- el rescate queda `rescatado`;
- la cobertura queda `finalizado`;
- existe una custodia `activo`;
- el primer seguimiento se programa aproximadamente tres horas después.

## Prueba de concurrencia

Con dos sesiones del staff abiertas, intentar seleccionar dos personas para el
mismo reporte casi al mismo tiempo. Sólo una solicitud debe crear la propuesta.
La segunda debe recibir conflicto HTTP 409 y el mensaje de que el caso ya no
está disponible.

Verificar que nunca existan duplicados:

```sql
select reporte_id, count(*)
from public.propuestas_asignacion
where estado = 'activa'
group by reporte_id
having count(*) > 1;
```

La consulta debe regresar cero filas.

## Pruebas automatizadas

Desde `backend/`:

```bash
pytest -q
python -m compileall -q app
```

Desde la raíz:

```bash
npm run build
git diff --check
```

## Roadmap por fases

### Fase 1 — Cobertura y ofrecimientos: implementada

- Estado de cobertura independiente.
- Casos cercanos y elegibilidad.
- Ofrecerse y retirar ofrecimiento.
- Panel separado de internos y externos.
- Reserva transaccional, conflicto controlado e índices únicos.
- Confirmación, rechazo y reapertura.
- Escalamiento automático exclusivo para internos.
- Privacidad de la ubicación antes de confirmar.

### Fase 2 — Ejecución del rescate: parcialmente implementada

Implementado:

- llegada a zona;
- animal encontrado con evidencia para externos;
- llegada al hogar verificado;
- separación entre rescate y comienzo de custodia.

Pendiente:

- completar todos los hitos condicionales;
- flujo completo de animal no localizado;
- reglas configurables para determinar si veterinaria es obligatoria;
- alertas y vencimientos de evidencias.

### Fase 3 — Seguimiento de custodia: estructura lista, operación pendiente

La base ya contiene custodias, seguimientos y validaciones. Falta:

- formularios y API de seguimientos;
- cálculo de frecuencia según condición;
- recordatorios programados;
- aclaraciones y alertas de bienestar;
- extensiones de fecha y evidencia periódica del entorno.

### Fase 4 — Coordinación regional y transferencias: estructura inicial

La base ya contiene solicitudes de relevo y transferencias. Falta:

- dashboard **Seguimiento regional de hogares temporales**;
- permisos por radio y datos personales limitados;
- ofertas de asociaciones receptoras;
- reserva transaccional de traslado;
- doble confirmación de entrega;
- cambio de coordinadora después de la entrega.

### Fase 5 — Automatización, inteligencia y cierre

Pendiente:

- notificaciones de 72 y 24 horas;
- Supabase Realtime en lugar del refresco periódico actual;
- análisis Gemini Vision y revisión humana de alertas;
- políticas RLS y auditoría fina de acceso;
- estados públicos para el reportante;
- cancelación diferenciada antes y después de la confirmación;
- administración regional cuando ninguna asociación pueda coordinar;
- métricas, observabilidad y pruebas E2E automatizadas.
