"""

overpass.py 

Connecteur OpenStreetMap via Overpass API — entièrement gratuit, aucune clé.

La "recherche" ici propose un jeu de préréglages (eau, végétation, bâti...)
plutôt qu'un vrai catalogue de datasets : Overpass n'a pas de notion de
jeu de données nommé, donc chaque préréglage EST le dataset_id.

Un même préréglage a un sens dans plusieurs onglets du catalogue (ex: les
parcelles agricoles sont à la fois "de l'OSM" et "de l'agriculture"). On
instancie donc ce connecteur une fois par catégorie pertinente
(cf. registry.py), chaque instance n'exposant que les préréglages qui la
concernent.
"""
from __future__ import annotations

import httpx
from sqlalchemy.orm import Session

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.persistence import persist_geojson_as_layer
from app.cloud_sources.schemas import CloudCategory, CloudSourceOut, DatasetResult, ImportResponse, SearchParams
from app.models.layer import GeometryType

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# overpass-api.de renvoie 406 Not Acceptable aux clients sans User-Agent
# identifiable (mesure anti-abus côté serveur) — on s'identifie donc explicitement.
OVERPASS_HEADERS = {"User-Agent": "WebSIG-PatrimoineUrbain/1.0 (contact administrateur du service)"}

# Chaque préréglage : (titre, tag Overpass, type de géométrie principal, catégorie d'appartenance)
PRESETS: dict[str, tuple[str, str, GeometryType, CloudCategory]] = {
    "water": ("Plans et cours d'eau", "natural=water", GeometryType.POLYGON, CloudCategory.WATER),
    "waterway": ("Cours d'eau (lignes)", "waterway", GeometryType.LINESTRING, CloudCategory.WATER),
    "farmland": ("Parcelles agricoles", "landuse=farmland", GeometryType.POLYGON, CloudCategory.AGRICULTURE),
    "forest": ("Forêts / bois", "landuse=forest", GeometryType.POLYGON, CloudCategory.AGRICULTURE),
    "buildings": ("Bâtiments", "building", GeometryType.POLYGON, CloudCategory.OSM),
    "roads": ("Routes", "highway", GeometryType.LINESTRING, CloudCategory.OSM),
}

_CATEGORY_LABELS = {
    CloudCategory.OSM: "OpenStreetMap (Overpass)",
    CloudCategory.AGRICULTURE: "OpenStreetMap — Agriculture",
    CloudCategory.WATER: "OpenStreetMap — Eau",
}


class OverpassConnector(CloudConnector):
    """Une instance = les préréglages OSM pertinents pour une catégorie donnée."""

    def __init__(self, category: CloudCategory):
        self._category = category
        self._presets = {k: v for k, v in PRESETS.items() if v[3] == category}
        # id unique par instance : "overpass" pour OSM (id historique conservé),
        # "overpass-agriculture" / "overpass-water" pour les deux autres.
        source_id = "overpass" if category == CloudCategory.OSM else f"overpass-{category.value}"
        self._source_id = source_id
        self.source = CloudSourceOut(
            id=source_id,
            name=_CATEGORY_LABELS[category],
            category=category,
            description="Bâtiments, routes, eau, agriculture... issus d'OpenStreetMap.",
            provider="OpenStreetMap",
            is_free=True,
            requires_api_key=False,
            default_zoom_hint="Préférer une petite emprise (ville/quartier) pour rester rapide.",
        )

    def _build_query(self, tag: str, bbox: tuple[float, float, float, float]) -> str:
        west, south, east, north = bbox
        bbox_str = f"{south},{west},{north},{east}"  # Overpass attend (sud,ouest,nord,est)
        key_value = tag.split("=") if "=" in tag else (tag, None)
        if len(key_value) == 2:
            key, value = key_value
            filt = f'["{key}"="{value}"]'
        else:
            filt = f'["{key_value[0]}"]'
        return f"""
            [out:json][timeout:25];
            (
              way{filt}({bbox_str});
              relation{filt}({bbox_str});
            );
            out geom;
        """

    async def search(self, params: SearchParams) -> list[DatasetResult]:
        results = []
        for preset_id, (title, _tag, geom_type, _cat) in self._presets.items():
            if params.query and params.query.lower() not in title.lower():
                continue
            results.append(
                DatasetResult(
                    dataset_id=preset_id,
                    title=title,
                    description=f"Données OSM — {title.lower()}, sur l'emprise carte actuelle.",
                    geometry_type=geom_type.value,
                    license="ODbL — OpenStreetMap contributors",
                    source_url="https://www.openstreetmap.org/copyright",
                )
            )
        return results

    def _way_to_geometry(self, element: dict) -> dict | None:
        geom = element.get("geometry")
        if not geom:
            return None
        coords = [[pt["lon"], pt["lat"]] for pt in geom]
        is_closed = len(coords) > 2 and coords[0] == coords[-1]
        if is_closed:
            return {"type": "Polygon", "coordinates": [coords]}
        return {"type": "LineString", "coordinates": coords}

    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        if dataset_id not in self._presets:
            raise ValueError(f"Préréglage OSM inconnu pour cette catégorie : {dataset_id}")
        if not bbox:
            raise ValueError("Une emprise (bbox) est requise pour importer des données OSM.")

        _title, tag, geom_type, _cat = self._presets[dataset_id]
        query = self._build_query(tag, bbox)

        async with httpx.AsyncClient(timeout=30, headers=OVERPASS_HEADERS) as client:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            resp.raise_for_status()
            payload = resp.json()

        features = []
        for element in payload.get("elements", []):
            geometry = self._way_to_geometry(element)
            if not geometry:
                continue
            features.append({"geometry": geometry, "properties": element.get("tags", {})})

        layer, count = persist_geojson_as_layer(
            db=db,
            layer_name=layer_name,
            geometry_type=geom_type,
            features_geojson=features,
            created_by_id=created_by_id,
            source="OpenStreetMap (Overpass API)",
            source_date=None,
            license="ODbL — OpenStreetMap contributors",
        )
        return ImportResponse(layer_id=layer.id, feature_count=count)