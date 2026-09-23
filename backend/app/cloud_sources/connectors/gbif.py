"""
Connecteur GBIF (Global Biodiversity Information Facility).

Occurrences d'observations d'espèces (faune, flore, fongique...) à travers
le monde, agrégées par GBIF depuis des milliers de sources (musées,
programmes de sciences participatives, relevés naturalistes...). API
publique, gratuite, sans clé requise. Utile ici pour des inventaires de
biodiversité urbaine (espaces verts, zones protégées...).

Documentation : https://www.gbif.org/developer/occurrence
"""
from __future__ import annotations

import httpx
from sqlalchemy.orm import Session

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.persistence import persist_geojson_as_layer
from app.cloud_sources.schemas import CloudSourceOut, DatasetResult, ImportResponse, SearchParams
from app.models.layer import GeometryType

GBIF_URL = "https://api.gbif.org/v1/occurrence/search"

# GBIF plafonne à 300 enregistrements par page ; suffisant pour un import
# d'inventaire local sans avoir à paginer.
IMPORT_LIMIT = 300


class GbifConnector(CloudConnector):
    source = CloudSourceOut(
        id="gbif",
        name="GBIF — Occurrences de biodiversité",
        category="environment",
        description=(
            "Observations d'espèces (faune, flore, fonge) géolocalisées, "
            "agrégées depuis des milliers de sources naturalistes."
        ),
        provider="GBIF (Global Biodiversity Information Facility)",
        is_free=True,
        requires_api_key=False,
        default_zoom_hint="Fonctionne à toute échelle ; préciser un mot-clé (nom d'espèce) affine la recherche.",
    )

    def _query_params(self, params: SearchParams, limit: int) -> dict:
        b = params.bbox
        query: dict = {
            "decimalLatitude": f"{b.south},{b.north}",
            "decimalLongitude": f"{b.west},{b.east}",
            "hasCoordinate": "true",
            "hasGeospatialIssue": "false",
            "limit": limit,
        }
        if params.query:
            query["q"] = params.query
        if params.date_from and params.date_to:
            query["eventDate"] = f"{params.date_from},{params.date_to}"
        elif params.date_from:
            query["eventDate"] = params.date_from
        return query

    async def search(self, params: SearchParams) -> list[DatasetResult]:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(GBIF_URL, params=self._query_params(params, params.limit))
            resp.raise_for_status()
            payload = resp.json()

        count = payload.get("count", 0)
        b = params.bbox
        dataset_id = (
            f"{b.west},{b.south},{b.east},{b.north}|"
            f"{params.date_from or ''}|{params.date_to or ''}|{params.query or ''}"
        )

        return [
            DatasetResult(
                dataset_id=dataset_id,
                title=f"Occurrences GBIF — {count} observation(s) sur l'emprise",
                description="Chaque point = une observation d'espèce géolocalisée (nom, date, règne en propriétés).",
                geometry_type="Point",
                feature_count=count,
                license="Variable selon la source (CC0, CC-BY... — voir chaque occurrence)",
                source_url="https://www.gbif.org/occurrence/search",
            )
        ]

    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        coords_part, date_from_part, date_to_part, query_part = dataset_id.split("|")
        west, south, east, north = (float(v) for v in coords_part.split(","))

        search_params = SearchParams(
            bbox={"west": west, "south": south, "east": east, "north": north},
            date_from=date_from_part or None,
            date_to=date_to_part or None,
            query=query_part or None,
            limit=IMPORT_LIMIT,
        )
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(GBIF_URL, params=self._query_params(search_params, IMPORT_LIMIT))
            resp.raise_for_status()
            payload = resp.json()

        features = []
        for record in payload.get("results", []):
            lon = record.get("decimalLongitude")
            lat = record.get("decimalLatitude")
            if lon is None or lat is None:
                continue
            features.append(
                {
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "espece": record.get("scientificName"),
                        "nom_vernaculaire": record.get("vernacularName"),
                        "regne": record.get("kingdom"),
                        "date_observation": record.get("eventDate"),
                        "pays": record.get("country"),
                        "etablissement": record.get("institutionCode"),
                        "url_detail": f"https://www.gbif.org/occurrence/{record.get('key')}" if record.get("key") else None,
                    },
                }
            )

        layer, count = persist_geojson_as_layer(
            db=db,
            layer_name=layer_name,
            geometry_type=GeometryType.POINT,
            features_geojson=features,
            created_by_id=created_by_id,
            source="GBIF (Global Biodiversity Information Facility)",
            source_date=None,
            license="Variable selon la source (CC0, CC-BY... — voir chaque occurrence)",
        )
        return ImportResponse(layer_id=layer.id, feature_count=count)
