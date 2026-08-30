import logging
from unittest.mock import MagicMock, patch

import httpx
import pytest
from pydantic import ValidationError

from app.services import vroom_service


@pytest.fixture(autouse=True)
def _vroom_configurado(monkeypatch):
    """VROOM_BASE_URL esta vacio por defecto (sin servidor publico) --
    las pruebas asumen una instancia configurada salvo que digan lo
    contrario explicitamente."""
    monkeypatch.setattr(
        vroom_service.settings, "vroom_base_url", "http://vroom.internal:3000"
    )


def _profile_matrix(matrix: list[list[float]]) -> vroom_service.VroomProfileMatrix:
    return vroom_service.VroomProfileMatrix(
        durations=matrix, distances=matrix, costs=matrix
    )


def request() -> vroom_service.VroomOptimizationRequest:
    return vroom_service.VroomOptimizationRequest(
        vehicles=[vroom_service.VroomVehicle(id=1, start_index=0)],
        jobs=[vroom_service.VroomJob(id=1, location_index=1)],
        matrices={"car": _profile_matrix([[0, 300], [300, 0]])},
    )


def response(
    status_code: int, payload: object | None = None, text: str | None = None
) -> MagicMock:
    result = MagicMock()
    result.status_code = status_code
    if payload is not None:
        result.json.return_value = payload
    if text is not None:
        result.text = text
    return result


def payload_exitoso() -> dict:
    return {
        "code": 0,
        "summary": {"cost": 300, "unassigned": 0},
        "unassigned": [],
        "routes": [
            {
                "vehicle": 1,
                "steps": [
                    {"type": "start", "location_index": 0, "arrival": 0},
                    {
                        "type": "job",
                        "location_index": 1,
                        "id": 1,
                        "arrival": 300,
                    },
                    {"type": "end", "location_index": 0, "arrival": 600},
                ],
            }
        ],
    }


def test_builds_payload_with_indexes_and_matrices_car():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload_exitoso()),
    ) as post:
        vroom_service.get_optimization(request())

    body = post.call_args.kwargs["json"]
    assert body["vehicles"] == [
        {"id": 1, "start_index": 0, "capacity": [], "skills": []}
    ]
    assert body["jobs"] == [
        {
            "id": 1,
            "location_index": 1,
            "priority": 0,
            "delivery": [],
            "skills": [],
        }
    ]
    assert body["matrices"] == {
        "car": {
            "durations": [[0, 300], [300, 0]],
            "distances": [[0, 300], [300, 0]],
            "costs": [[0, 300], [300, 0]],
        }
    }
    assert "matrix" not in body


def test_profile_matrix_rejects_fractional_values():
    """VROOM (rapidjson) exige IsUint() por celda -- entero no negativo
    exacto (input_parser.cpp:get_matrix, VROOM-Project/vroom) -- y responde
    400 {"code":2,"error":"Invalid matrix entry."} ante cualquier valor con
    parte fraccionaria. Un valor real de OSRM como 312.7 casi nunca cae en
    un segundo exacto, asi que este campo debe rechazarlo aqui mismo, en
    construccion, antes de que _build_vroom_request pueda mandarlo al
    proveedor."""
    with pytest.raises(ValidationError):
        vroom_service.VroomProfileMatrix(
            durations=[[0, 312.7], [312.7, 0]],
            distances=[[0, 2100], [2100, 0]],
            costs=[[0, 312.7], [312.7, 0]],
        )


def test_matrix_field_removed_in_favor_of_matrices():
    assert "matrix" not in vroom_service.VroomOptimizationRequest.model_fields
    assert "matrices" in vroom_service.VroomOptimizationRequest.model_fields


def test_validate_square_matrices_rejects_non_square_matrix():
    matrices = {
        "car": vroom_service.VroomProfileMatrix(
            durations=[[0, 300]],
            distances=[[0, 300]],
            costs=[[0, 300]],
        )
    }

    with pytest.raises(ValueError, match="square"):
        vroom_service.validate_square_matrices(matrices)


def test_validate_square_matrices_rejects_mismatched_profile_sizes():
    matrices = {
        "car": _profile_matrix([[0, 300], [300, 0]]),
        "bike": _profile_matrix(
            [[0, 100, 200], [100, 0, 150], [200, 150, 0]]
        ),
    }

    with pytest.raises(ValueError, match="does not match"):
        vroom_service.validate_square_matrices(matrices)


def test_validate_square_matrices_rejects_empty_matrices_dict():
    with pytest.raises(ValueError, match="at least one profile"):
        vroom_service.validate_square_matrices({})


def test_validate_references_rejects_out_of_range_start_index():
    invalid_request = vroom_service.VroomOptimizationRequest(
        vehicles=[vroom_service.VroomVehicle(id=1, start_index=5)],
        jobs=[vroom_service.VroomJob(id=1, location_index=1)],
        matrices={"car": _profile_matrix([[0, 300], [300, 0]])},
    )

    with pytest.raises(ValueError, match="out of range"):
        vroom_service.validate_references(invalid_request)


def test_validate_references_rejects_out_of_range_location_index():
    invalid_request = vroom_service.VroomOptimizationRequest(
        vehicles=[vroom_service.VroomVehicle(id=1, start_index=0)],
        jobs=[vroom_service.VroomJob(id=1, location_index=9)],
        matrices={"car": _profile_matrix([[0, 300], [300, 0]])},
    )

    with pytest.raises(ValueError, match="out of range"):
        vroom_service.validate_references(invalid_request)


def test_batch_over_max_locations_returns_request_too_large_without_request(
    monkeypatch, caplog
):
    monkeypatch.setattr(vroom_service.settings, "vroom_max_locations", 1)

    with (
        patch.object(vroom_service.httpx, "post") as post,
        caplog.at_level(logging.WARNING),
    ):
        result = vroom_service.get_optimization(request())

    post.assert_not_called()
    assert result.status == "unavailable"
    assert result.error_code == "request_too_large"
    assert any(
        "VROOM_MAX_LOCATIONS" in record.message for record in caplog.records
    )


def test_invalid_matrices_return_invalid_request_without_calling_provider():
    lote = vroom_service.VroomOptimizationRequest(
        vehicles=[vroom_service.VroomVehicle(id=1, start_index=0)],
        jobs=[vroom_service.VroomJob(id=1, location_index=1)],
        matrices={
            "car": vroom_service.VroomProfileMatrix(
                durations=[[0, 300]],
                distances=[[0, 300]],
                costs=[[0, 300]],
            )
        },
    )
    with patch.object(vroom_service.httpx, "post") as post:
        result = vroom_service.get_optimization(lote)

    post.assert_not_called()
    assert result.status == "unavailable"
    assert result.error_code == "invalid_request"


def test_missing_base_url_returns_not_configured_without_request():
    with (
        patch.object(vroom_service.settings, "vroom_base_url", ""),
        patch.object(vroom_service.httpx, "post") as post,
    ):
        result = vroom_service.get_optimization(request())

    post.assert_not_called()
    assert result.status == "unavailable"
    assert result.error_code == "not_configured"


def test_timeout_retries_once_and_returns_timeout():
    with patch.object(
        vroom_service.httpx,
        "post",
        side_effect=httpx.TimeoutException("timeout"),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "timeout"


def test_generic_http_error_returns_provider_error():
    with patch.object(
        vroom_service.httpx,
        "post",
        side_effect=httpx.ConnectError("boom"),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "provider_error"


def test_timeout_logs_exact_exception_type_and_message(caplog):
    """No debe tragarse el detalle real del timeout: el log debe incluir el
    tipo exacto de excepcion httpx (no solo 'timeout') y su mensaje, para
    poder distinguir un ReadTimeout de un ConnectTimeout en produccion sin
    tener que instrumentar nada despues del hecho."""
    with (
        patch.object(
            vroom_service.httpx,
            "post",
            side_effect=httpx.ReadTimeout("the read operation timed out"),
        ) as post,
        caplog.at_level(logging.WARNING),
    ):
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "timeout"

    timeout_logs = [
        record.message
        for record in caplog.records
        if "ReadTimeout" in record.message
    ]
    assert len(timeout_logs) == 2, (
        "cada intento debe loguear su propio detalle, no solo el ultimo"
    )
    assert all(
        "the read operation timed out" in message for message in timeout_logs
    )
    assert all(f"intento {n}/2" in message for n, message in zip((1, 2), timeout_logs))


def test_generic_http_error_logs_exact_exception_type_and_message(caplog):
    """Mismo estandar que el timeout: ConnectError (o cualquier subclase de
    httpx.HTTPError que no sea timeout) debe dejar su tipo exacto y mensaje
    en el log, no solo el error_code generico 'provider_error'."""
    with (
        patch.object(
            vroom_service.httpx,
            "post",
            side_effect=httpx.ConnectError("boom"),
        ) as post,
        caplog.at_level(logging.WARNING),
    ):
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "provider_error"

    connect_error_logs = [
        record.message
        for record in caplog.records
        if "ConnectError" in record.message
    ]
    assert len(connect_error_logs) == 2
    assert all("boom" in message for message in connect_error_logs)


def test_unexpected_status_code_logs_status_and_response_body(caplog):
    """La rama de status != 200 (provider_error por respuesta HTTP
    inesperada) no registraba nada antes de este fix -- ahora debe dejar el
    status_code exacto y el cuerpo completo de la respuesta en el log."""
    cuerpo_error = '{"code": 1, "error": "Internal server error"}'
    with (
        patch.object(
            vroom_service.httpx,
            "post",
            return_value=response(503, text=cuerpo_error),
        ) as post,
        caplog.at_level(logging.WARNING),
    ):
        result = vroom_service.get_optimization(request())

    assert post.call_count == 2
    assert result.status == "unavailable"
    assert result.error_code == "provider_error"

    status_logs = [
        record.message for record in caplog.records if "503" in record.message
    ]
    assert len(status_logs) == 2
    assert all(cuerpo_error in message for message in status_logs)


def test_successful_response_parses_routes_and_unassigned():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload_exitoso()),
    ):
        result = vroom_service.get_optimization(request())

    assert result.status == "complete"
    assert result.error_code is None
    assert result.unassigned_job_ids == []
    assert len(result.routes) == 1

    ruta = result.routes[0]
    assert ruta.vehicle_id == 1
    assert [step.type for step in ruta.steps] == ["start", "job", "end"]
    assert ruta.steps[1].job_id == 1
    assert ruta.steps[1].location_index == 1
    assert ruta.steps[1].arrival == 300
    assert ruta.steps[0].job_id is None


def test_logical_error_no_start_or_end_does_not_retry():
    payload = {"code": 2, "error": "No start or end specified for vehicle 1"}
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 1
    assert result.status == "unavailable"
    assert result.error_code == "logical_error"


def test_logical_error_connection_failure_does_not_retry():
    payload = {"code": 3, "error": "Failed to connect to 0.0.0.0:5000"}
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, payload),
    ) as post:
        result = vroom_service.get_optimization(request())

    assert post.call_count == 1
    assert result.status == "unavailable"
    assert result.error_code == "logical_error"


def test_malformed_payload_returns_invalid_response():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, {"code": 0, "routes": "no-es-una-lista"}),
    ):
        result = vroom_service.get_optimization(request())

    assert result.status == "unavailable"
    assert result.error_code == "invalid_response"


def test_payload_without_code_returns_invalid_response():
    with patch.object(
        vroom_service.httpx,
        "post",
        return_value=response(200, {"unexpected": "shape"}),
    ):
        result = vroom_service.get_optimization(request())

    assert result.status == "unavailable"
    assert result.error_code == "invalid_response"
