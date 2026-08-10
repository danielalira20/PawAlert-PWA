from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services import incidentes_service, reputacion_service


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


# ─── confirmar_puntos_reservados ────────────────────────────────────────

def test_confirmar_puntos_reservados_parametros_correctos_a_la_rpc():
    """A diferencia de otorgar/reservar/devolver/revertir, esta función NO
    manda p_puntos -- confirmar_puntos_reservados_atomico siempre inserta
    puntos=0 del lado de Postgres (0052_confirmar_liberar_puntos.sql)."""
    supabase, rpc = _rpc_supabase(data=[{"id": "mov-2", "tipo_movimiento": "confirmado", "puntos": 0}])

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.confirmar_puntos_reservados(
            "user-1", "reportante", "canje_recompensa_confirmado", "canje", "canje-1",
        )

    assert resultado == {"id": "mov-2", "tipo_movimiento": "confirmado", "puntos": 0}
    supabase.rpc.assert_called_once_with("confirmar_puntos_reservados_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": "reportante",
        "p_regla": "canje_recompensa_confirmado",
        "p_tipo_origen": "canje",
        "p_evento_origen_id": "canje-1",
    })


def test_confirmar_puntos_reservados_no_propaga_excepcion_de_la_rpc(capsys):
    """Mismo criterio que otorgar_puntos/devolver_puntos/revertir_puntos:
    traga la excepción, deja rastro por [WARN] y regresa None -- quien
    confirma un canje ya escaneó el QR, no tiene nada que deshacer si la
    auditoría falla."""
    supabase, rpc = _rpc_supabase(raises=Exception("fallo simulado de Postgres"))

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.confirmar_puntos_reservados(
            "user-1", "reportante", "canje_recompensa_confirmado", "canje", "canje-1",
        )

    assert resultado is None
    salida = capsys.readouterr().out
    assert "[WARN]" in salida
    assert "confirmar_puntos_reservados fallo" in salida


def test_confirmar_puntos_reservados_segunda_llamada_no_duplica():
    """ON CONFLICT (regla, evento_origen_id) DO NOTHING: si la misma
    confirmación ya se procesó, la RPC regresa RETURNING vacío -- el
    wrapper debe devolver None sin lanzar, igual que
    otorgar_puntos_no_duplica_si_ya_existe."""
    supabase, rpc = _rpc_supabase(data=[])

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.confirmar_puntos_reservados(
            "user-1", "reportante", "canje_recompensa_confirmado", "canje", "canje-1",
        )

    assert resultado is None
    supabase.rpc.assert_called_once_with("confirmar_puntos_reservados_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": "reportante",
        "p_regla": "canje_recompensa_confirmado",
        "p_tipo_origen": "canje",
        "p_evento_origen_id": "canje-1",
    })


def test_confirmar_puntos_reservados_manda_la_regla_tal_cual_sin_sufijo():
    """Desde 0053_confirmar_regla_segura.sql, quien reserva y quien
    confirma deben usar la MISMA regla -- es la propia RPC
    (confirmar_puntos_reservados_atomico) la que le agrega el sufijo fijo
    '__confirmado' antes de insertar, no el wrapper de Python.

    Este test deja constancia del contrato del lado Python: p_regla debe
    viajar a la RPC exactamente como la pasó el llamador (la misma regla
    usada en reservar_puntos para este evento), SIN que
    confirmar_puntos_reservados le agregue ningún sufijo por su cuenta.
    Si el wrapper alguna vez empezara a concatenar '__confirmado' (o
    cualquier otro sufijo) él mismo, terminaría duplicando el trabajo de
    la función SQL (que ya lo hace) y produciría una regla con el
    sufijo dos veces -- la responsabilidad de esa transformación vive
    exclusivamente en Postgres."""
    supabase, rpc = _rpc_supabase(data=[{"id": "mov-3", "tipo_movimiento": "confirmado", "puntos": 0}])

    with patch.object(reputacion_service, "supabase", supabase):
        reputacion_service.confirmar_puntos_reservados(
            "user-1", "reportante", "canje_recompensa", "canje", "canje-1",
        )

    kwargs_enviados = supabase.rpc.call_args[0][1]
    assert kwargs_enviados["p_regla"] == "canje_recompensa"
    assert not kwargs_enviados["p_regla"].endswith("__confirmado"), (
        "el wrapper Python no debe agregar el sufijo por su cuenta -- "
        "eso es responsabilidad exclusiva de confirmar_puntos_reservados_atomico (0053)"
    )


# ─── consultar_saldo_desglosado ─────────────────────────────────────────

def test_consultar_saldo_desglosado_parametros_correctos_y_retorno():
    fila = {"saldo_disponible": 70, "saldo_reservado": 30, "saldo_total": 100}
    supabase, rpc = _rpc_supabase(data=[fila])

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_saldo_desglosado("user-1", "reportante")

    assert resultado == fila
    supabase.rpc.assert_called_once_with("calcular_saldo_desglosado_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": "reportante",
    })


def test_consultar_saldo_desglosado_sin_movimientos_usa_default():
    """Usuario sin ningún movimiento todavía -- la RPC no regresa fila
    (a diferencia de ajustar_trust_score_atomico, esta no crea nada), el
    wrapper debe caer al default en cero en vez de tronar con IndexError."""
    supabase, rpc = _rpc_supabase(data=[])

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.consultar_saldo_desglosado("user-1", "reportante")

    assert resultado == {"saldo_disponible": 0, "saldo_reservado": 0, "saldo_total": 0}


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


def test_ajustar_trust_score_reduccion_con_tipo_origen_no_incidente_es_rechazada_no_propaga(capsys):
    """0050_bloquear_reduccion_directa.sql (CREATE OR REPLACE sobre
    ajustar_trust_score_atomico) ahora levanta P0006 para CUALQUIER
    tipo='reduccion' cuyo tipo_origen no sea exactamente 'incidente' --
    la única vía legítima pasa a ser registrar_incidente ->
    confirmar_incidente. Se simula aquí ese rechazo (Postgres real, no
    mockeado) y se confirma que el wrapper lo traga igual que cualquier
    otro fallo de RPC: [WARN] + None, sin propagar."""
    supabase, rpc = _rpc_supabase(
        raises=Exception(
            "Las reducciones de trust score solo pueden aplicarse a traves del "
            "sistema de Incidentes (registrar_incidente -> confirmar_incidente). "
            "tipo_origen recibido: moderacion"
        )
    )

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.ajustar_trust_score(
            "user-1", "reportante", "reduccion", reputacion_service.TRUST_REDUCCION_FALSO_CONFIRMADO,
            reputacion_service.REGLA_TRUST_REPORTE_FALSO, "Reporte falso confirmado por moderacion",
            reputacion_service.TIPO_ORIGEN_MODERACION, "reporte-1",
            responsable_confirmacion_id="admin-1",
        )

    assert resultado is None
    assert "[WARN]" in capsys.readouterr().out


def test_ajustar_trust_score_reduccion_con_tipo_origen_incidente_funciona_normal():
    """La única vía que 0050 deja abierta para reducir trust score:
    tipo_origen='incidente' (como lo manda confirmar_incidente_atomico
    en 0049) sigue funcionando sin cambios."""
    fila_reducida = {"usuario_id": "user-1", "rol": "reportante", "puntaje": 45, "estado_interno": "en_observacion"}
    supabase, rpc = _rpc_supabase(data=fila_reducida)

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.ajustar_trust_score(
            "user-1", "reportante", "reduccion", 15, "incidente_confirmado",
            "Evidencia manipulada", "incidente", "incidente-1",
            responsable_confirmacion_id="admin-1",
        )

    assert resultado == fila_reducida
    supabase.rpc.assert_called_once_with("ajustar_trust_score_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": "reportante",
        "p_tipo": "reduccion",
        "p_valor": 15,
        "p_regla": "incidente_confirmado",
        "p_motivo": "Evidencia manipulada",
        "p_tipo_origen": "incidente",
        "p_evento_origen_id": "incidente-1",
        "p_responsable_confirmacion_id": "admin-1",
        "p_limite_incremento_mes": None,
    })


def test_procesar_reporte_falso_confirmado_reduce_trust_score_via_incidente():
    """Reemplaza al canario del turno anterior (test_..._ya_no_reduce_
    trust_score_tras_0050): ese test documentaba el bug de 0050 a
    propósito y ahora está corregido -- procesar_reporte_falso_confirmado
    ya no llama ajustar_trust_score, crea Y confirma un incidente
    (tipo_incidente='reporte_falso') usando al admin como
    registrado_por/confirmado_por.

    Se mockean directamente incidentes_service.registrar_incidente /
    confirmar_incidente (probadas por su cuenta en
    test_incidentes_service.py) y se verifican los argumentos EXACTOS
    que este hook les manda -- no basta con "la cadena no truena": ese
    fue justo el error de la ronda anterior (el mock viejo respondía
    éxito genérico sin validar parámetros y dejó pasar el bug de 0050
    sin que nadie lo notara)."""
    supabase, rpc = _rpc_supabase(data=[{"id": "mov-1"}])  # respalda revertir_puntos

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(incidentes_service, "registrar_incidente", return_value={"id": "incidente-1"}) as mock_registrar,
        patch.object(
            incidentes_service, "confirmar_incidente",
            return_value={"id": "incidente-1", "estado": "confirmado"},
        ) as mock_confirmar,
    ):
        reputacion_service.procesar_reporte_falso_confirmado("reporte-1", "user-1", "admin-1")

    mock_registrar.assert_called_once_with(
        usuario_id="user-1",
        rol=reputacion_service.ROL_REPORTANTE,
        tipo_incidente="reporte_falso",
        descripcion="Reporte falso confirmado por moderacion",
        registrado_por="admin-1",
        actor_tipo="admin",
        reporte_id="reporte-1",
    )
    # confirmar_incidente recibe el id que registrar_incidente acaba de
    # devolver -- no un valor hardcodeado -- probando que están cableados
    # entre sí, no solo llamados por separado.
    mock_confirmar.assert_called_once_with("incidente-1", confirmado_por="admin-1", actor_tipo="admin")

    # revertir_puntos (movimientos_puntos, ajeno a 0050/incidentes) sigue
    # intentándose igual que antes de esta migración.
    supabase.rpc.assert_called_once_with("revertir_puntos_atomico", {
        "p_usuario_id": "user-1",
        "p_rol": reputacion_service.ROL_REPORTANTE,
        "p_regla": reputacion_service.REGLA_REPORTE_VALIDO_REVERTIDO,
        "p_tipo_origen": reputacion_service.TIPO_ORIGEN_MODERACION,
        "p_evento_origen_id": "reporte-1",
        "p_puntos": reputacion_service.PUNTOS_REPORTE_VALIDO,
    })


def test_procesar_reporte_falso_confirmado_no_propaga_si_incidentes_service_falla(capsys):
    """Mismo criterio que el resto de funciones secundarias: si
    incidentes_service falla (catálogo desactualizado, RPC rechazada,
    lo que sea), procesar_reporte_falso_confirmado no debe tumbar la
    resolución de moderación que lo llamó."""
    supabase, rpc = _rpc_supabase(data=[{"id": "mov-1"}])

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(
            incidentes_service, "registrar_incidente",
            side_effect=Exception("fallo simulado de incidentes_service"),
        ),
        patch.object(incidentes_service, "confirmar_incidente") as mock_confirmar,
    ):
        reputacion_service.procesar_reporte_falso_confirmado("reporte-1", "user-1", "admin-1")  # no debe lanzar

    # registrar_incidente ya falló -- nunca se llega a intentar confirmar.
    mock_confirmar.assert_not_called()
    assert "[WARN] no se pudo crear/confirmar incidente de reporte falso" in capsys.readouterr().out


# ─── _evaluar_racha_reportante ──────────────────────────────────────────
#
# Se mockea reputacion_service.ajustar_trust_score directamente (en vez
# de reconstruir una respuesta de RPC realista) porque lo que estas
# pruebas verifican es SI la racha se otorga y con qué regla -- ya hay
# pruebas propias de ajustar_trust_score más arriba que cubren su propio
# contrato con la RPC.

def test_evaluar_racha_reportante_otorga_mas_10_con_ventana_limpia(make_query):
    filas = [{"regla": reputacion_service.REGLA_TRUST_REPORTE_VALIDADO} for _ in range(10)]
    tabla = make_query(execute_results=[
        SimpleNamespace(data=filas),
        SimpleNamespace(data=None, count=10),
    ])
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service._evaluar_racha_reportante("user-1")

    mock_ajustar.assert_called_once()
    args = mock_ajustar.call_args.args
    assert args[0] == "user-1"
    assert args[2] == "incremento"
    assert args[3] == reputacion_service.TRUST_INCREMENTO_RACHA
    assert args[4] == reputacion_service.REGLA_TRUST_RACHA_10


def test_evaluar_racha_reportante_incidente_reporte_falso_en_ventana_rompe_racha(make_query):
    """Una fila con REGLA_INCIDENTE_REPORTE_FALSO (la regla real que
    confirmar_incidente_atomico escribe desde 0051) en los últimos 10
    eventos debe cortar la racha -- return temprano, sin otorgar el +10."""
    filas = [{"regla": reputacion_service.REGLA_TRUST_REPORTE_VALIDADO} for _ in range(9)] + [
        {"regla": reputacion_service.REGLA_INCIDENTE_REPORTE_FALSO},
    ]
    tabla = make_query(data=filas)  # nunca se llega a la segunda consulta (conteo_total)
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service._evaluar_racha_reportante("user-1")

    mock_ajustar.assert_not_called()


def test_evaluar_racha_reportante_regla_vieja_ya_no_se_reconoce_como_ruptura(make_query):
    """Limitación conocida, documentada aquí a propósito -- no es un bug
    activo: la consulta real filtra con
    .in_('regla', [REGLA_TRUST_REPORTE_VALIDADO, REGLA_INCIDENTE_REPORTE_FALSO]),
    así que una fila con la regla vieja REGLA_TRUST_REPORTE_FALSO
    ('trust_reporte_falso_confirmado', sin uso desde que
    procesar_reporte_falso_confirmado migró a incidentes_service) ni
    siquiera llegaría en `historial.data` de un Supabase real -- el
    propio filtro la excluye antes de que Python la vea. Esta prueba
    solo fija, a nivel de la función Python, que SI una fila así llegara
    de todos modos (ej. inspección manual de datos históricos previos a
    0051), _evaluar_racha_reportante no la reconoce como ruptura: los
    datos históricos previos a la migración no se re-interpretan."""
    filas = [{"regla": reputacion_service.REGLA_TRUST_REPORTE_VALIDADO} for _ in range(9)] + [
        {"regla": reputacion_service.REGLA_TRUST_REPORTE_FALSO},  # regla vieja, ya sin uso
    ]
    tabla = make_query(execute_results=[
        SimpleNamespace(data=filas),
        SimpleNamespace(data=None, count=10),
    ])
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service._evaluar_racha_reportante("user-1")

    # La regla vieja no se detecta -- la racha se otorga igual, como si
    # esa fila fuera un reporte válido más. Comportamiento aceptado, no
    # deseado activamente: no hay forma de que ocurra con datos nuevos.
    mock_ajustar.assert_called_once()


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


# ─── reglas de voluntario interno ───────────────────────────────────────

def test_procesar_busqueda_documentada_interna_otorga_puntos_y_trust():
    with (
        patch.object(reputacion_service, "otorgar_puntos") as mock_otorgar,
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service.procesar_busqueda_documentada_interna("busqueda-1", "user-1")

    mock_otorgar.assert_called_once_with(
        "user-1",
        reputacion_service.ROL_VOLUNTARIO_INTERNO,
        reputacion_service.REGLA_BUSQUEDA_DOCUMENTADA_INTERNA,
        reputacion_service.TIPO_ORIGEN_BUSQUEDA,
        "busqueda-1",
        reputacion_service.PUNTOS_BUSQUEDA_DOCUMENTADA_INTERNA,
    )
    mock_ajustar.assert_called_once_with(
        "user-1",
        reputacion_service.ROL_VOLUNTARIO_INTERNO,
        "incremento",
        reputacion_service.TRUST_BUSQUEDA_DOCUMENTADA_INTERNA,
        reputacion_service.REGLA_TRUST_BUSQUEDA_DOCUMENTADA_INTERNA,
        "Búsqueda documentada validada por la asociación",
        reputacion_service.TIPO_ORIGEN_BUSQUEDA,
        "busqueda-1",
        limite_incremento_mes=reputacion_service.TRUST_LIMITE_INCREMENTO_MES_VOLUNTARIO,
    )


def test_procesar_busqueda_documentada_interna_ignora_usuario_ausente():
    with (
        patch.object(reputacion_service, "otorgar_puntos") as mock_otorgar,
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service.procesar_busqueda_documentada_interna("busqueda-1", None)

    mock_otorgar.assert_not_called()
    mock_ajustar.assert_not_called()


def test_procesar_llegada_refugio_interna_solo_otorga_puntos():
    with (
        patch.object(reputacion_service, "otorgar_puntos") as mock_otorgar,
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service.procesar_llegada_refugio_interna("reporte-1", "user-1")

    mock_otorgar.assert_called_once_with(
        "user-1",
        reputacion_service.ROL_VOLUNTARIO_INTERNO,
        reputacion_service.REGLA_LLEGADA_REFUGIO_INTERNA,
        reputacion_service.TIPO_ORIGEN_HITO_RESCATE,
        "reporte-1",
        reputacion_service.PUNTOS_LLEGADA_REFUGIO_INTERNA,
    )
    mock_ajustar.assert_not_called()


def test_procesar_llegada_refugio_interna_ignora_usuario_ausente():
    with patch.object(reputacion_service, "otorgar_puntos") as mock_otorgar:
        reputacion_service.procesar_llegada_refugio_interna("reporte-1", None)

    mock_otorgar.assert_not_called()


def test_aprobacion_voluntario_interno_otorga_bono_unico_por_usuario():
    with patch.object(reputacion_service, "otorgar_puntos") as mock_otorgar:
        reputacion_service.procesar_aprobacion_voluntario_interno(
            "postulacion-1", "user-1"
        )

    mock_otorgar.assert_called_once_with(
        "user-1",
        reputacion_service.ROL_VOLUNTARIO_INTERNO,
        reputacion_service.REGLA_BONO_VOLUNTARIO_INTERNO,
        reputacion_service.TIPO_ORIGEN_POSTULACION,
        "user-1",
        reputacion_service.PUNTOS_BONO_VOLUNTARIO_INTERNO,
    )


def test_respuesta_propuesta_interna_suma_uno_si_no_alcanzo_tope(make_query):
    movimientos = make_query(data=[{"valor": 1}, {"valor": 1}])
    supabase = MagicMock()
    supabase.table.return_value = movimientos

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service.procesar_respuesta_propuesta_interna(
            "propuesta-1", "user-1"
        )

    mock_ajustar.assert_called_once_with(
        "user-1",
        reputacion_service.ROL_VOLUNTARIO_INTERNO,
        "incremento",
        reputacion_service.TRUST_RESPUESTA_PROPUESTA_INTERNA,
        reputacion_service.REGLA_TRUST_RESPUESTA_PROPUESTA_INTERNA,
        "Propuesta de asignación respondida dentro del plazo",
        reputacion_service.TIPO_ORIGEN_PROPUESTA_ASIGNACION,
        "propuesta-1",
        limite_incremento_mes=reputacion_service.TRUST_LIMITE_INCREMENTO_MES_VOLUNTARIO,
    )


def test_respuesta_propuesta_interna_no_supera_cinco_al_mes(make_query):
    movimientos = make_query(data=[{"valor": 1} for _ in range(5)])
    supabase = MagicMock()
    supabase.table.return_value = movimientos

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service.procesar_respuesta_propuesta_interna(
            "propuesta-6", "user-1"
        )

    mock_ajustar.assert_not_called()


def test_rescate_completado_interno_otorga_cuarenta_puntos_y_cinco_trust():
    with (
        patch.object(reputacion_service, "otorgar_puntos") as mock_otorgar,
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service.procesar_rescate_completado_interno(
            "reporte-1", "user-1", "Animal rescatado y estable"
        )

    mock_otorgar.assert_called_once_with(
        "user-1",
        reputacion_service.ROL_VOLUNTARIO_INTERNO,
        reputacion_service.REGLA_RESCATE_COMPLETADO_INTERNO,
        reputacion_service.TIPO_ORIGEN_REPORTE,
        "reporte-1",
        reputacion_service.PUNTOS_RESCATE_COMPLETADO_INTERNO,
    )
    mock_ajustar.assert_called_once_with(
        "user-1",
        reputacion_service.ROL_VOLUNTARIO_INTERNO,
        "incremento",
        reputacion_service.TRUST_RESCATE_COMPLETADO_INTERNO,
        reputacion_service.REGLA_TRUST_RESCATE_COMPLETADO_INTERNO,
        "Rescate concluido y documentado correctamente",
        reputacion_service.TIPO_ORIGEN_REPORTE,
        "reporte-1",
        limite_incremento_mes=reputacion_service.TRUST_LIMITE_INCREMENTO_MES_VOLUNTARIO,
    )


def test_rescate_interno_sin_conclusion_valida_no_otorga_reputacion():
    with (
        patch.object(reputacion_service, "otorgar_puntos") as mock_otorgar,
        patch.object(reputacion_service, "ajustar_trust_score") as mock_ajustar,
    ):
        reputacion_service.procesar_rescate_completado_interno(
            "reporte-1", "user-1", None
        )

    mock_otorgar.assert_not_called()
    mock_ajustar.assert_not_called()


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
    ("confirmar_puntos_reservados", dict(
        usuario_id="user-1", rol="reportante", regla="canje_recompensa_confirmado",
        tipo_origen="canje", evento_origen_id="canje-1",
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


# ─── evaluar_reportes_validados_por_tiempo — regresión de los 2 bugs reales ──
#
# Bug 1 (ronda anterior, ya corregido): ESTADOS_EXCLUIDOS_REPORTE_VALIDO
# tenía el string "cancelado" (nombre que dejó de existir en el esquema
# desde que Daniela lo renombró a "cancelado_por_reportante" en
# e9e210d, 08-02). El .not_.in_() de Postgres nunca coincidía con el
# nombre real, así que el job de 7 días NUNCA excluía esos reportes.
#
# Bug 2 (EL GRANDE de esta ronda): la misma constante también tenía
# "rechazado" -- un valor que NUNCA existió en estado_reporte_enum (es
# un enum tipado de Postgres, confirmado consultando el schema real).
# Un NOT IN con un literal inválido no "no hace match": revienta la
# query ENTERA con 22P02 para cualquier usuario, siempre -- esto dejó
# evaluar_reportes_validados_por_tiempo() fallando con 500 en cada
# corrida del cron desde que se desplegó (confirmado: cero filas con
# regla='reporte_valido' en todo movimientos_puntos). El concepto de
# "reporte rechazado por moderación" vive en estado_moderacion (columna
# de texto libre, admin.py::resolver_moderacion_reporte), NUNCA en
# estado_reporte -- por eso ahora se filtra aparte, con
# .neq("estado_moderacion", "rechazado"), no mezclado en el NOT IN.

ESTADOS_EXCLUIDOS_BUG_VIEJO = ["rechazado", "cancelado", "duplicado_vinculable", "duplicado_informativo"]


def test_evaluar_reportes_validados_por_tiempo_manda_la_lista_corregida(make_query):
    """Fija el valor EXACTO que la función le manda a Postgres para
    estado_reporte, y confirma que estado_moderacion viaja como
    condición SEPARADA (.neq), nunca mezclada dentro del NOT IN."""
    tabla = make_query(data=[])
    # make_query no encadena .lt(...)/.not_.in_(...)/.neq(...) por
    # defecto (mismo gotcha documentado en test_insignias_aliado.py) --
    # hay que apuntarlos a la misma query a mano.
    tabla.lt.return_value = tabla
    tabla.not_.in_.return_value = tabla
    tabla.neq.return_value = tabla
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with patch.object(reputacion_service, "supabase", supabase):
        reputacion_service.evaluar_reportes_validados_por_tiempo()

    tabla.not_.in_.assert_called_once_with(
        "estado_reporte",
        ["duplicado", "duplicado_vinculable", "duplicado_informativo", "cancelado_por_reportante"],
    )
    tabla.neq.assert_called_once_with("estado_moderacion", "rechazado")
    assert "rechazado" not in reputacion_service.ESTADOS_EXCLUIDOS_REPORTE_VALIDO
    assert "cancelado" not in reputacion_service.ESTADOS_EXCLUIDOS_REPORTE_VALIDO  # el nombre viejo, sin sufijo
    assert reputacion_service.ESTADOS_EXCLUIDOS_REPORTE_VALIDO != ESTADOS_EXCLUIDOS_BUG_VIEJO


def test_regresion_bug_reporte_cancelado_ya_no_se_cuela_como_valido(make_query):
    """Test canario del bug 1: el mock de la tabla APLICA de verdad la
    lista de exclusión que la función le manda (simula el filtrado real
    de Postgres) — así se puede probar el efecto completo, no solo el
    valor de la constante en aislado.

    Con la lista vieja del bug (ESTADOS_EXCLUIDOS_BUG_VIEJO, que tiene
    'cancelado' en vez de 'cancelado_por_reportante'), este mismo
    mecanismo hubiera dejado pasar el reporte cancelado a
    candidatos.data, y procesar_reporte_valido SÍ se habría llamado
    para él — exactamente el bug real. Con la lista corregida que usa
    el código hoy, el reporte cancelado nunca llega a candidatos.data."""
    reporte_cancelado = {"id": "rep-cancelado", "usuario_id": "user-1", "estado_reporte": "cancelado_por_reportante"}
    reporte_valido = {"id": "rep-valido", "usuario_id": "user-2", "estado_reporte": "pendiente"}
    todos = [reporte_cancelado, reporte_valido]

    tabla = MagicMock()
    tabla.select.return_value = tabla
    tabla.lt.return_value = tabla
    tabla.neq.return_value = tabla

    def fake_not_in(campo, excluidos):
        filtrados = [r for r in todos if r[campo] not in excluidos]
        tabla.execute.return_value = SimpleNamespace(data=filtrados)
        return tabla

    tabla.not_.in_.side_effect = fake_not_in

    supabase = MagicMock()
    supabase.table.return_value = tabla

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "procesar_reporte_valido") as mock_procesar,
    ):
        resultado = reputacion_service.evaluar_reportes_validados_por_tiempo()

    ids_procesados = [llamada.args[0] for llamada in mock_procesar.call_args_list]
    assert "rep-valido" in ids_procesados
    assert "rep-cancelado" not in ids_procesados
    assert resultado["revisados"] == 1

    # Confirmación explícita del "antes": con la lista vieja del bug, el
    # mismo reporte cancelado SÍ hubiera pasado el filtro.
    filtrados_con_bug_viejo = [r for r in todos if r["estado_reporte"] not in ESTADOS_EXCLUIDOS_BUG_VIEJO]
    assert reporte_cancelado in filtrados_con_bug_viejo


def test_regresion_bug_literal_rechazado_ya_no_se_manda_a_postgres():
    """Test canario del BUG GRANDE de esta ronda: 'rechazado' nunca fue
    miembro de estado_reporte_enum -- un NOT IN que lo incluyera no
    "no hacía match", reventaba la query ENTERA con 22P02 (confirmado
    contra Postgres real: se probó cada valor de la lista uno por uno,
    solo 'rechazado' y el 'cancelado' viejo fueron rechazados por el
    tipo). Este mock simula esa validación de tipo -- revienta si
    'rechazado' aparece en la lista de exclusión de estado_reporte,
    igual que el enum real lo haría."""
    def not_in_que_valida_enum(campo, excluidos):
        if campo == "estado_reporte" and "rechazado" in excluidos:
            raise Exception('invalid input value for enum estado_reporte_enum: "rechazado"')
        tabla.execute.return_value = SimpleNamespace(data=[])
        return tabla

    tabla = MagicMock()
    tabla.select.return_value = tabla
    tabla.lt.return_value = tabla
    tabla.neq.return_value = tabla
    tabla.not_.in_.side_effect = not_in_que_valida_enum
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.evaluar_reportes_validados_por_tiempo()

    # Con la lista actual (corregida), la validación de tipo simulada
    # nunca se dispara -- la query corre limpia, sin "error" en la
    # respuesta.
    assert "error" not in resultado
    assert resultado == {"revisados": 0, "procesados": 0}

    # Documentación explícita del "antes": si la lista todavía tuviera
    # el literal inválido (ESTADOS_EXCLUIDOS_BUG_VIEJO incluye
    # "rechazado"), esta misma validación de tipo -- la que Postgres
    # aplica de verdad -- hubiera reventado.
    with pytest.raises(Exception, match="estado_reporte_enum"):
        not_in_que_valida_enum("estado_reporte", ESTADOS_EXCLUIDOS_BUG_VIEJO)


def test_evaluar_reportes_validados_por_tiempo_no_propaga_si_falla_la_consulta():
    """Fix nuevo: si la consulta de candidatos revienta (cualquier error
    de Postgres, no solo el del enum), la función ahora lo atrapa y
    regresa el dict seguro con 'error', en vez de dejar que la
    excepción tumbe el endpoint completo con un 500 sin control -- el
    bug real que causó 22P02 sin manejo alguno durante toda esta
    investigación."""
    tabla = MagicMock()
    tabla.select.return_value = tabla
    tabla.lt.return_value = tabla
    tabla.not_.in_.return_value = tabla
    tabla.neq.return_value = tabla
    tabla.execute.side_effect = Exception("simulando un fallo real de Postgres")
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "procesar_reporte_valido") as mock_procesar,
    ):
        resultado = reputacion_service.evaluar_reportes_validados_por_tiempo()  # NO debe lanzar

    assert resultado["revisados"] == 0
    assert resultado["procesados"] == 0
    assert "error" in resultado
    assert "simulando un fallo real de Postgres" in resultado["error"]
    mock_procesar.assert_not_called()


# ─── Filtro compuesto: estado_reporte Y estado_moderacion, dos columnas ──
#
# Reporte con estado_reporte='asignado' (válido por sí solo) pero
# estado_moderacion='rechazado' (un admin ya lo marcó como contenido
# falso) -- debe excluirse en los 3 lugares que usan
# ESTADOS_EXCLUIDOS_REPORTE_VALIDO. Sin el filtro compuesto, un reporte
# ya marcado fraudulento seguiría sumando insignias/puntos porque
# estado_reporte por sí solo nunca refleja el rechazo de moderación
# (confirmado leyendo admin.py::resolver_moderacion_reporte: esa
# función solo actualiza estado_moderacion, nunca estado_reporte).

def _tabla_con_filtro_real(filas: list[dict]) -> MagicMock:
    """Mock de tabla que aplica de verdad los filtros .eq/.not_.in_/
    .neq sobre `filas`, para probar el filtro compuesto de punta a
    punta -- no solo que se llamaron los métodos correctos. Simplificación
    conocida: el estado de filtros se acumula y NO se resetea entre dos
    .execute() sobre el mismo mock (relevante solo si una función hace
    más de una consulta encadenada distinta sobre la misma tabla)."""
    estado = {"eq": {}, "excluidos": None, "neq": {}}
    tabla = MagicMock()

    def _eq(campo, valor):
        estado["eq"][campo] = valor
        return tabla

    def _not_in(campo, valores):
        estado["excluidos"] = valores
        return tabla

    def _neq(campo, valor):
        estado["neq"][campo] = valor
        return tabla

    def _execute():
        resultado = [
            f for f in filas
            if all(f.get(c) == v for c, v in estado["eq"].items())
            and (estado["excluidos"] is None or f.get("estado_reporte") not in estado["excluidos"])
            and all(f.get(c) != v for c, v in estado["neq"].items())
        ]
        return SimpleNamespace(data=resultado, count=len(resultado))

    tabla.select.return_value = tabla
    tabla.order.return_value = tabla
    tabla.lt.return_value = tabla
    tabla.eq.side_effect = _eq
    tabla.not_.in_.side_effect = _not_in
    tabla.neq.side_effect = _neq
    tabla.execute.side_effect = _execute
    return tabla


def test_evaluar_insignias_reportante_excluye_moderacion_rechazada(make_query):
    filas = [{"usuario_id": "user-1", "estado_reporte": "asignado", "estado_moderacion": "rechazado"}]
    reportes_tabla = _tabla_con_filtro_real(filas)
    tablas = {"reportes": reportes_tabla, "historial_reporte": make_query(data=[])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        actualizadas = reputacion_service.evaluar_insignias_reportante("user-1")

    assert actualizadas == []  # 0 reportes cuentan como válidos -> ningún nivel


def test_evaluar_reportes_validados_por_tiempo_excluye_moderacion_rechazada():
    reporte_moderado_rechazado = {
        "id": "rep-1", "usuario_id": "user-1", "estado_reporte": "asignado", "estado_moderacion": "rechazado",
    }
    reporte_normal = {
        "id": "rep-2", "usuario_id": "user-2", "estado_reporte": "pendiente", "estado_moderacion": "visible",
    }
    tabla = _tabla_con_filtro_real([reporte_moderado_rechazado, reporte_normal])
    supabase = MagicMock()
    supabase.table.return_value = tabla

    with (
        patch.object(reputacion_service, "supabase", supabase),
        patch.object(reputacion_service, "procesar_reporte_valido") as mock_procesar,
    ):
        resultado = reputacion_service.evaluar_reportes_validados_por_tiempo()

    ids_procesados = [c.args[0] for c in mock_procesar.call_args_list]
    assert "rep-2" in ids_procesados
    assert "rep-1" not in ids_procesados
    assert resultado["revisados"] == 1


def test_calcular_candidatos_historicos_excluye_moderacion_rechazada(make_query):
    filas = [{
        "id": "rep-1", "usuario_id": "user-1", "estado_reporte": "asignado",
        "estado_moderacion": "rechazado", "created_at": "2026-01-01T00:00:00+00:00",
    }]
    reportes_tabla = _tabla_con_filtro_real(filas)
    tablas = {"reportes": reportes_tabla, "historial_reporte": make_query(data=[])}
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        candidatos = reputacion_service._calcular_candidatos_insignias_historicas("user-1")

    assert candidatos == []


# ─── evaluar_insignias_reportante — cuenta desde reportes/historial_reporte ──
#
# Antes de este cambio, vigia_comunitario/impacto_real contaban desde
# movimientos_puntos/trust_score_movimientos (ledgers derivados, que
# solo tienen filas desde que el motor de puntos existe — dejaba
# "atrasadas" a las cuentas con reportes de antes del lanzamiento).
# Ahora cuentan directo de reportes/historial_reporte, mismo patrón que
# evaluar_insignias_aliado (Miguel). Los mocks reflejan eso: se
# patchea supabase.table("reportes")/("historial_reporte"), nunca
# movimientos_puntos/trust_score_movimientos.

def test_evaluar_insignias_reportante_cuenta_vigia_desde_reportes(make_query):
    reportes_query = make_query(execute_results=[
        SimpleNamespace(data=None, count=5),  # conteo de válidos (vigia)
        SimpleNamespace(data=[]),  # reportes_propios (_contar_desenlaces_validos) -- vacío, corta temprano
    ])
    reportes_query.not_.in_.return_value = reportes_query  # make_query no lo encadena por defecto
    tablas = {
        "reportes": reportes_query,
        "historial_reporte": make_query(data=[]),
        "insignias": make_query(execute_results=[
            SimpleNamespace(data=[]),  # select: no existe todavía
            SimpleNamespace(data=[{"id": "ins-1", "codigo_insignia": "vigia_comunitario", "nivel": "plata"}]),
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        actualizadas = reputacion_service.evaluar_insignias_reportante("user-1")

    llamadas_tabla = [c.args[0] for c in supabase.table.call_args_list]
    assert "reportes" in llamadas_tabla
    assert "movimientos_puntos" not in llamadas_tabla
    assert "trust_score_movimientos" not in llamadas_tabla
    tablas["reportes"].not_.in_.assert_any_call("estado_reporte", reputacion_service.ESTADOS_EXCLUIDOS_REPORTE_VALIDO)
    assert actualizadas[0]["codigo_insignia"] == "vigia_comunitario"
    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["nivel"] == "plata"
    assert insertado["progreso"] == 5


def test_evaluar_insignias_reportante_impacto_real_usa_historial_y_nivel_none(make_query):
    """Antes tenía nivel='oro' hardcodeado por error (mezclaba el
    concepto de insignia fija con el de insignia dinámica) -- ahora
    debe guardarse con nivel=None."""
    reportes_query = make_query(execute_results=[
        SimpleNamespace(data=None, count=0),  # conteo de válidos (vigia) -- 0, no dispara upsert de vigia
        SimpleNamespace(data=[{"id": "rep-1"}, {"id": "rep-2"}, {"id": "rep-3"}]),  # reportes_propios
    ])
    reportes_query.not_.in_.return_value = reportes_query  # make_query no lo encadena por defecto
    eventos = [
        {"reporte_id": "rep-1", "datos_extra": {"conclusion": "Animal rescatado y estable"}},
        {"reporte_id": "rep-2", "datos_extra": {"conclusion": "Animal en tratamiento veterinario"}},
        {"reporte_id": "rep-3", "datos_extra": {"conclusion": "Animal en hogar temporal"}},
    ]
    tablas = {
        "reportes": reportes_query,
        "historial_reporte": make_query(data=eventos),
        "insignias": make_query(execute_results=[
            SimpleNamespace(data=[]),
            SimpleNamespace(data=[{"id": "ins-2", "codigo_insignia": "impacto_real", "nivel": None}]),
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        actualizadas = reputacion_service.evaluar_insignias_reportante("user-1")

    assert actualizadas[0]["codigo_insignia"] == "impacto_real"
    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["codigo_insignia"] == "impacto_real"
    assert insertado["nivel"] is None
    assert insertado["progreso"] == 3


# ─── _calcular_candidatos_insignias_historicas — NUNCA escribe ─────────
#
# Separación cálculo/escritura (refactor reciente): esta función solo
# LEE y regresa los candidatos como dicts -- _aplicar_insignias_
# historicas_usuario es quien la llama y luego escribe de verdad vía
# _upsert_insignia. El modo dry_run del endpoint depende por completo
# de que esta separación se mantenga. Los mocks de abajo hacen que
# CUALQUIER .insert()/.update() reviente con una excepción -- si
# alguien en el futuro rompe la separación (ej. mueve el upsert para
# adentro de esta función por error), la prueba falla ruidosamente en
# vez de pasar en silencio.

def _tabla_que_revienta_si_escribe(*, data=None, execute_results=None):
    """Como make_query, pero .insert()/.update() lanzan en vez de
    regresar un mock encadenable -- cualquier intento de escritura
    revienta de inmediato, sin importar qué tabla sea."""
    query = MagicMock()
    for metodo in ("select", "eq", "order", "limit", "in_", "neq"):
        getattr(query, metodo).return_value = query
    query.not_.in_.return_value = query
    query.not_.is_.return_value = query
    query.insert.side_effect = AssertionError(
        "_calcular_candidatos_insignias_historicas NO debe escribir -- .insert() nunca debería llamarse aquí"
    )
    query.update.side_effect = AssertionError(
        "_calcular_candidatos_insignias_historicas NO debe escribir -- .update() nunca debería llamarse aquí"
    )
    if execute_results is not None:
        query.execute.side_effect = execute_results
    else:
        query.execute.return_value = SimpleNamespace(data=data, count=None)
    return query


def test_calcular_candidatos_insignias_historicas_no_escribe_nada():
    """Datos que alcanzan para AMBAS insignias (5+ reportes válidos y 3+
    desenlaces válidos), a propósito -- para maximizar la chance de
    atrapar una escritura accidental si alguien la reintroduce."""
    fechas = [f"2026-01-0{n}T00:00:00+00:00" for n in range(1, 6)]
    reportes_validos = [{"id": f"rep-{n}", "created_at": fechas[n - 1]} for n in range(1, 6)]
    reportes_query = _tabla_que_revienta_si_escribe(execute_results=[
        SimpleNamespace(data=reportes_validos),
        SimpleNamespace(data=[{"id": r["id"]} for r in reportes_validos]),
    ])
    eventos = [
        {"reporte_id": "rep-1", "datos_extra": {"conclusion": "Animal rescatado y estable"}, "created_at": "2026-02-01T00:00:00+00:00"},
        {"reporte_id": "rep-2", "datos_extra": {"conclusion": "Animal en tratamiento veterinario"}, "created_at": "2026-02-02T00:00:00+00:00"},
        {"reporte_id": "rep-3", "datos_extra": {"conclusion": "Animal en hogar temporal"}, "created_at": "2026-02-03T00:00:00+00:00"},
    ]
    tablas = {
        "reportes": reportes_query,
        "historial_reporte": _tabla_que_revienta_si_escribe(data=eventos),
        # "insignias" a propósito NO está en el dict -- si la función
        # intentara tocarla, supabase.table("insignias") lanza KeyError,
        # segunda capa de protección además de insert/update reventando.
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        candidatos = reputacion_service._calcular_candidatos_insignias_historicas("user-1")

    tablas["reportes"].insert.assert_not_called()
    tablas["reportes"].update.assert_not_called()
    tablas["historial_reporte"].insert.assert_not_called()
    tablas["historial_reporte"].update.assert_not_called()

    codigos = {c["codigo_insignia"] for c in candidatos}
    assert codigos == {"vigia_comunitario", "impacto_real"}
    vigia = next(c for c in candidatos if c["codigo_insignia"] == "vigia_comunitario")
    assert vigia["nivel"] == "plata"  # 5 reportes válidos -> cruza el umbral de plata (>=5)
    impacto = next(c for c in candidatos if c["codigo_insignia"] == "impacto_real")
    assert impacto["nivel"] is None
    assert impacto["progreso"] == 3


def test_reevaluar_insignias_historicas_reportante_dry_run_no_escribe_nada(make_query):
    """dry_run=True (el default) debe regresar el detalle calculado sin
    tocar la tabla insignias en absoluto -- ni select, ni insert, ni
    update. Es el modo que se usa contra producción antes de aplicar de
    verdad."""
    reportes_validos = [{"id": "rep-1", "created_at": "2026-01-01T00:00:00+00:00"}]
    reportes_query = _tabla_que_revienta_si_escribe(execute_results=[
        SimpleNamespace(data=[{"usuario_id": "user-1"}]),  # usuarios_resp
        SimpleNamespace(data=reportes_validos),  # reportes válidos de user-1
        SimpleNamespace(data=[{"id": "rep-1"}]),  # reportes_propios de user-1
    ])
    reportes_query.not_.is_.return_value = reportes_query
    tablas = {
        "reportes": reportes_query,
        "historial_reporte": _tabla_que_revienta_si_escribe(data=[]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        resultado = reputacion_service.reevaluar_insignias_historicas_reportante()  # sin args -> default dry_run=True

    assert resultado["modo"] == "dry_run"
    assert resultado["usuarios_revisados"] == 1
    assert resultado["insignias_que_se_crearian_o_actualizarian"] == 1
    assert resultado["detalle"][0]["codigo_insignia"] == "vigia_comunitario"
    assert resultado["detalle"][0]["nivel"] == "cobre"
    tablas["reportes"].insert.assert_not_called()
    tablas["reportes"].update.assert_not_called()


# ─── _aplicar_insignias_historicas_usuario ────────────────────────────

def test_reevaluar_historico_vigia_plata_con_fechas_reales_del_1ro_y_5to(make_query):
    """6 reportes válidos ordenados por fecha -> nivel 'plata' (>=5, no
    llega a 'oro' que pide >=15). obtenido_at debe ser la fecha del 1er
    reporte, mejorado_at la del 5to (el que cruza el umbral de plata),
    NO la del 6to."""
    fechas = [f"2026-01-0{n}T00:00:00+00:00" for n in range(1, 7)]
    reportes_validos = [{"id": f"rep-{n}", "created_at": fechas[n - 1]} for n in range(1, 7)]

    reportes_query = make_query(execute_results=[
        SimpleNamespace(data=reportes_validos),  # select válidos, ordenados
        SimpleNamespace(data=[{"id": r["id"]} for r in reportes_validos]),  # reportes_propios
    ])
    reportes_query.not_.in_.return_value = reportes_query  # make_query no lo encadena por defecto
    tablas = {
        "reportes": reportes_query,
        "historial_reporte": make_query(data=[]),  # sin eventos de cierre -- impacto_real no aplica aquí
        "insignias": make_query(execute_results=[
            SimpleNamespace(data=[]),
            SimpleNamespace(data=[{"id": "ins-1", "codigo_insignia": "vigia_comunitario", "nivel": "plata"}]),
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        actualizadas = reputacion_service._aplicar_insignias_historicas_usuario("user-1")

    assert actualizadas[0]["codigo_insignia"] == "vigia_comunitario"
    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["nivel"] == "plata"
    assert insertado["progreso"] == 6
    assert insertado["obtenido_at"] == fechas[0]  # 1er reporte
    # Fix aplicado: _upsert_insignia ahora incluye mejorado_at también en
    # el INSERT (antes solo se escribía en la rama de UPDATE, así que un
    # backfill que crea la insignia por primera vez -- el caso real hoy,
    # nadie tiene insignias de reportante todavía -- la dejaba en NULL sin
    # forma de corregirla después, porque un segundo run corta temprano en
    # _upsert_insignia si nivel/progreso no cambiaron). mejorado_at debe
    # ser la fecha del reporte que cruza el umbral de nivel -- el 5to para
    # 'plata', NO el 6to (el total de reportes válidos).
    assert insertado["mejorado_at"] == fechas[4]


def test_reevaluar_historico_impacto_real_ignora_conclusion_invalida_y_usa_3er_evento(make_query):
    """3 eventos caso_cerrado válidos + 1 inválido (que debe ignorarse) ->
    impacto_real se registra con obtenido_at = fecha del 3er evento
    válido en orden cronológico (no el 4to evento total, ni el inválido)."""
    reportes_propios = [{"id": f"rep-{n}"} for n in range(1, 5)]
    reportes_query = make_query(execute_results=[
        SimpleNamespace(data=[]),  # select válidos para vigia -- vacío, no dispara esa insignia
        SimpleNamespace(data=reportes_propios),
    ])
    reportes_query.not_.in_.return_value = reportes_query  # make_query no lo encadena por defecto
    eventos = [
        {"reporte_id": "rep-1", "datos_extra": {"conclusion": "No se pudo rescatar"}, "created_at": "2026-02-01T00:00:00+00:00"},
        {"reporte_id": "rep-2", "datos_extra": {"conclusion": "Animal rescatado y estable"}, "created_at": "2026-02-02T00:00:00+00:00"},
        {"reporte_id": "rep-3", "datos_extra": {"conclusion": "Animal en tratamiento veterinario"}, "created_at": "2026-02-03T00:00:00+00:00"},
        {"reporte_id": "rep-4", "datos_extra": {"conclusion": "Animal en hogar temporal"}, "created_at": "2026-02-04T00:00:00+00:00"},
    ]
    tablas = {
        "reportes": reportes_query,
        "historial_reporte": make_query(data=eventos),
        "insignias": make_query(execute_results=[
            SimpleNamespace(data=[]),
            SimpleNamespace(data=[{"id": "ins-2", "codigo_insignia": "impacto_real", "nivel": None}]),
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        actualizadas = reputacion_service._aplicar_insignias_historicas_usuario("user-1")

    assert actualizadas[0]["codigo_insignia"] == "impacto_real"
    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["nivel"] is None
    assert insertado["progreso"] == 3
    # 3er evento VÁLIDO en orden cronológico -- rep-1 (inválido) se
    # ignora, así que es el 4to evento total pero el 3er válido.
    assert insertado["obtenido_at"] == "2026-02-04T00:00:00+00:00"


def test_reevaluar_historico_impacto_real_mejorado_at_usa_misma_fecha_que_obtenido_at(make_query):
    """Fix aplicado: _aplicar_insignias_historicas_usuario ahora pasa
    mejorado_at explícito para impacto_real, con la MISMA fecha que
    obtenido_at (la fecha del 3er evento válido) -- antes se dejaba sin
    pasar y _upsert_insignia usaba el default 'ahora', lo cual era
    incorrecto para un backfill (la insignia no se "mejoró" hoy, se
    obtuvo en el pasado). impacto_real no tiene niveles (cobre/plata/
    oro), así que no hay un "umbral distinto" como en vigia_comunitario
    -- obtenido_at y mejorado_at deben coincidir exactamente."""
    reportes_propios = [{"id": f"rep-{n}"} for n in range(1, 4)]
    reportes_query = make_query(execute_results=[
        SimpleNamespace(data=[]),  # select válidos para vigia -- vacío, no dispara esa insignia
        SimpleNamespace(data=reportes_propios),
    ])
    reportes_query.not_.in_.return_value = reportes_query
    eventos = [
        {"reporte_id": "rep-1", "datos_extra": {"conclusion": "Animal rescatado y estable"}, "created_at": "2026-03-01T00:00:00+00:00"},
        {"reporte_id": "rep-2", "datos_extra": {"conclusion": "Animal en tratamiento veterinario"}, "created_at": "2026-03-02T00:00:00+00:00"},
        {"reporte_id": "rep-3", "datos_extra": {"conclusion": "Animal en hogar temporal"}, "created_at": "2026-03-03T00:00:00+00:00"},
    ]
    tablas = {
        "reportes": reportes_query,
        "historial_reporte": make_query(data=eventos),
        "insignias": make_query(execute_results=[
            SimpleNamespace(data=[]),
            SimpleNamespace(data=[{"id": "ins-2", "codigo_insignia": "impacto_real", "nivel": None}]),
        ]),
    }
    supabase = MagicMock()
    supabase.table.side_effect = lambda nombre: tablas[nombre]

    with patch.object(reputacion_service, "supabase", supabase):
        reputacion_service._aplicar_insignias_historicas_usuario("user-1")

    insertado = tablas["insignias"].insert.call_args[0][0]
    assert insertado["obtenido_at"] == "2026-03-03T00:00:00+00:00"
    assert insertado["mejorado_at"] == "2026-03-03T00:00:00+00:00"
    assert insertado["mejorado_at"] == insertado["obtenido_at"]
