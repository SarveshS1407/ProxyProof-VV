# ProxyProof API & WebSocket Documentation

Base URL: `http://localhost:8000/api/v1`
Interactive Swagger Docs: `http://localhost:8000/docs`

---

## 1. Authentication (`/api/v1/auth`)

### `POST /auth/register`
Registers a new user account.
* **Request Body:**
  ```json
  {
    "email": "student@university.edu",
    "password": "SecurePassword123!",
    "full_name": "Jane Doe",
    "role": "student", // "student" | "organiser" | "admin"
    "student_id_number": "STU-2024-001", // required if role == "student"
    "department": "Computer Science"
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "id": 1,
    "email": "student@university.edu",
    "full_name": "Jane Doe",
    "role": "student",
    "is_active": true,
    "student_profile": {
      "student_id_number": "STU-2024-001",
      "department": "Computer Science"
    }
  }
  ```

### `POST /auth/login`
Authenticates a user and returns a JWT bearer token.
* **Request Body:** `application/x-www-form-urlencoded` or JSON:
  ```json
  {
    "username": "student@university.edu",
    "password": "SecurePassword123!"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "user": {
      "id": 1,
      "email": "student@university.edu",
      "full_name": "Jane Doe",
      "role": "student"
    }
  }
  ```

### `GET /auth/me`
Returns current authenticated user details. Requires `Authorization: Bearer <token>`.

---

## 2. Device Management (`/api/v1/devices`)

### `POST /devices/register`
Student registers their device public key and hardware identifier.
* **Request Body:**
  ```json
  {
    "device_identifier": "a1b2c3d4-e5f6-7890",
    "public_key": "MCowBQYDK2VwAyEA...", // Ed25519 or ECDSA public key in hex/base64
    "device_model": "Google Pixel 8",
    "os_version": "Android 14"
  }
  ```

### `GET /devices/status`
Checks if the current student's registered device is `PENDING`, `APPROVED`, or `REVOKED`.

### `POST /devices/request-change`
Submits a device replacement request requiring administrator review.
* **Request Body:**
  ```json
  {
    "new_device_identifier": "f9e8d7c6-b5a4-3210",
    "new_public_key": "MCowBQYDK2VwAyEA...",
    "new_device_model": "iPhone 15 Pro",
    "new_os_version": "iOS 17.4",
    "reason": "Old phone was lost/replaced"
  }
  ```

### `GET /devices/requests` (Admin only)
Lists pending device change requests.

### `POST /devices/requests/{id}/approve` (Admin only)
Approves new device, revokes previous device key.

---

## 3. Courses & Sessions (`/api/v1/courses`, `/api/v1/sessions`)

### `POST /courses/` (Organiser/Admin)
Creates a course (e.g. `CS401: Distributed Systems`).

### `POST /courses/{id}/enroll`
Enrolls student into a course.

### `POST /sessions/` (Organiser/Admin)
Creates an attendance session.
* **Request Body:**
  ```json
  {
    "course_id": 1,
    "title": "Lecture 12: Consensus Protocols",
    "location": "Auditorium B",
    "duration_minutes": 60,
    "token_rotation_seconds": 10,
    "min_rssi": -85
  }
  ```

### `POST /sessions/{id}/start`
Activates the session, starts the token clock, and returns initial token payload.

### `POST /sessions/{id}/stop`
Closes the session. No further attendance claims will be accepted.

### `GET /sessions/{id}/current-token` (Organiser only)
Returns the current active rotating token, window index, and remaining seconds until next rotation.

---

## 4. Attendance Verification & Recording (`/api/v1/attendance`)

### `POST /attendance/submit` (Student only)
Submits a BLE-detected attendance claim.
* **Request Body:**
  ```json
  {
    "session_id": 1,
    "token": "7a3b4c5d6e7f8a9b",
    "rssi": -72,
    "timestamp": 1729074000,
    "nonce": "random-client-nonce-xyz",
    "device_identifier": "a1b2c3d4-e5f6-7890",
    "signature": "3045022100..." // cryptographic signature over payload
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "status": "confirmed",
    "record_id": 42,
    "recorded_at": "2026-10-16T10:45:00Z",
    "course_title": "CS401: Distributed Systems",
    "attendance_status": "PRESENT"
  }
  ```
* **Error Responses:**
  * `400 Bad Request`: Expired token, session closed, invalid signature, or RSSI below threshold.
  * `403 Forbidden`: Unapproved device or student not enrolled.
  * `409 Conflict`: Attendance already recorded (idempotent duplicate rejection).

### `GET /attendance/session/{id}` (Organiser/Admin)
Returns list of all attendance records for a session with live counts.

### `POST /attendance/manual-override` (Organiser/Admin)
Manually updates attendance status (PRESENT, ABSENT, EXCUSED, LATE) with audit reason.

### `GET /attendance/student/history` (Student)
Returns attendance logs across all enrolled courses.

### `GET /attendance/student/percentages` (Student)
Returns calculated attendance percentage per course:
$$\text{Percentage} = \frac{\text{Present Sessions} + \text{Excused Sessions}}{\text{Total Completed Sessions}} \times 100\%$$

### `GET /attendance/session/{id}/export-csv` (Organiser/Admin)
Exports sanitized CSV report (escapes characters like `=`, `+`, `-`, `@` to prevent CSV formula injection).

---

## 5. Live WebSocket Feed (`/api/v1/ws/sessions/{session_id}`)

* **Connection URL:** `ws://localhost:8000/api/v1/ws/sessions/{session_id}?token=<jwt>`
* **Events:**
  * `ATTENDANCE_RECORDED`: Broadcast whenever a student verifies attendance.
  * `ATTENDANCE_OVERRIDE`: Broadcast when an instructor manually edits a record.
  * `SESSION_STATUS_CHANGED`: Broadcast when session starts, pauses, or terminates.
