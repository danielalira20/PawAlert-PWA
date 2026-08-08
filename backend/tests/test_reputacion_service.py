from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services import reputacion_service


# ─── Helpers ────────────────────────────────────────────────────────────
#
# reputacion_service llama a supabase.rpc(nombre, params).execute() para
# las 5 funciones atómicas de 0048_reputacion_reportante.sql. A diferencia
# de insignias_aliado_service (que solo usa supabase.table(...)), aquí el
# mock relevante es la cadena .rpc(...).execute(), no .table(...).
#
# Importante: estas pruebas NO pueden verificar la lógica que vive dentro
# de las funciones PL/pgSQL (el default de puntaje 60, el clamp [0,100],
# el RAISE EXCEPTION cuando falta responsable_confirmacion_id, etc.) —
# eso corre en Postgres, no en este proceso. Lo que sí verifican es el
# contrato del lado Python: qué parámetros manda cada wrapper a la RPC
# correspondiente, cómo interpreta la respuesta, y si propaga o traga la
# excepción que la RPC levantaría en cada uno de esos casos.

def _rpc_supabase(*, data=None, raises=None) -> tuple[MagicMock, MagicMock]:
    """Arma un supabase_admin falso donde .rpc(cualquier_nombre, params)
    siempre regresa el mismo mock encadenable, sin importar qué RPC se
    llame -- suficiente porque cada prueba ejercita una sola función
    pública a la vez."""
    supabase = MagicMock()
    llamada = MagicMock()
    if raises is not None:
        llamada.execute.side_effect = raises
    else:
        llamada.execute.return_value = SimpleNamespace(data=data)
    supabase.rpc.return_value = llamada
    return supabase, llamada


# ─── otorgar_puntos ────────────────────────────────────────────────────

def test_otorgar_puntos_no_duplica_si_ya_existe():
    """ON CONFLICT (regla, evento_origen_id) DO NOTHING en
    otorgar_puntos_atomico regresa RETURNING vacío cuando el movimiento ya
    existía -- resultado.data == [] del lado del cliente."""
    supabase, rpc = _rpc_supabase(data=[])

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.otorgar_puntos(
            "user-1", "reportante", "reporte_valido", "reporte", "reporte-1", 20,
        )

    assert resultado is None
    supabase.rpc.assert_called_once_with("otorgar_puntos_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": "reportante",
        "p_regla": "reporte_valido",
        "p_tipo_origen": "reporte",
        "p_evento_origen_id": "reporte-1",
        "p_puntos": 20,
        "p_limite_ocurrencias_mes": None,
    })


def test_otorgar_puntos_limite_mensual_no_lanza_excepcion(capsys):
    """La RPC levanta P0002 ('Limite mensual alcanzado...') cuando ya se
    otorgaron las N ocurrencias del mes -- otorgar_puntos debe tragarla y
    solo dejar rastro por print(), no un 'no pagó pero nadie se enteró'
    silencioso ni tampoco una excepción que tumbe al llamador."""
    supabase, rpc = _rpc_supabase(raises=Exception("Limite mensual alcanzado para la regla reporte_valido"))

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.otorgar_puntos(
            "user-1", "reportante", "reporte_valido", "reporte", "reporte-1", 20,
            limite_ocurrencias_mes=5,
        )

    assert resultado is None
    salida = capsys.readouterr().out
    assert "[WARN]" in salida
    assert "otorgar_puntos fallo" in salida


# ─── reservar_puntos ───────────────────────────────────────────────────

def test_reservar_puntos_lanza_error_si_saldo_insuficiente():
    """Único caso del contrato donde SÍ debe propagar: quien reserva (ej.
    Persona 5 al crear un canje) necesita enterarse del fallo para no
    crear el canje sin respaldo de puntos."""
    supabase, rpc = _rpc_supabase(raises=Exception("Saldo insuficiente"))

    with patch.object(reputacion_service, "supabase", supabase):
        with pytest.raises(Exception, match="Saldo insuficiente"):
            reputacion_service.reservar_puntos(
                "user-1", "reportante", "canje_recompensa", "canje", "canje-1", 500,
            )


def test_reservar_puntos_parametros_correctos_a_la_rpc():
    supabase, rpc = _rpc_supabase(data=[{"id": "mov-1", "puntos": -500}])

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.reservar_puntos(
            "user-1", "reportante", "canje_recompensa", "canje", "canje-1", 500,
        )

    assert resultado == {"id": "mov-1", "puntos": -500}
    supabase.rpc.assert_called_once_with("reservar_puntos_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": "reportante",
        "p_regla": "canje_recompensa",
        "p_tipo_origen": "canje",
        "p_evento_origen_id": "canje-1",
        "p_puntos": 500,
    })


# ─── ajustar_trust_score ───────────────────────────────────────────────
#
# Los 3 puntos pedidos aquí (default 60, clamp [0,100], reduccion sin
# evento exige responsable) son reglas de ajustar_trust_score_atomico
# (PL/pgSQL) -- no de este wrapper. Lo que se puede probar sin Postgres
# real es: (a) que el wrapper pasa los parámetros correctos y no
# reinterpreta la fila que la RPC contesta, y (b) que si la RPC rechaza
# la llamada (como haría con el RAISE EXCEPTION de responsable faltante),
# el wrapper la traga igual que cualquier otro fallo, en vez de tumbar al
# llamador.

def test_ajustar_trust_score_pasa_fila_creada_con_puntaje_60_sin_modificarla():
    fila_primera_vez = {
        "usuario_id": "user-1", "rol": "reportante", "puntaje": 63, "estado_interno": "normal",
    }
    supabase, rpc = _rpc_supabase(data=fila_primera_vez)

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.ajustar_trust_score(
            "user-1", "reportante", "incremento", 3, "trust_reporte_validado",
            "Reporte validado", "reporte", "reporte-1",
        )

    assert resultado == fila_primera_vez
    supabase.rpc.assert_called_once_with("ajustar_trust_score_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": "reportante",
        "p_tipo": "incremento",
        "p_valor": 3,
        "p_regla": "trust_reporte_validado",
        "p_motivo": "Reporte validado",
        "p_tipo_origen": "reporte",
        "p_evento_origen_id": "reporte-1",
        "p_responsable_confirmacion_id": None,
        "p_limite_incremento_mes": None,
    })


def test_ajustar_trust_score_nunca_sale_del_rango_0_100():
    """No hay forma de provocar el clamp desde Python -- se simula la
    respuesta que la RPC daría tras aplicarlo (puntaje tope en 100 pese a
    pedir +3) y se confirma que el wrapper no reclama ni recorta un
    número que ya viene recortado del lado de Postgres."""
    fila_topada = {"usuario_id": "user-1", "rol": "reportante", "puntaje": 100, "estado_interno": "normal"}
    supabase, rpc = _rpc_supabase(data=fila_topada)

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.ajustar_trust_score(
            "user-1", "reportante", "incremento", 3, "trust_reporte_validado",
            "Reporte validado", "reporte", "reporte-1",
        )

    assert resultado["puntaje"] == 100


def test_ajustar_trust_score_reduccion_sin_evento_exige_responsable_no_propaga(capsys):
    """Simula el RAISE EXCEPTION 'P0003' que ajustar_trust_score_atomico
    levanta cuando tipo='reduccion', evento_origen_id es NULL y no llega
    responsable_confirmacion_id. El wrapper debe tragarla igual que
    cualquier otro fallo de la RPC, no dejarla subir."""
    supabase, rpc = _rpc_supabase(
        raises=Exception("Una reduccion sin evento de origen requiere responsable_confirmacion_id")
    )

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.ajustar_trust_score(
            "user-1", "reportante", "reduccion", 10, "ajuste_manual",
            "Ajuste manual sin evento", "admin", None,
            responsable_confirmacion_id=None,
        )

    assert resultado is None
    assert "[WARN]" in capsys.readouterr().out


# ─── procesar_reporte_valido ───────────────────────────────────────────

def test_no_existe_regla_de_primer_aporte_en_el_modulo():
    """El bono de bienvenida y el de 'primer aporte verificado' se
    fusionaron en una sola regla (+30) -- confirma que la regla vieja ya
    no existe como símbolo en el módulo, no solo que nadie la llama."""
    assert not hasattr(reputacion_service, "REGLA_PRIMER_APORTE")
    assert not hasattr(reputacion_service, "PUNTOS_PRIMER_APORTE")


def test_procesar_reporte_valido_otorga_bono_bienvenida_una_sola_vez():
    """Antes eran 2 llamadas a otorgar_puntos con +30 cada una
    (bono_bienvenida + primer_aporte_verificado, 60 en total antes del
    +20 de reporte_valido = 80). Ahora debe ser una sola llamada con
    REGLA_BONO_BIENVENIDA, y ninguna con la regla vieja
    'primer_aporte_verificado' -- el primer reporte válido paga 50
    (30 + 20), no 80."""
    with (
        patch.object(reputacion_service, "otorgar_puntos", return_value=None) as mock_otorgar,
        patch.object(reputacion_service, "ajustar_trust_score", return_value=None),
        patch.object(reputacion_service, "_evaluar_racha_reportante", return_value=None),
        patch.object(reputacion_service, "evaluar_insignias_reportante", return_value=[]),
    ):
        reputacion_service.procesar_reporte_valido("reporte-1", "user-1")

    reglas_llamadas = [llamada.args[2] for llamada in mock_otorgar.call_args_list]

    assert reglas_llamadas.count(reputacion_service.REGLA_BONO_BIENVENIDA) == 1
    assert "primer_aporte_verificado" not in reglas_llamadas

    llamada_bienvenida = next(
        llamada for llamada in mock_otorgar.call_args_list
        if llamada.args[2] == reputacion_service.REGLA_BONO_BIENVENIDA
    )
    assert llamada_bienvenida.args[5] == reputacion_service.PUNTOS_BONO_BIENVENIDA == 30


def test_procesar_reporte_valido_no_otorga_nada_si_usuario_id_es_none():
    """Reporte de invitado sin cuenta -- no hay a quién otorgarle puntos.
    Debe salir antes de tocar supabase en absoluto."""
    supabase = MagicMock()

    with patch.object(reputacion_service, "supabase", supabase):
        reputacion_service.procesar_reporte_valido("reporte-1", None)

    supabase.rpc.assert_not_called()
    supabase.table.assert_not_called()


# ─── procesar_cierre_reporte ────────────────────────────────────────────

def test_procesar_cierre_reporte_no_ajusta_trust_score_si_conclusion_invalida():
    supabase = MagicMock()

    with patch.object(reputacion_service, "supabase", supabase):
        reputacion_service.procesar_cierre_reporte("reporte-1", "user-1", "No se pudo rescatar")

    supabase.rpc.assert_not_called()
    supabase.table.assert_not_called()


def test_procesar_cierre_reporte_no_ajusta_trust_score_si_usuario_id_es_none():
    supabase = MagicMock()

    with patch.object(reputacion_service, "supabase", supabase):
        reputacion_service.procesar_cierre_reporte("reporte-1", None, "Animal adoptado")

    supabase.rpc.assert_not_called()
    supabase.table.assert_not_called()


# ─── Contrato de propagación de excepciones ────────────────────────────
#
# reservar_puntos es la única función pública que debe dejar subir la
# excepción de la RPC. otorgar_puntos / devolver_puntos / revertir_puntos
# / ajustar_trust_score deben tragarla siempre (print + None), sin
# importar la causa del fallo del lado de Postgres.

@pytest.mark.parametrize("nombre_funcion, kwargs", [
    ("otorgar_puntos", dict(
        usuario_id="user-1", rol="reportante", regla="reporte_valido",
        tipo_origen="reporte", evento_origen_id="reporte-1", puntos=20,
    )),
    ("devolver_puntos", dict(
        usuario_id="user-1", rol="reportante", regla="canje_recompensa",
        tipo_origen="canje", evento_origen_id="canje-1", puntos=500,
    )),
    ("revertir_puntos", dict(
        usuario_id="user-1", rol="reportante", regla="reporte_valido_revertido",
        tipo_origen="moderacion", evento_origen_id="reporte-1", puntos=20,
    )),
    ("ajustar_trust_score", dict(
        usuario_id="user-1", rol="reportante", tipo="incremento", valor=3,
        regla="trust_reporte_validado", motivo="Reporte validado",
        tipo_origen="reporte", evento_origen_id="reporte-1",
    )),
])
def test_funciones_secundarias_no_propagan_excepcion_de_la_rpc(nombre_funcion, kwargs, capsys):
    supabase, rpc = _rpc_supabase(raises=Exception("fallo simulado de Postgres"))
    funcion = getattr(reputacion_service, nombre_funcion)

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = funcion(**kwargs)  # no debe lanzar

    assert resultado is None
    assert "[WARN]" in capsys.readouterr().out


def test_reservar_puntos_si_propaga_excepcion_de_la_rpc():
    supabase, rpc = _rpc_supabase(raises=Exception("fallo simulado de Postgres"))

    with patch.object(reputacion_service, "supabase", supabase):
        with pytest.raises(Exception, match="fallo simulado de Postgres"):
            reputacion_service.reservar_puntos(
                "user-1", "reportante", "canje_recompensa", "canje", "canje-1", 500,
            )


# ─── consultar_restricciones ────────────────────────────────────────────
#
# A diferencia de las funciones de arriba, consultar_restricciones no usa
# .rpc(...) sino .table("trust_score").select(...).eq(...).eq(...) -- un
# simple SELECT, no una RPC atómica. Los rangos (80/60/40/20) y el
# estado_interno los calcula y guarda ajustar_trust_score_atomico del
# lado de Postgres (ver verificación de la migración más abajo); aquí
# solo se prueba que consultar_restricciones traduce correctamente un
# (puntaje, estado_interno) ya leído en las banderas de restricción por
# rol, incluyendo los cortes exactos "< 40" / "< 20".

def _supabase_trust_score(make_query, *, fila: dict | None) -> tuple[MagicMock, MagicMock]:
    tabla = make_query(data=[fila] if fila else [])
    supabase = MagicMock()
    supabase.table.return_value = tabla
    return supabase, tabla


def test_consultar_restricciones_usuario_sin_fila_usa_default(make_query):
    """Sin fila en trust_score todavía -- mismo estado inicial que
    ajustar_trust_score_atomico usaría si creara la fila ahora: puntaje
    60, 'estandar', sin ninguna restricción activa."""
    supabase, tabla = _supabase_trust_score(make_query, fila=None)

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_restricciones("user-1", "reportante")

    assert resultado["puntaje"] == 60
    assert resultado["estado_interno"] == "estandar"
    assert resultado["requiere_revision_previa"] is False
    assert resultado["maximo_reportes_activos_dia"] is None
    assert resultado["requiere_revision_administrativa_total"] is False
    assert resultado["puede_enviar_emergencia"] is True


def test_consultar_restricciones_reportante_puntaje_40_no_requiere_revision(make_query):
    """El corte es '< 40', no '<= 40' -- a los 40 exactos todavía no debe
    activarse ninguna restricción de revisión previa."""
    supabase, tabla = _supabase_trust_score(
        make_query, fila={"puntaje": 40, "estado_interno": "en_observacion"},
    )

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_restricciones("user-1", "reportante")

    assert resultado["requiere_revision_previa"] is False
    assert resultado["maximo_reportes_activos_dia"] is None


def test_consultar_restricciones_reportante_puntaje_39_requiere_revision_y_tope_diario(make_query):
    supabase, tabla = _supabase_trust_score(
        make_query, fila={"puntaje": 39, "estado_interno": "restringido"},
    )

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_restricciones("user-1", "reportante")

    assert resultado["requiere_revision_previa"] is True
    assert resultado["maximo_reportes_activos_dia"] == 2
    assert resultado["requiere_revision_administrativa_total"] is False


def test_consultar_restricciones_reportante_puntaje_19_revision_administrativa_total(make_query):
    """Incluso en el peor rango, puede_enviar_emergencia sigue en True --
    es la bandera no-negociable del documento de asignación."""
    supabase, tabla = _supabase_trust_score(
        make_query, fila={"puntaje": 19, "estado_interno": "suspendido"},
    )

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_restricciones("user-1", "reportante")

    assert resultado["requiere_revision_administrativa_total"] is True
    assert resultado["puede_enviar_emergencia"] is True
    # Por debajo de 20 ya no aplica el tope diario de 2 -- ese rango es
    # 20 <= puntaje < 40, 19 queda fuera por abajo.
    assert resultado["maximo_reportes_activos_dia"] is None


def test_consultar_restricciones_voluntario_interno_puntaje_39_bloqueado_pero_puede_finalizar(make_query):
    supabase, tabla = _supabase_trust_score(
        make_query, fila={"puntaje": 39, "estado_interno": "restringido"},
    )

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_restricciones("user-1", "voluntario_interno")

    assert resultado["bloqueado_nuevas_asignaciones"] is True
    assert resultado["puede_finalizar_activos_en_curso"] is True
    assert resultado["suspension_operativa"] is False


def test_consultar_restricciones_voluntario_puntaje_60_sin_restricciones(make_query):
    supabase, tabla = _supabase_trust_score(
        make_query, fila={"puntaje": 60, "estado_interno": "estandar"},
    )

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_restricciones("user-1", "voluntario_interno")

    assert resultado["en_observacion"] is False
    assert resultado["bloqueado_nuevas_asignaciones"] is False
    assert resultado["suspension_operativa"] is False


def test_consultar_restricciones_filtra_por_usuario_y_rol_correctos(make_query):
    supabase, tabla = _supabase_trust_score(
        make_query, fila={"puntaje": 75, "estado_interno": "estandar"},
    )

    with patch.object(reputacion_service, "supabase", supabase):
        reputacion_service.consultar_restricciones("user-42", "voluntario_externo")

    supabase.table.assert_called_once_with("trust_score")
    tabla.eq.assert_any_call("usuario_id", "user-42")
    tabla.eq.assert_any_call("rol", "voluntario_externo")
