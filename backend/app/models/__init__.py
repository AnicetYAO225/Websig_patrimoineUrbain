"""
Ce fichier importe tous les modeles pour qu'ils soient enregistres sur
`Base.metadata` -- indispensable pour qu'Alembic (autogenerate) et
`Base.metadata.create_all()` les detectent correctement.
"""
from app.models.user import User, UserRole  # noqa: F401
from app.models.layer import Layer, GeometryType  # noqa: F401
from app.models.feature import Feature  # noqa: F401
from app.models.feature_history import FeatureHistory
