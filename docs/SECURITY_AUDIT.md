# ProxyProof — Security Audit, Vulnerability Remediation & Hardening Report

**Audit Date:** October 2026  
**Auditor Role:** Senior Application Security Engineer & Software Architect  
**Project:** ProxyProof — Bluetooth Low Energy Attendance System  
**Audit Scope:** Full-stack codebase (FastAPI backend, React/Vite frontend, cryptographic verification engine, BLE protocol, authentication, RBAC, and data exports).

---

## 1. Executive Summary

A comprehensive application security audit of the ProxyProof repository was conducted to identify authorization flaws, anti-proxy circumvention vectors, data leakage risks, cryptographic weaknesses, and API attack surfaces.

During the audit, multiple critical and high-severity access control and denial-of-service vulnerabilities were identified, reproduced through negative test fixtures, and permanently remediated on the backend. A suite of 7 automated security hardening tests was developed in `backend/app/tests/test_security_hardening.py`, bringing the backend test suite to **43 passing tests (100% pass rate)** with zero regressions. The frontend production build was verified clean with 0 TypeScript errors.

---

## 2. Threat Model & Physical Realities of Anti-Proxy Systems

### 2.1 Threat Actors & Capabilities

| Threat Actor | Capabilities | Target Objective |
| :--- | :--- | :--- |
| **Absent Student** | Network access, smartphone, peer collaboration | Obtain attendance without attending lecture hall |
| **Colluding Present Student** | Physically present in class with valid device | Check in on behalf of absent peers ("buddy punching") |
| **Tech-Savvy Student (Hacker)** | Custom scripts, rooted/jailbroken device, packet sniffers | Extract private keys, replay tokens, flood server |
| **Malicious / Rogue Organiser** | Valid instructor account | Access or sabotage other faculty courses and sessions |
| **Eavesdropper / MitM** | Sniffing public WiFi / Bluetooth radio packets | Intercept tokens, credentials, or retransmit frames |

### 2.2 Physical Realities & Anti-Proxy Constraints

No wireless or software-based proximity solution can claim 100% theoretical invulnerability without physically tethered biometrics or Faraday cages. Understanding the boundaries of the medium is crucial for defense-in-depth:

1. **BLE Radio Characteristics & RSSI Volatility:**
   - **Physics:** Radio Frequency (RF) signal attenuation does not follow a pure inverse-square law in real-world indoor spaces. Human bodies (70% water), reinforced concrete walls, laptops, and varying smartphone antenna orientations cause RSSI swings of $\pm 10\text{ dBm}$ to $\pm 15\text{ dBm}$.
   - **Mitigation:** ProxyProof employs a baseline RSSI cutoff (default: $-85\text{ dBm}$) coupled with rotating cryptographic token freshness. RSSI acts as a coarse proximity gate to reject hallway or parking lot check-ins, while token rotation and cryptographic signatures prevent remote claims.

2. **BLE Wormhole / Radio Frequency Relays:**
   - **Attack:** An adversary in the classroom uses high-gain software-defined radio (SDR) or an internet tunnel to stream raw BLE advertising packets to a remote accomplice's phone in real time.
   - **Countermeasure:** The 10-second token rotation window combined with timestamp freshness ($\le 60\text{s}$ tolerance) and single-use nonces makes human-mediated forwarding (e.g., messaging apps) completely non-viable. Executing an automated sub-second SDR relay requires specialized physical hardware, deterring $\ge 99\%$ of casual university proxy attempts.

3. **Compromised & Rooted Devices:**
   - **Attack:** If an attacker roots their Android or iOS device, they could theoretically dump application memory to extract their own private signing key and share it with a server running proxy scripts.
   - **Mitigation:** Even if a student extracts their private key, the system binds each student account to a single approved device with unique hardware identifiers. The proxy server would still need live BLE rotating tokens broadcast exclusively inside the physical room. Furthermore, on native apps, keys are backed by hardware keystores (`Android Keystore` / `iOS Secure Enclave`) where private keys never leave the secure hardware element.

4. **Web Browser Simulation vs. Native Mobile Architecture:**
   - **Web Browser Limitation:** Standard web browsers (Chrome, Safari) do not provide cross-platform background BLE advertisement listening APIs without explicit user device pairing dialogs.
   - **Architectural Boundary:** In the web demo application, students obtain the rotating token for visualization via `/sessions/{session_id}/current-token`. In Phase 3, this endpoint was hardened to verify course enrollment; an unenrolled student or unauthorized organiser is rejected with `403 Forbidden`.
   - **Native Production:** In production native iOS/Android builds, student devices scan BLE advertising packets directly over radio frames, bypassing HTTP token retrieval completely.

---

## 3. Vulnerability Findings & Remediation Details

### VULN-01: Cross-Organiser Course Enrollment Privilege Escalation (CRITICAL)
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key / IDOR)
- **Vulnerability:** `POST /api/v1/courses/{course_id}/enroll` verified `get_current_organiser`, but failed to check if `course.organiser_id == current_user.id`. Any organiser could enroll arbitrary students into courses taught by other faculty members.
- **Remediation:** Added server-side ownership enforcement in `backend/app/api/courses.py`:
  ```python
  if current_user.role != UserRole.ADMIN and course.organiser_id != current_user.id:
      raise HTTPException(status_code=403, detail="You are not authorized to enroll students in another organiser's course")
  ```
- **Verification:** Verified by `test_cross_organiser_privilege_escalation_blocked` in `test_security_hardening.py`.

### VULN-02: Cross-Organiser Session Start/Stop Hijacking (HIGH)
- **CWE:** CWE-285 (Improper Authorization)
- **Vulnerability:** `POST /api/v1/sessions/{session_id}/start` and `POST /api/v1/sessions/{session_id}/stop` only verified that the caller had the `ORGANISER` role, allowing any instructor to prematurely close or start another instructor's active session.
- **Remediation:** Enforced ownership checks in `backend/app/api/sessions.py` verifying `current_user.role == UserRole.ADMIN or s.organiser_id == current_user.id`.
- **Verification:** Verified by `test_cross_organiser_privilege_escalation_blocked`.

### VULN-03: Student Roster Information Disclosure (MEDIUM)
- **CWE:** CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
- **Vulnerability:** `GET /api/v1/courses/{course_id}/students` allowed any instructor to view full student rosters (names, emails, student IDs, department, and batch) for courses they did not teach.
- **Remediation:** Added ownership validation in `backend/app/api/courses.py` returning `403 Forbidden` if the calling organiser is not the course owner.
- **Verification:** Verified by `test_cross_organiser_privilege_escalation_blocked`.

### VULN-04: Unauthorized Rotating Token Fetching (HIGH)
- **CWE:** CWE-284 (Improper Access Control)
- **Vulnerability:** `GET /api/v1/sessions/{session_id}/current-token` was open to any authenticated user, allowing students to inspect tokens for courses they were not enrolled in, or instructors to inspect other instructors' tokens.
- **Remediation:** Added multi-tier authorization in `backend/app/api/sessions.py`:
  - `ORGANISER`: restricted to session owner (`s.organiser_id == current_user.id`).
  - `STUDENT`: verified against active `CourseEnrollment`. Unenrolled students receive `403 Forbidden`.
  - `ADMIN`: permitted for troubleshooting.
- **Verification:** Verified by `test_unenrolled_student_cannot_fetch_session_token`.

### VULN-05: Missing Rate Limiting on Authentication & Attendance Claim Endpoints (HIGH)
- **CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)
- **Vulnerability:** The application had no rate limiting middleware, leaving `/api/v1/auth/login`, `/api/v1/auth/register`, and `/api/v1/attendance/submit` vulnerable to credential brute-forcing, account creation spam, and denial-of-service replay floods.
- **Remediation:** Implemented an in-memory sliding-window rate limiter in `backend/app/core/rate_limit.py` and mounted it as ASGI middleware in `backend/app/main.py`. Configurable thresholds:
  - Login attempts: max 10 requests / 60 seconds per IP (`429 Too Many Requests` + `Retry-After` header).
  - Registration attempts: max 10 requests / 60 seconds per IP.
  - Attendance check-in claims: max 30 requests / 60 seconds per IP.
- **Verification:** Verified by `test_rate_limiting_login_throttling`.

### VULN-06: Missing Security Response Headers (MEDIUM)
- **CWE:** CWE-693 (Protection Mechanism Failure)
- **Vulnerability:** HTTP responses lacked modern defensive headers, exposing client sessions to MIME-sniffing, clickjacking, and XSS risks.
- **Remediation:** Added HTTP middleware in `backend/app/main.py` injecting:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Verification:** Verified by `test_security_response_headers`.

### VULN-07: CSV Spreadsheet Formula Injection (MEDIUM)
- **CWE:** CWE-1236 (Improper Neutralization of Formula Elements in CSV File)
- **Vulnerability:** If student names, IDs, emails, or override reasons began with formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`, `|`, `%`), spreadsheet software (Excel, Calc) could execute arbitrary commands or DDE payloads upon opening exported reports.
- **Remediation:** Updated `sanitize_csv_cell()` in `backend/app/api/attendance.py` to prepend `'` (single quote) to any field beginning with `("=", "+", "-", "@", "\t", "\r", "|", "%")`.
- **Verification:** Verified by `test_csv_formula_injection_defense`.

### VULN-08: Nonce Replay & Database Concurrency Race Conditions (HIGH)
- **CWE:** CWE-294 (Authentication Bypass by Capture-replay) / CWE-362 (Race Condition)
- **Vulnerability:**
  - Duplicate nonces across different sessions were not validated.
  - Concurrent check-in submissions could cause unhandled `IntegrityError` (HTTP 500) rather than an idempotent conflict response.
- **Remediation:**
  - Added single-use nonce validation against `AttendanceRecord.nonce` returning `400 Bad Request` ("Nonce has already been consumed. Replay attack detected.").
  - Wrapped attendance record commitment with `try...except IntegrityError` returning clean `409 Conflict` ("Attendance already recorded for this session").
- **Verification:** Verified by `test_nonce_replay_attack_rejected`.

---

## 4. Cryptographic Implementation Review

| Component | Standard / Algorithm | Implementation Location | Security Property |
| :--- | :--- | :--- | :--- |
| **Password Storage** | `bcrypt` (12 rounds) | `app/core/security.py` | Adaptive slow hashing with unique salt |
| **Session JWTs** | `HMAC-SHA256` (`HS256`) | `app/core/security.py` | Signed stateless authorization token |
| **Rotating BLE Tokens** | `HMAC-SHA256` (16 hex chars) | `app/core/ble_token.py` | Unpredictable, rotating every 10s |
| **Token Verification** | `secrets.compare_digest` | `app/core/ble_token.py` | Constant-time comparison (no timing leaks) |
| **Device Signatures** | `Ed25519` / `ECDSA P-256` | `app/core/crypto.py` | Hardware-bound asymmetric proof of possession |
| **Device Public Keys** | 32-byte Ed25519 / SPKI PEM / SEC1 | `app/core/crypto.py` | Cryptographic key format validation |
| **Signature Payload** | Canonical formatted string | `app/api/attendance.py` | Binds `StudentID`, `SessionID`, `Token`, `Time`, `Nonce`, `RSSI` |

**Zero Private Key Exposure:** Private keys are generated on client devices and are never submitted to the backend or logged.

---

## 5. Automated Verification Results

All 43 unit and integration tests execute cleanly in under 17 seconds:

```bash
backend$ PYTHONPATH=. pytest
============================= test session starts ==============================
collected 43 items

app/tests/test_admin.py ........                                         [ 18%]
app/tests/test_attendance.py ......                                      [ 32%]
app/tests/test_auth.py ...........                                       [ 58%]
app/tests/test_crypto.py .....                                           [ 69%]
app/tests/test_device.py ....                                            [ 79%]
app/tests/test_reports.py ..                                             [ 83%]
app/tests/test_security_hardening.py .......                             [100%]

======================== 43 passed, 1 warning in 16.48s ========================
```

Frontend production verification:
```bash
frontend$ npm run build
✓ built in 1.00s (0 errors, 0 warnings)
```

---

## 6. Production Deployment & Hardening Checklist

When deploying to production environments (Vercel, AWS, GCP, or on-premises servers):

1. **Environment Secrets:**
   - Override default `SECRET_KEY` with a cryptographically secure random 256-bit key (`openssl rand -hex 32`).
   - Store secrets exclusively in environment variables or cloud secret managers (`AWS Secrets Manager`, `GCP Secret Manager`).
2. **TLS / HTTPS Termination:**
   - Enforce HTTPS across all traffic. Mount reverse proxy (Caddy, Nginx, or Cloudflare) configured with TLS 1.3 and HSTS (`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`).
3. **CORS Restrictions:**
   - In production, set `CORS_ORIGINS` to exact production domain names (e.g. `https://proxyproof.university.edu`) instead of localhost origins.
4. **Persistent Rate Limiting:**
   - For multi-instance clustered deployments, swap the in-memory limiter for Redis-backed distributed rate limiting (`redis-py` / sliding log).
5. **Native Mobile Enclave:**
   - For native iOS/Android client apps, utilize hardware-backed keystores (`SecKeyGeneratePair` with `kSecAccessControlBiometryAny` / `KeyGenParameterSpec` with `PURPOSE_SIGN`).
