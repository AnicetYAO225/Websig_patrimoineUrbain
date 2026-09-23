"""
Connecteur NASA EONET (Earth Observatory Natural Event Tracker).

Événements naturels en cours, suivis en temps quasi réel : feux de forêt,
tempêtes/cyclones, volcans, inondations, glace de mer... Complète FIRMS
(qui ne couvre que les feux) avec une vue multi-aléas. Gratuit, sans clé.
"""
from __future__ import annotations

import httpx
from sqlalchemy.orm import Session

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.persistence import persist_geojson_as_layer
from app.cloud_sources.schemas import CloudSourceOut, DatasetResult, ImportResponse, SearchParams
from app.models.layer import GeometryType

EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"

CATEGORY_LABELS = {
    "wildfires": "Feux de forêt / brousse",
    "severeStorms": "Tempêtes / cyclones",
    "volcanoes": "Activité volcanique",
    "floods": "Inondations",
    "drought": "Sécheresse",
    "landslides": "Glissements de terrain",
    "seaLakeIce": "Glace de mer / lacs",
}


def _point_in_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    return west <= lon <= east and south <= lat <= north


class EonetConnector(CloudConnector):
    source = CloudSourceOut(
        id="eonet",
        name="NASA EONET — Événements naturels",
        category="disaster",
        description="Suivi temps réel multi-aléas : feux, tempêtes, volcans, inondations, sécheresse...",
        provider="NASA",
        is_free=True,
        requires_api_key=False,
        default_zoom_hint="Couvre le monde entier ; la bbox filtre les événements affichés.",
    )

    async def search(self, params: SearchParams) -> list[DatasetResult]:
        query = {"status": "open", "limit": 200}
        if params.query:
            query["category"] = params.query  # ex: "wildfires", "severeStorms"

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(EONET_URL, params=query)
            resp.raise_for_status()
            payload = resp.json()

        bbox = params.bbox.as_tuple()
        matching = []
        for event in payload.get("events", []):
            geometries = event.get("geometry", [])
            if not geometries:
                continue
            last = geometries[-1]  # position la plus récente de l'événement
            coords = last.get("coordinates")
            if not coords or last.get("type") != "Point":
                continue
            lon, lat = coords
            if _point_in_bbox(lon, lat, bbox):
                matching.append(event)

        b = params.bbox
        dataset_id = f"{b.west},{b.south},{b.east},{b.north}|{params.query or ''}"
        categories_present = {c["id"] for e in matching for c in e.get("categories", [])}
        labels = ", ".join(CATEGORY_LABELS.get(c, c) for c in categories_present) or "aucun"

        return [
            DatasetResult(
                dataset_id=dataset_id,
                title=f"Événements en cours — {len(matching)} sur l'emprise",
                description=f"Types présents : {labels}",
                geometry_type="Point",
                feature_count=len(matching),
                license="Domaine public (NASA)",
                source_url="https://eonet.gsfc.nasa.gov/",
            )
        ]

    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        coords_part, _, category_part = dataset_id.partition("|")
        west, south, east, north = (float(v) for v in coords_part.split(","))

        query = {"status": "open", "limit": 200}
        if category_part:
            query["category"] = category_part

        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(EONET_URL, params=query)
            resp.raise_for_status()
            payload = resp.json()

        features = []
        for event in payload.get("events", []):
            geometries = event.get("geometry", [])
            if not geometries:
                continue
            last = geometries[-1]
            coords = last.get("coordinates")
            if not coords or last.get("type") != "Point":
                continue
            lon, lat = coords
            if not _point_in_bbox(lon, lat, (west, south, east, north)):
                continue

            categories = [c["id"] for c in event.get("categories", [])]
            sources = event.get("sources", [])
            features.append(
                {
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "titre": event.get("title"),
                        "categorie": ", ".join(CATEGORY_LABELS.get(c, c) for c in categories),
                        "date_derniere_maj": last.get("date"),
                        "url_source": sources[0].get("url") if sources else None,
                    },
                }
            )

        layer, count = persist_geojson_as_layer(
            db=db,
            layer_name=layer_name,
            geometry_type=GeometryType.POINT,
            features_geojson=features,
            created_by_id=created_by_id,
            source="NASA EONET",
            source_date=None,
            license="Domaine public (NASA)",
        )
        return ImportResponse(layer_id=layer.id, feature_count=count)
