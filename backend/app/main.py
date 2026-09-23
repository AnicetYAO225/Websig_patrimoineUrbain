from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, features, layers
from app.cloud_sources.router import router as cloud_sources_router
from app.core.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "API REST pour une plateforme WebSIG de gestion du patrimoine urbain "
        "(bâtiments, voirie, éclairage, espaces verts...). "
        "Authentification JWT + contrôle d'accès par rôle (RBAC)."
    ),
    version="1.0.0",
)

# En développement on autorise tout ; en production, restreindre allow_origins
# aux domaines réels du frontend (ex: ["https://mairie-ma-ville.fr"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sert les fichiers uploadés (avatars...) sur /media/... ; le dossier est
# créé automatiquement au premier upload (voir app/services/media_service.py)
Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)
app.mount(settings.MEDIA_URL_PREFIX, StaticFiles(directory=settings.MEDIA_ROOT), name="media")

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(layers.router)
app.include_router(features.router)
app.include_router(cloud_sources_router)


@app.get("/api/health", tags=["Santé"])
def health_check():
    """Endpoint simple pour vérifier que l'API est en ligne (utile pour Docker healthcheck / monitoring)."""
    return {"status": "ok", "project": settings.PROJECT_NAME}