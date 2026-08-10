import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import voluntario_service


# ─── finalizar_postulacion_interno() ──────────────────────────────────────
# La postulación de interno se crea aquí, no en POST /voluntarios/postulaciones
# — así no queda una postulación sin capacidades si el usuario abandona el
# formulario a medias.

def test_finalizar_postulacion_interno_sin_capacidades_lanza_422(make_query):
    voluntarios = make_query(data=[{"id": "vol-1"}])
    capacidades = make_query(data=[])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
    }[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        pytest.raises(Exception) as error,
    ):
        asyncio.run(
            voluntario_service.finalizar_postulacion_interno("user-1", "asoc-1")
        )

    assert getattr(error.value, "status_code", None) == 422
    assert "capacidades" in getattr(error.value, "detail", "").lower()


def test_finalizar_postulacion_interno_caso_feliz_llama_crear_postulacion(make_query):
    voluntarios = make_query(data=[{"id": "vol-1"}])
    capacidades = make_query(data=[{"voluntario_id": "vol-1"}])
    postulaciones = make_query(data=[])  # sin ninguna pendiente
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    resultado_esperado = {
        "postulacion_id": "post-1",
        "voluntario_id": "vol-1",
        "numero_intento": 1,
        "estado": "pendiente",
    }

    with (
        patch.object(voluntario_service, "supabase", supabase),
        patch.object(
            voluntario_service, "crear_postulacion",
            new=AsyncMock(return_value=resultado_esperado),
        ) as crear_mock,
    ):
        resultado = asyncio.run(
            voluntario_service.finalizar_postulacion_interno("user-1", "asoc-1")
        )

    crear_mock.assert_awaited_once_with("user-1", "interno", "asoc-1")
    assert resultado == resultado_esperado


def test_finalizar_postulacion_interno_idempotente_no_llama_crear_postulacion(make_query):
    # Simula un reintento después de que el INSERT anterior sí se completó
    # pero la respuesta se perdió — debe regresar la postulación ya creada
    # en vez de dejar que crear_postulacion() lance 409 (mismo patrón que
    # finalizar_postulacion_externa()).
    voluntarios = make_query(data=[{"id": "vol-1"}])
    capacidades = make_query(data=[{"voluntario_id": "vol-1"}])
    postulaciones = make_query(data=[{"id": "post-1", "numero_intento": 2}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        patch.object(
            voluntario_service, "crear_postulacion",
            new=AsyncMock(),
        ) as crear_mock,
    ):
        resultado = asyncio.run(
            voluntario_service.finalizar_postulacion_interno("user-1", "asoc-1")
        )

    crear_mock.assert_not_called()
    assert resultado == {
        "postulacion_id": "post-1",
        "voluntario_id": "vol-1",
        "numero_intento": 2,
        "estado": "pendiente",
    }


# ─── resolver_postulacion() ───────────────────────────────────────────────

def test_aprobar_postulacion_interna_dispara_bono_del_voluntario(make_query):
    tablas = {
        "postulaciones": make_query(data=[{
            "id": "post-1",
            "voluntario_id": "vol-1",
            "asociacion_id": "asoc-1",
            "tipo": "interno",
            "estado": "pendiente",
        }]),
        "voluntarios": make_query(data=[{"usuario_id": "user-1"}]),
        "roles": make_query(data=[{"id": "rol-interno"}]),
        "usuarios": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: tablas[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        patch(
            "app.services.reputacion_service.procesar_aprobacion_voluntario_interno"
        ) as mock_bono,
    ):
        resultado = asyncio.run(voluntario_service.resolver_postulacion(
            postulacion_id="post-1",
            usuario_staff_id="staff-1",
            asociacion_id="asoc-1",
            accion="aceptar",
        ))

    assert resultado["estado"] == "activo_nivel_1"
    mock_bono.assert_called_once_with("post-1", "user-1")


def test_fallo_del_bono_no_revierte_aprobacion_interna(make_query):
    tablas = {
        "postulaciones": make_query(data=[{
            "id": "post-1",
            "voluntario_id": "vol-1",
            "asociacion_id": "asoc-1",
            "tipo": "interno",
            "estado": "pendiente",
        }]),
        "voluntarios": make_query(data=[{"usuario_id": "user-1"}]),
        "roles": make_query(data=[{"id": "rol-interno"}]),
        "usuarios": make_query(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: tablas[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        patch(
            "app.services.reputacion_service.procesar_aprobacion_voluntario_interno",
            side_effect=Exception("fallo simulado"),
        ),
    ):
        resultado = asyncio.run(voluntario_service.resolver_postulacion(
            postulacion_id="post-1",
            usuario_staff_id="staff-1",
            asociacion_id="asoc-1",
            accion="aceptar",
        ))

    assert resultado == {
        "mensaje": "Postulación aceptada",
        "estado": "activo_nivel_1",
    }
    tablas["voluntarios"].update.assert_called_once()
    tablas["postulaciones"].update.assert_called_once()


# ─── asegurar_perfil_voluntario_interno() ─────────────────────────────────

def test_asegurar_perfil_voluntario_interno_ya_tiene_pendiente_lanza_409(make_query):
    voluntarios = make_query(data=[{"id": "vol-1", "estado": "postulacion_pendiente"}])
    postulaciones = make_query(data=[{"id": "post-1"}])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "postulaciones": postulaciones,
    }[tabla]

    with (
        patch.object(voluntario_service, "supabase", supabase),
        pytest.raises(Exception) as error,
    ):
        asyncio.run(
            voluntario_service.asegurar_perfil_voluntario_interno("user-1")
        )

    assert getattr(error.value, "status_code", None) == 409
    assert "pendiente" in getattr(error.value, "detail", "").lower()


# ─── obtener_mi_voluntario() ───────────────────────────────────────────────
# voluntarios.estado se marca 'postulacion_pendiente' desde el paso 1 de
# postular, antes de que exista una fila real en `postulaciones` — si el
# usuario abandona el formulario de capacidades, ese estado queda pegado sin
# ninguna postulación real detrás. La función debe tratar ese caso como si no
# tuviera perfil todavía (tiene_perfil_voluntario: false), sin tocar la fila
# real en `voluntarios`.

def test_obtener_mi_voluntario_pendiente_sin_postulacion_real_regresa_sin_perfil(make_query):
    voluntarios = make_query(data=[{
        "id": "vol-1", "estado": "postulacion_pendiente", "asociacion_id": None,
        "created_at": "2026-07-20T10:00:00+00:00", "updated_at": "2026-07-20T10:00:00+00:00",
    }])
    capacidades = make_query(data=[])
    postulaciones = make_query(data=[])  # nunca se creó ninguna
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(voluntario_service.obtener_mi_voluntario("user-1"))

    assert resultado == {"tiene_perfil_voluntario": False}


def test_obtener_mi_voluntario_pendiente_con_postulacion_real_regresa_datos(make_query):
    voluntarios = make_query(data=[{
        "id": "vol-1", "estado": "postulacion_pendiente", "asociacion_id": "aso-1",
        "created_at": "2026-07-20T10:00:00+00:00", "updated_at": "2026-07-20T10:00:00+00:00",
    }])
    capacidades = make_query(data=[])
    postulaciones = make_query(data=[{
        "id": "post-1", "tipo": "interno", "estado": "pendiente", "motivo_rechazo": None,
        "numero_intento": 1, "asociacion_id": "aso-1", "asociaciones": {"nombre": "Rescate Toluca"},
    }])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(voluntario_service.obtener_mi_voluntario("user-1"))

    assert resultado["tiene_perfil_voluntario"] is True
    assert resultado["estado"] == "postulacion_pendiente"
    assert resultado["ultima_postulacion"]["estado"] == "pendiente"
    assert resultado["ultima_postulacion"]["asociacion_nombre"] == "Rescate Toluca"


def test_obtener_mi_voluntario_reintento_abandonado_regresa_sin_perfil(make_query):
    # Postuló, fue rechazado, volvió a postular (voluntarios.estado regresa a
    # 'postulacion_pendiente') y abandonó el formulario de capacidades otra
    # vez — la postulación más reciente sigue siendo la vieja 'rechazada',
    # nunca se creó una nueva fila 'pendiente'.
    voluntarios = make_query(data=[{
        "id": "vol-1", "estado": "postulacion_pendiente", "asociacion_id": None,
        "created_at": "2026-07-20T10:00:00+00:00", "updated_at": "2026-07-20T10:00:00+00:00",
    }])
    capacidades = make_query(data=[])
    postulaciones = make_query(data=[{
        "id": "post-1", "tipo": "interno", "estado": "rechazada",
        "motivo_rechazo": "No cumple los requisitos", "numero_intento": 1,
        "asociacion_id": "aso-1", "asociaciones": {"nombre": "Rescate Toluca"},
    }])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "voluntarios": voluntarios,
        "capacidades": capacidades,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(voluntario_service.obtener_mi_voluntario("user-1"))

    assert resultado == {"tiene_perfil_voluntario": False}


# ─── generar_resumen_expediente_interno() ─────────────────────────────────
# Función pura (sin supabase) — mismos 5 bloques reutilizables que
# generar_resumen_expediente() de externo, escrita de cero para interno.

def test_generar_resumen_expediente_interno_arma_los_5_bloques():
    capacidades = {
        "disponibilidad": {"dias": ["lun", "mie"], "franjas": ["matutino"]},
        "tiempo_reaccion": "inmediata",
        "disponibilidad_urgencias": "si",
        "max_casos_simultaneos": 2,
        "radio_max_km": 10,
        "medios_transporte": ["automovil"],
        "vehiculo_apto_traslado": True,
        "tamanios_traslado": ["grande"],
        "especies_manejo": ["perro", "gato"],
        "tamanios_manejo": ["pequeno"],
        "primeros_auxilios_nivel": "basico",
        "experiencias_campo": ["cachorros_neonatos"],
        "vias_tratamiento": ["oral"],
        "trayectoria_tipos": ["mascotas_propias"],
        "experiencia_anios": "entre_1_3",
        "equipamiento": ["transportadora_chica"],
        "restricciones_fisicas": ["ninguna"],
        "canal_contacto": "whatsapp",
        "proyeccion_colaboracion": "continua",
        "motivaciones": ["salvar_animales"],
        "comentarios_adicionales": "Disponible fines de semana",
    }

    resumen = voluntario_service.generar_resumen_expediente_interno(capacidades)

    assert resumen == {
        "disponibilidad": {
            "dias": ["lun", "mie"],
            "franjas": ["matutino"],
            "tiempo_reaccion": "inmediata",
            "urgencias": "si",
            "casos_simultaneos": 2,
        },
        "movilidad": {
            "radio_max_km": 10,
            "medios_transporte": ["automovil"],
            "vehiculo_apto_traslado": True,
            "tamanios_traslado": ["grande"],
        },
        "manejo_animal": {
            "especies": ["perro", "gato"],
            "tamanios": ["pequeno"],
            "primeros_auxilios": "basico",
            "experiencias_campo": ["cachorros_neonatos"],
            "tratamientos": ["oral"],
            "trayectoria": ["mascotas_propias"],
            "experiencia_anios": "entre_1_3",
        },
        "equipo_y_bienestar": {
            "equipamiento": ["transportadora_chica"],
            "restricciones_fisicas": ["ninguna"],
        },
        "contacto_y_compromisos": {
            "canal_preferido": "whatsapp",
            "proyeccion": "continua",
            "motivaciones": ["salvar_animales"],
            "comentarios": "Disponible fines de semana",
        },
    }


def test_generar_resumen_expediente_interno_capacidades_vacias_no_truena():
    resumen = voluntario_service.generar_resumen_expediente_interno({})

    assert resumen["disponibilidad"]["dias"] == []
    assert resumen["movilidad"]["medios_transporte"] == []
    assert resumen["manejo_animal"]["especies"] == []
    assert resumen["equipo_y_bienestar"]["equipamiento"] == []
    assert resumen["contacto_y_compromisos"]["motivaciones"] == []


# ─── obtener_postulaciones_asociacion() — fallback legacy→v2 y distancia_km ─

def _fila_postulacion_interno(capacidades: dict) -> dict:
    """Una fila cruda de postulaciones tal como la regresaría Supabase, con
    el embed de voluntarios/usuarios/capacidades — mismo shape que usa
    obtener_postulaciones_asociacion()."""
    return {
        "id": "post-1",
        "voluntario_id": "vol-1",
        "tipo": "interno",
        "estado": "pendiente",
        "motivo_rechazo": None,
        "numero_intento": 1,
        "created_at": "2026-07-20T10:00:00+00:00",
        "resuelta_at": None,
        "voluntarios": {
            "usuario_id": "user-1",
            "usuarios": {
                "nombre": "Ana", "apellido_paterno": "López",
                "telefono": "5512345678", "email": "ana@example.com",
            },
            "capacidades": capacidades,
        },
    }


def test_obtener_postulaciones_asociacion_fallback_legacy_v2(make_query):
    # vehiculo: v2 real (True) debe ganar sobre legacy (False).
    # especies: v2 nunca se tocó (None) debe caer a legacy.
    # tamanios: v2 explícitamente vacío ([]) debe respetarse, NO caer a legacy.
    capacidades = {
        "disponibilidad": {}, "ofrece_casa_hogar": False, "capacidad_animales": 0,
        "especies": ["perro"], "tamanios": ["grande"], "tiene_vehiculo": False,
        "motivo_voluntario": None, "experiencia_previa": None,
        "latitud": None, "longitud": None,
        "medios_transporte": [], "vehiculo_apto_traslado": True, "radio_max_km": None,
        "tamanios_traslado": [], "especies_manejo": None, "tamanios_manejo": [],
        "primeros_auxilios_nivel": None, "experiencias_campo": [], "vias_tratamiento": [],
        "trayectoria_tipos": [], "experiencia_anios": None, "equipamiento": [],
        "restricciones_fisicas": [], "canal_contacto": None,
        "proyeccion_colaboracion": None, "motivaciones": [], "comentarios_adicionales": None,
        "tiempo_reaccion": None, "disponibilidad_urgencias": None, "max_casos_simultaneos": 1,
    }
    asociaciones = make_query(data=[{"latitud": 19.04, "longitud": -98.19}])
    postulaciones = make_query(data=[_fila_postulacion_interno(capacidades)])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "asociaciones": asociaciones,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(
            voluntario_service.obtener_postulaciones_asociacion("aso-1")
        )

    cap = resultado[0]["capacidades"]
    assert cap["vehiculo_final"] is True  # v2 real gana sobre legacy False
    assert cap["especies_final"] == ["perro"]  # v2 None -> cae a legacy
    assert cap["tamanios_final"] == []  # v2 [] explícito -> se respeta, no cae a legacy


def test_obtener_postulaciones_asociacion_distancia_none_sin_coordenadas(make_query):
    capacidades = {
        "disponibilidad": {}, "ofrece_casa_hogar": False, "capacidad_animales": 0,
        "especies": [], "tamanios": [], "tiene_vehiculo": False,
        "motivo_voluntario": None, "experiencia_previa": None,
        "latitud": 19.04, "longitud": -98.19,  # el voluntario sí tiene coordenadas...
        "medios_transporte": [], "vehiculo_apto_traslado": False, "radio_max_km": None,
        "tamanios_traslado": [], "especies_manejo": [], "tamanios_manejo": [],
        "primeros_auxilios_nivel": None, "experiencias_campo": [], "vias_tratamiento": [],
        "trayectoria_tipos": [], "experiencia_anios": None, "equipamiento": [],
        "restricciones_fisicas": [], "canal_contacto": None,
        "proyeccion_colaboracion": None, "motivaciones": [], "comentarios_adicionales": None,
        "tiempo_reaccion": None, "disponibilidad_urgencias": None, "max_casos_simultaneos": 1,
    }
    asociaciones = make_query(data=[])  # ...pero la asociación no tiene fila/coordenadas
    postulaciones = make_query(data=[_fila_postulacion_interno(capacidades)])
    supabase = MagicMock()
    supabase.table.side_effect = lambda tabla: {
        "asociaciones": asociaciones,
        "postulaciones": postulaciones,
    }[tabla]

    with patch.object(voluntario_service, "supabase", supabase):
        resultado = asyncio.run(
            voluntario_service.obtener_postulaciones_asociacion("aso-1")
        )

    assert resultado[0]["distancia_km"] is None
    assert resultado[0]["resumen_interno"] is not None  # el resto del expediente sigue funcionando
