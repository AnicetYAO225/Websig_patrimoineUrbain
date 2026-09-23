"""
Registre central : liste toutes les instances de connecteurs disponibles.

Pour ajouter une nouvelle source plus tard :
  - WFS/OGC (IGN, Géorisques, data.gouv.fr...) → ajouter une entrée dans
    WFS_ENDPOINTS (connectors/wfs.py), rien d'autre à faire.
  - STAC (nouveau catalogue satellite) → ajouter une entrée dans
    STAC_ENDPOINTS (connectors/stac.py), rien d'autre à faire.
  - Un tout nouveau type de source → créer connectors/xxx.py sur le
    modèle de firms.py/earthquakes.py, puis l'ajouter ici.
"""
from __future__ import annotations

from app.cloud_sources.base import CloudConnector
from app.cloud_sources.connectors.earthquakes import EarthquakesConnector
from app.cloud_sources.connectors.eonet import EonetConnector
from app.cloud_sources.connectors.firms import FirmsConnector
from app.cloud_sources.connectors.gbif import GbifConnector
from app.cloud_sources.connectors.overpass import OverpassConnector
from app.cloud_sources.connectors.stac import STAC_ENDPOINTS, StacConnector
from app.cloud_sources.connectors.wfs import WFS_ENDPOINTS, WfsConnector
from app.cloud_sources.schemas import CloudCategory, CloudSourceOut

_connectors: dict[str, CloudConnector] = {}


def _register(connector: CloudConnector) -> None:
    _connectors[connector.source.id] = connector


_register(FirmsConnector())
_register(GbifConnector())
_register(EarthquakesConnector())
_register(EonetConnector())

# Overpass (OSM) couvre plusieurs catégories métier (agriculture, eau...) en
# plus d'OSM lui-même : on enregistre une instance par catégorie pertinente,
# chacune n'exposant que le sous-ensemble de préréglages qui la concerne.
for _osm_category in (CloudCategory.OSM, CloudCategory.AGRICULTURE, CloudCategory.WATER):
    _register(OverpassConnector(_osm_category))

for _wfs_id in WFS_ENDPOINTS:
    _register(WfsConnector(_wfs_id))
for _stac_id in STAC_ENDPOINTS:
    _register(StacConnector(_stac_id))


def get_connector(source_id: str) -> CloudConnector:
    connector = _connectors.get(source_id)
    if not connector:
        raise KeyError(f"Source cloud inconnue : {source_id}")
    return connector


def list_sources() -> list[CloudSourceOut]:
    return [c.source for c in _connectors.values()]
