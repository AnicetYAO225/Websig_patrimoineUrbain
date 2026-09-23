"""
Enregistrement en base d'un import cloud.

Réutilise le même pattern que `_bulk_insert_features` dans app/api/features.py :
géométrie GeoJSON -> WKBElement PostGIS via gis_service, avec validation du
type de géométrie et tolérance aux entités individuellement invalides
(une géométrie cassée dans un flux WFS/Overpass ne doit pas faire échouer
tout l'import).
"""
from __future__ import annotations

import re
import unicodedata

from sqlalchemy.orm import Session

from app.models.feature import Feature
from app.models.layer import GeometryType, Layer
from app.services import gis_service


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", normalized).strip("_").lower()
    return slug or "layer"


def persist_geojson_as_layer(
    db: Session,
    layer_name: str,
    geometry_type: GeometryType,
    features_geojson: list[dict],
    created_by_id: int | None,
    source: str,
    source_date: str | None,
    license: str | None,
    srid: int = 4326,
) -> tuple[Layer, int]:
    """Crée une nouvelle Layer et y insère chaque feature GeoJSON fourni. Retourne (layer, nombre d'entités insérées)."""
    base_slug = slugify(layer_name)
    slug = base_slug
    suffix = 1
    while db.query(Layer).filter(Layer.slug == slug).first():
        suffix += 1
        slug = f"{base_slug}_{suffix}"

    layer = Layer(
        name=layer_name,
        slug=slug,
        description=f"Importé automatiquement depuis {source}",
        geometry_type=geometry_type,
        srid=srid,
        is_visible=True,
        source=source,
        source_date=source_date,
        license=license,
        created_by_id=created_by_id,
    )
    db.add(layer)
    db.flush()  # attribue layer.id sans commiter, pour lier les features tout de suite

    to_insert: list[Feature] = []
    for feature in features_geojson:
        geometry = feature.get("geometry")
        properties = feature.get("properties") or {}
        if not geometry:
            continue
        if not gis_service.validate_geometry_type(geometry, geometry_type.value):
            continue  # entité incompatible avec le type de la couche : ignorée silencieusement
        try:
            to_insert.append(
                Feature(
                    layer_id=layer.id,
                    geom=gis_service.geojson_geometry_to_wkbelement(geometry, srid=srid),
                    properties=properties,
                    created_by_id=created_by_id,
                )
            )
        except Exception:
            continue  # géométrie individuellement invalide (topologie cassée, etc.) : ignorée

    if to_insert:
        db.bulk_save_objects(to_insert)

    db.commit()
    db.refresh(layer)
    return layer, len(to_insert)
