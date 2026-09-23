import json
from sqlalchemy.orm import aliased
from geoalchemy2.functions import ST_Intersects
from app.services import history_service
from sqlalchemy import func
from geoalchemy2.functions import ST_Intersection, ST_Length, ST_Transform, ST_Contains, ST_MakeValid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session


from fastapi import Form
from fastapi.responses import JSONResponse
from app.services import tabular_import_service, shapefile_import_service

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.feature import Feature
from app.models.layer import Layer
from app.models.user import User, UserRole
from app.schemas.feature import FeatureCreate, FeatureUpdate, ImportResult
from app.services import gis_service

from typing import Literal
from pydantic import BaseModel

import io
import zipfile
from fastapi.responses import Response

class ExtractionRequest(BaseModel):
    within_layer_id: int
    within_feature_id: int | None = None
    predicate: Literal["within", "intersects", "contains"] = "within"
    format: Literal["geojson", "csv", "xlsx", "shapefile"] = "geojson"

class AttributeJoinRequest(BaseModel):
    source_layer_id: int
    target_key_field: str
    source_key_field: str
    fields: list[str] | None = None  # None = tous les attributs de la source

class SpatialJoinRequest(BaseModel):
    source_layer_id: int
    predicate: Literal["intersects", "within", "contains"] = "intersects"
    fields: list[str] | None = None

class JoinResult(BaseModel):
    updated_count: int
    unmatched_count: int

router = APIRouter(tags=["Objets géographiques (Features)"])

# Lecture ouverte à tous les rôles connectés (le CITIZEN doit voir la carte)
can_read = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT, UserRole.CITIZEN)
# Création/édition : agents de terrain + administrateurs (pas les simples citoyens)
can_write = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT)
# Import en masse : action d'administration des données, réservée ADMIN+
can_import = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)

MAX_IMPORT_FEATURES = 20_000  # garde-fou raisonnable pour un import en un seul appel


def _get_layer_or_404(db: Session, layer_id: int) -> Layer:
    layer = db.query(Layer).filter(Layer.id == layer_id).first()
    if not layer:
        raise HTTPException(status_code=404, detail="Couche introuvable")
    return layer

from app.models.feature_history import FeatureHistory

def serialize_features(features: list[Feature], fmt: str, base_name: str) -> tuple[bytes, str, str]:
    if fmt == "geojson":
        content = json.dumps(gis_service.features_to_feature_collection(features), ensure_ascii=False).encode("utf-8")
        return content, "application/geo+json", f"{base_name}.geojson"

    if fmt in ("csv", "xlsx"):
        import pandas as pd
        from shapely.geometry import shape

        rows = []
        for f in features:
            geo = gis_service.feature_to_geojson(f)
            row = dict(geo["properties"])
            geom = geo["geometry"]
            if geom["type"] == "Point":
                row["longitude"], row["latitude"] = geom["coordinates"]
            else:
                row["wkt"] = shape(geom).wkt
            rows.append(row)
        df = pd.DataFrame(rows)

        if fmt == "csv":
            buf = io.StringIO()
            df.to_csv(buf, index=False)
            return buf.getvalue().encode("utf-8-sig"), "text/csv", f"{base_name}.csv"
        else:
            buf = io.BytesIO()
            df.to_excel(buf, index=False, engine="openpyxl")
            return (
                buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                f"{base_name}.xlsx",
            )

    if fmt == "shapefile":
        return _build_shapefile_zip(features, base_name), "application/zip", f"{base_name}.zip"

    raise ValueError(f"Format d'export inconnu : {fmt}")


def _build_shapefile_zip(features: list[Feature], base_name: str) -> bytes:
    import shapefile
    from shapely.geometry import shape

    if not features:
        raise ValueError("Aucun objet à exporter")

    geo_features = [gis_service.feature_to_geojson(f) for f in features]
    geom_type = geo_features[0]["geometry"]["type"]
    shp_type = (
        shapefile.POINT if "Point" in geom_type
        else shapefile.POLYLINE if "LineString" in geom_type
        else shapefile.POLYGON
    )

    all_keys: list[str] = []
    for gf in geo_features:
        for k in gf["properties"]:
            if k not in all_keys and k not in ("layer_id", "created_at", "updated_at"):
                all_keys.append(k)

    buf_shp, buf_shx, buf_dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    writer = shapefile.Writer(shp=buf_shp, shx=buf_shx, dbf=buf_dbf, shapeType=shp_type)
    for key in all_keys:
        writer.field(key[:10], "C", size=254)  # DBF : noms limités à 10 caractères

    for gf in geo_features:
        geom = shape(gf["geometry"])
        if shp_type == shapefile.POINT:
            writer.point(geom.x, geom.y)
        elif shp_type == shapefile.POLYLINE:
            lines = [list(geom.coords)] if geom.geom_type == "LineString" else [list(g.coords) for g in geom.geoms]
            writer.line(lines)
        else:
            polys = (
                [list(geom.exterior.coords)]
                if geom.geom_type == "Polygon"
                else [list(p.exterior.coords) for p in geom.geoms]
            )
            writer.poly(polys)
        writer.record(*[str(gf["properties"].get(k, "")) for k in all_keys])

    writer.close()

    prj_content = (
        'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
        'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
    )
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{base_name}.shp", buf_shp.getvalue())
        zf.writestr(f"{base_name}.shx", buf_shx.getvalue())
        zf.writestr(f"{base_name}.dbf", buf_dbf.getvalue())
        zf.writestr(f"{base_name}.prj", prj_content)
    return zip_buf.getvalue()

@router.get("/api/layers/{layer_id}/export")
def export_layer(
    layer_id: int,
    format: Literal["geojson", "csv", "xlsx", "shapefile"] = "geojson",
    db: Session = Depends(get_db),
    _: User = Depends(can_read),
):
    layer = _get_layer_or_404(db, layer_id)
    features = db.query(Feature).filter(Feature.layer_id == layer.id).all()
    try:
        content, media_type, filename = serialize_features(features, format, layer.slug)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Export impossible : {exc}")
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/api/layers/{layer_id}/extract")
def extract_features(
    layer_id: int,
    payload: ExtractionRequest,
    db: Session = Depends(get_db),
    _: User = Depends(can_read),
):
    from shapely.geometry import shape

    layer = _get_layer_or_404(db, layer_id)
    features = db.query(Feature).filter(Feature.layer_id == layer.id).all()

    if payload.within_feature_id is not None:
        ref_feature = db.query(Feature).filter(Feature.id == payload.within_feature_id).first()
        if not ref_feature:
            raise HTTPException(status_code=404, detail="Objet de référence introuvable")
        ref_shapes = [shape(gis_service.feature_to_geojson(ref_feature)["geometry"])]
    else:
        ref_layer = _get_layer_or_404(db, payload.within_layer_id)
        ref_features = db.query(Feature).filter(Feature.layer_id == ref_layer.id).all()
        ref_shapes = [shape(gis_service.feature_to_geojson(rf)["geometry"]) for rf in ref_features]

    extracted: list[Feature] = []
    for f in features:
        try:
            fgeom = shape(gis_service.feature_to_geojson(f)["geometry"])
        except Exception:
            continue
        for rshape in ref_shapes:
            try:
                is_match = (
                    (payload.predicate == "within" and fgeom.within(rshape))
                    or (payload.predicate == "intersects" and fgeom.intersects(rshape))
                    or (payload.predicate == "contains" and fgeom.contains(rshape))
                )
            except Exception:
                continue
            if is_match:
                extracted.append(f)
                break

    try:
        content, media_type, filename = serialize_features(extracted, payload.format, f"{layer.slug}_extraction")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Extraction impossible : {exc}")

    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})

@router.get("/api/features/{feature_id}/history")
def get_feature_history(feature_id: int, db: Session = Depends(get_db), _: User = Depends(can_read)):
    entries = (
        db.query(FeatureHistory)
        .filter(FeatureHistory.feature_id == feature_id)
        .order_by(FeatureHistory.changed_at.desc())
        .all()
    )
    return [
        {
            "id": e.id,
            "action": e.action,
            "properties_before": e.properties_before,
            "properties_after": e.properties_after,
            "changed_by_id": e.changed_by_id,
            "changed_at": e.changed_at.isoformat(),
        }
        for e in entries
    ]
    
@router.post("/api/layers/{layer_id}/features/import-tabular")
async def import_tabular_features(
    layer_id: int,
    file: UploadFile,
    lat_field: str | None = Form(default=None),
    lon_field: str | None = Form(default=None),
    wkt_field: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(can_import),
):
    layer = _get_layer_or_404(db, layer_id)
    content = await file.read()
    try:
        df = tabular_import_service.read_tabular_file(content, file.filename or "")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Fichier illisible : {exc}")

    if wkt_field:
        mapping = {"type": "wkt", "wkt_field": wkt_field}
    elif lat_field and lon_field:
        mapping = {"type": "latlon", "lat_field": lat_field, "lon_field": lon_field}
    else:
        mapping = tabular_import_service.detect_geometry_mapping(list(df.columns))

    if mapping is None:
        return JSONResponse(status_code=422, content={"needs_mapping": True, "columns": list(df.columns)})

    raw_features = tabular_import_service.dataframe_to_raw_features(df, mapping)
    return _bulk_insert_features(db, layer, raw_features, current_user)


@router.post("/api/layers/{layer_id}/features/import-shapefile")
async def import_shapefile(
    layer_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(can_import),
):
    layer = _get_layer_or_404(db, layer_id)
    content = await file.read()
    try:
        raw_features = shapefile_import_service.parse_shapefile_zip(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Shapefile illisible : {exc}")
    return _bulk_insert_features(db, layer, raw_features, current_user)

@router.get("/api/layers/{layer_id}/features")
def list_features(
    layer_id: int,
    bbox: str | None = Query(
        default=None,
        description="Filtre spatial optionnel 'minLon,minLat,maxLon,maxLat' (ex: pour ne charger que la zone visible de la carte)",
    ),
    db: Session = Depends(get_db),
    _: User = Depends(can_read),
):
    """
    Retourne les objets d'une couche au format GeoJSON FeatureCollection,
    directement exploitable par Leaflet (`L.geoJSON(data).addTo(map)`).
    """
    layer = _get_layer_or_404(db, layer_id)

    query = db.query(Feature).filter(Feature.layer_id == layer.id)

    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
        except ValueError:
            raise HTTPException(status_code=400, detail="Format bbox invalide, attendu: minLon,minLat,maxLon,maxLat")
        # ST_MakeEnvelope + ST_Intersects : filtre spatial exécuté côté PostGIS
        # (beaucoup plus performant que de filtrer en Python)
        from geoalchemy2.functions import ST_Intersects, ST_MakeEnvelope

        envelope = ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
        query = query.filter(ST_Intersects(Feature.geom, envelope))

    features = query.all()
    return gis_service.features_to_feature_collection(features)
from geoalchemy2.functions import ST_DWithin, ST_Intersects, ST_Transform

def _bulk_insert_features(
    db: Session,
    layer: Layer,
    raw_features: list[dict],
    current_user: User,
    max_count: int = MAX_IMPORT_FEATURES,
) -> ImportResult:
    if len(raw_features) > max_count:
        raise HTTPException(status_code=400, detail=f"Trop d'objets (max {max_count} par import)")

    imported = 0
    errors: list[str] = []
    to_insert: list[Feature] = []

    for i, feat in enumerate(raw_features):
        geometry = feat.get("geometry") or {}
        if not gis_service.validate_geometry_type(geometry, layer.geometry_type.value):
            errors.append(
                f"Objet #{i + 1} ignoré : géométrie '{geometry.get('type', '?')}' "
                f"incompatible avec la couche ('{layer.geometry_type.value}' attendu)"
            )
            continue
        try:
            to_insert.append(
                Feature(
                    layer_id=layer.id,
                    geom=gis_service.geojson_geometry_to_wkbelement(geometry, srid=layer.srid),
                    properties=feat.get("properties") or {},
                    created_by_id=current_user.id,
                )
            )
        except Exception as exc:
            errors.append(f"Objet #{i + 1} ignoré : géométrie invalide ({exc})")

    if to_insert:
        db.bulk_save_objects(to_insert)
        db.commit()
        imported = len(to_insert)

    return ImportResult(imported_count=imported, skipped_count=len(raw_features) - imported, errors=errors[:50])
@router.get("/api/layers/{layer_id}/features/search")
def search_features_spatial(
    layer_id: int,
    lng: float | None = Query(default=None, description="Longitude du centre (recherche par rayon)"),
    lat: float | None = Query(default=None, description="Latitude du centre (recherche par rayon)"),
    radius_m: float | None = Query(default=None, description="Rayon de recherche en mètres"),
    intersects_layer_id: int | None = Query(default=None, description="Filtre : objets intersectant cette autre couche"),
    db: Session = Depends(get_db),
    _: User = Depends(can_read),
):
    layer = _get_layer_or_404(db, layer_id)
    query = db.query(Feature).filter(Feature.layer_id == layer.id)

    if lng is not None and lat is not None and radius_m is not None:
        query = query.filter(gis_service.within_radius_filter(Feature.geom, lng, lat, radius_m))

    if intersects_layer_id is not None:
        other_layer = _get_layer_or_404(db, intersects_layer_id)
        OtherFeature = aliased(Feature)
        query = query.filter(
            db.query(OtherFeature.id)
            .filter(OtherFeature.layer_id == other_layer.id)
            .filter(ST_Intersects(Feature.geom, OtherFeature.geom))
            .exists()
        )

    features = query.all()
    return gis_service.features_to_feature_collection(features)

@router.get("/api/layers/{layer_id}/features/search")
def search_features_spatial(
    layer_id: int,
    lng: float | None = Query(default=None, description="Longitude du centre (recherche par rayon)"),
    lat: float | None = Query(default=None, description="Latitude du centre (recherche par rayon)"),
    radius_m: float | None = Query(default=None, description="Rayon de recherche en mètres"),
    intersects_layer_id: int | None = Query(default=None, description="Filtre : objets intersectant cette autre couche"),
    db: Session = Depends(get_db),
    _: User = Depends(can_read),
):
    layer = _get_layer_or_404(db, layer_id)
    query = db.query(Feature).filter(Feature.layer_id == layer.id)

    if lng is not None and lat is not None and radius_m is not None:
        # ST_DWithin sur géographie : distance directe en mètres, fiable même
        # avec des données en lat/lng (SRID 4326).
        point = f"SRID=4326;POINT({lng} {lat})"
        query = query.filter(
            ST_DWithin(
                gis_service.cast_to_geography(Feature.geom),
                gis_service.cast_to_geography(point),
                radius_m,
            )
        )

    if intersects_layer_id is not None:
        other_layer = _get_layer_or_404(db, intersects_layer_id)
        other_geoms = db.query(Feature.geom).filter(Feature.layer_id == other_layer.id).subquery()
        query = query.filter(
            db.query(other_geoms).filter(ST_Intersects(Feature.geom, other_geoms.c.geom)).exists()
        )

    features = query.all()
    return gis_service.features_to_feature_collection(features)


@router.post("/api/layers/{layer_id}/features", status_code=status.HTTP_201_CREATED)
def create_feature(
    layer_id: int,
    payload: FeatureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(can_write),
):
    layer = _get_layer_or_404(db, layer_id)

    geometry_dict = payload.geometry.model_dump()
    if not gis_service.validate_geometry_type(geometry_dict, layer.geometry_type.value):
        raise HTTPException(
            status_code=400,
            detail=f"Cette couche attend une géométrie de type '{layer.geometry_type.value}', reçu '{geometry_dict.get('type')}'",
        )

    feature = Feature(
        layer_id=layer.id,
        geom=gis_service.geojson_geometry_to_wkbelement(geometry_dict, srid=layer.srid),
        properties=payload.properties,
        created_by_id=current_user.id,
    )
    db.add(feature)
    db.commit()
    db.refresh(feature)
    history_service.log_feature_change(
    db, feature.id, layer.id, "created", None, feature.properties, current_user.id
    )
    db.commit()
    return gis_service.feature_to_geojson(feature)


@router.post("/api/layers/{layer_id}/features/import", response_model=ImportResult, status_code=status.HTTP_201_CREATED)
async def import_features(
    layer_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(can_import),
):
    layer = _get_layer_or_404(db, layer_id)
    raw = await file.read()
    try:
        geojson = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Fichier illisible : ce n'est pas un JSON valide")
    if geojson.get("type") != "FeatureCollection" or not isinstance(geojson.get("features"), list):
        raise HTTPException(status_code=400, detail="Le fichier doit être un GeoJSON de type FeatureCollection")
    return _bulk_insert_features(db, layer, geojson["features"], current_user)


@router.put("/api/features/{feature_id}")
def update_feature(
    feature_id: int,
    payload: FeatureUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(can_write),
):
    feature = db.query(Feature).filter(Feature.id == feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Objet introuvable")

    if payload.geometry is not None:
        geometry_dict = payload.geometry.model_dump()
        layer = db.query(Layer).filter(Layer.id == feature.layer_id).first()
        if not gis_service.validate_geometry_type(geometry_dict, layer.geometry_type.value):
            raise HTTPException(status_code=400, detail="Type de géométrie incompatible avec la couche")
        feature.geom = gis_service.geojson_geometry_to_wkbelement(geometry_dict, srid=layer.srid)

    properties_before = dict(feature.properties or {})

    if payload.properties is not None:
        feature.properties = payload.properties

    db.commit()
    db.refresh(feature)

    history_service.log_feature_change(
        db, feature.id, feature.layer_id, "updated", properties_before, feature.properties, None
    )
    db.commit()
    return gis_service.feature_to_geojson(feature)

@router.post("/api/layers/{layer_id}/join-attribute", response_model=JoinResult)
def join_attribute(
    layer_id: int,
    payload: AttributeJoinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(can_write),
):
    target_layer = _get_layer_or_404(db, layer_id)
    source_layer = _get_layer_or_404(db, payload.source_layer_id)

    target_features = db.query(Feature).filter(Feature.layer_id == target_layer.id).all()
    source_features = db.query(Feature).filter(Feature.layer_id == source_layer.id).all()

    # Index de la source par valeur de clé (comparaison en texte pour
    # tolérer les écarts str/nombre, ex: "42101" vs 42101)
    source_index: dict[str, dict] = {}
    for sf in source_features:
        key_val = (sf.properties or {}).get(payload.source_key_field)
        if key_val is not None:
            source_index[str(key_val)] = sf.properties or {}

    updated = 0
    unmatched = 0
    for tf in target_features:
        key_val = (tf.properties or {}).get(payload.target_key_field)
        match = source_index.get(str(key_val)) if key_val is not None else None
        if match:
            selected = {k: v for k, v in match.items() if not payload.fields or k in payload.fields}
            before = dict(tf.properties or {})
            tf.properties = {**(tf.properties or {}), **selected}
            history_service.log_feature_change(db, tf.id, tf.layer_id, "updated", before, tf.properties, current_user.id)
            updated += 1
        else:
            unmatched += 1

    db.commit()
    return JoinResult(updated_count=updated, unmatched_count=unmatched)


@router.post("/api/layers/{layer_id}/join-spatial", response_model=JoinResult)
def join_spatial(
    layer_id: int,
    payload: SpatialJoinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(can_write),
):
    from shapely.geometry import shape

    target_layer = _get_layer_or_404(db, layer_id)
    source_layer = _get_layer_or_404(db, payload.source_layer_id)

    target_features = db.query(Feature).filter(Feature.layer_id == target_layer.id).all()
    source_features = db.query(Feature).filter(Feature.layer_id == source_layer.id).all()

    source_shapes = [
        (shape(gis_service.feature_to_geojson(sf)["geometry"]), sf.properties or {})
        for sf in source_features
    ]

    updated = 0
    unmatched = 0
    for tf in target_features:
        try:
            tgeom = shape(gis_service.feature_to_geojson(tf)["geometry"])
        except Exception:
            unmatched += 1
            continue

        match_props = None
        for sgeom, sprops in source_shapes:
            try:
                is_match = (
                    (payload.predicate == "intersects" and tgeom.intersects(sgeom))
                    or (payload.predicate == "within" and tgeom.within(sgeom))
                    or (payload.predicate == "contains" and tgeom.contains(sgeom))
                )
            except Exception:
                continue
            if is_match:
                match_props = sprops
                break

        if match_props:
            selected = {k: v for k, v in match_props.items() if not payload.fields or k in payload.fields}
            before = dict(tf.properties or {})
            tf.properties = {**(tf.properties or {}), **selected}
            history_service.log_feature_change(db, tf.id, tf.layer_id, "updated", before, tf.properties, current_user.id)
            updated += 1
        else:
            unmatched += 1

    db.commit()
    return JoinResult(updated_count=updated, unmatched_count=unmatched)


@router.delete("/api/features/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feature(feature_id: int, db: Session = Depends(get_db), _: User = Depends(can_write)):
    feature = db.query(Feature).filter(Feature.id == feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Objet introuvable")

    history_service.log_feature_change(
        db, feature.id, feature.layer_id, "deleted", feature.properties, None, _.id
    )
    db.delete(feature)
    db.commit()
    
# RGF93 / Lambert-93 : système de projection officiel français, adapté au
# calcul précis de longueurs/surfaces en mètres sur le territoire métropolitain
# (bien plus précis ici que le Web Mercator ou un calcul en "geography" brut).
FRENCH_METRIC_SRID = 2154


@router.get("/api/stats/zone-summary")
def zone_summary(
    zone_layer_id: int,
    target_layer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(can_read),
):
    """
    Calcule, pour chaque objet de `zone_layer_id` (couche de polygones —
    communes, quartiers...), une statistique sur `target_layer_id` :
    - nombre d'objets contenus, si la couche cible est de type Point
    - longueur totale (km) réellement contenue, si la couche cible est de
      type LineString (découpage géométrique exact via ST_Intersection,
      pas une approximation)
    """
    zone_layer = _get_layer_or_404(db, zone_layer_id)
    target_layer = _get_layer_or_404(db, target_layer_id)

    zones = db.query(Feature).filter(Feature.layer_id == zone_layer.id).all()
    results = []

    if target_layer.geometry_type.value == "Point":
        for zone in zones:
            count = (
                db.query(func.count(Feature.id))
                .filter(Feature.layer_id == target_layer.id)
                .filter(ST_Contains(zone.geom, Feature.geom))
                .scalar()
            )
            results.append({
                "zone_id": zone.id,
                "zone_name": _zone_name(zone),
                "count": count or 0,
            })

    elif target_layer.geometry_type.value == "LineString":
        for zone in zones:
            try:
                total_length_m = (
                    db.query(
                        func.coalesce(
                            func.sum(
                                ST_Length(
                                    ST_Transform(
                                        ST_Intersection(
                                            ST_MakeValid(Feature.geom),
                                            ST_MakeValid(zone.geom),
                                        ),
                                        FRENCH_METRIC_SRID,
                                    )
                                )
                            ),
                            0,
                        )
                    )
                    .filter(Feature.layer_id == target_layer.id)
                    # Pré-filtre via l'index spatial : ne calcule
                    # l'intersection précise que pour les lignes qui
                    # touchent réellement la zone (évite un calcul inutile
                    # sur l'ensemble de la couche à chaque itération).
                    .filter(Feature.geom.intersects(zone.geom))
                    .scalar()
                )
            except Exception as exc:
                # Une géométrie invalide ponctuelle (topologie auto-intersectante,
                # fréquent sur des données réelles) ne doit jamais faire échouer
                # tout le calcul des autres zones.
                total_length_m = 0

            results.append({
                "zone_id": zone.id,
                "zone_name": _zone_name(zone),
                "length_km": round((total_length_m or 0) / 1000, 3),
            })

    else:
        raise HTTPException(
            status_code=400,
            detail="Type de couche cible non pris en charge pour cette statistique (Point ou LineString attendu)",
        )

    return {"zone_layer": zone_layer.name, "target_layer": target_layer.name, "results": results}


def _zone_name(zone: Feature) -> str:
    props = zone.properties or {}
    return props.get("nom") or props.get("name") or props.get("NOM") or props.get("libelle") or f"Zone #{zone.id}"
