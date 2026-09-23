"""
Connecteur STAC (SpatioTemporal Asset Catalog) — protocole standard utilisé
par la quasi-totalité des catalogues satellite modernes et gratuits :
Copernicus/Sentinel via Earth Search (AWS, sans clé), Microsoft Planetary
Computer (sans clé pour la recherche), etc.

IMPORTANT : un item STAC est une SCÈNE SATELLITE (raster), pas un objet
vectoriel. Notre modèle Feature/Layer ne stocke que du vecteur, donc
l'import crée un polygone = l'EMPRISE de la scène, avec en `properties`
les liens vers la vignette et les bandes. Le frontend peut afficher la
vignette (thumbnail_url) dans le popup de l'objet ; l'affichage de la
vraie image géoréférencée nécessitera plus tard un serveur de tuiles
(ex: titiler) — hors scope de ce module.

Ajouter un nouveau catalogue STAC = une entrée dans STAC_ENDPOINTS, sans
code supplémentaire.
"""
from __future__ import annotations

import httpx
from sqlalchemy.orm import Session

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.persistence import persist_geojson_as_layer
from app.cloud_sources.schemas import CloudSourceOut, DatasetResult, ImportResponse, SearchParams
from app.models.layer import GeometryType

STAC_ENDPOINTS: dict[str, dict] = {
    "earth-search-sentinel2": {
        "label": "Copernicus Sentinel-2 (Earth Search)",
        "provider": "Copernicus / Element84",
        "search_url": "https://earth-search.aws.element84.com/v1/search",
        "collection": "sentinel-2-l2a",
        "license": "Copernicus Sentinel Data — accès libre",
    },
    "pc-sentinel1": {
        "label": "Copernicus Sentinel-1 (Planetary Computer)",
        "provider": "Copernicus / Microsoft Planetary Computer",
        "search_url": "https://planetarycomputer.microsoft.com/api/stac/v1/search",
        "collection": "sentinel-1-grd",
        "license": "Copernicus Sentinel Data — accès libre",
    },
    "pc-worldcover": {
        "label": "ESA WorldCover (occupation du sol, 10m)",
        "provider": "ESA / Microsoft Planetary Computer",
        "search_url": "https://planetarycomputer.microsoft.com/api/stac/v1/search",
        "collection": "esa-worldcover",
        "license": "CC BY 4.0",
    },
}


class StacConnector(CloudConnector):
    """Une instance = un couple (catalogue STAC, collection) du registre STAC_ENDPOINTS."""

    def __init__(self, source_id: str):
        cfg = STAC_ENDPOINTS[source_id]
        self._source_id = source_id
        self._cfg = cfg
        self.source = CloudSourceOut(
            id=source_id,
            name=cfg["label"],
            category="satellite",
            description=f"Scènes {cfg['collection']} — {cfg['provider']}. Import = empreinte + vignette (pas la donnée raster brute).",
            provider=cfg["provider"],
            is_free=True,
            requires_api_key=False,
            default_zoom_hint="Utiliser une emprise raisonnable (ville/région) pour limiter le nombre de scènes.",
        )

    def _search_body(self, params: SearchParams) -> dict:
        body: dict = {
            "collections": [self._cfg["collection"]],
            "bbox": list(params.bbox.as_tuple()),
            "limit": params.limit,
        }
        if params.date_from or params.date_to:
            body["datetime"] = f"{params.date_from or '..'}/{params.date_to or '..'}"
        return body

    async def search(self, params: SearchParams) -> list[DatasetResult]:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.post(self._cfg["search_url"], json=self._search_body(params))
            resp.raise_for_status()
            payload = resp.json()

        results = []
        for item in payload.get("features", []):
            props = item.get("properties", {})
            assets = item.get("assets", {})
            thumbnail = (
                assets.get("thumbnail", {}).get("href")
                or assets.get("visual", {}).get("href")
                or assets.get("rendered_preview", {}).get("href")
            )
            cloud_cover = props.get("eo:cloud_cover")
            title = f"{self._cfg['label']} — {item.get('id')}"
            if cloud_cover is not None:
                title += f" ({cloud_cover:.0f}% nuages)"

            results.append(
                DatasetResult(
                    dataset_id=item["id"],
                    title=title,
                    description=f"Acquisition du {props.get('datetime', '?')}",
                    thumbnail_url=thumbnail,
                    date=props.get("datetime"),
                    geometry_type="Polygon",
                    license=self._cfg["license"],
                    source_url=item.get("links", [{}])[0].get("href"),
                )
            )
        return results

    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        item_url = f"{self._cfg['search_url'].rsplit('/search', 1)[0]}/collections/{self._cfg['collection']}/items/{dataset_id}"
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(item_url)
            resp.raise_for_status()
            item = resp.json()

        props = item.get("properties", {})
        assets = item.get("assets", {})

        feature = {
            "geometry": item["geometry"],  # empreinte de la scène (Polygon/MultiPolygon)
            "properties": {
                "scene_id": item.get("id"),
                "date_acquisition": props.get("datetime"),
                "couverture_nuageuse_pct": props.get("eo:cloud_cover"),
                "vignette_url": assets.get("thumbnail", {}).get("href") or assets.get("visual", {}).get("href"),
                "url_bande_visuelle": assets.get("visual", {}).get("href"),
                "collection": self._cfg["collection"],
            },
        }

        layer, count = persist_geojson_as_layer(
            db=db,
            layer_name=layer_name,
            geometry_type=GeometryType.POLYGON,
            features_geojson=[feature],
            created_by_id=created_by_id,
            source=self._cfg["provider"],
            source_date=props.get("datetime"),
            license=self._cfg["license"],
        )
        return ImportResponse(layer_id=layer.id, feature_count=count)
