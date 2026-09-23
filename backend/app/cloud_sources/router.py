"""
Router FastAPI du module cloud_sources.

Trois endpoints seulement :
  GET  /api/cloud-sources                    -> catalogue (avec filtre catégorie)
  GET  /api/cloud-sources/{id}/search         -> recherche sur une emprise/critères
  POST /api/cloud-sources/{id}/import         -> importe un dataset en tant que nouvelle Layer
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.cloud_sources.registry import get_connector, list_sources
from app.cloud_sources.schemas import (
    BBox,
    CloudCategory,
    CloudSourceOut,
    ImportRequest,
    ImportResponse,
    SearchParams,
    SearchResponse,
)
from app.core.database import get_db
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/cloud-sources", tags=["Sources cloud"])

# Parcourir le catalogue / chercher : ouvert à tout utilisateur authentifié
can_browse = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT, UserRole.CITIZEN)
# Importer crée une nouvelle couche en base : réservé aux administrateurs, comme la création de Layer
can_import = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get("", response_model=list[CloudSourceOut])
def get_catalog(
    category: CloudCategory | None = Query(default=None),
    _: User = Depends(can_browse),
):
    """Catalogue des sources cloud disponibles, filtrable par catégorie."""
    sources = list_sources()
    if category:
        sources = [s for s in sources if s.category == category]
    return sources


@router.get("/{source_id}/search", response_model=SearchResponse)
async def search_source(
    source_id: str,
    west: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    north: float = Query(...),
    q: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    _: User = Depends(can_browse),
):
    try:
        connector = get_connector(source_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Source cloud introuvable")

    params = SearchParams(
        bbox=BBox(west=west, south=south, east=east, north=north),
        query=q,
        date_from=date_from,
        date_to=date_to,
    )
    try:
        results = await connector.search(params)
    except Exception as exc:  # service distant indisponible, timeout, etc.
        raise HTTPException(status_code=502, detail=f"Source distante indisponible : {exc}")

    return SearchResponse(source_id=source_id, results=results)


@router.post("/{source_id}/import", response_model=ImportResponse, status_code=status.HTTP_201_CREATED)
async def import_dataset(
    source_id: str,
    payload: ImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(can_import),
):
    try:
        connector = get_connector(source_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Source cloud introuvable")

    bbox = payload.bbox.as_tuple() if payload.bbox else None
    try:
        return await connector.import_to_layer(
            dataset_id=payload.dataset_id,
            layer_name=payload.layer_name,
            db=db,
            created_by_id=current_user.id,
            bbox=bbox,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Échec de l'import : {exc}")
