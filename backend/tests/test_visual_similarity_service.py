from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.models.visual_similarity import ClipEmbeddingResult
from app.services import visual_similarity_service


NOW = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)
MODEL = "openai/clip-vit-base-patch32"
VECTOR = [1.0] + [0.0] * 511


def query(data=None):
    result = MagicMock()
    for method in (
        "select", "eq", "limit", "delete", "insert", "upsert",
    ):
        getattr(result, method).return_value = result
    result.execute.return_value = SimpleNamespace(data=data)
    return result


def complete_embedding():
    return ClipEmbeddingResult(
        status=ExternalSignalStatus.complete,
        embedding=VECTOR,
        model=MODEL,
        calculated_at=NOW,
    )


def unavailable_embedding():
    return ClipEmbeddingResult(
        status=ExternalSignalStatus.unavailable,
        model=MODEL,
        calculated_at=NOW,
        error_code=ExternalSignalErrorCode.timeout,
    )


def test_complete_analysis_persists_embedding_and_five_candidates_at_most():
    embeddings = query(data=[])
    embeddings.upsert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "embedding-new"}]
    )
    coincidences = query(data=[])
    rpc = query(data=[
        {
            "embedding_id": "embedding-old",
            "reporte_id": "report-old",
            "animal_foto_id": "photo-old",
            "similitud": 0.95,
            "modelo": MODEL,
        }
    ])
    database = MagicMock()
    database.table.side_effect = lambda name: {
        "reporte_imagen_embeddings": embeddings,
        "reporte_imagen_coincidencias": coincidences,
    }[name]
    database.rpc.return_value = rpc

    with (
        patch.object(visual_similarity_service, "supabase_admin", database),
        patch.object(
            visual_similarity_service,
            "get_clip_embedding",
            return_value=complete_embedding(),
        ),
    ):
        result = visual_similarity_service.analyze_visual_similarity(
            report_id="report-new",
            animal_photo_id="photo-new",
            image_bytes=b"image",
            content_type="image/jpeg",
        )

    assert result.status == ExternalSignalStatus.complete
    assert result.candidates[0].report_id == "report-old"
    rpc_args = database.rpc.call_args.args[1]
    assert rpc_args["p_limite"] == 5
    inserted = coincidences.insert.call_args.args[0][0]
    assert inserted["nivel"] == "high"
    assert inserted["reporte_coincidente_id"] == "report-old"


def test_provider_failure_is_persisted_and_does_not_search():
    embeddings = query(data=[])
    embeddings.upsert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "embedding-error"}]
    )
    database = MagicMock()
    database.table.return_value = embeddings

    with (
        patch.object(visual_similarity_service, "supabase_admin", database),
        patch.object(
            visual_similarity_service,
            "get_clip_embedding",
            return_value=unavailable_embedding(),
        ),
    ):
        result = visual_similarity_service.analyze_visual_similarity(
            report_id="report-new",
            animal_photo_id="photo-new",
            image_bytes=b"image",
            content_type="image/jpeg",
        )

    assert result.status == ExternalSignalStatus.unavailable
    assert result.error_code == ExternalSignalErrorCode.timeout
    database.rpc.assert_not_called()
    payload = embeddings.upsert.call_args.args[0]
    assert payload["embedding"] is None
    assert payload["error_codigo"] == "timeout"


def test_existing_complete_embedding_is_reused_without_provider_call():
    embeddings = query(data=[{
        "id": "embedding-existing",
        "estado": "complete",
        "embedding": str(VECTOR),
        "modelo": MODEL,
        "calculado_at": NOW.isoformat(),
    }])
    coincidences = query(data=[])
    rpc = query(data=[])
    database = MagicMock()
    database.table.side_effect = lambda name: {
        "reporte_imagen_embeddings": embeddings,
        "reporte_imagen_coincidencias": coincidences,
    }[name]
    database.rpc.return_value = rpc

    with (
        patch.object(visual_similarity_service, "supabase_admin", database),
        patch.object(visual_similarity_service, "get_clip_embedding") as provider,
    ):
        result = visual_similarity_service.analyze_visual_similarity(
            report_id="report-new",
            animal_photo_id="photo-new",
            image_bytes=b"image",
            content_type="image/jpeg",
        )

    assert result.status == ExternalSignalStatus.complete
    provider.assert_not_called()
    embeddings.upsert.assert_not_called()


def test_invalid_candidate_row_is_discarded_without_breaking_analysis():
    embeddings = query(data=[])
    embeddings.upsert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "embedding-new"}]
    )
    coincidences = query(data=[])
    rpc = query(data=[{"embedding_id": "missing-fields"}])
    database = MagicMock()
    database.table.side_effect = lambda name: {
        "reporte_imagen_embeddings": embeddings,
        "reporte_imagen_coincidencias": coincidences,
    }[name]
    database.rpc.return_value = rpc

    with (
        patch.object(visual_similarity_service, "supabase_admin", database),
        patch.object(
            visual_similarity_service,
            "get_clip_embedding",
            return_value=complete_embedding(),
        ),
    ):
        result = visual_similarity_service.analyze_visual_similarity(
            report_id="report-new",
            animal_photo_id="photo-new",
            image_bytes=b"image",
            content_type="image/jpeg",
        )

    assert result.status == ExternalSignalStatus.complete
    assert result.candidates == []
    coincidences.insert.assert_not_called()
