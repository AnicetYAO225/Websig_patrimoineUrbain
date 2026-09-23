"""
Schémas Feature, alignés sur le standard GeoJSON afin que l'API puisse
être consommée directement par Leaflet / OpenLayers côté frontend sans
transformation supplémentaire.
"""
from datetime import datetime
from typing import Any, Literal

from geojson_pydantic import Feature as GeoJSONFeature
from geojson_pydantic import FeatureCollection as GeoJSONFeatureCollection
from geojson_pydantic.geometries import Geometry
from pydantic import BaseModel


class FeatureCreate(BaseModel):
    """Payload attendu en entrée : une géométrie GeoJSON + des propriétés libres."""
    geometry: Geometry
    properties: dict[str, Any] = {}


class FeatureUpdate(BaseModel):
    geometry: Geometry | None = None
    properties: dict[str, Any] | None = None


class FeaturePropertiesOut(BaseModel):
    """Métadonnées ajoutées par le serveur, fusionnées avec les properties libres côté API."""
    id: int
    layer_id: int
    created_at: datetime
    updated_at: datetime


class ImportResult(BaseModel):
    """Résumé retourné après l'import en masse d'un fichier GeoJSON."""
    imported_count: int
    skipped_count: int
    errors: list[str] = []


# Réutilisation des types GeoJSON standard pour la sortie API :
# - FeatureOut : un seul objet, au format GeoJSON Feature
# - FeatureCollectionOut : liste d'objets, au format GeoJSON FeatureCollection
# -> directement affichable par L.geoJSON(...) côté Leaflet.
FeatureOut = GeoJSONFeature
FeatureCollectionOut = GeoJSONFeatureCollection
