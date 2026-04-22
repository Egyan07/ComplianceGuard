"""
AWS Credentials API

Endpoints for storing, retrieving, and deleting per-user AWS credentials.

Design decisions
----------------
* Credentials are encrypted at rest using Fernet (see core/credential_crypto.py).
* The secret access key is NEVER returned to the client after it is saved —
  only a masked hint (last 4 chars) is exposed so the UI can confirm a key is set.
* One credential set per user — upsert on save.
* Credentials are loaded from the DB automatically when evidence collection runs;
  callers no longer pass raw keys in the request body.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.credential_crypto import encrypt_credential, decrypt_credential
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.aws_credential import AwsCredential
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/aws-credentials", tags=["aws-credentials"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SaveAwsCredentialsRequest(BaseModel):
    access_key_id: str
    secret_access_key: str
    region: str = "us-east-1"
    label: Optional[str] = None


class AwsCredentialStatusResponse(BaseModel):
    """
    Safe representation — never exposes the secret.
    access_key_id_hint: last 4 characters of the access key ID, or None.
    """
    configured: bool
    access_key_id_hint: Optional[str] = None
    region: Optional[str] = None
    label: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=AwsCredentialStatusResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def save_aws_credentials(
    request: Request,
    body: SaveAwsCredentialsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save (or replace) the user's AWS credentials.

    The access key ID and secret are encrypted before being written to the
    database.  The plaintext secret is never stored or logged.
    """
    if not body.access_key_id or not body.secret_access_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="access_key_id and secret_access_key are required",
        )

    enc_key_id = encrypt_credential(body.access_key_id, settings.secret_key)
    enc_secret = encrypt_credential(body.secret_access_key, settings.secret_key)

    existing = (
        db.query(AwsCredential)
        .filter(AwsCredential.user_id == current_user.id)
        .first()
    )

    if existing:
        existing.encrypted_access_key_id = enc_key_id
        existing.encrypted_secret_access_key = enc_secret
        existing.region = body.region
        existing.label = body.label
    else:
        cred = AwsCredential(
            user_id=current_user.id,
            encrypted_access_key_id=enc_key_id,
            encrypted_secret_access_key=enc_secret,
            region=body.region,
            label=body.label,
        )
        db.add(cred)

    db.commit()
    logger.info("AWS credentials saved for user_id=%d", current_user.id)

    return AwsCredentialStatusResponse(
        configured=True,
        access_key_id_hint=body.access_key_id[-4:],
        region=body.region,
        label=body.label,
    )


@router.get("", response_model=AwsCredentialStatusResponse)
@limiter.limit("30/minute")
async def get_aws_credential_status(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return whether the user has stored AWS credentials, plus a safe hint.
    The secret is never included in the response.
    """
    cred = (
        db.query(AwsCredential)
        .filter(AwsCredential.user_id == current_user.id)
        .first()
    )

    if not cred:
        return AwsCredentialStatusResponse(configured=False)

    try:
        key_id_plain = decrypt_credential(cred.encrypted_access_key_id, settings.secret_key)
        hint = key_id_plain[-4:] if key_id_plain else None
    except Exception:
        # Decryption failed (e.g. key rotated) — treat as unconfigured
        logger.warning("Failed to decrypt AWS key ID for user_id=%d", current_user.id)
        hint = None

    return AwsCredentialStatusResponse(
        configured=True,
        access_key_id_hint=hint,
        region=cred.region,
        label=cred.label,
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def delete_aws_credentials(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete the user's stored AWS credentials."""
    deleted = (
        db.query(AwsCredential)
        .filter(AwsCredential.user_id == current_user.id)
        .delete()
    )
    db.commit()

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No credentials found")

    logger.info("AWS credentials deleted for user_id=%d", current_user.id)
