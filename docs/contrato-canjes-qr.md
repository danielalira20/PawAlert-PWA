# Documento de entrega — Persona 5 (Magui): Canjes y Centro de Reputación

**Proyecto:** PawAlert — Gamificación  
**Autor:** Magui (Persona 5)  
**Rama:** `magui-dev2`  
**Fecha de inicio:** 9 de agosto de 2026  

Este documento describe todos los cambios implementados por Persona 5 sobre la base que dejaron Jass (motor de reputación), Daniela (voluntario interno) y Miguel (recompensas y catálogo). Está pensado para que el equipo pueda revisar, reproducir y continuar el trabajo.

---

## Contexto de partida

Cuando Persona 5 inició su implementación, el proyecto ya contaba con:

- Motor de puntos y Trust Score operativo (Jass).
- Funciones `reservar_puntos`, `confirmar_puntos_reservados` y `devolver_puntos` disponibles en Supabase (migraciones 0052/0053 ejecutadas).
- Tabla `canjes_recompensa` básica creada por Miguel (migración 0046), con estados `emitido`, `confirmado` y `cancelado`.
- Endpoint público `GET /recompensas/catalogo` entregado por Miguel.
- Insignias del voluntario interno evaluadas por el backend (Daniela).
- Componentes `SaldoReputacionCard`, `ReportanteInsigniasCard` e `ImpactoInsigniasToggle` ya existentes en el frontend.

---

## Sección 1 — Migración SQL: tabla de canjes completa

**Archivo:** `backend/migrations/0054_canjes_completos.sql`  
**Estado:** ✅ Implementado y ejecutado en Supabase

### Qué cambia

La tabla `canjes_recompensa` de Miguel solo cubría el flujo básico del patrocinador. Esta migración la amplía para soportar el ciclo completo del usuario que canjea:

1. **Nuevas columnas:**
   - `fecha_expiracion`: marca cuándo expira el QR (48 horas desde la emisión).
   - `patrocinador_confirmacion_id`: registra quién confirmó el canje.
   - `motivo_cancelacion`: texto libre para cancelaciones y reembolsos administrativos.

2. **Nuevos estados:** `expirado` y `reembolsado` se agregan al CHECK existente.

3. **Constraint de unicidad reemplazado:** el `UNIQUE (recompensa_id, beneficiario_id)` original de Miguel bloqueaba que un usuario pudiera canjear la misma recompensa dos veces aunque la primera hubiera expirado. Se reemplaza por un índice parcial que solo impide duplicados cuando el canje está activo (`estado IN ('emitido', 'confirmado')`).

### Por qué es retrocompatible

- Las columnas nuevas aceptan `NULL`, por lo que las filas existentes no se invalidan.
- Ampliar un CHECK nunca elimina datos existentes.
- El índice parcial reemplaza una restricción más estricta, no elimina protección: sigue siendo imposible tener dos canjes activos del mismo producto para el mismo usuario.
- Todo el código de Miguel que filtra `estado = 'confirmado'` sigue funcionando sin cambios.

---

## Sección 2 — Backend: servicio y endpoints de canjes

**Archivos:**  
- `backend/app/services/canjes_service.py` (nuevo)  
- `backend/app/api/recompensas.py` (modificado: nuevas rutas)  
- `backend/app/api/internal.py` (modificado: cron de expiración)  
- `backend/app/services/recompensas_service.py` (modificado: confirmar_canje ahora llama `confirmar_puntos_reservados`)  
- `backend/app/models/recompensas.py` (modificado: modelos de canjes ampliados)  
**Estado:** ✅ Implementado

### Qué hace el nuevo servicio

- `crear_canje(recompensa_id, usuario_id, rol)`: valida los 6 límites de negocio, llama `reservar_puntos` de Jass, luego reserva el inventario con la RPC de Miguel. Si alguno falla, la transacción no avanza.
- `expirar_canjes_vencidos()`: cron idempotente que busca canjes con `fecha_expiracion < now()` y estado `emitido`, devuelve los puntos y restaura el inventario.
- `reembolsar_canje(canje_id, motivo, admin_id)`: reembolso administrativo idempotente.

### Modificación a `confirmar_canje` de Miguel

Se agrega dentro de un `try/except` la llamada a `confirmar_puntos_reservados` de Jass. La firma del endpoint y el JSON de respuesta no cambian — el panel del patrocinador sigue funcionando igual.

---

## Sección 3 — Frontend: insignias del voluntario interno

**Archivos:**  
- `src/components/profile/VoluntarioInternoInsigniasCard.tsx` (nuevo)  
- `src/components/profile/ImpactoInsigniasToggle.tsx` (modificado)  
- `src/components/profile/LoggedInProfile.tsx` (modificado)  
**Estado:** ✅ Implementado

---

## Sección 4 — Frontend: catálogo de recompensas

**Archivos:**  
- `src/screens/CatalogoRecompensasScreen.tsx` (nuevo)  
- `src/app/(tabs)/profile.tsx` (modificado: acceso desde el perfil)  
**Estado:** ✅ Implementado

---

## Sección 5 — Frontend: mis canjes y QR

**Archivos:**  
- `src/screens/MisCanjesScreen.tsx` (nuevo)  
- `src/app/(tabs)/profile.tsx` (modificado)  
**Estado:** ✅ Implementado


---

## Sección 6 — Frontend: escáner QR del patrocinador

**Archivos:**  
- `src/screens/EscanerCanjeScreen.tsx` (nuevo)  
- `src/app/(tabs)/profile.tsx` (modificado)  
**Estado:** ✅ Implementado

---

## Reglas de negocio implementadas (no modificar sin consenso del equipo)

- Los puntos **nunca se calculan en el frontend**. El saldo que se muestra en la UI viene directamente de `GET /reputacion/me`.
- Los puntos se **reservan al crear el canje** y se **confirman definitivamente** solo cuando el patrocinador escanea el QR. Si el QR expira, los puntos se devuelven automáticamente.
- Un usuario no puede tener **más de un QR activo** de la misma recompensa al mismo tiempo.
- El límite global es de **2 canjes en 30 días** por usuario.
- Los límites por patrocinador según nivel son: pequeña = 30 días, mediana = 90 días, grande = 365 días.
- El Trust Score **nunca se expone en la UI** con su valor numérico, solo como mensaje de restricción ya traducido.
- Las insignias del voluntario interno **no se calculan en el frontend**. Se consumen desde `GET /reputacion/me/insignias?rol=voluntario_interno`.
