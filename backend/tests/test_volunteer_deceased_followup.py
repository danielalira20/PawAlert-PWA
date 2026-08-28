from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import voluntarios
from app.main import app
from app.services import deceased_followup_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-voluntario"}
USUARIO_ID = "00000000-0000-0000-0000-000000000005"
REPORTE_ID = "20000000-0000-0000-0000-000000000003"
ANIMAL_ID = "30000000-0000-0000-0000-000000000031"
RESULTADO_ID = "50000000-0000-0000-0000-000000000031"


def _usuario(rol: str = "voluntario_externo") -> dict:
    return {"id": USUARIO_ID, "asociacion_id": None, "rol": rol}


@pytest.mark.parametrize("rol", ["voluntario_interno", "voluntario_externo"])
def test_listado_usa_identidad_del_voluntario(rol: str) -> None:
    filas = [{"reporte_id": REPORTE_ID, "estado": "pendiente_voluntario"}]
    with (
        patch.object(
            voluntarios,
            "_obtener_usuario_autenticado",
            return_value=_usuario(rol),
        ),
        patch.object(
            deceased_followup_service,
            "listar_seguimientos_voluntario",
            return_value=filas,
        ) as listar,
    ):
        response = client.get(
            "/voluntarios/me/seguimientos-fallecimiento",
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == filas
    listar.assert_called_once_with(USUARIO_ID)


def test_listado_rechaza_roles_ajenos() -> None:
    with (
        patch.object(
            voluntarios,
            "_obtener_usuario_autenticado",
            return_value=_usuario("reportante"),
        ),
        patch.object(
            deceased_followup_service,
            "listar_seguimientos_voluntario",
        ) as listar,
    ):
        response = client.get(
            "/voluntarios/me/seguimientos-fallecimiento",
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    listar.assert_not_called()


def test_detalle_ajeno_no_revela_si_existe() -> None:
    with (
        patch.object(
            voluntarios,
            "_obtener_usuario_autenticado",
            return_value=_usuario(),
        ),
        patch.object(
            deceased_followup_service,
            "obtener_detalle_seguimiento_voluntario",
            side_effect=deceased_followup_service.SeguimientoFallecimientoError(
                "seguimiento_no_encontrado"
            ),
        ),
    ):
        response = client.get(
            f"/voluntarios/me/seguimientos-fallecimiento/{REPORTE_ID}",
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Seguimiento no encontrado"


def test_listado_se_limita_a_resultados_propios_y_abiertos(make_query) -> None:
    resultados = make_query(data=[{
        "id": RESULTADO_ID,
        "reporte_id": REPORTE_ID,
        "animal_id": ANIMAL_ID,
        "estado": "sin_vida_reportado",
    }])
    seguimientos = make_query(data=[{
        "id": "seguimiento-1",
        "reporte_id": REPORTE_ID,
        "estado": "pendiente_voluntario",
    }])
    reportes = make_query(data=[{
        "id": REPORTE_ID,
        "estado_reporte": "pendiente_seguimiento_fallecimiento",
        "municipio": "Benito Juárez",
        "colonia": "Del Valle",
    }])
    base = MagicMock()
    base.table.side_effect = lambda tabla: {
        "resultados_rescate_animal": resultados,
        "seguimientos_fallecimiento_reporte": seguimientos,
        "reportes": reportes,
    }[tabla]

    with patch.object(deceased_followup_service, "supabase_admin", base):
        respuesta = deceased_followup_service.listar_seguimientos_voluntario(
            USUARIO_ID
        )

    resultados.eq.assert_any_call("reportado_por_id", USUARIO_ID)
    seguimientos.in_.assert_any_call(
        "estado",
        list(deceased_followup_service.ESTADOS_SEGUIMIENTO_ABIERTOS),
    )
    assert respuesta[0]["reporte"]["id"] == REPORTE_ID
    assert respuesta[0]["resultados"][0]["id"] == RESULTADO_ID


def test_detalle_no_expone_evidencia_ni_coordenadas(make_query) -> None:
    resultados = make_query(data=[{
        "id": RESULTADO_ID,
        "reporte_id": REPORTE_ID,
        "animal_id": ANIMAL_ID,
        "estado": "sin_vida_reportado",
        "comentario": "Se documentó el hallazgo.",
    }])
    seguimiento = make_query(data=[{
        "id": "seguimiento-1",
        "reporte_id": REPORTE_ID,
        "estado": "pendiente_voluntario",
    }])
    reporte = make_query(data=[{
        "id": REPORTE_ID,
        "municipio": "Benito Juárez",
        "colonia": "Del Valle",
        "calle": "Amores",
        "animal": [{
            "id": ANIMAL_ID,
            "orden": 1,
            "cantidad": 1,
            "tipo_animal_catalogo": {"clave": "perro"},
            "condicion_catalogo": {"clave": "grave"},
            "tamanio_catalogo": {"clave": "mediano"},
        }],
    }])
    acciones = make_query(data=[])
    contactos = make_query(data=[])
    base = MagicMock()
    base.table.side_effect = lambda tabla: {
        "resultados_rescate_animal": resultados,
        "seguimientos_fallecimiento_reporte": seguimiento,
        "reportes": reporte,
        "seguimientos_retiro_animal": acciones,
        "contactos_retiro_animal": contactos,
    }[tabla]

    with patch.object(deceased_followup_service, "supabase_admin", base):
        detalle = (
            deceased_followup_service.obtener_detalle_seguimiento_voluntario(
                REPORTE_ID,
                USUARIO_ID,
            )
        )

    serializado = repr(detalle).lower()
    assert detalle["reporte"]["animales"][0]["id"] == ANIMAL_ID
    assert "evidencia" not in serializado
    assert "latitud" not in serializado
    assert "longitud" not in serializado
    acciones.in_.assert_called_once_with(
        "resultado_rescate_animal_id",
        [RESULTADO_ID],
    )
