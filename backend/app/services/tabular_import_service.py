import io
import pandas as pd

LAT_CANDIDATES = ["lat", "latitude", "y"]
LON_CANDIDATES = ["lon", "lng", "long", "longitude", "x"]
WKT_CANDIDATES = ["geometry", "geom", "wkt"]


def read_tabular_file(content: bytes, filename: str) -> pd.DataFrame:
    if filename.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content))
    text = content.decode("utf-8-sig", errors="replace")
    try:
        return pd.read_csv(io.StringIO(text))
    except Exception:
        return pd.read_csv(io.StringIO(text), sep=";")


def detect_geometry_mapping(columns: list[str]) -> dict | None:
    lower = {c.lower(): c for c in columns}
    for cand in WKT_CANDIDATES:
        if cand in lower:
            return {"type": "wkt", "wkt_field": lower[cand]}
    lat_col = next((lower[c] for c in LAT_CANDIDATES if c in lower), None)
    lon_col = next((lower[c] for c in LON_CANDIDATES if c in lower), None)
    if lat_col and lon_col:
        return {"type": "latlon", "lat_field": lat_col, "lon_field": lon_col}
    return None


def dataframe_to_raw_features(df: pd.DataFrame, mapping: dict) -> list[dict]:
    from shapely import wkt as shapely_wkt
    from shapely.geometry import Point, mapping as shapely_mapping

    features = []
    for _, row in df.iterrows():
        props = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        try:
            if mapping["type"] == "wkt":
                geom = shapely_wkt.loads(str(row[mapping["wkt_field"]]))
                props.pop(mapping["wkt_field"], None)
            else:
                lat = float(row[mapping["lat_field"]])
                lon = float(row[mapping["lon_field"]])
                geom = Point(lon, lat)
                props.pop(mapping["lat_field"], None)
                props.pop(mapping["lon_field"], None)
            features.append({"geometry": shapely_mapping(geom), "properties": props})
        except Exception:
            # ligne invalide : conservée avec géométrie vide pour être
            # comptée dans skipped_count par le helper d'insertion
            features.append({"geometry": {}, "properties": props})
    return features