from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import reports
from app.main import app
from app.models.report import ResultadoRescateSinVidaRequest
from app.services import rescue_result_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-voluntario"}
REPORTE_ID = "20000000-0000-0000-0000-000000000003"
USUARIO_ID = "00000000-0000-0000-0000-000000000001"
ANIMAL_ID = "30000000-0000-0000-0000-000000000031"
EVIDENCIA_ID = "40000000-0000-0000-0000-000000000031"


def _payload() -> dict:
    return {
        "animales": [{"animal_id": ANIMAL_ID, "cantidad_reportada": 1}],
        "evidencia_id": EVIDENCIA_ID,
        "latitud": 19.4326,
        "longitud": -99.1332,
        "puede_esperar_seguro": False,
        "riesgo_vial": True,
        "riesgo_sanitario": False,
        "comentario": "El animal se encuentra junto a la banqueta.",
        "motivo_retiro_seguridad": "La vía tiene tránsito continuo.",
    }


def _usuario(rol: str = "voluntario_interno") -> dict:
    return {
        "id": USUARIO_ID,
        "asociacion_id": "10000000-0000-0000-0000-000000000001",
        "rol": rol,
    }


def _jpeg_simple() -> bytes:
    salida = BytesIO()
    Image.new("RGB", (80, 60), "gray").save(salida, format="JPEG")
    return salida.getvalue()


def test_carga_sensible_usa_almacenamiento_privado(make_query) -> None:
    reportes_query = make_query(data=[{
        "id": REPORTE_ID,
        "staff_asignado_id": USUARIO_ID,
        "asociacion_asignada_id": "10000000-0000-0000-0000-000000000001",
    }])
    evidencias_query = make_query(data=[{"id": EVIDENCIA_ID}])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "reportes": reportes_query,
        "reporte_evidencias": evidencias_query,
    }[tabla]

    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value=_usuario()),
        patch.object(reports, "supabase", cliente),
        patch.object(reports, "supabase_admin", cliente),
        patch("app.services.evidence_service.supabase_admin", cliente),
        patch(
            "app.services.storage_service.subir_bytes_privados",
            new=AsyncMock(
                return_value=(
                    "storage://pawalert-evidencias-privadas/"
                    "reportes/resultados-sensibles/foto.jpg"
                )
            ),
        ) as subir_privada,
        patch(
            "app.services.storage_service.subir_bytes",
            new=AsyncMock(),
        ) as subir_publica,
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/hitos/foto",
            data={"sensible": "true"},
            files={"foto": ("evidencia.jpg", _jpeg_simple(), "image/jpeg")},
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json()["foto_url"].startswith("storage://")
    subir_privada.assert_awaited_once()
    subir_publica.assert_not_awaited()


def test_endpoint_registra_resultado_para_voluntario() -> None:
    respuesta_rpc = {
        "reporte_id": REPORTE_ID,
        "todos_animales_reportados": False,
        "transicion_realizada": False,
        "estado_reporte": "en_camino",
    }

    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value=_usuario()),
        patch.object(
            reports,
            "_vincular_y_verificar_evidencia",
            return_value={
                "evidencia_id": EVIDENCIA_ID,
                "estado": "coincidente",
                "distancia_metros": 4,
                "requiere_revision": False,
            },
        ) as verificar_evidencia,
        patch.object(
            rescue_result_service,
            "registrar_resultado_sin_vida",
            return_value=respuesta_rpc,
        ) as registrar,
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/resultados/sin-vida",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 201
    assert response.json()["estado_reporte"] == "en_camino"
    assert response.json()["verificacion_evidencia"]["estado"] == "coincidente"
    assert registrar.call_args.args[:2] == (REPORTE_ID, USUARIO_ID)
    assert registrar.call_args.args[2].animales[0].animal_id == UUID(ANIMAL_ID)
    assert verificar_evidencia.call_args.kwargs["permitir_vinculada_mismo_hito"] is True


def test_endpoint_rechaza_roles_ajenos_al_voluntariado() -> None:
    with (
        patch.object(
            reports,
            "_obtener_usuario_autenticado",
            return_value=_usuario("asociacion"),
        ),
        patch.object(
            rescue_result_service,
            "registrar_resultado_sin_vida",
        ) as registrar,
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/resultados/sin-vida",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    registrar.assert_not_called()


@pytest.mark.parametrize(
    ("codigo", "status_code"),
    [
        ("reporte_no_encontrado", 404),
        ("voluntario_no_asignado", 403),
        ("llegada_zona_requerida", 409),
        ("resultado_previo_en_conflicto", 409),
        ("evidencia_no_disponible", 422),
        ("registro_resultado_no_disponible", 503),
    ],
)
def test_endpoint_traduce_errores_del_registro(codigo: str, status_code: int) -> None:
    with (
        patch.object(reports, "_obtener_usuario_autenticado", return_value=_usuario()),
        patch.object(
            rescue_result_service,
            "registrar_resultado_sin_vida",
            side_effect=rescue_result_service.ResultadoRescateError(codigo),
        ),
    ):
        response = client.post(
            f"/reports/{REPORTE_ID}/resultados/sin-vida",
            json=_payload(),
            headers=AUTH_HEADERS,
        )

    assert response.status_code == status_code


def test_servicio_envia_contrato_completo_a_la_rpc() -> None:
    cliente = MagicMock()
    cliente.rpc.return_value.execute.return_value = SimpleNamespace(
        data={"reporte_id": REPORTE_ID, "estado_reporte": "en_camino"}
    )
    body = ResultadoRescateSinVidaRequest.model_validate(_payload())

    with patch.object(rescue_result_service, "supabase_admin", cliente):
        resultado = rescue_result_service.registrar_resultado_sin_vida(
            REPORTE_ID,
            USUARIO_ID,
            body,
        )

    assert resultado["estado_reporte"] == "en_camino"
    nombre_rpc, parametros = cliente.rpc.call_args.args
    assert nombre_rpc == "registrar_resultado_rescate_sin_vida"
    assert parametros["p_animales"] == [
        {"animal_id": ANIMAL_ID, "cantidad_reportada": 1}
    ]
    assert parametros["p_evidencia_id"] == EVIDENCIA_ID
    assert parametros["p_puede_esperar_seguro"] is False
    assert parametros["p_riesgo_vial"] is True


def test_servicio_no_expone_el_error_crudo_de_supabase() -> None:
    cliente = MagicMock()
    cliente.rpc.return_value.execute.side_effect = RuntimeError(
        "connection details and private payload"
    )
    body = ResultadoRescateSinVidaRequest.model_validate(_payload())

    with (
        patch.object(rescue_result_service, "supabase_admin", cliente),
        pytest.raises(rescue_result_service.ResultadoRescateError) as error,
    ):
        rescue_result_service.registrar_resultado_sin_vida(
            REPORTE_ID,
            USUARIO_ID,
            body,
        )

    assert error.value.codigo == "registro_resultado_no_disponible"
