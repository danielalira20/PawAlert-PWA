import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import storage_service


EVENT_ID = "30000000-0000-0000-0000-000000000003"
PATH = f"eventos/{EVENT_ID}/principal.jpg"


def test_subida_usa_bucket_privado_y_conserva_path():
    bucket = MagicMock()
    admin = MagicMock()
    admin.storage.from_.return_value = bucket
    with (
        patch.object(storage_service, "supabase_admin", admin),
        patch.object(
            storage_service,
            "run_in_threadpool",
            new=AsyncMock(return_value=None),
        ) as threadpool,
    ):
        result = asyncio.run(
            storage_service.subir_bytes_evento(
                b"jpeg",
                carpeta=f"eventos/{EVENT_ID}",
                content_type="image/jpeg",
                extension="jpg",
                nombre_archivo="principal.jpg",
            )
        )

    assert result == PATH
    admin.storage.from_.assert_called_with("pawalert-eventos-privado")
    assert threadpool.call_args.kwargs["path"] == PATH
    assert threadpool.call_args.kwargs["file_options"] == {
        "content-type": "image/jpeg"
    }


def test_subida_reconoce_reintento_por_objeto_existente():
    admin = MagicMock()
    admin.storage.from_.return_value = MagicMock()
    with (
        patch.object(storage_service, "supabase_admin", admin),
        patch.object(
            storage_service,
            "run_in_threadpool",
            new=AsyncMock(side_effect=RuntimeError("409 already exists")),
        ),
    ):
        with pytest.raises(storage_service.ObjetoPrivadoYaExiste):
            asyncio.run(
                storage_service.subir_bytes_evento(
                    b"jpeg",
                    carpeta=f"eventos/{EVENT_ID}",
                    content_type="image/jpeg",
                    extension="jpg",
                    nombre_archivo="principal.jpg",
                )
            )


def test_url_firmada_no_acepta_paths_fuera_de_eventos():
    with pytest.raises(ValueError):
        storage_service.crear_url_firmada_evento(
            "adopciones/perfiles/privado.jpg"
        )


def test_url_firmada_usa_bucket_privado_sin_devolver_path():
    bucket = MagicMock()
    bucket.create_signed_url.return_value = {
        "signedURL": "https://signed.test/event"
    }
    admin = MagicMock()
    admin.storage.from_.return_value = bucket
    with patch.object(storage_service, "supabase_admin", admin):
        result = storage_service.crear_url_firmada_evento(PATH)

    admin.storage.from_.assert_called_once_with("pawalert-eventos-privado")
    bucket.create_signed_url.assert_called_once_with(PATH, 600)
    assert result["url"] == "https://signed.test/event"
    assert PATH not in str(result)
