from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.api import navigation
from app.models.navigation import NavigationErrorCode
from app.services import navigation_service


def test_domain_error_keeps_stable_code_and_retry_header():
    error = navigation_service.NavigationServiceError(
        NavigationErrorCode.recalculation_rate_limited,
        429,
        "Espera antes de recalcular.",
        retry_after_seconds=12,
    )

    with pytest.raises(HTTPException) as response:
        navigation._call(lambda: (_ for _ in ()).throw(error))

    assert response.value.status_code == 429
    assert response.value.detail == {
        "code": "recalculation_rate_limited",
        "message": "Espera antes de recalcular.",
    }
    assert response.value.headers == {"Retry-After": "12"}


def test_capabilities_pass_authenticated_user_to_service():
    with (
        patch.object(
            navigation,
            "_authenticated_user",
            return_value={"id": "user-1"},
        ),
        patch.object(
            navigation.navigation_service,
            "get_navigation_capabilities",
            return_value={"navigation_enabled": True},
        ) as service,
    ):
        result = navigation.get_navigation_capabilities(
            "report-1", "Bearer token"
        )

    assert result == {"navigation_enabled": True}
    service.assert_called_once_with("report-1", "user-1")
