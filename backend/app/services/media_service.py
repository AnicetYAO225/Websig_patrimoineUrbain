"""
Service de stockage des fichiers média (avatars utilisateurs, etc.).

Stockage simple sur disque local (dossier `media/`), suffisant pour ce
projet. En production sur plusieurs instances, on préférerait un stockage
objet (S3, GCS...) — voir la section "Pistes d'évolution" du README.
"""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _avatars_dir() -> Path:
    path = Path(settings.MEDIA_ROOT) / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_avatar(user_id: int, file: UploadFile, content: bytes) -> str:
    """
    Valide et enregistre la photo de profil d'un utilisateur sur disque.
    Retourne l'URL publique (relative) à stocker dans `user.avatar_url`.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format d'image non supporté (jpg, png ou webp uniquement)",
        )
    if len(content) > settings.MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image trop volumineuse (max {settings.MAX_AVATAR_SIZE_BYTES // 1024 // 1024} Mo)",
        )

    extension = ALLOWED_CONTENT_TYPES[file.content_type]
    # Nom de fichier unique : évite les conflits et le cache navigateur périmé
    filename = f"user_{user_id}_{uuid.uuid4().hex[:8]}.{extension}"
    filepath = _avatars_dir() / filename
    filepath.write_bytes(content)

    return f"{settings.MEDIA_URL_PREFIX}/avatars/{filename}"
