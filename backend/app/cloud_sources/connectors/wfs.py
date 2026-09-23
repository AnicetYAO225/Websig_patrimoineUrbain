"""
Connecteur WFS (OGC) générique.

Un seul connecteur, paramétré par une URL de service WFS + une liste de
couches disponibles : couvre l'IGN Géoservices, data.gouv.fr, Géorisques,
et toute future source WFS gratuite, sans écrire une classe par service.

Ajouter une nouvelle source WFS = ajouter une entrée dans WFS_ENDPOINTS,
aucun code supplémentaire.
"""
from __future__ import annotations

import httpx
from sqlalchemy.orm import Session

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.persistence import persist_geojson_as_layer
from app.cloud_sources.schemas import CloudSourceOut, DatasetResult, ImportResponse, SearchParams
from app.models.layer import GeometryType

# Chaque service WFS gratuit qu'on veut exposer, avec ses couches connues.
# geometry_type est indicatif (utilisé pour créer la Layer) — WFS renvoie
# toujours du GeoJSON avec le vrai type dedans.
WFS_ENDPOINTS: dict[str, dict] = {
    "ign-cadastre": {
        "label": "IGN — Parcelles cadastrales",
        "provider": "IGN Géoservices",
        "base_url": "https://data.geopf.fr/wfs/ows",
        "type_name": "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
        "geometry_type": GeometryType.POLYGON,
        "license": "Etalab Licence Ouverte 2.0",
    },
    "ign-plu": {
        "label": "IGN — Zonage PLU/GPU",
        "provider": "IGN Géoservices / GPU",
        "base_url": "https://data.geopf.fr/wfs/ows",
        "type_name": "WFS_GPU.CATNAT:zone_urba",
        "geometry_type": GeometryType.POLYGON,
        "license": "Etalab Licence Ouverte 2.0",
    },
    "georisques-inondation": {
        "label": "Géorisques — Zones inondables (TRI)",
        "provider": "Géorisques (MTE)",
        # Le domaine sans "www." redirige (301) — on pointe directement sur la bonne URL.
        "base_url": "https://www.georisques.gouv.fr/webservice/risques/wfs",
        "type_name": "zonage_inondation",
        "geometry_type": GeometryType.POLYGON,
        "license": "Etalab Licence Ouverte 2.0",
    },
}


class WfsConnector(CloudConnector):
    """Une instance = un service WFS particulier du catalogue WFS_ENDPOINTS."""

    def __init__(self, source_id: str):
        cfg = WFS_ENDPOINTS[source_id]
        self._source_id = source_id
        self._cfg = cfg
        self.source = CloudSourceOut(
            id=source_id,
            name=cfg["label"],
            category="environment",
            description=f"Couche WFS « {cfg['type_name']} » — {cfg['provider']}.",
            provider=cfg["provider"],
            is_free=True,
            requires_api_key=False,
        )

    async def search(self, params: SearchParams) -> list[DatasetResult]:
        # Un endpoint WFS de ce catalogue = un seul type de couche, donc un seul résultat,
        # mais on interroge le service pour donner un aperçu du nombre d'objets sur la bbox.
        url = self._feature_url(params.bbox.as_tuple(), count_only=True)
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                total = data.get("totalFeatures") or data.get("numberMatched")
        except Exception:
            total = None

        return [
            DatasetResult(
                dataset_id=self._source_id,
                title=self._cfg["label"],
                description=f"Service WFS {self._cfg['provider']} — {self._cfg['type_name']}.",
                geometry_type=self._cfg["geometry_type"].value,
                feature_count=total,
                license=self._cfg["license"],
                source_url=self._cfg["base_url"],
            )
        ]

    def _feature_url(self, bbox: tuple[float, float, float, float], count_only: bool = False) -> str:
        west, south, east, north = bbox
        # WFS 2.0.0 + EPSG:4326 : l'ordre des axes imposé par l'autorité EPSG est
        # latitude,longitude (et non longitude,latitude comme pour CRS:84 / GeoJSON).
        # C'est ce qui causait le 400 Bad Request sur data.geopf.fr.
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeName": self._cfg["type_name"],
            "outputFormat": "application/json",
            "srsName": "EPSG:4326",
            "bbox": f"{south},{west},{north},{east},EPSG:4326",
        }
        if count_only:
            params["resultType"] = "hits"
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self._cfg['base_url']}?{query}"

    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        if not bbox:
            raise ValueError("Une emprise (bbox) est requise pour importer une couche WFS.")

        url = self._feature_url(bbox)
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            geojson = resp.json()

        features = geojson.get("features", [])

        layer, count = persist_geojson_as_layer(
            db=db,
            layer_name=layer_name,
            geometry_type=self._cfg["geometry_type"],
            features_geojson=features,
            created_by_id=created_by_id,
            source=f"{self._cfg['provider']} (WFS)",
            source_date=None,
            license=self._cfg["license"],
        )
        return ImportResponse(layer_id=layer.id, feature_count=count)
