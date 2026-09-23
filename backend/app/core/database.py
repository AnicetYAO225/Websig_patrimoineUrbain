"""
Configuration de la connexion SQLAlchemy vers PostgreSQL/PostGIS.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

# pool_pre_ping=True : vérifie que la connexion est toujours vivante avant de
# l'utiliser (évite les erreurs "connexion fermée" après une inactivité).
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Classe de base pour tous les modèles SQLAlchemy de l'application."""
    pass


def get_db():
    """
    Dependency FastAPI : fournit une session DB par requête et la ferme
    systématiquement à la fin (même en cas d'exception).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
