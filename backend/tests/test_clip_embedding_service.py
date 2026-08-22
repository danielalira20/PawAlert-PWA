import math
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.models.urgency import ExternalSignalErrorCode, ExternalSignalStatus
from app.services import clip_embedding_service


MODEL = "openai/clip-vit-base-patch32"


def response(status_code: int, payload: object = None) -> MagicMock:
    result = MagicMock(status_code=status_code)
    result.json.return_value = payload
    return result


def configured():
    return (
        patch.object(clip_embedding_service.settings, "clip_validation_enabled", True),
        patch.object(clip_embedding_service.settings, "huggingface_token", "hf_test"),
        patch.object(
            clip_embedding_service.settings,
            "clip_endpoint_url",
            "https://clip.example.test/embed",
        ),
        patch.object(clip_embedding_service.settings, "clip_model", MODEL),
    )


def test_disabled_clip_does_not_call_provider():
    with (
        patch.object(clip_embedding_service.settings, "clip_validation_enabled", False),
        patch.object(clip_embedding_service.httpx, "post") as post,
    ):
        result = clip_embedding_service.get_clip_embedding(b"image", "image/jpeg")

    assert result.status == ExternalSignalStatus.unavailable
    assert result.error_code == ExternalSignalErrorCode.not_configured
    post.assert_not_called()


def test_probe_works_while_operational_flag_is_disabled():
    with (
        patch.object(clip_embedding_service.settings, "clip_validation_enabled", False),
        patch.object(clip_embedding_service.settings, "huggingface_token", "hf_test"),
        patch.object(
            clip_embedding_service.settings,
            "clip_endpoint_url",
            "https://clip.example.test/embed",
        ),
        patch.object(clip_embedding_service.settings, "clip_model", MODEL),
        patch.object(
            clip_embedding_service.httpx,
            "post",
            return_value=response(200, {"embedding": [1.0] * 512}),
        ) as post,
    ):
        result = clip_embedding_service.probe_clip_embedding(
            b"diagnostic-image",
            "image/jpeg",
        )

    assert result.status == ExternalSignalStatus.complete
    assert result.embedding is not None
    assert len(result.embedding) == 512
    post.assert_called_once()


def test_probe_still_requires_provider_credentials():
    with (
        patch.object(clip_embedding_service.settings, "clip_validation_enabled", False),
        patch.object(clip_embedding_service.settings, "huggingface_token", ""),
        patch.object(clip_embedding_service.settings, "clip_endpoint_url", ""),
        patch.object(clip_embedding_service.httpx, "post") as post,
    ):
        result = clip_embedding_service.probe_clip_embedding(
            b"diagnostic-image",
            "image/jpeg",
        )

    assert result.status == ExternalSignalStatus.unavailable
    assert result.error_code == ExternalSignalErrorCode.not_configured
    post.assert_not_called()


def test_complete_embedding_is_normalized_before_returning():
    values = [1.0] * 512
    patches = configured()
    with (
        patches[0],
        patches[1],
        patches[2],
        patches[3],
        patch.object(
            clip_embedding_service.httpx,
            "post",
            return_value=response(200, {"embedding": values}),
        ) as post,
    ):
        result = clip_embedding_service.get_clip_embedding(b"image", "image/jpeg")

    assert result.status == ExternalSignalStatus.complete
    assert result.embedding is not None
    assert math.sqrt(sum(value * value for value in result.embedding)) == pytest.approx(1)
    assert len(result.embedding) == 512
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer hf_test"


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [
        (401, ExternalSignalErrorCode.unauthorized),
        (403, ExternalSignalErrorCode.unauthorized),
        (429, ExternalSignalErrorCode.rate_limited),
        (500, ExternalSignalErrorCode.provider_error),
    ],
)
def test_http_errors_are_mapped_without_raising(status_code, expected):
    patches = configured()
    with (
        patches[0],
        patches[1],
        patches[2],
        patches[3],
        patch.object(
            clip_embedding_service.httpx,
            "post",
            return_value=response(status_code),
        ),
    ):
        result = clip_embedding_service.get_clip_embedding(b"image", "image/png")

    assert result.status == ExternalSignalStatus.unavailable
    assert result.error_code == expected


def test_timeout_is_retried_once_and_returned_as_unavailable():
    patches = configured()
    with (
        patches[0],
        patches[1],
        patches[2],
        patches[3],
        patch.object(
            clip_embedding_service.httpx,
            "post",
            side_effect=httpx.TimeoutException("timeout"),
        ) as post,
    ):
        result = clip_embedding_service.get_clip_embedding(b"image", "image/webp")

    assert result.error_code == ExternalSignalErrorCode.timeout
    assert post.call_count == 2


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"embedding": [0.0] * 511},
        {"embedding": [0.0] * 512},
        {"embedding": [float("nan")] * 512},
    ],
)
def test_invalid_provider_payload_never_becomes_a_complete_embedding(payload):
    patches = configured()
    with (
        patches[0],
        patches[1],
        patches[2],
        patches[3],
        patch.object(
            clip_embedding_service.httpx,
            "post",
            return_value=response(200, payload),
        ),
    ):
        result = clip_embedding_service.get_clip_embedding(b"image", "image/jpeg")

    assert result.status == ExternalSignalStatus.unavailable
    assert result.error_code == ExternalSignalErrorCode.invalid_response


def test_empty_image_is_no_data_without_calling_provider():
    with patch.object(clip_embedding_service.httpx, "post") as post:
        result = clip_embedding_service.get_clip_embedding(b"", "image/jpeg")
    assert result.error_code == ExternalSignalErrorCode.no_data
    post.assert_not_called()
