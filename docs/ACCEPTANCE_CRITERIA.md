# ProxyProof — System Acceptance Criteria & Testable Specifications

This document defines the formal, individually testable acceptance criteria for the ProxyProof Bluetooth Attendance system. Every criterion is mapped to specific user roles, technical components, API contracts, and security controls.

---

## 1. Authentication & Role-Based Access Control (RBAC)

### AC-AUTH-01: User Registration
- **Given** a new user with valid email, password, full name, and role (`student`, `organiser`, or `admin`),
- **When** submitting `POST /api/v1/auth/register`,
- **Then** the system must:
  1. Hash the password with bcrypt (minimum 12 rounds / salt).
  2. Reject registration if email is already taken (`400 Bad Request`).
  3. Require `student_id_number` and `department` if role is `student`.
  4. Automatically create an associated `StudentProfile` record for students.
  5. Return `201 Created` with public user attributes (excluding hashed password).

### AC-AUTH-02: User Authentication & JWT Issuance
- **Given** registered user credentials,
- **When** submitting `POST /api/v1/auth/login`,
- **Then** the system must:
  1. Verify credentials against bcrypt hash.
  2. Issue a signed JWT token containing `sub` (user email), `id`, and `role`.
  3. Enforce token expiration (default: 60 minutes).
  4. Reject invalid passwords or inactive accounts with `401 Unauthorized`.

### AC-AUTH-03: Server-Side Role Enforcement
- **Given** an authenticated request to a role-protected endpoint (e.g., `/api/v1/admin/*`, `/api/v1/sessions/*`, `/api/v1/attendance/submit`),
- **When** the JWT role does not match the required authorization level,
- **Then** the server must reject the request with `403 Forbidden`. The frontend must never be the sole mechanism for role gating.

---

## 2. Student Device Binding & Device Lifecycle

### AC-DEV-01: Initial Single-Device Registration
- **Given** an authenticated student with no prior approved device,
- **When** submitting `POST /api/v1/devices/register` with `device_identifier`, `public_key`, `device_model`, and `os_version`,
- **Then** the system must:
  1. Bind the device to the student's `StudentProfile`.
  2. Auto-approve the initial device (`status = APPROVED`) to streamline onboarding.
  3. Prevent other students from registering the same physical `device_identifier` (`400 Bad Request`).

### AC-DEV-02: Prevention of Multi-Device Registrations
- **Given** a student who already has an `APPROVED` active device,
- **When** attempting to call `POST /api/v1/devices/register` again,
- **Then** the system must reject the request with `400 Bad Request`, instructing the user to submit a Device Change Request.

### AC-DEV-03: Device Replacement Request Workflow
- **Given** a student with an approved device needing a replacement (e.g., lost or upgraded phone),
- **When** submitting `POST /api/v1/devices/request-change` with `new_device_identifier`, `new_public_key`, and `reason`,
- **Then** the system must:
  1. Create a `DeviceChangeRequest` in `PENDING` state.
  2. Maintain the old device active until administrative approval.
  3. Log an audit event for the request.

### AC-DEV-04: Administrator Review & Revocation
- **Given** an administrator reviewing pending requests via `GET /api/v1/devices/requests`,
- **When** calling `POST /api/v1/devices/requests/{id}/approve` or `reject`,
- **Then** upon approval:
  1. The student's previous device status must transition to `REVOKED`.
  2. The new device must be registered and set to `APPROVED`.
  3. The request status must transition to `APPROVED`.
  4. An audit log entry must record the reviewing admin's ID, timestamp, and notes.

---

## 3. Bluetooth Low Energy (BLE) Protocol & Rotating Tokens

### AC-BLE-01: Standardized Advertisement Payload
- **Given** an active attendance session,
- **When** the organiser device broadcasts BLE signals,
- **Then** the broadcast must conform to the ProxyProof BLE specification:
  - Custom Service UUID: `0000FFF0-0000-1000-8000-00805F9B34FB`
  - Manufacturer / Service Data payload format:
    - Bytes 0–1: Company / Protocol ID (`0x5050` = "PP")
    - Byte 2: Protocol Version (`0x01`)
    - Bytes 3–6: Session ID (32-bit unsigned big-endian integer)
    - Bytes 7–14: Rotating Token (8 bytes / 16 hex chars)
    - Byte 15: Token Window Index (8-bit counter)
    - Byte 16: Transmit Power / Flags
  - Maximum payload size must not exceed 24 bytes (fitting within standard 31-byte legacy BLE advertisement limits).

### AC-BLE-02: Cryptographic Token Rotation Engine
- **Given** a session configured with token secret $K$ and rotation interval $T$ (default: 10s),
- **When** generating tokens at timestamp $t$,
- **Then** the token must be computed as:
  $$W = \lfloor t / T \rfloor$$
  $$\text{Token} = \text{HMAC-SHA256}(K, \text{SessionID} \parallel W)[0:8]$$
- **And** tokens must rotate automatically every $T$ seconds.

### AC-BLE-03: Clock Skew Tolerance & Replay Protection
- **Given** a student attendance claim submitted at client timestamp $t_{client}$,
- **When** validating the token against the backend:
  1. The server must verify whether the token matches window $W$, $W-1$, or $W+1$ (allowing $\pm 1$ rotation window for network jitter and BLE broadcast delay).
  2. Any token from window $W < (W_{now} - 1)$ or $W > (W_{now} + 1)$ must be rejected with `400 Bad Request (Token Expired)`.
  3. The submission nonce must be checked to prevent replay attacks within the same window.

---

## 4. Proximity & Physical Presence Verification

### AC-PROX-01: RSSI Signal Strength Cutoff
- **Given** an attendance claim with measured RSSI value $R$,
- **When** the session specifies a minimum threshold $R_{min}$ (default: $-85$ dBm),
- **Then** if $R < R_{min}$, the server must reject check-in with `400 Bad Request` citing insufficient signal strength (proxy attempt from outside classroom).

### AC-PROX-02: Cryptographic Proof of Device Possession
- **Given** a student submitting an attendance claim,
- **When** constructing the payload:
  $$\text{Payload} = \text{StudentID} \parallel \text{SessionID} \parallel \text{Token} \parallel \text{Timestamp} \parallel \text{Nonce} \parallel \text{RSSI}$$
- **Then** the claim must include a digital signature produced by the approved device's private key.
- **And** the server must verify the signature using the registered public key before recording attendance. Claims with forged or mismatched signatures must be rejected (`400 Bad Request`).

---

## 5. Attendance Recording & Session Management

### AC-SESS-01: Session Lifecycle
- **Organisers** must be able to:
  1. Create a session in draft status (`POST /api/v1/sessions/`).
  2. Start a session (`POST /api/v1/sessions/{id}/start`), generating a cryptographically secure token secret and marking `is_active = True`.
  3. Stop a session (`POST /api/v1/sessions/{id}/stop`), setting `is_active = False` and `is_closed = True`.
  4. Expire sessions automatically when `now >= started_at + duration_minutes`.

### AC-ATT-01: Idempotent Single Check-In per Session
- **Given** an enrolled student who has successfully checked into session $S$,
- **When** another check-in is submitted for the same student and session $S$,
- **Then** the server must return `409 Conflict` and preserve the original timestamp and verification record.

### AC-ATT-02: Course Enrollment Enforcement
- **Given** an attendance session for Course $C$,
- **When** a student who is NOT actively enrolled in Course $C$ attempts check-in,
- **Then** the server must reject the claim with `403 Forbidden`.

### AC-ATT-03: Manual Attendance Override & Audit Trail
- **Given** an Organiser or Admin reviewing session attendance,
- **When** submitting `POST /api/v1/attendance/manual-override` with `record_id`, `new_status` (`PRESENT`, `ABSENT`, `EXCUSED`, `LATE`), and `reason`,
- **Then** the system must:
  1. Update the record status and set `manual_override = True`.
  2. Record the override reason and modifying user ID.
  3. Create an immutable `AuditLog` entry.
  4. Broadcast the update over WebSocket to connected clients.

---

## 6. Course & Student Enrollment Management

### AC-CRS-01: Course Creation
- **Given** an Organiser or Admin,
- **When** submitting `POST /api/v1/courses/` with `code`, `title`, and `description`,
- **Then** a unique course record must be created, assigned to the organiser, and listed in the dashboard.

### AC-CRS-02: Student Enrollment
- **Given** an active course,
- **When** enrolling a student via `POST /api/v1/courses/{id}/enroll` using the student's ID or email,
- **Then** an active `CourseEnrollment` record must be created, granting the student eligibility to check into sessions of that course.

---

## 7. Reporting & Data Exports

### AC-REP-01: Accurate Attendance Percentage Calculation
- **Given** a student viewing attendance percentages across enrolled courses,
- **When** calling `GET /api/v1/attendance/student/percentages`,
- **Then** the calculation for each course must be:
  $$\text{Percentage} = \frac{\text{Count}(\text{PRESENT}) + \text{Count}(\text{LATE}) + \text{Count}(\text{EXCUSED})}{\text{Total Conducted Sessions}} \times 100$$
- **And** total conducted sessions must only count sessions that have actually started or completed (`is_active == True` or `is_closed == True` or `started_at IS NOT NULL`), excluding unstarted future drafts.

### AC-REP-02: CSV Export Sanitization (Formula Injection Protection)
- **Given** an Organiser exporting session attendance via `GET /api/v1/attendance/session/{id}/export-csv`,
- **When** generating the CSV content,
- **Then** any cell starting with `=`, `+`, `-`, `@`, `\t`, or `\r` must be safely prepended with a single quote (`'`) to prevent CSV/spreadsheet formula injection exploits.

---

## 8. Real-Time WebSocket Communication

### AC-WS-01: Real-Time Attendance Broadcast
- **Given** an Organiser viewing the live session dashboard with an active WebSocket connection,
- **When** any student verifies attendance or an override occurs,
- **Then** an `ATTENDANCE_RECORDED` or `ATTENDANCE_OVERRIDE` event must be dispatched to the room within 500 ms, updating the attendee list and count without requiring a page refresh.

### AC-WS-02: Reconnection & Graceful Degradation
- **Given** a temporary network interruption during a live session,
- **When** the WebSocket disconnects,
- **Then** the frontend client must attempt exponential backoff reconnection and fall back to periodic REST polling if WebSockets are unavailable.

---

## 9. Security & Hardening Controls

| Control ID | Threat Mitigated | Enforcement Mechanism |
|---|---|---|
| **SEC-01** | Password Cracking | bcrypt with work factor $\ge 12$; minimum 8 character length. |
| **SEC-02** | Session Hijacking / Forgery | HS256 signed JWT with user ID, role, and expiration timestamp. |
| **SEC-03** | Proxy Attendance by Device Sharing | Single-device hardware binding; device replacement requires Admin approval. |
| **SEC-04** | Remote Attendance / Location Spoofing | Dynamic HMAC rotating tokens (every 10s) + RSSI proximity threshold. |
| **SEC-05** | Replay of Intercepted BLE Tokens | Window expiry ($\pm 1$ window tolerance) + unique client nonces + idempotent attendance DB constraints. |
| **SEC-06** | Claim Forgery via Client Modification | Digital signature verification over canonical payload using device public key. |
| **SEC-07** | Spreadsheet Formula Injection | Prepending `'` to dangerous initial characters in all CSV exports. |
| **SEC-08** | Unauthorized Elevation of Privilege | Strict server-side FastAPI dependencies (`get_current_student`, `get_current_organiser`, `get_current_admin`). |

---

## 10. Database Migrations & Deployment

### AC-DEP-01: Alembic Schema Determinism
- **Given** a fresh SQLite or PostgreSQL database,
- **When** executing `alembic upgrade head`,
- **Then** all tables (`users`, `student_profiles`, `devices`, `device_change_requests`, `courses`, `course_enrollments`, `attendance_sessions`, `attendance_records`, `audit_logs`) must be created cleanly without manual DDL intervention.

### AC-DEP-02: Vercel SPA Client Compatibility
- **Given** the React + Vite frontend deployed to Vercel,
- **When** accessing client-side routes directly (e.g. `/organiser`, `/student`, `/admin`),
- **Then** `frontend/vercel.json` must rewrite all requests to `/index.html` preventing 404 errors on deep links.

### AC-DEP-03: Environment Variable Configuration
- **Given** frontend and backend deployments across staging and production,
- **Then** the frontend must read API and WebSocket URLs from `VITE_API_URL` and `VITE_WS_URL` rather than hardcoded localhost strings.
