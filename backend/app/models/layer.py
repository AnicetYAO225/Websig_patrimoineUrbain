"""
Modèle Layer (couche SIG).

Une "couche" (Layer) dans le dossier models regroupe des objets géographiques (Features) de même
nature métier : ex. "Éclairage public", "Espaces verts", "Bâtiments"...
Le type de géométrie (Point / LineString / Polygon) est stocké pour
validation et pour que le frontend sache comment afficher la couche.
"""
import enum
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GeometryType(str, enum.Enum):
    POINT = "Point"
    LINESTRING = "LineString"
    POLYGON = "Polygon"


class Layer(Base):
    __tablename__ = "layers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)  # ex: "street_lights"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    geometry_type: Mapped[GeometryType] = mapped_column(Enum(GeometryType), nullable=False)
    srid: Mapped[int] = mapped_column(Integer, default=4326)  # WGS84, standard GPS/web
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)

    # Configuration de symbologie (couleur unique ou par attribut), gérée
    # et interprétée côté frontend — le backend la stocke telle quelle sans
    # en connaître la structure interne.
    style_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # --- Traçabilité des données (cahier des charges §7-8) ---
    # Permet de savoir d'où vient chaque couche, à quelle date elle a été
    # récupérée, et sous quelle licence — indispensable pour des données
    # territoriales officielles (IGN, data.gouv.fr, OSM...).
    source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_date: Mapped[str | None] = mapped_column(String(50), nullable=True)  # format libre, ex: "2026-07" ou un ISO 8601 complet
    license: Mapped[str | None] = mapped_column(String(200), nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    features: Mapped[list["Feature"]] = relationship(
        back_populates="layer", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Layer id={self.id} name={self.name} type={self.geometry_type}>"
