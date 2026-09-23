from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base  # ⚠️ adapter ce import si ma base est ailleurs 

class FeatureHistory(Base):
    __tablename__ = "feature_history"

    id = Column(Integer, primary_key=True, index=True)
    feature_id = Column(Integer, index=True, nullable=False)
    layer_id = Column(Integer, ForeignKey("layers.id"), nullable=False)
    action = Column(String(20), nullable=False)  # "created" | "updated" | "deleted"
    properties_before = Column(JSON, nullable=True)
    properties_after = Column(JSON, nullable=True)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False)