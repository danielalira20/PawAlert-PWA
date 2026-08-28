from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import associations
from app.main import app
from app.models.report import RevisionResultadoSinVidaRequest
from app.services import deceased_followup_service, storage_service


client = TestClient(app)
AUTH_HEADERS = {"Authorization": "Bearer token-asociacion"}
ASOCIACION_ID = "10000000-0000-0000-0000-000000000001"
REPORTE_ID = "20000000-0000-0000-0000-000000000003"
ANIMAL_ID = "30000000-0000-0000-0000-000000000031"
EVIDENCIA_ID = "40000000-0000-0000-0000-000000000031"
RESULTADO_ID = "50000000-0000-0000-0000-000000000031"


def _usuario(rol: str = "asociacion") -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000005",
        "asociacion_id": ASOCIACION_ID,
        "rol": rol,
    }


def test_listado_solo_consulta_la_asociacion_autenticada() -> None:
    filas = [{"reporte_id": REPORTE_ID, "estado": "pendiente_voluntario"}]
    with (
        patch.object(
            associations,
            "_obtener_usuario_autenticado",
            return_value=_usuario(),
        ),
        patch.object(associations, "_verificar_asociacion_aprobada"),
        patch.object(
            deceased_followup_service,
            "listar_seguimientos_asociacion",
            return_value=filas,
        ) as listar,
    ):
        response = client.get(
            "/associations/me/seguimientos-fallecimiento",
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == filas
    listar.assert_called_once_with(ASOCIACION_ID)


def test_listado_rechaza_roles_ajenos_a_la_asociacion() -> None:
    with (
        patch.object(
            associations,
            "_obtener_usuario_autenticado",
            return_value=_usuario("voluntario_externo"),
        ),
        patch.object(
            deceased_followup_service,
            "listar_seguimientos_asociacion",
        ) as listar,
    ):
        response = client.get(
            "/associations/me/seguimientos-fallecimiento",
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 403
    listar.assert_not_called()


def test_detalle_ajeno_no_revela_si_el_reporte_existe() -> None:
    with (
        patch.object(
            associations,
            "_obtener_usuario_autenticado",
            return_value=_usuario(),
        ),
        patch.object(associations, "_verificar_asociacion_aprobada"),
        patch.object(
            deceased_followup_service,
            "obtener_detalle_seguimiento",
            side_effect=(
                deceased_followup_service.SeguimientoFallecimientoError(
                    "seguimiento_no_encontrado"
                )
            ),
        ),
    ):
        response = client.get(
            f"/associations/me/seguimientos-fallecimiento/{REPORTE_ID}",
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "Seguimiento no encontrado para tu asociación"
    )


def test_endpoint_envia_revision_con_actor_y_asociacion() -> None:
    respuesta = {
        "reporte_id": REPORTE_ID,
        "resultado_id": RESULTADO_ID,
        "estado_resultado": "sin_vida_confirmado",
    }
    with (
        patch.object(
            associations,
            "_obtener_usuario_autenticado",
            return_value=_usuario(),
        ),
        patch.object(associations, "_verificar_asociacion_aprobada"),
        patch.object(
            deceased_followup_service,
            "revisar_resultado",
            return_value=respuesta,
        ) as revisar,
    ):
        response = client.post(
            (
                f"/associations/me/seguimientos-fallecimiento/{REPORTE_ID}/"
                f"resultados/{RESULTADO_ID}/revision"
            ),
            json={
                "decision": "confirmar",
                "notas": "La evidencia y el contexto son consistentes.",
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == respuesta
    argumentos = revisar.call_args.args
    assert argumentos[:4] == (
        REPORTE_ID,
        RESULTADO_ID,
        _usuario()["id"],
        ASOCIACION_ID,
    )
    assert argumentos[4].decision == "confirmar"


def test_endpoint_informa_duda_guardada_si_falla_urgency() -> None:
    with (
        patch.object(
            associations,
            "_obtener_usuario_autenticado",
            return_value=_usuario(),
        ),
        patch.object(associations, "_verificar_asociacion_aprobada"),
        patch.object(
            deceased_followup_service,
            "revisar_resultado",
            side_effect=(
                deceased_followup_service.SeguimientoFallecimientoError(
                    "reactivacion_urgency_pendiente"
                )
            ),
        ),
    ):
        response = client.post(
            (
                f"/associations/me/seguimientos-fallecimiento/{REPORTE_ID}/"
                f"resultados/{RESULTADO_ID}/revision"
            ),
            json={
                "decision": "duda_critica",
                "notas": "Hay señales que requieren tratar el caso como crítico.",
            },
            headers=AUTH_HEADERS,
        )

    assert response.status_code == 503
    assert "duda quedó registrada" in response.json()["detail"]


def test_revision_confirmada_no_recalcula_urgency() -> None:
    body = RevisionResultadoSinVidaRequest(
        decision="confirmar",
        notas="La evidencia es consistente.",
    )
    respuesta = {
        "reporte_id": REPORTE_ID,
        "resultado_id": RESULTADO_ID,
        "requiere_reactivacion": False,
    }
    with (
        patch.object(
            deceased_followup_service,
            "_ejecutar_rpc",
            return_value=respuesta,
        ) as rpc,
        patch(
            "app.services.urgency_service.evaluate_report_urgency"
        ) as urgency,
    ):
        resultado = deceased_followup_service.revisar_resultado(
            REPORTE_ID,
            RESULTADO_ID,
            _usuario()["id"],
            ASOCIACION_ID,
            body,
        )

    assert resultado == respuesta
    assert rpc.call_count == 1
    urgency.assert_not_called()


def test_duda_recalcula_urgency_antes_de_abrir_matching() -> None:
    body = RevisionResultadoSinVidaRequest(
        decision="duda_critica",
        notas="La postura observada podría corresponder a un estado crítico.",
    )
    decision = {
        "reporte_id": REPORTE_ID,
        "resultado_id": RESULTADO_ID,
        "requiere_reactivacion": True,
    }
    activacion = {
        "reporte_id": REPORTE_ID,
        "estado": "reactivado",
        "estado_cobertura": "abierto",
    }

    with (
        patch.object(
            deceased_followup_service,
            "_ejecutar_rpc",
            side_effect=[decision, activacion],
        ) as rpc,
        patch(
            "app.services.urgency_service.evaluate_report_urgency"
        ) as urgency,
        patch(
            "app.services.matching.obtener_candidatos",
            return_value={"candidatos": []},
        ) as matching,
    ):
        resultado = deceased_followup_service.revisar_resultado(
            REPORTE_ID,
            RESULTADO_ID,
            _usuario()["id"],
            ASOCIACION_ID,
            body,
        )

    assert [llamada.args[0] for llamada in rpc.call_args_list] == [
        "revisar_resultado_rescate_sin_vida",
        "finalizar_reactivacion_duda_fallecimiento",
    ]
    urgency.assert_called_once_with(REPORTE_ID)
    matching.assert_called_once_with(REPORTE_ID)
    assert resultado["reactivacion"] == activacion
    assert resultado["matching_status"] == "completo"


def test_duda_mantiene_cobertura_pausada_si_falla_urgency() -> None:
    body = RevisionResultadoSinVidaRequest(
        decision="duda_critica",
        notas="La evidencia requiere una atención crítica inmediata.",
    )
    decision = {
        "reporte_id": REPORTE_ID,
        "resultado_id": RESULTADO_ID,
        "requiere_reactivacion": True,
    }
    with (
        patch.object(
            deceased_followup_service,
            "_ejecutar_rpc",
            return_value=decision,
        ) as rpc,
        patch(
            "app.services.urgency_service.evaluate_report_urgency",
            side_effect=RuntimeError("weather unavailable"),
        ),
        pytest.raises(
            deceased_followup_service.SeguimientoFallecimientoError,
            match="reactivacion_urgency_pendiente",
        ),
    ):
        deceased_followup_service.revisar_resultado(
            REPORTE_ID,
            RESULTADO_ID,
            _usuario()["id"],
            ASOCIACION_ID,
            body,
        )

    assert rpc.call_count == 1


def test_detalle_firma_evidencia_sin_exponer_localizador(make_query) -> None:
    seguimiento = make_query(data=[{
        "id": "seguimiento-1",
        "reporte_id": REPORTE_ID,
        "asociacion_coordinadora_id": ASOCIACION_ID,
        "estado": "pendiente_voluntario",
    }])
    reporte = make_query(data=[{
        "id": REPORTE_ID,
        "estado_reporte": "pendiente_seguimiento_fallecimiento",
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
    resultados = make_query(data=[{
        "id": "resultado-1",
        "animal_id": ANIMAL_ID,
        "evidencia_id": EVIDENCIA_ID,
        "estado": "sin_vida_reportado",
    }])
    localizador = (
        "storage://pawalert-evidencias-privadas/"
        "reportes/resultados-sensibles/evidencia.jpg"
    )
    evidencias = make_query(data=[{
        "id": EVIDENCIA_ID,
        "foto_url": localizador,
        "created_at": "2026-08-25T12:00:00+00:00",
    }])
    acciones = make_query(data=[])
    contactos = make_query(data=[{
        "id": "contacto-1",
        "nombre_servicio": "Protección Animal",
        "telefono": "5555555555",
    }])
    base = MagicMock()
    base.table.side_effect = lambda tabla: {
        "seguimientos_fallecimiento_reporte": seguimiento,
        "reportes": reporte,
        "resultados_rescate_animal": resultados,
        "reporte_evidencias": evidencias,
        "seguimientos_retiro_animal": acciones,
        "contactos_retiro_animal": contactos,
    }[tabla]

    with (
        patch.object(deceased_followup_service, "supabase_admin", base),
        patch.object(
            deceased_followup_service,
            "crear_url_firmada_sensible",
            return_value={
                "url": "https://storage.example/signed",
                "expira_at": "2026-08-25T12:05:00+00:00",
            },
        ) as firmar,
    ):
        detalle = deceased_followup_service.obtener_detalle_seguimiento(
            REPORTE_ID,
            ASOCIACION_ID,
        )

    assert detalle["reporte"]["animales"][0]["id"] == ANIMAL_ID
    assert detalle["resultados"][0]["evidencia"] == {
        "url": "https://storage.example/signed",
        "expira_at": "2026-08-25T12:05:00+00:00",
        "creada_at": "2026-08-25T12:00:00+00:00",
        "contenido_sensible": True,
    }
    assert localizador not in repr(detalle)
    firmar.assert_called_once_with(localizador)


def test_servicio_bloquea_asociacion_no_coordinadora(make_query) -> None:
    seguimiento = make_query(data=[])
    base = MagicMock()
    base.table.return_value = seguimiento

    with (
        patch.object(deceased_followup_service, "supabase_admin", base),
        pytest.raises(
            deceased_followup_service.SeguimientoFallecimientoError,
            match="seguimiento_no_encontrado",
        ),
    ):
        deceased_followup_service.obtener_detalle_seguimiento(
            REPORTE_ID,
            "asociacion-ajena",
        )

    base.table.assert_called_once_with("seguimientos_fallecimiento_reporte")


@pytest.mark.parametrize(
    "localizador",
    [
        "https://storage.example/publica.jpg",
        "storage://otro-bucket/privada.jpg",
        "storage://pawalert-evidencias-privadas/",
    ],
)
def test_firma_rechaza_localizadores_no_sensibles(localizador: str) -> None:
    almacenamiento = MagicMock()
    with (
        patch.object(storage_service, "supabase_admin", almacenamiento),
        pytest.raises(ValueError, match="localizador_sensible_invalido"),
    ):
        storage_service.crear_url_firmada_sensible(localizador)

    almacenamiento.storage.from_.assert_not_called()


def test_firma_url_del_bucket_sensible() -> None:
    bucket = MagicMock()
    bucket.create_signed_url.return_value = {
        "signedURL": "https://storage.example/signed"
    }
    almacenamiento = MagicMock()
    almacenamiento.storage.from_.return_value = bucket
    localizador = (
        "storage://pawalert-evidencias-privadas/"
        "reportes/resultados-sensibles/evidencia.jpg"
    )

    with patch.object(storage_service, "supabase_admin", almacenamiento):
        resultado = storage_service.crear_url_firmada_sensible(localizador)

    assert resultado["url"] == "https://storage.example/signed"
    almacenamiento.storage.from_.assert_called_once_with(
        "pawalert-evidencias-privadas"
    )
    bucket.create_signed_url.assert_called_once_with(
        "reportes/resultados-sensibles/evidencia.jpg",
        300,
    )
