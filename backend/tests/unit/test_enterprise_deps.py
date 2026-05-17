import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock
from app.api.deps import require_enterprise, require_admin
from app.models.user import User


def _make_user(tier: str) -> User:
    u = User()
    u.license_tier = tier
    return u


def test_require_enterprise_passes_for_enterprise():
    user = _make_user("enterprise")
    result = require_enterprise(user)
    assert result is user


def test_require_enterprise_raises_403_for_pro():
    with pytest.raises(HTTPException) as exc:
        require_enterprise(_make_user("pro"))
    assert exc.value.status_code == 403


def test_require_enterprise_raises_403_for_free():
    with pytest.raises(HTTPException) as exc:
        require_enterprise(_make_user("free"))
    assert exc.value.status_code == 403


def test_require_admin_passes_for_enterprise_admin():
    from sqlalchemy.orm import Session
    user = _make_user("enterprise")
    user.id = 1
    db = MagicMock(spec=Session)
    from app.models.enterprise import UserRole
    role_row = UserRole()
    role_row.role = "admin"
    db.query.return_value.filter.return_value.first.return_value = role_row
    result = require_admin(user, db)
    assert result is user


def test_require_admin_raises_403_for_auditor():
    from sqlalchemy.orm import Session
    user = _make_user("enterprise")
    user.id = 1
    db = MagicMock(spec=Session)
    from app.models.enterprise import UserRole
    role_row = UserRole()
    role_row.role = "auditor"
    db.query.return_value.filter.return_value.first.return_value = role_row
    with pytest.raises(HTTPException) as exc:
        require_admin(user, db)
    assert exc.value.status_code == 403
