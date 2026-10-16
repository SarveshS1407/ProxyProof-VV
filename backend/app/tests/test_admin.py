def test_admin_stats(client, admin_headers):
    res = client.get("/api/v1/admin/stats", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_users" in data
    assert "active_sessions" in data
    assert "total_attendance_records" in data


def test_admin_audit_logs(client, admin_headers):
    res = client.get("/api/v1/admin/audit-logs", headers=admin_headers)
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)


def test_non_admin_forbidden(client, student_headers):
    res = client.get("/api/v1/admin/stats", headers=student_headers)
    assert res.status_code == 403
    assert "Operation not permitted" in res.json()["detail"]


def test_update_user_status(client, admin_headers, student_fixture):
    student_id = student_fixture["user"].id
    res = client.put(f"/api/v1/admin/users/{student_id}/status", headers=admin_headers, json={
        "is_active": False
    })
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Deactivated student cannot login or access protected routes
    token_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {student_id}"})
    assert token_res.status_code == 401


def test_update_user_role(client, admin_headers, student_fixture):
    student_id = student_fixture["user"].id
    res = client.put(f"/api/v1/admin/users/{student_id}/role", headers=admin_headers, json={
        "role": "organiser"
    })
    assert res.status_code == 200
    assert res.json()["role"] == "organiser"


def test_admin_cannot_alter_own_role(client, admin_headers, admin_user):
    res = client.put(f"/api/v1/admin/users/{admin_user.id}/role", headers=admin_headers, json={
        "role": "student"
    })
    assert res.status_code == 400
    assert "Cannot alter your own administrative role" in res.json()["detail"]


def test_admin_revoke_device(client, admin_headers, student_fixture):
    device_id = student_fixture["device"].id
    res = client.post(f"/api/v1/admin/devices/{device_id}/revoke", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "REVOKED"

    # Attempting to revoke again returns 400
    res_second = client.post(f"/api/v1/admin/devices/{device_id}/revoke", headers=admin_headers)
    assert res_second.status_code == 400
    assert "already revoked" in res_second.json()["detail"]


def test_admin_investigate_attendance(client, admin_headers):
    res = client.get("/api/v1/admin/attendance/investigate", headers=admin_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

