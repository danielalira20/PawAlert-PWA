import asyncio
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://localhost:8000")
JWT_DUMMY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ."
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
)
os.environ.setdefault("SUPABASE_KEY", JWT_DUMMY)
os.environ.setdefault("SUPABASE_SERVICE_KEY", JWT_DUMMY)

from app.api import avistamientos as api
from app.models.dispatch import AvistamientoCreate, AvistamientoResult, LocationSource


def _body() -> AvistamientoCreate:
    return AvistamientoCreate(
        animal_id="animal-1",
        latitud=19.0,
        longitud=-98.0,
        observado_at=datetime.now(timezone.utc),
    )


def _resultado(**cambios) -> AvistamientoResult:
    datos = {
        "id": "av-1",
        "reporte_id": "rep-1",
        "animal_id": "animal-1",
        "fuente": LocationSource.confirmacion_reportante,
        "estado_validacion": "pendiente",
        "registrado_at": datetime.now(timezone.utc),
    }
    datos.update(cambios)
    return AvistamientoResult(**datos)


def _mockear_auth(monkeypatch, make_query, *, usuario_id="user-1"):
    supabase = MagicMock()
    supabase.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="auth-uid-1")
    )
    supabase.table.return_value = make_query(data=[{"id": usuario_id}])
    monkeypatch.setattr(api, "supabase", supabase)
    return supabase


# --- POST /{reporte_id}/avistamientos --------------------------------------


def test_crear_avistamiento_caso_feliz(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-1")
    registrar = MagicMock(return_value=_resultado())
    monkeypatch.setattr(api.avistamiento_service, "registrar_avistamiento", registrar)

    resultado = api.crear_avistamiento(
        "rep-1", _body(), authorization="Bearer token-valido"
    )

    assert resultado.id == "av-1"
    registrar.assert_called_once()
    args = registrar.call_args[0]
    assert args[0] == "rep-1"
    assert args[1] == "user-1"
    assert args[2].animal_id == "animal-1"


def test_crear_avistamiento_sin_token_es_401(monkeypatch, make_query):
    with pytest.raises(HTTPException) as error:
        api.crear_avistamiento("rep-1", _body(), authorization=None)

    assert error.value.status_code == 401


def test_crear_avistamiento_propaga_403_del_servicio(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-1")
    registrar = MagicMock(
        side_effect=HTTPException(status_code=403, detail="No calificas")
    )
    monkeypatch.setattr(api.avistamiento_service, "registrar_avistamiento", registrar)

    with pytest.raises(HTTPException) as error:
        api.crear_avistamiento("rep-1", _body(), authorization="Bearer token-valido")

    assert error.value.status_code == 403


# --- POST /{reporte_id}/avistamientos/foto -------------------------------


def _foto_falsa():
    return SimpleNamespace(content_type="image/jpeg", filename="evi.jpg")


def test_subir_foto_avistamiento_autoriza_y_delega(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-1")
    autorizar = MagicMock()
    monkeypatch.setattr(
        api.avistamiento_service, "autorizar_subida_evidencia", autorizar
    )
    subir = AsyncMock(
        return_value={
            "foto_url": "https://x/y.jpg",
            "evidencia_id": "evi-1",
            "exif_gps_disponible": False,
        }
    )
    monkeypatch.setattr(
        "app.services.evidence_service.subir_evidencia_suelta", subir
    )

    resultado = asyncio.run(
        api.subir_foto_avistamiento(
            "rep-1", _foto_falsa(), authorization="Bearer token-valido"
        )
    )

    assert resultado["evidencia_id"] == "evi-1"
    autorizar.assert_called_once_with("rep-1", "user-1")
    assert subir.call_args.kwargs["carpeta"] == "reportes/avistamientos"
    assert subir.call_args.kwargs["reporte_id"] == "rep-1"
    assert subir.call_args.kwargs["usuario_id"] == "user-1"


def test_subir_foto_avistamiento_sin_token_es_401(monkeypatch, make_query):
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            api.subir_foto_avistamiento(
                "rep-1", _foto_falsa(), authorization=None
            )
        )

    assert error.value.status_code == 401


def test_subir_foto_avistamiento_sin_permiso_es_403(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-1")
    monkeypatch.setattr(
        api.avistamiento_service,
        "autorizar_subida_evidencia",
        MagicMock(
            side_effect=HTTPException(status_code=403, detail="No calificas")
        ),
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            api.subir_foto_avistamiento(
                "rep-1", _foto_falsa(), authorization="Bearer token-valido"
            )
        )

    assert error.value.status_code == 403


# --- GET /{reporte_id}/avistamientos/elegible -----------------------------


def test_elegible_endpoint_delega_en_servicio(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-1")
    evaluar = MagicMock(
        return_value={"elegible": True, "motivo": None, "fuente": "asociacion"}
    )
    monkeypatch.setattr(api.avistamiento_service, "evaluar_elegibilidad", evaluar)

    resultado = api.avistamiento_elegible(
        "rep-1", 19.0, -98.0, authorization="Bearer token-valido"
    )

    assert resultado["elegible"] is True
    evaluar.assert_called_once_with("rep-1", "user-1", 19.0, -98.0)


def test_elegible_endpoint_sin_token_es_401(monkeypatch, make_query):
    with pytest.raises(HTTPException) as error:
        api.avistamiento_elegible("rep-1", 19.0, -98.0, authorization=None)

    assert error.value.status_code == 401


def test_elegible_endpoint_propaga_403_del_servicio(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-1")
    evaluar = MagicMock(
        side_effect=HTTPException(status_code=403, detail="No calificas")
    )
    monkeypatch.setattr(api.avistamiento_service, "evaluar_elegibilidad", evaluar)

    with pytest.raises(HTTPException) as error:
        api.avistamiento_elegible(
            "rep-1", 19.0, -98.0, authorization="Bearer token-valido"
        )

    assert error.value.status_code == 403


# --- POST /{reporte_id}/avistamientos/{avistamiento_id}/validar ------------


def test_validar_avistamiento_endpoint_caso_feliz(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-staff")
    validar = MagicMock(return_value=_resultado(estado_validacion="validado"))
    monkeypatch.setattr(api.avistamiento_service, "validar_avistamiento", validar)

    resultado = api.validar_avistamiento(
        "rep-1",
        "av-1",
        api.ValidarAvistamientoRequest(aprobar=True),
        authorization="Bearer token-valido",
    )

    assert resultado.estado_validacion == "validado"
    validar.assert_called_once_with("av-1", "user-staff", True, False)


def test_validar_avistamiento_endpoint_propaga_403_por_rol(monkeypatch, make_query):
    _mockear_auth(monkeypatch, make_query, usuario_id="user-ajeno")
    validar = MagicMock(
        side_effect=HTTPException(status_code=403, detail="No autorizado")
    )
    monkeypatch.setattr(api.avistamiento_service, "validar_avistamiento", validar)

    with pytest.raises(HTTPException) as error:
        api.validar_avistamiento(
            "rep-1",
            "av-1",
            api.ValidarAvistamientoRequest(aprobar=True),
            authorization="Bearer token-valido",
        )

    assert error.value.status_code == 403
