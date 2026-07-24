import os
import tempfile
from unittest.mock import MagicMock, patch

from app.services import video_evidence_service


def _video_temporal(contenido: bytes) -> str:
    archivo = tempfile.NamedTemporaryFile(delete=False, suffix=".mov")
    archivo.write(contenido)
    archivo.close()
    return archivo.name


def test_extrae_coordenadas_quicktime_iso6709():
    ruta = _video_temporal(
        b"cabecera"
        b"com.apple.quicktime.location.ISO6709"
        b"\x00\x00+19.31342-098.24115+022.000/"
        b"contenido"
    )
    try:
        resultado = video_evidence_service.extraer_coordenadas_video(ruta)
    finally:
        os.unlink(ruta)

    assert resultado == {
        "latitud": 19.31342,
        "longitud": -98.24115,
        "fuente": "quicktime_iso6709",
    }


def test_ausencia_de_gps_es_resultado_neutral():
    ruta = _video_temporal(b"video sin metadatos de ubicacion")
    try:
        resultado = video_evidence_service.validar_coordenadas_video(
            ruta,
            19.31342,
            -98.24115,
        )
    finally:
        os.unlink(ruta)

    assert resultado["estado"] == "sin_metadatos"
    assert "neutral" in resultado["detalle"]["mensaje"]


def test_compara_coordenadas_con_umbral_sin_decidir():
    with patch.object(
        video_evidence_service,
        "extraer_coordenadas_video",
        return_value={
            "latitud": 19.31350,
            "longitud": -98.24120,
            "fuente": "quicktime_iso6709",
        },
    ):
        resultado = video_evidence_service.validar_coordenadas_video(
            "video.mov",
            19.31342,
            -98.24115,
        )

    assert resultado["estado"] == "coincide"
    assert resultado["distancia_m"] < 250
    assert "decisión automática" in resultado["detalle"]["mensaje"]


def test_analisis_gemini_guarda_contrato_y_elimina_archivo():
    analisis = video_evidence_service.AnalisisVideoHogar(
        observabilidad="parcial",
        resumen_breve="Se observaron áreas interiores y un patio.",
        areas_observadas=["Sala", "Patio"],
        caracteristicas_visibles=["Puerta hacia el exterior"],
        condiciones_aparentes=["Espacio ventilado"],
        riesgos_aparentes=["Acceso exterior sin detalle suficiente"],
        otros_animales_visibles=[],
        espacios_aislamiento_visibles=["Habitación interior"],
        puntos_no_observados=["Ventanas"],
        evidencias_temporales=[{
            "momento": "00:12",
            "observacion": "Se muestra el patio.",
        }],
    )

    with (
        patch.object(
            video_evidence_service,
            "_subir_video_gemini",
            return_value={"name": "files/video-1"},
        ),
        patch.object(
            video_evidence_service,
            "_esperar_archivo_gemini",
            return_value={
                "name": "files/video-1",
                "uri": "https://gemini.test/video-1",
                "mimeType": "video/mp4",
            },
        ),
        patch.object(
            video_evidence_service,
            "_analizar_con_gemini",
            return_value=analisis,
        ),
        patch.object(
            video_evidence_service,
            "_eliminar_archivo_gemini",
        ) as eliminar,
    ):
        resultado = video_evidence_service.analizar_video_gemini(
            "video.mp4",
            "video/mp4",
        )

    assert resultado["observabilidad"] == "parcial"
    assert "decisión" in resultado["advertencia"]
    eliminar.assert_called_once_with("files/video-1")


def test_procesamiento_sin_clave_conserva_validacion_de_coordenadas(
    make_query,
):
    verificaciones = make_query(data=[{
        "id": "ver-1",
        "perfil_casa_temporal_id": "perfil-1",
        "analisis_video_estado": "pendiente",
    }])
    perfiles = make_query(data=[{
        "video_recorrido_url": "https://storage.test/video.mp4",
        "latitud": 19.31,
        "longitud": -98.24,
    }])
    cliente = MagicMock()
    cliente.table.side_effect = lambda tabla: {
        "verificaciones_hogar": verificaciones,
        "perfil_casa_temporal": perfiles,
    }[tabla]
    ruta = _video_temporal(b"video")

    try:
        with (
            patch.object(video_evidence_service, "supabase_admin", cliente),
            patch.object(
                video_evidence_service,
                "_descargar_video",
                return_value=(ruta, "video/mp4"),
            ),
            patch.object(
                video_evidence_service,
                "validar_coordenadas_video",
                return_value={
                    "estado": "coincide",
                    "latitud": 19.31,
                    "longitud": -98.24,
                    "distancia_m": 8.0,
                    "fuente": "quicktime_iso6709",
                    "detalle": {},
                },
            ),
            patch.object(
                video_evidence_service.settings,
                "gemini_api_key",
                "",
            ),
        ):
            resultado = video_evidence_service.procesar_evidencia_verificacion(
                "ver-1"
            )
    finally:
        if os.path.exists(ruta):
            os.unlink(ruta)

    actualizaciones = [
        llamada.args[0]
        for llamada in verificaciones.update.call_args_list
    ]
    assert resultado["estado"] == "no_configurado"
    assert any(
        valores.get("estado_coordenadas") == "coincide"
        for valores in actualizaciones
    )
    assert actualizaciones[-1]["analisis_video_estado"] == "no_configurado"

