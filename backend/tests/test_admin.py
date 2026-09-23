from app.models.user import UserRole
from tests.conftest import auth_headers, create_user


def test_admin_can_list_users(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    create_user(db_session, username="citizen1", email="citizen1@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "admin1@example.com", "Password123")

    resp = client.get("/api/admin/users", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_citizen_cannot_list_users(client, db_session):
    create_user(db_session, username="citizen1", email="citizen1@example.com", password="Password123", role=UserRole.CITIZEN)
    headers = auth_headers(client, "citizen1@example.com", "Password123")

    resp = client.get("/api/admin/users", headers=headers)
    assert resp.status_code == 403


def test_only_super_admin_can_change_role(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    target = create_user(db_session, username="citizen1", email="citizen1@example.com", password="Password123", role=UserRole.CITIZEN)
    admin_headers = auth_headers(client, "admin1@example.com", "Password123")

    # ADMIN (pas SUPER_ADMIN) ne peut pas changer un rôle
    resp = client.put(f"/api/admin/users/{target.id}/role", json={"role": "AGENT"}, headers=admin_headers)
    assert resp.status_code == 403

    create_user(db_session, username="super1", email="super1@example.com", password="Password123", role=UserRole.SUPER_ADMIN)
    super_headers = auth_headers(client, "super1@example.com", "Password123")

    resp = client.put(f"/api/admin/users/{target.id}/role", json={"role": "AGENT"}, headers=super_headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "AGENT"


def test_admin_cannot_deactivate_self(client, db_session):
    create_user(db_session, username="admin1", email="admin1@example.com", password="Password123", role=UserRole.ADMIN)
    headers = auth_headers(client, "admin1@example.com", "Password123")

    me = client.get("/api/auth/me", headers=headers).json()
    resp = client.put(f"/api/admin/users/{me['id']}/status", json={"is_active": False}, headers=headers)
    assert resp.status_code == 400
