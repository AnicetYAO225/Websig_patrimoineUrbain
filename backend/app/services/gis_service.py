"""
Service GIS : centralise toutes les conversions entre la géométrie
PostGIS (stockée en WKB dans la colonne `geom`) et le format GeoJSON
utilisé par l'API / le frontend.

Isoler cette logique ici évite de disperser du code shapely/geoalchemy
dans les routes et facilite les tests unitaires.
"""
import json
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import cast, func

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape

from app.models.feature import Feature
from app.models.layer import Layer


def geojson_geometry_to_wkbelement(geometry: dict, srid: int = 4326):
    """Convertit une géométrie GeoJSON (dict) en objet WKBElement PostGIS."""
    geom_shape = shape(geometry)
    return from_shape(geom_shape, srid=srid)


def feature_to_geojson(feature: Feature) -> dict[str, Any]:
    """Convertit un objet Feature SQLAlchemy en dict GeoJSON `Feature`."""
    geom_shape = to_shape(feature.geom)
    return {
        "type": "Feature",
        "id": feature.id,
        "geometry": mapping(geom_shape),
        "properties": {
            **(feature.properties or {}),
            "layer_id": feature.layer_id,
            "created_at": feature.created_at.isoformat() if feature.created_at else None,
            "updated_at": feature.updated_at.isoformat() if feature.updated_at else None,
        },
    }


def features_to_feature_collection(features: list[Feature]) -> dict[str, Any]:
    """Convertit une liste de Feature SQLAlchemy en `FeatureCollection` GeoJSON."""
    return {
        "type": "FeatureCollection",
        "features": [feature_to_geojson(f) for f in features],
    }


def validate_geometry_type(geometry: dict, expected_type: str) -> bool:
    """
    Vérifie que le type de géométrie envoyé correspond au type de la couche.

    Accepte aussi la variante "Multi" du type attendu (ex: une couche
    "Polygon" accepte aussi des MultiPolygon) : en données réelles, une
    même couche mélange souvent les deux (ex: une commune avec une
    enclave devient un MultiPolygon alors que ses voisines sont de
    simples Polygon) — les rejeter ferait perdre des objets valides.
    """
    actual_type = geometry.get("type")
    return actual_type == expected_type or actual_type == f"Multi{expected_type}"

def within_radius_filter(geom_column, lng: float, lat: float, radius_m: float):
    """
    Filtre SQLAlchemy : vrai si `geom_column` est à moins de `radius_m`
    mètres du point (lng, lat).

    Le cast en Geography est indispensable ici : nos géométries sont
    stockées en SRID 4326 (latitude/longitude, en degrés). Sans ce cast,
    ST_DWithin interpréterait `radius_m` comme des degrés (un rayon de
    "500" engloberait alors la moitié de la planète). Le cast Geography
    fait le calcul sur l'ellipsoïde terrestre, en mètres réels.
    """
    point_wkt = f"SRID=4326;POINT({lng} {lat})"
    return func.ST_DWithin(
        cast(geom_column, Geography),
        cast(func.ST_GeomFromEWKT(point_wkt), Geography),
        radius_m,
    )
