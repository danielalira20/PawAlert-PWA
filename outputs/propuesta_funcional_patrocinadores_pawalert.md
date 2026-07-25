# Propuesta funcional: Red de Aliados PawAlert

## 1. Decisión de producto

PawAlert integrará a patrocinadores, negocios aliados y personas donantes como una
capa de abastecimiento coordinada por las asociaciones.

La asociación conserva la autoridad operativa sobre cada rescate:

1. Evalúa el caso.
2. Determina qué recurso hace falta.
3. Publica o dirige una necesidad.
4. Acepta el ofrecimiento adecuado.
5. Confirma que el recurso se recibió y se utilizó.

El patrocinador no asigna voluntarios, no modifica el estado del rescate y no recibe
la ubicación exacta del animal. Su función es cubrir necesidades verificadas.

Esta decisión conserva el flujo real que ya funciona en PawAlert y cumple los dos
Must Have del reto relacionados con patrocinio:

- Registrar usuarios con rol o capacidad de patrocinador.
- Registrar recursos ofrecidos por patrocinadores.

## 2. Nombre recomendado

Nombre público del módulo: **Red de Aliados PawAlert**.

Se evita usar "patrocinador" como nombre universal porque una persona que dona una
bolsa de croquetas puede no identificarse como patrocinadora. Dentro de la red se
utilizan tres categorías comprensibles:

| Categoría | Quién participa | Relación esperada |
| --- | --- | --- |
| Donante comunitario | Persona que aporta productos o apoyo puntual | Ocasional |
| Aliado local verificado  | Veterinaria, tienda, profesional o proveedor | Recurrente o bajo demanda |
| Patrocinador institucional | Empresa, fundación, universidad o marca | Recurrente y mediante convenio |

La categoría del participante no determina qué puede aportar. La identidad y los
recursos se modelan por separado.

## 3. Taxonomía de recursos

### 3.1 Alimentos e insumos

- Croquetas y alimento húmedo.
- Fórmula para crías.
- Arena sanitaria.
- Cobijas, camas y material de limpieza.
- Correas, collares y transportadoras.
- Material de curación.

### 3.2 Servicios veterinarios

- Consulta general o de urgencia.
- Diagnóstico y estudios.
- Medicamentos.
- Curaciones y cirugía.
- Hospitalización.
- Vacunación y esterilización.

### 3.3 Logística

- Transporte del animal.
- Recolección o entrega de productos.
- Combustible o vales de traslado.

### 3.4 Infraestructura institucional

- Espacio clínico.
- Resguardo ofrecido por una organización verificada.
- Almacenamiento de insumos.

### 3.5 Apoyo económico

- Cobertura de un gasto específico.
- Fondo general de una asociación.
- Aportación recurrente.

### 3.6 Difusión y campañas

- Publicidad digital o impresa.
- Jornadas comunitarias.
- Espacios para eventos.
- Servicios profesionales o tecnológicos.

### Regla de custodia

Una casa temporal particular no se clasifica como patrocinador. Continúa dentro del
flujo de voluntariado porque implica custodia, validación de capacidad y
responsabilidad sobre el animal. El hospedaje clínico o institucional sí puede
registrarse como servicio de un aliado verificado.

## 4. Modalidades de apoyo

Cada oferta o contribución debe distinguir:

- Puntual o recurrente.
- Para un caso, una campaña o el fondo general de una asociación.
- En especie, servicio o apoyo económico.
- Con entrega, recolección o uso en establecimiento.
- Capacidad disponible.
- Fecha de disponibilidad o vigencia.
- Zona de cobertura.
- Restricciones por especie, tamaño o condición, cuando apliquen.

La disponibilidad no se reduce a un toggle. Para un MVP es suficiente usar:

- Disponible.
- Capacidad limitada.
- No disponible temporalmente.

La cantidad o capacidad evita que un aliado aparezca como disponible cuando ya
comprometió todos sus recursos.

## 5. Flujos funcionales

### 5.1 Necesidad asociada a un rescate

1. El reporte se asigna a una asociación.
2. La asociación acepta y evalúa el caso.
3. Desde el detalle del rescate crea una necesidad.
4. Selecciona categoría, recurso, cantidad, urgencia, fecha límite y forma de entrega.
5. Decide si la necesidad será pública o dirigida a aliados compatibles.
6. Los aliados elegibles reciben una notificación; las personas pueden descubrir las
   necesidades públicas desde "Cómo ayudar".
7. Una persona o aliado ofrece cubrir todo o parte de la necesidad.
8. La asociación acepta, rechaza o ajusta la cantidad ofrecida.
9. El recurso queda reservado para evitar duplicidad.
10. La asociación confirma recepción y posteriormente aplicación al caso.
11. El sistema registra el evento en el historial y actualiza el impacto del aportante.

### 5.2 Donación general a una asociación

1. La asociación publica una lista de necesidades recurrentes.
2. La persona elige qué aportar o selecciona "donde haga más falta".
3. Selecciona un punto de entrega o acuerda recolección.
4. La asociación confirma la recepción.
5. Cuando el producto se asigna a uno o varios casos, registra su aplicación de forma
   agregada o individual.

Este flujo permite recibir croquetas, arena o sobres sin inventar artificialmente un
caso específico.

### 5.3 Oferta recurrente de un aliado

1. El aliado verificado registra una oferta, por ejemplo dos consultas de urgencia al
   mes.
2. PawAlert compara categoría, zona y capacidad con necesidades abiertas.
3. La asociación recibe la oferta como sugerencia, nunca como asignación obligatoria.
4. Si la acepta, se reserva capacidad y se sigue el flujo de confirmación.

### 5.4 Campaña institucional

1. Una asociación o el equipo administrador crea una campaña con objetivo, periodo y
   métricas.
2. Uno o varios patrocinadores institucionales comprometen recursos.
3. La asociación registra resultados.
4. PawAlert genera un resumen de impacto compartible.

### 5.5 Apoyo económico sin pasarela de pago

PawAlert no cobra, no retiene saldo y no transfiere dinero. Su función es registrar
una necesidad económica, coordinar el compromiso y permitir que la asociación
confirme el resultado.

Hay dos mecanismos posibles:

#### Pago directo al proveedor - recomendado para casos específicos

Ejemplo: una veterinaria cotiza una radiografía en $800 MXN.

1. La asociación crea la necesidad "Radiografía veterinaria - $800 MXN" y puede
   adjuntar una cotización sin datos sensibles.
2. Una persona elige cubrir todo o una parte.
3. La asociación acepta el compromiso.
4. PawAlert muestra de forma privada las instrucciones para pagar directamente a la
   veterinaria o pone a ambas partes en contacto.
5. La persona realiza el pago fuera de PawAlert y registra "Ya realicé el apoyo".
6. Puede adjuntar un comprobante opcional; se deben ocultar datos bancarios que no
   sean necesarios.
7. La asociación o el proveedor confirma que el gasto fue cubierto.
8. El sistema marca la contribución como verificada y la necesidad como cubierta.

Este mecanismo es el más trazable: el dinero nunca entra a PawAlert y queda ligado a
un gasto concreto.

#### Transferencia directa a la asociación

1. La asociación publica una necesidad económica general o específica.
2. PawAlert indica que el apoyo se realizará directamente con la asociación.
3. Después de aceptar el compromiso, se muestran instrucciones privadas de
   transferencia, depósito o contacto.
4. La persona paga fuera de PawAlert y registra su aportación.
5. La asociación confirma manualmente la recepción.
6. Posteriormente registra en qué necesidad se aplicó el recurso.

PawAlert no valida automáticamente el banco. La confirmación humana de la asociación
es la fuente de verdad del MVP.

#### Reglas del compromiso económico

- Se permiten coberturas parciales, por ejemplo $300 de una necesidad de $800.
- El monto aceptado aparece como "comprometido", no como "recibido".
- Si no se confirma el pago dentro de un plazo configurable, por ejemplo 24 horas,
  el compromiso vence y el monto vuelve a quedar disponible.
- No se muestran públicamente cuentas bancarias, comprobantes ni nombres legales.
- No se almacenan tarjetas, CLABE, contraseñas ni credenciales bancarias del donante.
- La asociación puede ocultar públicamente el monto y mostrar solo el porcentaje de
  cobertura.
- No se permiten reembolsos gestionados por PawAlert porque la plataforma no
  procesa la operación.

Para el MVP se recomienda habilitar primero el pago directo a proveedores y dejar
las aportaciones económicas generales como opción configurable por asociación.

### 5.6 Transporte y logística

"Transporte" se divide en tres casos diferentes para no mezclar responsabilidades:

#### Transporte operativo del animal

Es una capacidad de voluntariado, no un patrocinio. Una persona conduce hasta el
animal, participa físicamente en el rescate y puede trasladarlo a una clínica o
refugio. Debe seguir la validación y asignación de voluntarios existente.

- Se registra mediante la capacidad `tiene_vehiculo`.
- La asociación decide quién participa.
- La ubicación exacta se revela solo después de la asignación y confirmación.
- El traslado forma parte de los hitos del rescate.

#### Servicio o apoyo logístico patrocinado

Aplica cuando un negocio, transportista o empresa ofrece una capacidad concreta:

- Un traslado veterinario gratuito al mes.
- Un viaje con descuento.
- Vales de combustible.
- Una ambulancia veterinaria bajo disponibilidad.
- Presupuesto para pagar un servicio de transporte externo.

Flujo:

1. La asociación crea una necesidad de traslado indicando tipo de animal, tamaño,
   fecha, ventana de horario y zona general. No publica la ubicación exacta.
2. Un aliado compatible ofrece el viaje, vale o cobertura económica.
3. La asociación acepta la opción y confirma quién realizará el traslado.
4. Solo entonces se comparte la información necesaria para coordinar origen y
   destino.
5. El aliado o voluntario confirma la realización; la asociación verifica el hito.

El proveedor patrocinador no recibe control sobre el caso y no aparece como
voluntario si únicamente financia el viaje.

#### Entrega o recolección de insumos

Mover croquetas o arena no es un rescate. Se coordina con un punto público de la
asociación, una ventana de entrega o una recolección acordada, sin compartir datos
del animal.

#### Recomendación para el MVP

- Mantener el transporte físico del animal dentro del flujo de voluntarios.
- Registrar como recursos patrocinables únicamente viajes profesionales, vales de
  combustible o cobertura de un traslado.
- No construir un algoritmo nuevo de matching de transporte durante esta fase.
- Permitir que la asociación coordine manualmente el traslado desde la necesidad.

## 6. Estados

### Necesidad

`borrador -> abierta -> parcialmente_cubierta -> comprometida -> recibida -> aplicada`

Estados terminales alternativos:

- Vencida.
- Cancelada.

### Contribución

`ofrecida -> aceptada -> coordinando_entrega -> recibida -> verificada`

Estados alternativos:

- Rechazada.
- Retirada por el aportante.
- No entregada.
- Parcialmente recibida.

Solo las contribuciones verificadas generan métricas públicas y reconocimiento.

## 7. Permisos

| Acción | Asociación | Donante | Aliado | Admin |
| --- | --- | --- | --- | --- |
| Crear necesidad de un rescate | Sí, en casos propios | No | No | Supervisión |
| Ver ubicación exacta del animal | Sí | No | No | Según política operativa |
| Ofrecer un recurso | No aplica | Sí | Sí | No aplica |
| Aceptar una contribución | Sí | No | No | Solo intervención excepcional |
| Confirmar recepción y uso | Sí | No | No | Auditoría |
| Crear oferta recurrente | No | No | Sí | No |
| Aprobar perfil público de aliado | No | No | No | Sí |

## 8. Cuenta y rol

`patrocinador` no debe reemplazar el rol principal de una persona. Un reportante o
voluntario también puede donar, y una veterinaria podría participar de varias formas.

Para el MVP se recomienda añadir un perfil complementario de apoyo:

- `supporter_profile` para datos, categoría y preferencias públicas.
- El rol actual de rescate permanece sin cambios.
- La existencia del perfil habilita el acceso "Mis apoyos".
- Los aliados recurrentes reciben verificación adicional.

Así se cumple el requisito de diferenciación de funciones sin limitar cada cuenta a
una única forma de participación.

## 9. Pantallas propuestas

### 9.1 Cómo ayudar

Pantalla pública con:

- Necesidades urgentes.
- Necesidades recurrentes por asociación.
- Filtros por categoría y zona general.
- Acción "Quiero aportar".
- Acción "Ayudar donde haga más falta".
- Explicación de qué ocurre después de ofrecer apoyo.

### 9.2 Mis apoyos

Para cualquier persona registrada:

- Ofrecimientos pendientes.
- Coordinación de entrega.
- Contribuciones recibidas y verificadas.
- Resultados comunicados por la asociación.
- Preferencia de nombre público, alias o anonimato.

### 9.3 Panel de aliado

Para negocios y participantes recurrentes:

- Ofertas y capacidad.
- Disponibilidad.
- Solicitudes compatibles.
- Historial de servicios o productos utilizados.
- Métricas de impacto.
- Configuración del perfil público.

### 9.4 Necesidades de la asociación

Nueva sección del panel actual:

- Crear necesidad desde un caso.
- Solicitudes generales.
- Ofrecimientos recibidos.
- Recursos comprometidos, recibidos y aplicados.
- Alertas de vencimiento.

### 9.5 Mural "Huellas que ayudan"

- Muestra únicamente apoyos verificados.
- Publicación opcional mediante consentimiento.
- Permite nombre, alias o anonimato.
- No muestra montos individuales por defecto.
- Incluye historias de colaboración y resultados agregados.

### 9.6 Directorio y mapa de aliados

El mapa es una capa independiente de los rescates y solo incluye ubicaciones
comerciales o institucionales públicas.

Cada ficha puede mostrar:

- Sello de aliado verificado.
- Servicios ofrecidos.
- Horario y contacto.
- Zona de cobertura.
- Contribuciones confirmadas de forma agregada.
- Enlaces a sitio web o redes.

Una persona donante nunca aparece en el mapa. Tampoco se muestra la ubicación
exacta de los animales o puntos privados de entrega.

## 10. Retorno de valor

### Donante comunitario

- Confirmación de recepción.
- Actualización del resultado.
- Agradecimiento público opcional.
- Historial personal de impacto.
- Insignias de constancia, no de capacidad económica.

### Aliado local

- Perfil y sello de aliado verificado.
- Presencia en directorio y mapa.
- Enlaces de contacto.
- Estadísticas verificables.
- Historias compartibles.
- Participación en campañas locales.

### Patrocinador institucional

- Informe periódico de impacto.
- Participación visible en campañas acordadas.
- Material para comunicación de responsabilidad social.
- Métricas por zona, recurso y resultado.

La aportación nunca modifica la prioridad de un rescate, el matching de voluntarios o
las decisiones de la asociación. PawAlert no vende influencia operativa.

## 11. Donación frente a patrocinio comercial

PawAlert debe mantener separados:

- **Donación:** apoyo no oneroso ni remunerativo.
- **Patrocinio comercial:** existe una contraprestación publicitaria pactada.
- **Compra o contratación:** la asociación paga por un producto o servicio.

No se promete deducibilidad. En México, un donativo solo puede presentarse como
deducible cuando la organización receptora es una Donataria Autorizada vigente y
emite el CFDI correspondiente. La ficha de cada asociación debe indicar claramente
una de estas opciones:

- Donataria autorizada verificada.
- Recibe apoyos sin deducibilidad.
- Solo recibe productos o servicios.

Fuentes de referencia:

- SAT, Deducciones personales por donaciones:
  https://www.sat.gob.mx/minisitio/DeduccionesPersonales/donaciones.html
- SAT, Portal de Donatarias Autorizadas:
  https://www.sat.gob.mx/portal/public/tramites/donatarias-autorizadas

Para el MVP, PawAlert no debe custodiar dinero. Puede registrar la intención y la
confirmación, mientras el pago o donación ocurre directamente con la asociación.

## 12. Accesibilidad y privacidad

- No comunicar estados únicamente mediante color.
- Acompañar iconos con etiquetas textuales.
- Navegación completa con teclado en web.
- Contraste suficiente y foco visible.
- Texto alternativo en logotipos e imágenes.
- Evitar carruseles automáticos.
- Respetar la preferencia de movimiento reducido.
- Consentimiento explícito para reconocimiento público.
- Anonimato disponible y reversible.
- Datos de contacto visibles solo cuando son necesarios para coordinar una entrega.
- Ubicación exacta del animal reservada al flujo operativo autorizado.

## 13. Modelo de datos mínimo

### `supporter_profiles`

- `id`
- `usuario_id`
- `tipo`: comunitario, aliado_local, institucional
- `nombre_publico`
- `es_anonimo`
- `verificado`
- `logo_url`
- `descripcion`
- `sitio_web`
- `telefono_publico`
- `latitud_publica`, `longitud_publica`
- `mostrar_en_mapa`
- `consentimiento_publico_at`

### `resource_offers`

- `supporter_profile_id`
- `categoria`
- `recurso`
- `modalidad`: producto, servicio, economico
- `cantidad_disponible`
- `unidad`
- `recurrencia`
- `zona_cobertura`
- `restricciones`
- `vigente_desde`, `vigente_hasta`
- `estado_disponibilidad`

### `resource_needs`

- `asociacion_id`
- `reporte_id` opcional
- `campania_id` opcional
- `categoria`
- `recurso`
- `cantidad_solicitada`
- `cantidad_cubierta`
- `unidad`
- `urgencia`
- `fecha_limite`
- `visibilidad`: publica, dirigida, privada
- `estado`
- `moneda` opcional
- `monto_objetivo` opcional
- `monto_comprometido` opcional
- `tipo_logistica` opcional: traslado_animal, entrega_insumos, combustible

### `contributions`

- `resource_need_id`
- `supporter_profile_id`
- `resource_offer_id` opcional
- `cantidad_ofrecida`
- `cantidad_aceptada`
- `metodo_entrega`
- `estado`
- `aceptada_por`
- `recibida_por`
- `recibida_at`
- `aplicada_at`
- `metodo_externo` opcional: proveedor_directo, asociacion_directa, vale, servicio
- `monto_comprometido` opcional
- `monto_confirmado` opcional
- `compromiso_expira_at` opcional

### `contribution_evidence`

- `contribution_id`
- `tipo`
- `archivo_url`
- `descripcion`
- `creado_por`

Cada cambio relevante también se registra en el historial del rescate cuando la
necesidad esté vinculada a uno.

## 14. API mínima orientativa

- `POST /supporters/profile`
- `GET /supporters/me`
- `PUT /supporters/me`
- `POST /supporters/offers`
- `GET /supporters/offers`
- `POST /associations/me/resource-needs`
- `GET /associations/me/resource-needs`
- `GET /resource-needs/public`
- `POST /resource-needs/{id}/contributions`
- `PATCH /contributions/{id}/accept`
- `PATCH /contributions/{id}/receive`
- `PATCH /contributions/{id}/apply`
- `GET /allies/public`

## 15. Alcance por fases

### MVP obligatorio

1. Perfil complementario de patrocinador o aliado.
2. Registro de recursos ofrecidos.
3. Creación de necesidades por asociaciones.
4. Ofrecimiento, aceptación y confirmación.
5. Historial y métricas básicas.
6. Mural público con consentimiento.

### Segunda fase

1. Ofertas recurrentes.
2. Notificaciones por categoría y zona.
3. Directorio y mapa de aliados verificados.
4. Campañas comunitarias.
5. Reportes de impacto descargables.

### Fase posterior a validación

1. Pagos dentro de PawAlert.
2. Integraciones contables o fiscales.
3. Inventario avanzado.
4. Beneficios o recompensas con QR.
5. Matching predictivo de demanda y oferta.

## 16. Fuera del MVP

- Monedero de puntos.
- Canjes y catálogo de recompensas.
- Pagos procesados por PawAlert.
- CFDI emitido por PawAlert.
- Ranking público por monto donado.
- Publicidad proporcional al valor aportado.
- Acceso del patrocinador a coordenadas exactas.
- Asignación automática de recursos sin confirmación de la asociación.

## 17. Criterios de aceptación del MVP

1. Una persona registrada puede activar su perfil de apoyo sin perder su rol actual.
2. Un aliado puede registrar al menos un producto o servicio con capacidad y zona.
3. Una asociación puede crear una necesidad general o vinculada a un reporte propio.
4. Una persona puede ofrecer cubrir total o parcialmente una necesidad pública.
5. La asociación puede aceptar una cantidad distinta de la ofrecida.
6. Una cantidad aceptada queda reservada y actualiza la cobertura de la necesidad.
7. Solo la asociación puede marcar una contribución como recibida y aplicada.
8. Los eventos vinculados a un rescate aparecen en su historial.
9. Una contribución no aparece en el mural antes de ser verificada.
10. El aportante puede elegir nombre, alias o anonimato.
11. Ninguna vista de patrocinio expone la ubicación exacta del animal.
12. El mapa público solo muestra aliados verificados con ubicación comercial y
    consentimiento.
13. El sistema no describe un apoyo como deducible sin verificación fiscal de la
    asociación receptora.
14. Las aportaciones no cambian urgencia, matching ni prioridad operativa.
15. Un compromiso económico no se muestra como recibido antes de la confirmación de
    la asociación o proveedor.
16. Un compromiso económico vencido libera nuevamente el monto de la necesidad.
17. PawAlert no solicita ni almacena credenciales bancarias o datos de tarjeta.
18. El transporte operativo del animal solo puede coordinarse mediante un
    participante validado y confirmado por la asociación.
19. Un patrocinador de transporte puede financiar el viaje sin recibir acceso a la
    ubicación exacta ni permisos de voluntario.

## 18. Decisiones recomendadas para iniciar

| Decisión | Recomendación |
| --- | --- |
| ¿PawAlert recibe dinero en el MVP? | No; la recepción ocurre directamente con la asociación |
| ¿Cómo se cubre un gasto veterinario? | Preferentemente mediante pago directo al proveedor |
| ¿Quién confirma un apoyo económico? | La asociación o el proveedor involucrado |
| ¿Qué pasa si alguien promete y no paga? | El compromiso vence y la necesidad se reabre |
| ¿Transporte es siempre patrocinio? | No; trasladar físicamente al animal es capacidad de voluntariado |
| ¿Qué transporte sí puede patrocinarse? | Servicio profesional, vales, combustible o costo de un traslado |
| ¿Las personas necesitan una cuenta empresarial? | No; perfil complementario y flujo breve |
| ¿Mural público por defecto? | No; consentimiento y opción de anonimato |
| ¿Mapa de personas donantes? | Nunca |
| ¿Mapa de veterinarias y negocios? | Sí, solo verificados y en una capa independiente |
| ¿Puntos y QR desde el inicio? | No; primero validar oferta, necesidad y entrega |
| ¿Quién confirma el impacto? | La asociación responsable |
| ¿El patrocinador puede escoger casos? | Puede ofrecer apoyo a necesidades públicas, pero la asociación acepta y coordina |

## 19. Propuesta de valor resumida

> PawAlert conecta necesidades verificadas por asociaciones con personas y aliados
> capaces de cubrirlas, registra la entrega y convierte cada contribución en impacto
> comprobable.

## 20. Trazabilidad contra los documentos

### Reto de PolyWorks

| Requisito | Cobertura en esta propuesta |
| --- | --- |
| Registrar usuarios con rol de patrocinador | Perfil complementario de apoyo y categorías de participante |
| Registrar recursos ofrecidos | Taxonomía, ofertas, capacidad, vigencia y zona de cobertura |
| Coordinar recursos disponibles | Necesidades creadas por asociaciones y contribuciones aceptadas |
| Mostrar estado del rescate | Los recursos no sustituyen los estados operativos existentes |
| Mantener historial básico | Recepción y aplicación se registran en el historial del caso |
| Estadísticas básicas | Impacto por participante, asociación, recurso y campaña |
| Reputación e impacto comunitario | Verificación, mural voluntario e historias de colaboración |

### Propuesta original de 48 páginas

| Idea original | Decisión actual |
| --- | --- |
| Patrocinador como rol operativo independiente | Se convierte en perfil complementario; la asociación coordina |
| Hogar temporal como patrocinador | Permanece en voluntariado por implicar custodia |
| Dashboard del patrocinador | Se conserva para aliados recurrentes, no para donantes ocasionales |
| Toggle disponible/no disponible | Se amplía a capacidad limitada y vigencia para evitar falsos positivos |
| Matching automático de recursos | Primero funciona como sugerencia que la asociación acepta |
| Mapa de patrocinadores | Se conserva como directorio separado y solo para ubicaciones públicas verificadas |
| Carrusel de marketing | Se sustituye por galería accesible, filtrable y no automática |
| Puntos, recompensas y QR | Se posponen hasta validar que la coordinación básica funciona |
| Mapa de calor del patrocinador | Se pospone; no es necesario para cumplir el Must Have |
| Campañas comunitarias | Se conservan para la segunda fase |
| Visibilidad proporcional a recompensas | Se descarta para evitar un modelo de pago por influencia |

La propuesta no elimina el patrocinio del alcance: reduce su primera implementación
a la evidencia que pide el reto y deja rutas de crecimiento explícitas.
