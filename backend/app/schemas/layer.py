from datetime import datetime

from pydantic import BaseModel, Field

from app.models.layer import GeometryType


class LayerCreate(BaseModel):
    name: str = Field(max_length=100)
    slug: str = Field(max_length=100, description="Identifiant technique unique, ex: 'street_lights'")
    description: str | None = None
    geometry_type: GeometryType
    is_visible: bool = True
    # Traçabilité : d'où vient la donnée, sous quelle licence
    source: str | None = Field(default=None, max_length=200)
    source_date: str | None = Field(default=None, max_length=20, description="ex: '2026-07'")
    license: str | None = Field(default=None, max_length=200)


class LayerUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_visible: bool | None = None
    source: str | None = None
    source_date: str | None = None
    license: str | None = None
    style_config: dict | None = None


class LayerOut(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    geometry_type: GeometryType
    srid: int
    is_visible: bool
    source: str | None = None
    source_date: str | None = None
    license: str | None = None
    created_at: datetime
    feature_count: int = 0
    style_config: dict | None = None

    class Config:
        from_attributes = True
