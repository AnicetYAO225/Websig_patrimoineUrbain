"""
Import des données géographiques réelles fournies par l'utilisateur.

Contrairement à `seed.py` (données fictives de démonstration), ce script
charge de vraies données territoriales officielles dans PostGIS :
- Contour de Saint-Étienne Métropole (EPCI)
- Communes membres de la métropole

Sources : fichiers GeoJSON fournis par l'utilisateur (issus de l'IGN),
reprojetés de Lambert-93 (EPSG:2154) vers WGS84 (EPSG:4326) et nettoyés
au préalable (voir la conversation de développement pour le détail).

Exécution :  docker compose exec backend python -m app.import_geodata
"""
import json
from pathlib import Path
from app.core.database import SessionLocal
from app.models.layer import GeometryType, Layer
from app.models.feature import Feature
from app.services import auth_service, gis_service
from app.core.config import settings

DATA_DIR = Path(__file__).parent.parent / "data"

LAYERS_TO_IMPORT = [
    {
        "file": "epci_saint_etienne_metropole.geojson",
        "layer": {
            "name": "Saint-Étienne Métropole",
            "slug": "epci_saint_etienne_metropole",
            "description": "Contour administratif de l'intercommunalité (EPCI)",
            "geometry_type": GeometryType.POLYGON,
            "source": "IGN - Admin Express",
            "source_date": "2026-07",
            "license": "Licence Ouverte / Etalab 2.0",
        },
    },
    {
        "file": "communes_saint_etienne_metropole.geojson",
        "layer": {
            "name": "Communes",
            "slug": "communes_saint_etienne_metropole",
            "description": "Limites administratives des 53 communes membres de la métropole",
            "geometry_type": GeometryType.POLYGON,
            "source": "IGN - Admin Express",
            "source_date": "2026-07",
            "license": "Licence Ouverte / Etalab 2.0",
        },
    },
]


def import_geodata():
    db = SessionLocal()
    try:
        admin = auth_service.get_user_by_email(db, settings.FIRST_SUPERADMIN_EMAIL)

        for entry in LAYERS_TO_IMPORT:
            filepath = DATA_DIR / entry["file"]
            if not filepath.exists():
                print(f"! Fichier introuvable, ignoré : {filepath}")
                continue

            geojson = json.loads(filepath.read_text(encoding="utf-8"))

            layer_def = entry["layer"]
            layer = db.query(Layer).filter(Layer.slug == layer_def["slug"]).first()
            if not layer:
                layer = Layer(
                    name=layer_def["name"],
                    slug=layer_def["slug"],
                    description=layer_def["description"],
                    geometry_type=layer_def["geometry_type"],
                    source=layer_def["source"],
                    source_date=layer_def["source_date"],
                    license=layer_def["license"],
                    created_by_id=admin.id if admin else None,
                )
                db.add(layer)
                db.commit()
                db.refresh(layer)
                print(f"✔ Couche créée : {layer.name}")
            else:
                print(f"… Couche déjà existante : {layer.name}, objets non réimportés")
                continue

            count = 0
            for feat in geojson["features"]:
                feature = Feature(
                    layer_id=layer.id,
                    geom=gis_service.geojson_geometry_to_wkbelement(feat["geometry"]),
                    properties=feat["properties"],
                    created_by_id=admin.id if admin else None,
                )
                db.add(feature)
                count += 1
            db.commit()
            print(f"  → {count} objet(s) importé(s)")

        print("\nImport terminé.")
    finally:
        db.close()


if __name__ == "__main__":
    import_geodata()
