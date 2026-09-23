"""
Modèle Feature (objet géographique concret : un lampadaire, un bâtiment...).

- `geom` est une colonne PostGIS (via GeoAlchemy2), stockée en SRID 4326
  (WGS84 = coordonnées GPS standard, compatibles OpenStreetMap/Leaflet).
- `properties` est un champ JSONB : il stocke les attributs libres de
  l'objet (état, date d'installation, etc.) sans devoir créer une table
  par type d'équipement. C'est ce qui rend le modèle Layer/Feature
  générique et facilement extensible.
"""
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Feature(Base):
    __tablename__ = "features"

    id: Mapped[int] = mapped_column(primary_key=True)
    layer_id: Mapped[int] = mapped_column(ForeignKey("layers.id"), nullable=False, index=True)

    # geometry générique (accepte Point/LineString/Polygon) ; la cohérence
    # avec layer.geometry_type est vérifiée au niveau applicatif (schemas/service)
    geom = mapped_column(Geometry(geometry_type="GEOMETRY", srid=4326), nullable=False)

    properties: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    layer: Mapped["Layer"] = relationship(back_populates="features")

    def __repr__(self) -> str:
        return f"<Feature id={self.id} layer_id={self.layer_id}>"
