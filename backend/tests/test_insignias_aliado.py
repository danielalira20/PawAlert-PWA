from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import insignias_aliado_service


def _tablas(make_query, *, perfil, contribuciones, lotes=None, lote_asociaciones=None,
            insignias=None, recompensas=None, canjes=None):
    if insignias:
        # Ya existe una fila: select la encuentra -> rama update. Select y
        # update comparten el mismo `data` fijo, las pruebas que llegan
        # aquí no inspeccionan qué regresa el update, solo que se llamó.
        insignias_query = make_query(data=insignias)
    else:
        # No existe todavía: el primer execute() (select) debe regresar
        # vacío para caer en la rama insert; el segundo (insert) regresa
        # la fila recién creada. Cada prueba que usa insignias=None
        # dispara como máximo un otorgamiento en la misma corrida.
        insignias_query = make_query(execute_results=[
            SimpleNamespace(data=[]),
            SimpleNamespace(data=[{"id": "ins-auto"}]),
        ])

    tablas = {
        "perfil_apoyo": make_query(data=[perfil] if perfil else []),
        "contribuciones": make_query(data=contribuciones),
        "lotes": make_query(data=lotes or []),
        "lote_asociaciones": make_query(data=lote_asociaciones or []),
        "insignias": insignias_query,
        "recompensas": make_query(data=recompensas or []),
        "canjes_recompensa": make_query(data=canjes or []),
    }
    # .not_.is_(...) no lo configura make_query por defecto (ver
    # test_whatsapp_notifications.py) — hay que apuntarlo a la misma query.
    tablas["contribuciones"].not_.is_.return_value = tablas["contribuciones"]
    return tablas


def _supabase(tablas) -> MagicMock:
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]
    return supabase


PERFIL_ALIADO = {"id": "perfil-1", "tipo": "aliado_local"}


# ─── Contribución no entregada no avanza insignias ────────────────────────

def test_sin_contribuciones_entregadas_no_otorga_insignias(make_query):
    tablas = _tablas(make_query, perfil=PERFIL_ALIADO, contribuciones=[])

    with patch.object(insignias_aliado_service, "supabase", _supabase(tablas)):
        resultado = insignias_aliado_service.evaluar_insignias_aliado("user-1")

    assert resultado == []
    # La query real filtra por confirmada_at IS NOT NULL — una contribución
    # 'comprometida'/'rechazada'/'retirada' nunca la cumple.
    tablas["contribuciones"].not_.is_.assert_called_once_with("confirmada_at", "null")
    tablas["insignias"].insert.assert_not_called()


def test_contribucion_entregada_unica_otorga_aliado_de_impacto_cobre(make_query):
    tablas = _tablas(
        make_query,
        perfil=PERFIL_ALIADO,
        contribuciones=[{"id": "c1", "confirmada_at": "2026-08-01T10:00:00+00:00", "necesidades": None}],
        insignias=[],
    )

    with patch.object(insignias_aliado_service, "supabase", _supabase(tablas)):
        insignias_aliado_service.evaluar_insignias_aliado("user-1")

    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["codigo_insignia"] == "aliado_de_impacto"
    assert insertado["nivel"] == "cobre"


# ─── Un lote solo cuenta una vez (Recurso multiplicado) ───────────────────

def test_lote_confirmado_por_dos_asociaciones_otorga_recurso_multiplicado(make_query):
    tablas = _tablas(
        make_query,
        perfil=PERFIL_ALIADO,
        contribuciones=[],
        lotes=[{"id": "lote-1"}],
        lote_asociaciones=[{"lote_id": "lote-1"}, {"lote_id": "lote-1"}],
        insignias=[],
    )

    with patch.object(insignias_aliado_service, "supabase", _supabase(tablas)):
        insignias_aliado_service.evaluar_insignias_aliado("user-1")

    assert tablas["insignias"].insert.call_count == 1
    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["codigo_insignia"] == "recurso_multiplicado"


def test_lote_ya_premiado_no_se_vuelve_a_insertar(make_query):
    """Idempotencia: reevaluar el mismo lote (o cualquier otro evento) no
    debe duplicar la fila de insignia ya otorgada."""
    tablas = _tablas(
        make_query,
        perfil=PERFIL_ALIADO,
        contribuciones=[],
        lotes=[{"id": "lote-1"}],
        lote_asociaciones=[{"lote_id": "lote-1"}, {"lote_id": "lote-1"}],
        insignias=[{
            "id": "ins-1", "usuario_id": "user-1", "rol": "aliado_local",
            "codigo_insignia": "recurso_multiplicado", "nivel": None, "progreso": 1,
        }],
    )

    with patch.object(insignias_aliado_service, "supabase", _supabase(tablas)):
        insignias_aliado_service.evaluar_insignias_aliado("user-1")

    tablas["insignias"].insert.assert_not_called()
    tablas["insignias"].update.assert_called_once()


def test_lote_con_una_sola_confirmacion_no_otorga_recurso_multiplicado(make_query):
    tablas = _tablas(
        make_query,
        perfil=PERFIL_ALIADO,
        contribuciones=[],
        lotes=[{"id": "lote-1"}],
        lote_asociaciones=[{"lote_id": "lote-1"}],  # solo 1 asociación confirmó
        insignias=[],
    )

    with patch.object(insignias_aliado_service, "supabase", _supabase(tablas)):
        insignias_aliado_service.evaluar_insignias_aliado("user-1")

    tablas["insignias"].insert.assert_not_called()


# ─── Apoyo crítico / Recurso multiplicado son exclusivos de aliado_local o institucional ──

def test_donante_comunitario_no_obtiene_apoyo_critico_ni_recurso_multiplicado(make_query):
    tablas = _tablas(
        make_query,
        perfil={"id": "perfil-2", "tipo": "donante_comunitario"},
        contribuciones=[
            {"id": "c1", "confirmada_at": "2026-06-01T00:00:00+00:00", "necesidades": {"urgencia": "critico"}},
            {"id": "c2", "confirmada_at": "2026-06-02T00:00:00+00:00", "necesidades": {"urgencia": "critico"}},
            {"id": "c3", "confirmada_at": "2026-06-03T00:00:00+00:00", "necesidades": {"urgencia": "critico"}},
        ],
        lotes=[{"id": "lote-1"}],
        lote_asociaciones=[{"lote_id": "lote-1"}, {"lote_id": "lote-1"}],
        insignias=[],
    )

    with patch.object(insignias_aliado_service, "supabase", _supabase(tablas)):
        insignias_aliado_service.evaluar_insignias_aliado("user-1")

    codigos_insertados = [c.args[0]["codigo_insignia"] for c in tablas["insignias"].insert.call_args_list]
    assert "apoyo_critico" not in codigos_insertados
    assert "recurso_multiplicado" not in codigos_insertados
    # Pero sí puede ganar las 2 insignias que "aplican a todos los aliados".
    assert "aliado_de_impacto" in codigos_insertados


def test_diez_canjes_confirmados_otorgan_comunidad_que_recompensa(make_query):
    tablas = _tablas(
        make_query,
        perfil=PERFIL_ALIADO,
        contribuciones=[],
        recompensas=[{"id": "rec-1"}],
        canjes=[{"id": f"canje-{i}"} for i in range(10)],
        insignias=[],
    )
    with patch.object(insignias_aliado_service, "supabase", _supabase(tablas)):
        insignias_aliado_service.evaluar_insignias_aliado("user-1")
    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["codigo_insignia"] == "comunidad_que_recompensa"
    assert insertado["progreso"] == 10


def test_consultar_insignias_reevalua_historial_sin_bloquear_panel(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{"tipo": "aliado_local"}]),
        "insignias": make_query(data=[{
            "id": "ins-1", "usuario_id": "user-1", "rol": "aliado_local",
            "codigo_insignia": "aliado_de_impacto", "nivel": "cobre",
            "progreso": 1,
        }]),
    }
    with (
        patch.object(insignias_aliado_service, "supabase", _supabase(tablas)),
        patch.object(insignias_aliado_service, "evaluar_insignias_aliado") as evaluar,
    ):
        resultado = insignias_aliado_service.obtener_mis_insignias_aliado("user-1")

    evaluar.assert_called_once_with("user-1")
    assert resultado[0]["codigo_insignia"] == "aliado_de_impacto"


def test_fallo_al_reevaluar_no_impide_consultar_insignias(make_query):
    tablas = {
        "perfil_apoyo": make_query(data=[{"tipo": "aliado_local"}]),
        "insignias": make_query(data=[]),
    }
    with (
        patch.object(insignias_aliado_service, "supabase", _supabase(tablas)),
        patch.object(
            insignias_aliado_service,
            "evaluar_insignias_aliado",
            side_effect=RuntimeError("gamificación no disponible"),
        ),
    ):
        resultado = insignias_aliado_service.obtener_mis_insignias_aliado("user-1")

    assert resultado == []
