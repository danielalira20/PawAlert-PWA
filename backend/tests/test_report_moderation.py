import asyncio
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from PIL import Image, ImageDraw

from app.api import reports
from app.models.report import DenunciarReporteRequest
from app.services.report_moderation_service import (
    ImagenHashInvalida,
    calcular_phash,
    distancia_hamming,
)


def _imagen_patron(*, size=(180, 120), formato="JPEG", quality=90) -> bytes:
    imagen = Image.new("RGB", size, "white")
    dibujo = ImageDraw.Draw(imagen)
    dibujo.rectangle((15, 15, size[0] // 2, size[1] - 20), fill="#F5822A")
    dibujo.ellipse(
        (size[0] // 2, 10, size[0] - 12, size[1] - 12),
        fill="#55BDB5",
    )
    dibujo.line((0, size[1] - 1, size[0], 0), fill="black", width=4)
    salida = BytesIO()
    imagen.save(salida, format=formato, quality=quality)
    return salida.getvalue()


def test_phash_es_estable_ante_redimension_y_recompresion():
    original = _imagen_patron(size=(180, 120), quality=95)
    with Image.open(BytesIO(original)) as imagen:
        imagen = imagen.resize((720, 480), Image.Resampling.LANCZOS)
        salida = BytesIO()
        imagen.save(salida, format="JPEG", quality=60)
        variante = salida.getvalue()

    hash_original = calcular_phash(original)
    hash_variante = calcular_phash(variante)

    assert len(hash_original) == 16
    assert distancia_hamming(hash_original, hash_variante) <= 8


def test_phash_distingue_imagenes_visualmente_distintas():
    patron = calcular_phash(_imagen_patron())
    salida = BytesIO()
    imagen = Image.new("RGB", (180, 120), "#242424")
    dibujo = ImageDraw.Draw(imagen)
    dibujo.polygon([(90, 5), (175, 110), (5, 110)], fill="#F5C84C")
    imagen.save(salida, format="JPEG")

    distinto = calcular_phash(salida.getvalue())

    assert distancia_hamming(patron, distinto) > 8


def test_distancia_hamming_cuenta_bits_diferentes():
    assert distancia_hamming("0000000000000000", "000000000000000f") == 4
    assert distancia_hamming("abcdef0123456789", "abcdef0123456789") == 0


def test_phash_rechaza_archivos_que_no_son_imagen():
    with pytest.raises(ImagenHashInvalida, match="fotografía válida"):
        calcular_phash("contenido que no es una fotografía".encode())


def test_denuncia_envia_usuario_y_umbral_a_funcion_atomica(make_query):
    consulta_reporte = make_query(
        data=[{"id": "reporte-1", "usuario_id": "autor-1", "estado_moderacion": "visible"}]
    )
    rpc = MagicMock()
    rpc.execute.return_value = SimpleNamespace(
        data=[{"total_denuncias": 3, "estado_moderacion": "en_revision"}]
    )
    admin = MagicMock()
    admin.table.return_value = consulta_reporte
    admin.rpc.return_value = rpc

    with (
        patch.object(reports, "supabase_admin", admin),
        patch.object(reports, "_obtener_usuario_autenticado", return_value={"id": "usuario-2"}),
        patch("app.services.report_service.registrar_historial") as historial,
    ):
        respuesta = asyncio.run(
            reports.denunciar_reporte(
                "reporte-1",
                DenunciarReporteRequest(motivo="informacion_falsa", detalle="Los datos no coinciden"),
                "Bearer token",
            )
        )

    assert respuesta["total_denuncias"] == 3
    assert respuesta["estado_moderacion"] == "en_revision"
    parametros = admin.rpc.call_args.args[1]
    assert parametros["p_usuario_id"] == "usuario-2"
    assert parametros["p_umbral"] == 3
    # El historial no revela la identidad de quien envió la denuncia.
    assert historial.call_args.kwargs["usuario_id"] is None


def test_autor_no_puede_denunciar_su_propia_publicacion(make_query):
    admin = MagicMock()
    admin.table.return_value = make_query(
        data=[{"id": "reporte-1", "usuario_id": "usuario-1", "estado_moderacion": "visible"}]
    )
    with (
        patch.object(reports, "supabase_admin", admin),
        patch.object(reports, "_obtener_usuario_autenticado", return_value={"id": "usuario-1"}),
        pytest.raises(HTTPException) as error,
    ):
        asyncio.run(
            reports.denunciar_reporte(
                "reporte-1",
                DenunciarReporteRequest(motivo="otro"),
                "Bearer token",
            )
        )

    assert error.value.status_code == 403
    admin.rpc.assert_not_called()


def test_usuario_solo_puede_marcar_su_notificacion_como_leida(make_query):
    tabla = make_query(data=[{"id": "notificacion-1", "leida": True}])
    admin = MagicMock()
    admin.table.return_value = tabla

    with (
        patch.object(reports, "supabase_admin", admin),
        patch.object(reports, "_obtener_usuario_autenticado", return_value={"id": "usuario-1"}),
    ):
        respuesta = asyncio.run(
            reports.marcar_notificacion_moderacion_leida(
                "notificacion-1",
                "Bearer token",
            )
        )

    assert respuesta["mensaje"] == "Notificación marcada como leída"
    tabla.update.assert_called_once_with({"leida": True})
    assert tabla.eq.call_args_list[0].args == ("id", "notificacion-1")
    assert tabla.eq.call_args_list[1].args == ("usuario_id", "usuario-1")
