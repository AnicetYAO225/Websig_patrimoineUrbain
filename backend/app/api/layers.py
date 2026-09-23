from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.feature import Feature
from app.models.layer import Layer
from app.models.user import User, UserRole
from app.schemas.layer import LayerCreate, LayerOut, LayerUpdate
from app.models.feature_history import FeatureHistory

router = APIRouter(prefix="/api/layers", tags=["Couches SIG"])

# Lecture : accessible à tout utilisateur authentifié (y compris CITOYEN)
can_read = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT, UserRole.CITIZEN)
# Écriture : réservée aux administrateurs (la structure des couches est sensible)
can_write = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get("", response_model=list[LayerOut])
def list_layers(db: Session = Depends(get_db), _: User = Depends(can_read)):
    """Liste des couches avec le nombre d'objets qu'elles contiennent."""
    rows = (
        db.query(Layer, func.count(Feature.id).label("feature_count"))
        .outerjoin(Feature, Feature.layer_id == Layer.id)
        .group_by(Layer.id)
        .order_by(Layer.id)
        .all()
    )
    results = []
    for layer, count in rows:
        out = LayerOut.model_validate(layer)
        out.feature_count = count
        results.append(out)
    return results


@router.post("", response_model=LayerOut, status_code=status.HTTP_201_CREATED)
def create_layer(payload: LayerCreate, db: Session = Depends(get_db), current_user: User = Depends(can_write)):
    if db.query(Layer).filter(Layer.slug == payload.slug).first():
        raise HTTPException(status_code=400, detail="Ce slug de couche existe déjà")

    layer = Layer(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        geometry_type=payload.geometry_type,
        is_visible=payload.is_visible,
        source=payload.source,
        source_date=payload.source_date,
        license=payload.license,
        created_by_id=current_user.id,
    )
    db.add(layer)
    db.commit()
    db.refresh(layer)
    return layer


@router.put("/{layer_id}", response_model=LayerOut)
def update_layer(
    layer_id: int, payload: LayerUpdate, db: Session = Depends(get_db), _: User = Depends(can_write)
):
    layer = db.query(Layer).filter(Layer.id == layer_id).first()
    if not layer:
        raise HTTPException(status_code=404, detail="Couche introuvable")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(layer, field, value)

    db.commit()
    db.refresh(layer)
    return layer


@router.delete("/{layer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_layer(
    layer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(can_write),
):
    layer = db.query(Layer).filter(Layer.id == layer_id).first()

    if not layer:
        raise HTTPException(status_code=404, detail="Couche introuvable")

    try:
        db.query(FeatureHistory).filter(
            FeatureHistory.layer_id == layer_id
        ).delete(synchronize_session=False)

        db.delete(layer)

        db.commit()

    except Exception:
        db.rollback()
        raise