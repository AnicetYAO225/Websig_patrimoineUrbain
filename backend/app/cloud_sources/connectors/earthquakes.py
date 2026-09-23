"""
Connecteur USGS — séismes en temps réel via l'API FDSN Event.

Aucune clé requise, mise à jour en continu par l'USGS (source de
référence mondiale, y compris pour les séismes hors USA). Filtrage
natif par bbox et par période côté serveur.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.persistence import persist_geojson_as_layer
from app.cloud_sources.schemas import CloudSourceOut, DatasetResult, ImportResponse, SearchParams
from app.models.layer import GeometryType

USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"


class EarthquakesConnector(CloudConnector):
    source = CloudSourceOut(
        id="usgs-earthquakes",
        name="USGS — Séismes en temps réel",
        category="disaster",
        description="Séismes récents (magnitude, profondeur, heure), mis à jour en continu par l'USGS.",
        provider="USGS (United States Geological Survey)",
        is_free=True,
        requires_api_key=False,
        default_zoom_hint="Par défaut : 30 derniers jours. Préciser des dates pour une autre période.",
    )

    def _query_params(self, params: SearchParams) -> dict:
        b = params.bbox
        start = params.date_from or (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        end = params.date_to or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return {
            "format": "geojson",
            "starttime": start,
            "endtime": end,
            "minlongitude": b.west,
            "maxlongitude": b.east,
            "minlatitude": b.south,
            "maxlatitude": b.north,
            "limit": params.limit,
            "orderby": "time",
        }

    async def search(self, params: SearchParams) -> list[DatasetResult]:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(USGS_URL, params=self._query_params(params))
            resp.raise_for_status()
            payload = resp.json()

        events = payload.get("features", [])
        b = params.bbox
        dataset_id = (
            f"{b.west},{b.south},{b.east},{b.north}|"
            f"{params.date_from or ''}|{params.date_to or ''}"
        )

        return [
            DatasetResult(
                dataset_id=dataset_id,
                title=f"Séismes détectés — {len(events)} événement(s)",
                description="Chaque point = un séisme (magnitude, profondeur, heure en propriétés).",
                geometry_type="Point",
                feature_count=len(events),
                license="Domaine public (USGS)",
                source_url="https://earthquake.usgs.gov/earthquakes/map/",
            )
        ]

    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        coords_part, date_from_part, date_to_part = dataset_id.split("|")
        west, south, east, north = (float(v) for v in coords_part.split(","))

        search_params = SearchParams(
            bbox={"west": west, "south": south, "east": east, "north": north},
            date_from=date_from_part or None,
            date_to=date_to_part or None,
            limit=500,
        )
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(USGS_URL, params=self._query_params(search_params))
            resp.raise_for_status()
            payload = resp.json()

        features = []
        for event in payload.get("features", []):
            geom = event.get("geometry")
            props = event.get("properties", {})
            if not geom:
                continue
            lon, lat, depth_km = geom["coordinates"]
            occurred_at = (
                datetime.fromtimestamp(props["time"] / 1000, tz=timezone.utc).isoformat()
                if props.get("time")
                else None
            )
            features.append(
                {
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "magnitude": props.get("mag"),
                        "lieu": props.get("place"),
                        "profondeur_km": depth_km,
                        "date_heure": occurred_at,
                        "type_evenement": props.get("type"),
                        "url_detail": props.get("url"),
                    },
                }
            )

        layer, count = persist_geojson_as_layer(
            db=db,
            layer_name=layer_name,
            geometry_type=GeometryType.POINT,
            features_geojson=features,
            created_by_id=created_by_id,
            source="USGS (FDSN Event)",
            source_date=None,
            license="Domaine public (USGS)",
        )
        return ImportResponse(layer_id=layer.id, feature_count=count)
