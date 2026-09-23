"""
Configuration pytest partagee.

IMPORTANT : les variables d'environnement de test doivent etre fixees
AVANT tout `import app...`, car `app/core/config.py` lit l'environnement
au moment de l'import (settings = get_settings()).

Strategie d'isolation : plutot qu'une transaction par test (complexe a
faire cohabiter avec les `db.commit()` internes aux routes), on vide
simplement toutes les tables apres chaque test. Plus simple, tout aussi
fiable, et suffisant pour la taille de ce projet.
"""
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:anicet94@localhost:5432/websig_patrimoine_test",
)
os.environ.setdefault("SECRET_KEY", "test_secret_key_do_not_use_in_production")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.config import settings
from app.main import app
from app.models.user import User, UserRole
from app.services import auth_service

engine = create_engine(settings.DATABASE_URL)
TestingSessionLocal = sessionmaker(bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Cree le schema une fois pour toute la session de tests, le supprime a la fin."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def clean_tables():
    """Vide toutes les tables apres chaque test pour ne jamais polluer le suivant."""
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture()
def db_session():
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture()
def client(db_session):
    """Client HTTP FastAPI branche sur la session de test (override de get_db)."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_user(db_session, *, username: str, email: str, password: str, role: UserRole) -> User:
    return auth_service.create_user(db_session, username=username, email=email, password=password, role=role)


def auth_headers(client: TestClient, email: str, password: str) -> dict:
    """Se connecte via l'API et retourne le header Authorization pret a l'emploi."""
    resp = client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
