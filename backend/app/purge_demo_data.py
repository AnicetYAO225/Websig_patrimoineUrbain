"""
Supprime les couches de démonstration (et leurs objets) d'une base déjà
initialisée avec l'ancienne version de `seed.py`.

À exécuter une seule fois sur une installation existante :

    docker compose exec backend python -m app.purge_demo_data

Les vraies données (ex: Saint-Étienne Métropole, importées via
`app.import_geodata`) ne sont jamais touchées par ce script — seules les
couches listées ci-dessous, identifiées par leur slug de démonstration,
sont supprimées.
"""
from app.core.database import SessionLocal
from app.models.layer import Layer

DEMO_SLUGS = [
    "buildings",
    "roads",
    "street_lights",
    "green_spaces",
    "waste_containers",
    "bus_stops",
]


def purge_demo_data():
    db = SessionLocal()
    try:
        removed = 0
        for slug in DEMO_SLUGS:
            layer = db.query(Layer).filter(Layer.slug == slug).first()
            if layer:
                name = layer.name
                # cascade="all, delete-orphan" sur Layer.features supprime aussi
                # tous les objets géographiques de la couche.
                db.delete(layer)
                db.commit()
                print(f"✔ Couche de démo supprimée : {name}")
                removed += 1
        if removed == 0:
            print("Aucune couche de démonstration trouvée — rien à supprimer.")
        else:
            print(f"\n{removed} couche(s) de démonstration supprimée(s).")
    finally:
        db.close()


if __name__ == "__main__":
    purge_demo_data()
