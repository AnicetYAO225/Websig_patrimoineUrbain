from sqlalchemy.orm import Session
from app.models.feature_history import FeatureHistory

def log_feature_change(
    db: Session,
    feature_id: int,
    layer_id: int,
    action: str,
    properties_before: dict | None,
    properties_after: dict | None,
    changed_by_id: int | None,
):
    entry = FeatureHistory(
        feature_id=feature_id,
        layer_id=layer_id,
        action=action,
        properties_before=properties_before,
        properties_after=properties_after,
        changed_by_id=changed_by_id,
    )
    db.add(entry)