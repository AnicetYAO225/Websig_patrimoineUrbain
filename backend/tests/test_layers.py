from app.models.user import UserRole
from tests.conftest import auth_headers, create_user


def _create_admin(db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)


def test_list_layers_requires_authentication(client):
    resp = client.get("/api/layers")
    assert resp.status_code == 401


def test_admin_can_create_layer(client, db_session):
    _create_admin(db_session)
    headers = auth_headers(client, "admin1@example.com", "Password123")

    resp = client.post(
        "/api/layers",
        json={
            "name": "Éclairage public",
            "slug": "street_lights",
            "geometry_type": "Point",
            "description": "Lampadaires",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["slug"] == "street_lights"
    assert data["feature_count"] == 0


def test_cannot_create_layer_with_duplicate_slug(client, db_session):
    _create_admin(db_session)
    headers = auth_headers(client, "admin1@example.com", "Password123")
    payload = {"name": "Routes", "slug": "roads", "geometry_type": "LineString"}

    assert client.post("/api/layers", json=payload, headers=headers).status_code == 201
    resp = client.post("/api/layers", json=payload, headers=headers)
    assert resp.status_code == 400


def test_citizen_cannot_create_layer(client, db_session):
    create_user(db_session, username="citizen1", email="citizen1@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "citizen1@example.com", "Password123")

    resp = client.post(
        "/api/layers",
        json={"name": "Parkings", "slug": "parkings", "geometry_type": "Polygon"},
        headers=headers,
    )
    assert resp.status_code == 403


def test_citizen_can_read_layers(client, db_session):
    _create_admin(db_session)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    client.post(
        "/api/layers",
        json={"name": "Parkings", "slug": "parkings", "geometry_type": "Polygon"},
        headers=admin_headers,
    )

    create_user(db_session, username="citizen2", email="citizen2@example.com", password="Password123", role=UserRole.CITIZEN)
    citizen_headers = auth_headers(client, "citizen2@example.com", "Password123")

    resp = client.get("/api/layers", headers=citizen_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_delete_layer(client, db_session):
    _create_admin(db_session)
    headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = client.post(
        "/api/layers",
        json={"name": "Espaces verts", "slug": "green_spaces", "geometry_type": "Polygon"},
        headers=headers,
    ).json()["id"]

    resp = client.delete(f"/api/layers/{layer_id}", headers=headers)
    assert resp.status_code == 204
    assert client.get("/api/layers", headers=headers).json() == []
