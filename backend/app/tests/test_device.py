from app.models.device import DeviceStatus, RequestStatus
from app.core.crypto import generate_ed25519_keypair


def test_device_status_query(client, student_headers):
    response = client.get("/api/v1/devices/status", headers=student_headers)
    assert response.status_code == 200
    devices = response.json()
    assert len(devices) == 1
    assert devices[0]["status"] == "APPROVED"
    assert devices[0]["device_identifier"] == "device-uuid-test-1234"


def test_cannot_register_second_device_without_approval(client, student_headers):
    _, pub2 = generate_ed25519_keypair()
    response = client.post("/api/v1/devices/register", headers=student_headers, json={
        "device_identifier": "second-device-unauthorized",
        "public_key": pub2,
        "device_model": "iPad",
        "os_version": "iPadOS 17"
    })
    assert response.status_code == 400
    assert "already have an approved device" in response.json()["detail"]


def test_device_change_request_and_admin_approval(client, student_headers, admin_headers):
    # 1. Student requests device change
    _, new_pub = generate_ed25519_keypair()
    req_res = client.post("/api/v1/devices/request-change", headers=student_headers, json={
        "new_device_identifier": "iphone-16-pro-new",
        "new_public_key": new_pub,
        "new_device_model": "iPhone 16 Pro",
        "new_os_version": "iOS 18.1",
        "reason": "Upgraded my phone"
    })
    assert req_res.status_code == 201
    req_data = req_res.json()
    req_id = req_data["id"]
    assert req_data["status"] == "PENDING"

    # 2. Admin lists requests
    admin_list = client.get("/api/v1/devices/requests", headers=admin_headers)
    assert admin_list.status_code == 200
    items = admin_list.json()
    assert any(item["id"] == req_id for item in items)

    # 3. Admin approves request
    review_res = client.post(f"/api/v1/devices/requests/{req_id}/review", headers=admin_headers, json={
        "approved": True,
        "admin_notes": "Verified student ID and receipt"
    })
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "APPROVED"

    # 4. Check student device status: old is REVOKED, new is APPROVED
    dev_status = client.get("/api/v1/devices/status", headers=student_headers).json()
    assert len(dev_status) == 2
    statuses = {d["device_identifier"]: d["status"] for d in dev_status}
    assert statuses["device-uuid-test-1234"] == "REVOKED"
    assert statuses["iphone-16-pro-new"] == "APPROVED"
