# Sistema de Expiración de Canjes QR — Estrategia Híbrida

**Archivo relevante:** `backend/app/services/canjes_service.py`  
**Archivos de soporte:** `backend/app/main.py`  
**Autor:** Persona 5 (Magui)  
**Fecha:** Agosto 2026

---

## ¿Por qué se necesita este sistema?

Cuando un usuario canjea una recompensa, el sistema genera un código QR con vigencia de **48 horas**. Si el usuario no lo escanea antes de que venza:

- El QR debe dejar de ser válido.
- Los puntos reservados deben regresar a su cuenta.
- La unidad de inventario debe volver al catálogo.
- La recompensa debe reactivarse si estaba agotada solo por esa reserva.
- Todo debe quedar registrado sin duplicar operaciones.

Este proceso **no puede hacerse a mano** — tiene que ser automático.

---

## Las dos columnas clave: `fecha_expiracion` y `emitido_at`

La tabla `canjes_recompensa` guarda dos fechas fundamentales:

| Columna | Qué guarda |
|---|---|
| `emitido_at` | Exactamente cuándo el usuario generó el QR |
| `fecha_expiracion` | `emitido_at` + 48 horas (calculado al crear el canje) |

Esto es la base de todo el sistema: **la base de datos ya sabe cuándo expiró cada canje**. Solo hay que consultarla.

---

## Estrategia elegida: Expiración Híbrida (2 mecanismos)

```
MECANISMO 1: Expiración Reactiva (al consultar mis-canjes)
─────────────────────────────────────────────────────────
Cuando el usuario abre "Mis Canjes"
   └─> El servidor verifica si tiene canjes vencidos
       └─> Si sí, los expira ANTES de devolver la lista
           └─> El usuario siempre ve el estado real

MECANISMO 2: Cron de Limpieza (background, cada hora)
──────────────────────────────────────────────────────
El servidor FastAPI, al arrancar, lanza un bucle
   └─> Cada 60 minutos revisa TODOS los canjes vencidos
       └─> Expira los de usuarios que no abrieron la app
```

---

## Mecanismo 1: Expiración Reactiva (la más importante)

### ¿Dónde vive?
Función `_expirar_canjes_del_usuario(usuario_id)` en `canjes_service.py`.

### ¿Cuándo se activa?
Cada vez que el frontend llama a `GET /recompensas/canjes/mis-canjes`. La función `obtener_mis_canjes()` llama a `_expirar_canjes_del_usuario()` **antes** de devolver los datos.

### ¿Qué hace paso a paso?

```
Paso 1: Consulta la base de datos
   ¿Tienes canjes en estado "emitido" cuya fecha_expiracion ya pasó?
   → filtro: estado = "emitido" AND fecha_expiracion < ahora

Paso 2: Por cada canje vencido encontrado:
   2a. Restaura la unidad en el inventario de la recompensa
       (si estaba agotada por esta reserva, la reactiva a "activa")
   2b. Cambia el estado del canje a "expirado"
   2c. Devuelve los puntos al usuario con regla:
       regla = "canje_recompensa_expirado"

Paso 3: Devuelve la lista de canjes ya actualizada
```

### ¿Por qué es idempotente?

La operación es idempotente (puede correr 1000 veces sin efectos duplicados) porque:

1. **El filtro es seguro:** Solo busca canjes con `estado = "emitido"`. Una vez marcado como `"expirado"`, ya no aparece en futuras búsquedas.
2. **La devolución de puntos tiene UNIQUE:** La tabla de transacciones tiene una restricción `UNIQUE(regla, evento_origen_id)`. Si se intenta devolver puntos por el mismo canje dos veces, la base de datos rechaza el duplicado.

---

## Mecanismo 2: Cron de Limpieza en Segundo Plano

### ¿Dónde vive?
Función `expiracion_en_segundo_plano()` en `main.py`.

### ¿Cuándo se activa?
Automáticamente cuando el servidor FastAPI arranca (evento `startup`). Corre en segundo plano en un bucle infinito cada 60 minutos.

### ¿Por qué existe si ya tenemos el Mecanismo 1?

El Mecanismo 1 solo funciona cuando el usuario abre la app. El Cron asegura que:
- Usuarios que **nunca vuelven a abrir la app** también tienen sus canjes expirados correctamente.
- El inventario del catálogo siempre refleja el estado real para todos los usuarios.

### Limitación conocida

Si el servidor en Railway se reinicia (por un nuevo deploy), el temporizador del cron se reinicia también. **Por eso el Mecanismo 1 (reactivo) es el principal** — no depende de cuándo arrancó el servidor.

---

## Diagrama de flujo

```
Usuario abre "Mis Canjes"
         │
         ▼
GET /recompensas/canjes/mis-canjes
         │
         ▼
obtener_mis_canjes(usuario_id)
         │
         ▼
_expirar_canjes_del_usuario(usuario_id)
         │
         ├─── ¿Tiene canjes emitidos con fecha_expiracion < ahora?
         │         │
         │    SÍ   ▼
         │    Para cada canje vencido:
         │    1. Restaura unidad en inventario
         │    2. Marca canje como "expirado"
         │    3. Devuelve puntos (regla "canje_recompensa_expirado")
         │    4. Log: [EXPIRACIÓN REACTIVA] canje {id} expirado
         │
         │    NO → (no hace nada extra)
         │
         ▼
Consulta la lista actualizada de canjes
         │
         ▼
Devuelve al frontend (el usuario ve el estado correcto)
```

---

## ¿Por qué NO se eligió solo el Cron Externo de Railway?

Con deploys semanales, el cron externo de Railway requeriría:
1. Acceso al dashboard de Railway para configurarlo y mantenerlo.
2. Recordar reconfigurar si cambia la URL del backend.
3. Gestionar el `CRON_SECRET` en dos servicios distintos.

La estrategia híbrida lo hace innecesario para el contexto actual del proyecto.

---

## Tabla de garantías

| Característica | Valor |
|---|---|
| ¿Requiere configuración extra en Railway? | ❌ No |
| ¿Funciona después de un deploy? | ✅ Sí (reactiva en primera apertura) |
| ¿Es idempotente? | ✅ Sí (UNIQUE en puntos + filtro por estado) |
| ¿El usuario siempre ve el estado correcto? | ✅ Sí |
| ¿Usuarios que nunca abren la app son limpiados? | ✅ Sí (cron cada hora) |
| ¿Puede duplicar devolución de puntos? | ❌ No (UNIQUE constraint lo previene) |
| ¿Depende de deploys/reinicios del servidor? | ❌ No (el Mecanismo 1 no tiene estado) |
