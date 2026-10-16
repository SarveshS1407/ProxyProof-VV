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
