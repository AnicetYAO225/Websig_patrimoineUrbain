"""
Configuration centrale de l'application.

Toutes les valeurs sensibles (mots de passe, clé secrète JWT, etc.) sont
lues depuis les variables d'environnement (voir .env / .env.example) et
jamais codées en dur dans le code source.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Base de données ---
    DATABASE_URL: str

    # --- Sécurité JWT ---
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # --- Compte super admin de démarrage (seed) ---
    FIRST_SUPERADMIN_EMAIL: str = "yao.anicet36@gmail.com"
    FIRST_SUPERADMIN_PASSWORD: str = "Stephen.curry94@"

    # --- Fichiers média (avatars, logo...) ---
    MEDIA_ROOT: str = "media"          # dossier local où sont stockés les fichiers uploadés
    MEDIA_URL_PREFIX: str = "/media"    # préfixe d'URL servi statiquement par FastAPI
    MAX_AVATAR_SIZE_BYTES: int = 2 * 1024 * 1024  # 2 Mo

    # --- Métadonnées API ---
    PROJECT_NAME: str = "WebSIG - Gestion du Patrimoine Urbain"
    API_V1_PREFIX: str = "/api"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    """
    Mise en cache des settings pour éviter de relire les variables
    d'environnement à chaque requête (le décorateur lru_cache agit
    comme un singleton ici).
    """
    return Settings()


settings = get_settings()
