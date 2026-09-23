import io
import zipfile
import shapefile  # pyshp
from shapely.geometry import mapping as shapely_mapping, shape
from shapely.ops import transform
from pyproj import CRS, Transformer


def parse_shapefile_zip(content: bytes) -> list[dict]:
    zf = zipfile.ZipFile(io.BytesIO(content))
    names = zf.namelist()

    def find(ext):
        matches = [n for n in names if n.lower().endswith(ext)]
        return matches[0] if matches else None

    shp_name = find(".shp")
    dbf_name = find(".dbf")
    shx_name = find(".shx")
    prj_name = find(".prj")

    if not shp_name or not dbf_name:
        raise ValueError("Le zip doit contenir au moins un fichier .shp et .dbf")

    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(shp_name)),
        dbf=io.BytesIO(zf.read(dbf_name)),
        shx=io.BytesIO(zf.read(shx_name)) if shx_name else None,
    )

    transformer = None
    if prj_name:
        try:
            source_crs = CRS.from_wkt(zf.read(prj_name).decode("utf-8", errors="replace"))
            if source_crs.to_epsg() != 4326:
                transformer = Transformer.from_crs(source_crs, CRS.from_epsg(4326), always_xy=True)
        except Exception:
            transformer = None  # projection illisible : on suppose déjà en WGS84

    field_names = [f[0] for f in reader.fields[1:]]  # 1er champ = DeletionFlag
    features = []

    for shape_rec in reader.iterShapeRecords():
        try:
            geom = shape(shape_rec.shape.__geo_interface__)
            if transformer:
                geom = transform(lambda x, y, z=None: transformer.transform(x, y), geom)
            props = dict(zip(field_names, shape_rec.record))
            features.append({"geometry": shapely_mapping(geom), "properties": props})
        except Exception:
            features.append({"geometry": {}, "properties": {}})

    return features