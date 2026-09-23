"""

schema.py

Schémas Pydantic du module cloud_sources.

Tous les connecteurs (STAC, WMS/WFS, Overpass, FIRMS...) exposent leurs
résultats sous cette même forme, quelle que soit l'API distante réellement
appelée. C'est ce qui permet au frontend de parler un seul langage pour
parcourir n'importe quelle source.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class CloudCategory(str, Enum):
    SATELLITE = "satellite"
    FIRE = "fire"  # feux de brousse / incendies
    AGRICULTURE = "agriculture"
    WATER = "water"
    ENVIRONMENT = "environment"
    DISASTER = "disaster"  # séismes, catastrophes naturelles temps réel
    OSM = "osm"


class CloudSourceOut(BaseModel):
    """Une entrée du catalogue (ex: 'NASA FIRMS', 'IGN — Cadastre')."""

    id: str  # slug stable, ex: "firms", "ign-cadastre", "sentinel2-l2a"
    name: str
    category: CloudCategory
    description: str
    provider: str  # ex: "NASA", "IGN", "Copernicus"
    is_free: bool = True
    requires_api_key: bool = False
    default_zoom_hint: str | None = None  # ex: "utiliser un niveau de zoom > 12"


class BBox(BaseModel):
    """Emprise géographique WGS84 [ouest, sud, est, nord]."""

    west: float
    south: float
    east: float
    north: float

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.west, self.south, self.east, self.north)


class SearchParams(BaseModel):
    bbox: BBox
    query: str | None = None
    date_from: str | None = None  # ISO 8601, ex: "2026-06-01"
    date_to: str | None = None
    # Plafond relevé à 500 (au lieu de 100) : la recherche via l'endpoint public
    # utilise toujours une valeur par défaut raisonnable (20), mais certains
    # connecteurs (earthquakes, gbif...) reconstruisent un SearchParams en
    # interne avec un volume plus large au moment de l'import du dataset
    # complet ; le plafond doit donc l'autoriser.
    limit: int = Field(default=20, le=500)


class DatasetResult(BaseModel):
    """Un jeu de données trouvé lors d'une recherche, prêt à être prévisualisé/importé."""

    dataset_id: str
    title: str
    description: str | None = None
    thumbnail_url: str | None = None
    date: str | None = None
    geometry_type: str | None = None  # "Point" | "LineString" | "Polygon" | "Raster"
    feature_count: int | None = None
    license: str | None = None
    source_url: str | None = None


class SearchResponse(BaseModel):
    source_id: str
    results: list[DatasetResult]


class ImportRequest(BaseModel):
    dataset_id: str
    layer_name: str
    bbox: BBox | None = None  # pour ne récupérer que la zone visible sur la carte


class ImportResponse(BaseModel):
    layer_id: int
    feature_count: int
