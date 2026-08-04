# Reporte de pruebas automatizadas y cobertura de código

**Proyecto:** PawAlert  
**Fecha de corte:** 4 de agosto de 2026  
**Commit usado como línea base:** `2e95100`

## 1. Objetivo

Este reporte documenta las herramientas de pruebas incorporadas al proyecto,
los resultados obtenidos, la cobertura actual y los flujos críticos preparados
para pruebas de extremo a extremo.

La finalidad es comprobar de manera repetible que las funciones principales no
se rompan al integrar cambios y establecer una línea base para incrementar la
cobertura progresivamente.

## 2. Resumen ejecutivo

| Nivel | Herramienta | Implementadas | Ejecutadas | Aprobadas | Fallidas |
|---|---|---:|---:|---:|---:|
| Backend | Pytest | 307 | 307 | 307 | 0 |
| Frontend | Jest y Testing Library | 23 | 23 | 23 | 0 |
| E2E prioritarias | Playwright | 3 | 0 | Pendientes | — |
| **Pruebas ejecutadas** | — | — | **330** | **330** | **0** |

Los tres E2E están escritos y Playwright los detecta correctamente. Su ejecución
real queda pendiente porque necesitan cuentas y una base de datos exclusiva de
pruebas. No se ejecutaron contra producción para evitar modificar información
real.

## 3. Herramientas utilizadas

### 3.1 Pytest

Se utiliza para ejecutar las pruebas del backend desarrollado con Python y
FastAPI. Valida rutas, servicios, reglas de negocio, permisos, autenticación,
moderación, evidencias y funciones de la red de aliados.

### 3.2 Coverage.py y pytest-cov

`coverage.py`, mediante el complemento `pytest-cov`, mide qué líneas y ramas del
backend fueron recorridas por las pruebas. La configuración está en
`backend/.coveragerc`.

Los reportes generados son:

- Resumen en la terminal.
- Reporte HTML navegable en `backend/htmlcov/index.html`.
- Reporte XML en `backend/coverage.xml`, útil para integración continua.

### 3.3 Jest

Es el ejecutor de las pruebas del frontend React Native/Expo. También genera la
cobertura de sentencias, ramas, funciones y líneas del código TypeScript.

### 3.4 React Native Testing Library

Permite probar componentes desde la perspectiva de la persona usuaria: textos,
botones, formularios, cambios de estado y respuestas de la interfaz.

### 3.5 Playwright

Se configuró para validar flujos completos usando la API y una base de datos de
pruebas. Estos escenarios comprueban la interacción entre varias capas del
sistema, no solamente una función aislada.

Incluye una protección que impide realizar escrituras si no se habilita
`E2E_ALLOW_WRITES=true` o si la URL no parece corresponder a un ambiente local,
de pruebas, staging o preview.

## 4. Resultados del backend

- **Archivos de prueba:** 29.
- **Pruebas ejecutadas:** 307.
- **Pruebas aprobadas:** 307.
- **Pruebas fallidas:** 0.
- **Cobertura total:** 51.98 %, considerando líneas y ramas de `backend/app`.

Se corrigieron 17 fallas que provenían del aislamiento incompleto de Supabase en
las pruebas de custodia e hitos externos. Ahora se sustituyen tanto el cliente
normal como el cliente administrativo, por lo que esas pruebas no dependen de
una conexión real.

Entre las áreas cubiertas se encuentran:

- Registro, autenticación y seguridad.
- Creación, consulta y actualización de reportes.
- Asociaciones, asignaciones, reasignaciones y estadísticas.
- Moderación y denuncias comunitarias.
- Evidencia fotográfica, EXIF, ubicación e imagen.
- Custodia e hitos de rescate internos y externos.
- Red de aliados, lotes, capacidades y necesidades.
- Notificaciones, escalamiento, matching y servicios regionales.

## 5. Resultados del frontend

- **Suites ejecutadas:** 3.
- **Pruebas ejecutadas:** 23.
- **Pruebas aprobadas:** 23.
- **Pruebas fallidas:** 0.
- **Cobertura global actual:**
  - Sentencias: 0.63 %.
  - Ramas: 0.54 %.
  - Funciones: 0.62 %.
  - Líneas: 0.67 %.

La cobertura global es baja porque la medición contempla todo `src`, mientras
que actualmente solo existen tres suites. Este porcentaje funciona como línea
base y no significa que las 23 pruebas estén fallando.

Las pruebas frontend actuales cubren:

- Validadores de formularios.
- Estado y comportamiento de autenticación.
- Menú de denuncia comunitaria.
- Solicitud de inicio de sesión antes de denunciar.
- Envío del motivo, descripción y token.
- Respuesta ante una denuncia duplicada.
- Retiro de la publicación de la vista al confirmarse la tercera denuncia.

## 6. Flujos E2E implementados

Playwright reconoce tres escenarios en `e2e/critical-flows.spec.ts`:

1. **Registro e inicio de sesión:** crea una cuenta única y comprueba el acceso.
2. **Creación y publicación:** crea un reporte y verifica que la API pública del
   mapa lo entregue.
3. **Moderación comunitaria:** tres personas distintas denuncian un reporte, se
   verifica que salga del mapa y llegue a la cola administrativa; después el
   administrador lo aprueba y se comprueba que vuelva a ser visible.

Estos escenarios están implementados, pero su estado es **pendiente de ejecución
real** hasta disponer de un ambiente E2E y las cuentas indicadas en
`.env.e2e.example`.

## 7. Qué mide la cobertura

La cobertura responde principalmente a estas preguntas:

- ¿Qué líneas de código se ejecutaron durante las pruebas?
- ¿Qué decisiones lógicas recorrieron sus diferentes ramas?
- ¿Qué funciones fueron llamadas?
- ¿Qué partes del sistema todavía carecen de pruebas automatizadas?

La cobertura no demuestra por sí sola que la aplicación sea correcta. Un
porcentaje alto puede ejecutar código sin validar bien sus resultados. Por eso
se complementa con aserciones de comportamiento y pruebas E2E.

## 8. Cómo reproducir los resultados

### Backend

```bash
cd backend
.venv/bin/python -m pytest tests \
  --cov=app \
  --cov-branch \
  --cov-report=term-missing \
  --cov-report=html \
  --cov-report=xml
```

### Frontend

```bash
yarn test --runInBand
yarn test:coverage
```

### Listar los E2E sin modificar datos

```bash
npx playwright test --list
```

### Ejecutar los E2E en un ambiente seguro

```bash
cp .env.e2e.example .env.e2e
set -a
source .env.e2e
set +a
E2E_ALLOW_WRITES=true yarn test:e2e
```

Antes del último comando, el backend debe estar conectado a una base exclusiva
de pruebas y las cuentas E2E deben existir.

## 9. Estado y siguientes pasos

El bloque de configuración, corrección de pruebas backend, incorporación de
pruebas frontend y definición de los tres E2E prioritarios está terminado.

PawAlert continúa en desarrollo y todavía existen módulos, integraciones y
recorridos funcionales por completar. Por esta razón, la suite E2E no se
considera cerrada ni definitiva: se ampliará progresivamente conforme los
flujos principales alcancen suficiente estabilidad. Esto evita invertir en
automatizaciones frágiles sobre interfaces o reglas de negocio que todavía
pueden cambiar.

Los E2E iniciales ya implementados establecen la estructura que se reutilizará
para las siguientes funcionalidades. Cuando los flujos principales estén más
completos, se habilitará un proyecto de Supabase exclusivo para pruebas
integrales. De esta manera se podrán crear cuentas, reportes, denuncias,
asignaciones y lotes automatizados sin modificar los datos del entorno
principal.

Para cerrar la validación integral falta:

1. Terminar y estabilizar los flujos principales que continúan en desarrollo.
2. Preparar un proyecto Supabase y cuentas exclusivas para E2E.
3. Ejecutar y documentar el resultado de los tres escenarios Playwright.
4. Agregar los flujos E2E de asociaciones, lotes y las funcionalidades que se
   incorporen posteriormente.
5. Incrementar gradualmente la cobertura frontend sobre los flujos de mayor
   riesgo.

## 10. Conclusión

La suite automatizada ejecutada se encuentra estable: **330 de 330 pruebas
aprobaron**. El backend dispone de una cobertura inicial medible de **51.98 %** y
el frontend cuenta con una línea base de **0.63 % de sentencias**. Además, los
tres primeros flujos E2E ya están codificados y protegidos contra escrituras
accidentales en producción; únicamente falta ejecutarlos en el ambiente de
pruebas correspondiente. Como la aplicación todavía está en construcción, las
pruebas E2E y sus resultados se actualizarán de manera progresiva junto con la
implementación y estabilización de los nuevos módulos.
