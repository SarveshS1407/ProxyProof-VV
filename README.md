# ProxyProof — Bluetooth Attendance System

ProxyProof is a modern, mobile-first attendance management platform that automatically records student attendance using Bluetooth Low Energy (BLE) when students are physically present in the vicinity of an organiser conducting a session.

ProxyProof defends against proxy attendance through **layered defenses**:
1. **Short-Lived Rotating Cryptographic Tokens:** Tokens rotate every 10 seconds via HMAC-SHA256, rendering screenshots and forwarded tokens useless before they can be relayed.
2. **Device-Bound Asymmetric Cryptography:** Each student binds their physical phone to the platform using an asymmetric keypair (Ed25519/ECDSA); check-in claims must be digitally signed by the device private key.
3. **Single-Device Enforcement & Admin Approval:** Student accounts can only bind to one approved device. Phone replacements require formal administrator review and approval.
4. **Server-Side Authority & Replay Resistance:** Attendance creation is strictly idempotent, enforced by unique constraints on `(session_id, student_id)`. Nonces and freshness windows prevent replay attacks.
5. **Proximity & RSSI Thresholding:** Signal strength (default $\ge -85\text{ dBm}$) filters out distant check-ins with audit records permanently preserved.
6. **Real-Time Organiser Dashboard:** Instructors monitor live check-in feeds via WebSockets, manually correct records with mandatory audit reasons, and export formula-injection-sanitized CSV reports.

---

## 1. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│                   Organiser Device                     │
│         (Web Dashboard or Mobile App Peripheral)       │
│     Advertises ProxyProof BLE Service UUID 0xFD00      │
│      Payload: Short Session Hash + 16-Hex Token        │
└───────────────────────────┬────────────────────────────┘
                            │ (BLE Beacon Broadcast)
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Student Device                      │
│            (Mobile App Central Scanner)                │
│    Scans 0xFD00, Measures RSSI, Signs Canonical String │
└───────────────────────────┬────────────────────────────┘
                            │ (POST /api/v1/attendance/submit)
                            ▼
┌────────────────────────────────────────────────────────┐
│              ProxyProof Backend Server                 │
│                 (FastAPI + Python)                     │
│       - Validates Session Status & Course Enrollment   │
│       - Verifies Ephemeral Rotating Token              │
│       - Verifies Registered Device Public Key Sig      │
│       - Verifies RSSI Proximity Threshold              │
│       - Idempotently Records Attendance                │
│       - Broadcasts Live Event via WebSockets           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             SQLite / PostgreSQL Database               │
│   (Users, Devices, Change Requests, Sessions, Audit)   │
└────────────────────────────────────────────────────────┘
```

### Technology Components
* **Backend:** FastAPI (Python 3.11+ / 3.13), SQLAlchemy 2.0, Pydantic v2, Alembic migrations, Uvicorn, WebSockets.
* **Cryptography:** `cryptography` library (Ed25519 and ECDSA SECP256R1 signatures, HMAC-SHA256).
* **Web Frontend:** React 18, TypeScript, Vite, Tailwind CSS / Lucide icons.
* **Mobile App:** React Native, Expo SDK, TypeScript, native BLE configuration.
* **Database:** SQLite (development / test suite) and PostgreSQL (production).
* **Containerization:** Docker, Docker Compose, Nginx.

---

## 2. Quick Start & Local Execution

### 2.1 Backend Setup & Server
```bash
# 1. Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r backend/requirements.txt

# 3. Run database migrations (or auto-seeded on launch)
cd backend
alembic upgrade head

# 4. Start backend server (starts on http://localhost:8000)
python run.py
```
* Interactive API Documentation (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)
* Health Check Endpoint: [http://localhost:8000/health](http://localhost:8000/health)

### 2.2 Web Frontend (Organiser Dashboard & Student Portal)
```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
npm install

# 3. Run development server (starts on http://localhost:5173)
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your web browser.

### 2.3 Mobile Application (Expo / React Native)
```bash
# 1. Navigate to mobile directory
cd mobile

# 2. Install dependencies
npm install

# 3. Start Expo development server
npm start
```

---

## 3. Pre-Seeded Default Accounts

For instant testing and evaluation, the database automatically initializes with sample verified accounts:

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **Student** | `student@university.edu` | `StudentPass123!` | Roll No: `CS-2024-001`, Enrolled in `CS301`, Pre-bound verified device |
| **Organiser** | `prof@university.edu` | `ProfPass123!` | Prof. Alan Turing, Instructor for `CS301: Distributed Systems` |
| **Administrator**| `admin@proxyproof.edu` | `AdminPass123!` | System Administrator with full device approval & audit access |

---

## 4. BLE Protocol & Packet Specification

* **Service UUID:** `0000FD00-0000-1000-8000-00805F9B34FB` (16-bit short ID: `0xFD00`).
* **Packet Payload (21 Bytes, complies with BLE 31-byte limit):**
  * `Protocol Version (1 Byte):` `0x01`
  * `Session Hash (8 Bytes):` SHA-256 truncated hash of session identifier.
  * `Window Index (4 Bytes):` `floor(epoch_seconds / 10)`
  * `Rotating Token (8 Bytes):` `HMAC-SHA256(session_secret, session_id || window_index)[0..7]`
* **Client Signature String:**
  `"{student_id}:{session_id}:{token}:{timestamp}:{nonce}:{rssi}"`
  Digitally signed using the student's hardware private key.

---

## 5. Automated Test Suite

A comprehensive automated test suite covers authentication, role authorization, device binding, cryptographic proof verification, rotating token freshness, replay rejection, RSSI threshold enforcement, manual attendance overrides, percentage calculations, and CSV sanitization:

```bash
source .venv/bin/activate
cd backend
python -m pytest app/tests -v
```

### Verified Test Results (36 Passed, 100% Pass Rate):
* `test_admin.py` — Admin metrics, audit log inspection, user role updates, direct device revocation, and forensic attendance investigation filters.
* `test_attendance.py` — End-to-end check-in, duplicate prevention (409 Conflict), weak signal rejection, expired token rejection, cross-organiser ownership isolation (403 Forbidden), manual overrides, and sanitized CSV generation.
* `test_auth.py` — Registration, duplicate checking, password hashing, token issuing, profile attribute updates, and password changes with current password verification.
* `test_crypto.py` — Asymmetric keypair generation, signature verification (Ed25519 & ECDSA P-256), payload tampering detection, and public key format validation.
* `test_device.py` — Single-device binding, public key validation (Ed25519, SPKI PEM, SEC1 points), duplicate hardware rejection, and device replacement approval workflow.
* `test_reports.py` — Attendance percentages, excused session handling, and division-by-zero safety.

---

## 6. Production Deployment

### Docker Compose
```bash
docker-compose up -d --build
```
* Backend API: `http://localhost:8000`
* Frontend App: `http://localhost:5173`

---

## 7. Security Limitations & Physical World Realities

* **Live Wormhole / High-Speed RF Relay:**
  * While the 10-second token rotation prevents manual screenshot forwarding over chat apps, an advanced adversary with specialized low-latency radio tunnels could relay RF signals in real time.
  * *Mitigation:* Requiring signed challenges, RSSI calibration, and instructor visual dashboard monitoring.
* **RSSI Fluctuations:**
  * Bluetooth signal strength is affected by human bodies, walls, and phone orientations. RSSI serves as an approximate proximity check ($\ge -85\text{ dBm}$), not millimeter-precision radar.
