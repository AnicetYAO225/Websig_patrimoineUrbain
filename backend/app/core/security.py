"""
Utilitaires de sécurité : hachage des mots de passe (bcrypt) et
génération / vérification des tokens JWT.
"""
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Retourne le hash bcrypt d'un mot de passe en clair."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie qu'un mot de passe en clair correspond à un hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, extra_claims: dict | None = None) -> str:
    """
    Crée un JWT signé.
    `subject` est généralement l'identifiant (id) de l'utilisateur.
    `extra_claims` permet d'ajouter des infos utiles (ex: rôle) pour éviter
    une requête DB supplémentaire à chaque appel protégé.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(subject), "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Décode un JWT. Retourne None si le token est invalide ou expiré."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
