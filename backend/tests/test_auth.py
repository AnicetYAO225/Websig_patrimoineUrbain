from app.models.user import UserRole
from tests.conftest import auth_headers, create_user


def test_register_creates_citizen_user(client):
    resp = client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "alice@example.com", "password": "Password123"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["username"] == "alice"
    assert data["role"] == "CITIZEN"  # le rôle par défaut, jamais choisi par l'utilisateur
    assert "hashed_password" not in data  # le hash ne doit jamais fuiter dans la réponse


def test_register_rejects_duplicate_email(client):
    client.post(
        "/api/auth/register",
        json={"username": "bob", "email": "bob@example.com", "password": "Password123"},
    )
    resp = client.post(
        "/api/auth/register",
        json={"username": "bob2", "email": "bob@example.com", "password": "Password123"},
    )
    assert resp.status_code == 400


def test_login_success(client, db_session):
    create_user(db_session, username="carla", email="carla@example.com", password="Password123", role=UserRole.CITIZEN)
    resp = client.post("/api/auth/login", data={"username": "carla@example.com", "password": "Password123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password_returns_401(client, db_session):
    create_user(db_session, username="dave", email="dave@example.com", password="Password123", role=UserRole.CITIZEN)
    resp = client.post("/api/auth/login", data={"username": "dave@example.com", "password": "WrongPassword"})
    assert resp.status_code == 401


def test_me_requires_authentication(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_returns_current_user(client, db_session):
    create_user(db_session, username="eve", email="eve@example.com", password="Password123", role=UserRole.AGENT)
    headers = auth_headers(client, "eve@example.com", "Password123")
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["username"] == "eve"
    assert resp.json()["role"] == "AGENT"
