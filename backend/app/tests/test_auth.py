def test_register_student_success(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "new_student@university.edu",
        "password": "SecurePassword123!",
        "full_name": "Bob Builder",
        "role": "student",
        "student_id_number": "STU-999-001",
        "department": "Engineering",
        "batch": "2024"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new_student@university.edu"
    assert data["role"] == "student"
    assert data["student_profile"]["student_id_number"] == "STU-999-001"


def test_register_duplicate_email(client, student_fixture):
    response = client.post("/api/v1/auth/register", json={
        "email": "test_student@proxyproof.edu",
        "password": "Password123!",
        "full_name": "Duplicate Alice",
        "role": "student",
        "student_id_number": "NEW-ID-001"
    })
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_register_duplicate_student_id(client, student_fixture):
    response = client.post("/api/v1/auth/register", json={
        "email": "another_email@university.edu",
        "password": "Password123!",
        "full_name": "Copycat",
        "role": "student",
        "student_id_number": "STU-TEST-001"  # already used by student_fixture
    })
    assert response.status_code == 400
    assert "Student ID number is already registered" in response.json()["detail"]


def test_register_student_missing_id_number(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "noid@university.edu",
        "password": "Password123!",
        "full_name": "No ID Person",
        "role": "student"
    })
    assert response.status_code == 400
    assert "Student ID number is required" in response.json()["detail"]


def test_register_organiser_success(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "prof_hawking@university.edu",
        "password": "QuantumPass123!",
        "full_name": "Stephen Hawking",
        "role": "organiser"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["role"] == "organiser"


def test_login_success(client, organiser_user):
    response = client.post("/api/v1/auth/login", json={
        "email": "test_organiser@proxyproof.edu",
        "password": "ProfPass123!"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "test_organiser@proxyproof.edu"


def test_login_wrong_password(client, organiser_user):
    response = client.post("/api/v1/auth/login", json={
        "email": "test_organiser@proxyproof.edu",
        "password": "WrongPassword!"
    })
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


def test_get_current_user_me(client, student_headers):
    response = client.get("/api/v1/auth/me", headers=student_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test_student@proxyproof.edu"
    assert data["student_profile"]["student_id_number"] == "STU-TEST-001"


def test_update_profile_name_and_department(client, student_headers):
    res = client.put("/api/v1/auth/profile", headers=student_headers, json={
        "full_name": "Alice Updated",
        "department": "Robotics & AI"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["full_name"] == "Alice Updated"
    assert data["student_profile"]["department"] == "Robotics & AI"


def test_update_password_wrong_current(client, student_headers):
    res = client.put("/api/v1/auth/profile", headers=student_headers, json={
        "current_password": "WrongCurrentPassword123!",
        "new_password": "NewSecretPass123!"
    })
    assert res.status_code == 400
    assert "Current password is incorrect" in res.json()["detail"]


def test_update_password_success_and_login(client, student_headers, student_fixture):
    # Update password successfully
    res = client.put("/api/v1/auth/profile", headers=student_headers, json={
        "current_password": "StudentPass123!",
        "new_password": "BrandNewStudentPassword456!"
    })
    assert res.status_code == 200

    # Old password no longer works
    fail_res = client.post("/api/v1/auth/login", json={
        "email": student_fixture["user"].email,
        "password": "StudentPass123!"
    })
    assert fail_res.status_code == 401

    # New password logs in successfully
    success_res = client.post("/api/v1/auth/login", json={
        "email": student_fixture["user"].email,
        "password": "BrandNewStudentPassword456!"
    })
    assert success_res.status_code == 200
    assert "access_token" in success_res.json()

