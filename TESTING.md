# Pruebas y cobertura

Este documento define una forma reproducible de medir la calidad automatizada de PawAlert.
Los porcentajes de cobertura no sustituyen la validación de los flujos completos.

## Frontend

Instalar dependencias y ejecutar las pruebas:

```bash
yarn install
yarn test --runInBand
```

Generar cobertura:

```bash
yarn test:coverage
```

El informe navegable se genera en `coverage/lcov-report/index.html`.

## Backend

Desde la raíz del repositorio, crear o activar un entorno virtual e instalar las
dependencias de la aplicación y de pruebas:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m pip install -r backend/tests/requirements.txt
```

Ejecutar las pruebas y generar cobertura:

```bash
cd backend
.venv/bin/python -m pytest tests \
  --cov=app \
  --cov-branch \
  --cov-report=term-missing \
  --cov-report=html \
  --cov-report=xml
```

Los informes se generan en `backend/htmlcov/index.html` y
`backend/coverage.xml`.

## Línea base del 4 de agosto de 2026

Commit evaluado: `2e95100`.

- Frontend: 3 suites, 23 pruebas aprobadas y 0 fallidas.
- Cobertura frontend: 0.63% de sentencias, 0.54% de ramas, 0.62% de
  funciones y 0.67% de líneas. La cobertura nueva valida el flujo comunitario
  de denuncias, incluida la tercera denuncia y la respuesta duplicada.
- Backend: 307 pruebas aprobadas y 0 fallidas.
- Cobertura backend: 51.98% considerando líneas y ramas sobre todo `app`.
- Se corrigieron las 17 fallas de aislamiento en `test_custody.py` y
  `test_hitos_rescate_externo.py`: ahora los dobles reemplazan tanto el cliente
  normal como el cliente administrativo de Supabase.

Antes de establecer un umbral obligatorio se debe corregir la suite y registrar
la cobertura inicial real. Después puede incrementarse el mínimo gradualmente.

## Flujos E2E prioritarios

1. Registro, inicio de sesión, consulta del perfil y cierre de sesión.
2. Creación de un reporte con fotografía y ubicación, seguido de su aparición
   en el mapa.
3. Tres usuarios distintos denuncian una publicación, que pasa a revisión y se
   oculta del mapa.
4. El administrador aprueba o retira la publicación y el reportante recibe la
   notificación correspondiente.
5. Una asociación acepta un caso, registra hitos y completa el rescate.
6. Un aliado registra un lote, invita asociaciones y confirma la recepción por
   QR.

Los E2E deben usar un entorno y datos exclusivos de prueba. Nunca deben crear,
modificar o borrar información en producción.

### Playwright

Los tres primeros escenarios están implementados en `e2e/critical-flows.spec.ts`.
Usan la API completa y su base de pruebas para validar persistencia, visibilidad
del mapa, denuncias y moderación.

1. Copia `.env.e2e.example` como `.env.e2e` y configura cuentas exclusivas del
   ambiente de pruebas.
2. Exporta las variables en la terminal. Playwright no carga ese archivo de
   forma implícita:

```bash
set -a
source .env.e2e
set +a
```

3. Inicia el backend conectado a la base de pruebas.
4. Confirma que `E2E_API_URL` contiene `localhost`, `test`, `staging` o
   `preview`, y habilita las escrituras solo ahí:

```bash
E2E_ALLOW_WRITES=true yarn test:e2e
```

La protección rechaza URLs que parezcan productivas. Para listar los casos sin
escribir datos se puede ejecutar `npx playwright test --list`.
