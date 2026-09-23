from app.models.user import UserRole
from tests.conftest import auth_headers, create_user


def _create_layer(client, headers, geometry_type="Point", slug="street_lights"):
    resp = client.post(
        "/api/layers",
        json={"name": "Couche test", "slug": slug, "geometry_type": geometry_type},
        headers=headers,
    )
    return resp.json()["id"]


def test_agent_can_create_point_feature(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers)

    create_user(db_session, username="agent1", email="agent1@example.com", password="Password123", role=UserRole.AGENT)
    agent_headers = auth_headers(client, "agent1@example.com", "Password123")

    resp = client.post(
        f"/api/layers/{layer_id}/features",
        json={
            "geometry": {"type": "Point", "coordinates": [2.3522, 48.8566]},
            "properties": {"code": "LMP-001", "etat": "Fonctionnel"},
        },
        headers=agent_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["type"] == "Feature"
    assert body["geometry"]["type"] == "Point"
    assert body["properties"]["code"] == "LMP-001"


def test_citizen_cannot_create_feature(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers)

    create_user(db_session, username="citizen1", email="citizen1@example.com", password="Password123", role=UserRole.CITIZEN)
    citizen_headers = auth_headers(client, "citizen1@example.com", "Password123")

    resp = client.post(
        f"/api/layers/{layer_id}/features",
        json={"geometry": {"type": "Point", "coordinates": [2.35, 48.85]}, "properties": {}},
        headers=citizen_headers,
    )
    assert resp.status_code == 403


def test_citizen_can_read_features(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers)
    client.post(
        f"/api/layers/{layer_id}/features",
        json={"geometry": {"type": "Point", "coordinates": [2.35, 48.85]}, "properties": {}},
        headers=admin_headers,
    )

    create_user(db_session, username="citizen1", email="citizen1@example.com", password="Password123", role=UserRole.CITIZEN)
    citizen_headers = auth_headers(client, "citizen1@example.com", "Password123")

    resp = client.get(f"/api/layers/{layer_id}/features", headers=citizen_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1


def test_geometry_type_mismatch_is_rejected(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    # Couche de type Point...
    layer_id = _create_layer(client, admin_headers, geometry_type="Point")

    # ...mais on envoie un Polygon : doit être refusé
    resp = client.post(
        f"/api/layers/{layer_id}/features",
        json={
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[2.35, 48.85], [2.36, 48.85], [2.36, 48.86], [2.35, 48.85]]],
            },
            "properties": {},
        },
        headers=admin_headers,
    )
    assert resp.status_code == 400


def test_delete_feature(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers)

    feature_id = client.post(
        f"/api/layers/{layer_id}/features",
        json={"geometry": {"type": "Point", "coordinates": [2.35, 48.85]}, "properties": {}},
        headers=admin_headers,
    ).json()["id"]

    resp = client.delete(f"/api/features/{feature_id}", headers=admin_headers)
    assert resp.status_code == 204

    body = client.get(f"/api/layers/{layer_id}/features", headers=admin_headers).json()
    assert len(body["features"]) == 0


def _geojson_file(features):
    import io
    import json

    content = json.dumps({"type": "FeatureCollection", "features": features}).encode("utf-8")
    return io.BytesIO(content)


def test_bulk_import_geojson(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers, geometry_type="Point")

    features = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [2.35, 48.85]}, "properties": {"nom": "A"}},
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [2.36, 48.86]}, "properties": {"nom": "B"}},
    ]
    resp = client.post(
        f"/api/layers/{layer_id}/features/import",
        files={"file": ("data.geojson", _geojson_file(features), "application/geo+json")},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["imported_count"] == 2
    assert body["skipped_count"] == 0

    collection = client.get(f"/api/layers/{layer_id}/features", headers=admin_headers).json()
    assert len(collection["features"]) == 2


def test_bulk_import_accepts_multi_geometry_variant(client, db_session):
    """Une couche 'Polygon' doit aussi accepter des MultiPolygon (cas réel fréquent)."""
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers, geometry_type="Polygon", slug="polygons_test")

    features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [[[[2.35, 48.85], [2.36, 48.85], [2.36, 48.86], [2.35, 48.85]]]],
            },
            "properties": {},
        },
    ]
    resp = client.post(
        f"/api/layers/{layer_id}/features/import",
        files={"file": ("data.geojson", _geojson_file(features), "application/geo+json")},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["imported_count"] == 1


def test_bulk_import_skips_incompatible_geometry(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers, geometry_type="Point", slug="points_test")

    features = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [2.35, 48.85]}, "properties": {}},
        {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[2.35, 48.85], [2.36, 48.85], [2.36, 48.86], [2.35, 48.85]]],
            },
            "properties": {},
        },
    ]
    resp = client.post(
        f"/api/layers/{layer_id}/features/import",
        files={"file": ("data.geojson", _geojson_file(features), "application/geo+json")},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["imported_count"] == 1
    assert body["skipped_count"] == 1
    assert len(body["errors"]) == 1


def test_agent_cannot_bulk_import(client, db_session):
    """L'import en masse est réservé ADMIN+ (contrairement à la création unitaire, ouverte aux AGENT)."""
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")
    layer_id = _create_layer(client, admin_headers)

    create_user(db_session, username="agent1", email="agent1@example.com", password="Password123", role=UserRole.AGENT)
    agent_headers = auth_headers(client, "agent1@example.com", "Password123")

    features = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [2.35, 48.85]}, "properties": {}}]
    resp = client.post(
        f"/api/layers/{layer_id}/features/import",
        files={"file": ("data.geojson", _geojson_file(features), "application/geo+json")},
        headers=agent_headers,
    )
    assert resp.status_code == 403
