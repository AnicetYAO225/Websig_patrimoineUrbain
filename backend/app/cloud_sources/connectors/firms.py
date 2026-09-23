"""
Connecteur NASA FIRMS (Fire Information for Resource Management System).

Détections de feux actifs (VIIRS/MODIS) en quasi temps réel, format CSV
public, gratuit. Une clé "MAP_KEY" gratuite est recommandée pour un usage
régulier (https://firms.modaps.eosdis.nasa.gov/api/) mais l'API accepte un
volume limité de requêtes anonymes pour du test.
"""
from __future__ import annotations

import csv
import io
import os

import httpx
from sqlalchemy.orm import Session

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.persistence import persist_geojson_as_layer
from app.cloud_sources.schemas import CloudSourceOut, DatasetResult, ImportResponse, SearchParams
from app.models.layer import GeometryType

FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")  # à renseigner dans .env pour un usage en production

# VIIRS_SNPP_NRT = capteur satellite VIIRS, résolution ~375m, mis à jour toutes les 3-4h
DATASET_ID = "VIIRS_SNPP_NRT"


class FirmsConnector(CloudConnector):
    source = CloudSourceOut(
        id="firms",
        name="NASA FIRMS — Feux actifs",
        category="fire",
        description="Détections de feux actifs par satellite (VIIRS), mises à jour quasi temps réel.",
        provider="NASA",
        is_free=True,
        requires_api_key=False,
        default_zoom_hint="Fonctionne à toute échelle, une bbox large est acceptée.",
    )

    def _csv_url(self, bbox: tuple[float, float, float, float], days: int = 1) -> str:
        west, south, east, north = bbox
        key = FIRMS_MAP_KEY or "DEMO_KEY"
        return (
            f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/"
            f"{DATASET_ID}/{west},{south},{east},{north}/{days}"
        )

    async def search(self, params: SearchParams) -> list[DatasetResult]:
        url = self._csv_url(params.bbox.as_tuple())
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)

        # FIRMS ne propose pas de "jeux de données" multiples : on renvoie un seul résultat
        # agrégé représentant les détections trouvées sur la bbox demandée.
        return [
            DatasetResult(
                dataset_id=f"{DATASET_ID}:{params.bbox.west},{params.bbox.south},{params.bbox.east},{params.bbox.north}",
                title=f"Feux actifs détectés — {len(rows)} points (dernières 24h)",
                description="Détections VIIRS NRT, chaque point = un foyer probable.",
                date=rows[0]["acq_date"] if rows else None,
                geometry_type="Point",
                feature_count=len(rows),
                license="NASA FIRMS — usage libre avec attribution",
                source_url=url,
            )
        ]

    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        # dataset_id encode la bbox utilisée lors de la recherche ; on la ré-extrait pour refaire l'appel
        _, coords = dataset_id.split(":", 1)
        west, south, east, north = (float(v) for v in coords.split(","))
        url = self._csv_url((west, south, east, north))

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(resp.text))
        features = []
        for row in reader:
            features.append(
                {
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(row["longitude"]), float(row["latitude"])],
                    },
                    "properties": {
                        "date_acquisition": row.get("acq_date"),
                        "heure_acquisition": row.get("acq_time"),
                        "confiance": row.get("confidence"),
                        "puissance_radiative_mw": row.get("frp"),
                        "satellite": row.get("satellite"),
                    },
                }
            )

        layer, count = persist_geojson_as_layer(
            db=db,
            layer_name=layer_name,
            geometry_type=GeometryType.POINT,
            features_geojson=features,
            created_by_id=created_by_id,
            source="NASA FIRMS (VIIRS NRT)",
            source_date=features[0]["properties"]["date_acquisition"] if features else None,
            license="NASA FIRMS — usage libre avec attribution",
        )
        return ImportResponse(layer_id=layer.id, feature_count=count)
