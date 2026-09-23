import io

from app.models.user import UserRole
from tests.conftest import auth_headers, create_user


def test_update_username(client, db_session):
    create_user(db_session, username="fred", email="fred@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "fred@example.com", "Password123")

    resp = client.put("/api/auth/me", json={"username": "fredo"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["username"] == "fredo"


def test_change_password_requires_correct_current_password(client, db_session):
    create_user(db_session, username="gina", email="gina@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "gina@example.com", "Password123")

    resp = client.put(
        "/api/auth/me/password",
        json={"current_password": "WrongPassword", "new_password": "NewPassword123"},
        headers=headers,
    )
    assert resp.status_code == 400


def test_change_password_success_and_relogin(client, db_session):
    create_user(db_session, username="hugo", email="hugo@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "hugo@example.com", "Password123")

    resp = client.put(
        "/api/auth/me/password",
        json={"current_password": "Password123", "new_password": "NewPassword123"},
        headers=headers,
    )
    assert resp.status_code == 200

    # L'ancien mot de passe ne fonctionne plus, le nouveau oui
    assert client.post("/api/auth/login", data={"username": "hugo@example.com", "password": "Password123"}).status_code == 401
    assert client.post("/api/auth/login", data={"username": "hugo@example.com", "password": "NewPassword123"}).status_code == 200


def test_upload_avatar(client, db_session):
    create_user(db_session, username="ines", email="ines@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "ines@example.com", "Password123")

    # Un faux fichier JPEG minimal (le contenu réel n'a pas besoin d'être une vraie image valide pour ce test)
    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-content")
    resp = client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.jpg", fake_image, "image/jpeg")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["avatar_url"].startswith("/media/avatars/")


def test_upload_avatar_rejects_wrong_type(client, db_session):
    create_user(db_session, username="jules", email="jules@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "jules@example.com", "Password123")

    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    resp = client.post(
        "/api/auth/me/avatar",
        files={"file": ("doc.pdf", fake_pdf, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 400
