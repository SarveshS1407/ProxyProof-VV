# ProxyProof Project Audit Report

**Date:** October 16, 2026  
**Auditor:** Senior Software Architect  
**Project:** ProxyProof — Bluetooth Low Energy Attendance System  
**Repository Working Directory:** `/Users/kingpin/Documents/Vinno-2`  
**Git Commit Baseline:** `d3bf5ad13c9488c90f8d518b78cd11ef423b4caa` (Branch: `main`)

---

## 1. Executive Summary

ProxyProof has established a solid, functional baseline across its core domains:
* A modern **FastAPI backend** with declarative SQLAlchemy ORM models, cryptographic token rotation, and role-based access control.
* A verified **test suite of 25 automated tests** covering authentication, device binding, cryptographic signature validation, replay rejection, RSSI thresholding, manual attendance overrides, percentage calculations, and sanitized CSV exports.
* A responsive **React 18 + Vite frontend** with dedicated portals for Students, Organisers, and Administrators.
* An **Expo / React Native mobile application structure** configured with native BLE permissions.

However, several critical architectural gaps, mock placeholders, deployment incompatibilities, and database migration risks must be addressed before the platform is production-ready.

---

## 2. Existing Architecture & Technology Stack

```
ProxyProof Multi-Tier Architecture
┌────────────────────────────────────────────────────────┐
│  Clients                                               │
│  - React 18 + Vite SPA (Organiser, Student, Admin)     │
│  - React Native / Expo Mobile App (Student, Organiser) │
└───────────────────────────┬────────────────────────────┘
                            │ REST (HTTP/JSON) & WebSockets
                            ▼
┌────────────────────────────────────────────────────────┐
│  Backend Service (FastAPI / Python 3.13)               │
│  - Ed25519 / ECDSA Asymmetric Crypto Engine            │
│  - HMAC-SHA256 Ephemeral Token Window Derivation       │
│  - Role-Based Access Control (RBAC)                    │
│  - Live WebSocket Connection Manager                   │
└───────────────────────────┬────────────────────────────┘
                            │ SQLAlchemy 2.0 ORM
                            ▼
┌────────────────────────────────────────────────────────┐
│  Database Layer                                        │
│  - SQLite (Local Dev & In-Memory Test Suite)           │
│  - PostgreSQL (Production Container / Cloud DB)        │
│  - Alembic Schema Migrations                           │
└────────────────────────────────────────────────────────┘
```

### Detailed Component Inventory
| Component | Technology | Role & Responsibility | Status |
| :--- | :--- | :--- | :--- |
| **Backend API** | FastAPI 0.143, Python 3.13 | REST API routes, auth, sessions, attendance, audit logging | Active & Verified (Port 8000) |
| **ORM & DB** | SQLAlchemy 2.0.28, SQLite | Relational schema, constraints, cascading relationships | Active & Seeded (`proxyproof.db`) |
| **Migrations** | Alembic 1.20 | Versioned schema migration management | Empty migration file (`pass`) |
| **Web Frontend** | React 18.3, TypeScript 5.4, Vite 5.4 | Organiser live console, student check-in, admin portal | Active & Verified (Port 5173) |
| **Mobile App** | React Native 0.74, Expo 51 | BLE scanner, device key generator, check-in client | Scaffolded, `node_modules` uninstalled |
| **Crypto** | `cryptography` 50.0 (Python) | Ed25519 signature verification, HMAC token rotation | Verified via automated unit tests |
| **Realtime** | Starlette WebSockets | Live check-in broadcasting to connected organisers | Active (`/api/v1/ws/sessions/{id}`) |

---

## 3. Detailed Feature Audit Matrix

| Feature | State | Real Code Implementation vs Mock / Gap |
| :--- | :--- | :--- |
| **User Registration & Login** | **Implemented** | Real bcrypt hashing, JWT access token generation, role validation, unique student roll number checks. |
| **Role-Based Authorization** | **Implemented** | Server-side role enforcement via FastAPI dependencies (`get_current_student`, `get_current_organiser`, `get_current_admin`). |
| **Device Binding (Backend)** | **Implemented** | Enforces single active approved device per student; duplicate hardware detection; `DeviceChangeRequest` approval queue. |
| **Device Binding (Frontend)** | **Partially Implemented** | If a student has no device, UI shows "NO APPROVED DEVICE" but lacks a button to register initial hardware. |
| **Cryptographic Check-in Proof** | **Partially Implemented** | Backend verifies authentic Ed25519/ECDSA signatures. However, `StudentPortal.tsx` passes hardcoded `'mock_demo_signature_or_ed25519_hex'` and `mobile/App.tsx` passes `'ed25519_mobile_signature_verified'`. |
| **Rotating BLE Tokens** | **Implemented** | Cryptographic HMAC-SHA256 derived from `session_secret` and window index $W_i = \lfloor t/10 \rfloor$. Verified with +/-1 window tolerance. |
| **Proximity RSSI Threshold** | **Implemented** | Rejects check-in attempts below configurable session threshold (default $\ge -85\text{ dBm}$). |
| **Replay & Duplicate Rejection**| **Implemented** | Unique DB constraint on `(session_id, student_id)` returns HTTP 409 Conflict; nonce validation prevents replay. |
| **Real-time Live Attendance** | **Implemented** | WebSockets broadcast `ATTENDANCE_RECORDED` and `ATTENDANCE_OVERRIDE` events immediately to instructor dashboard. |
| **Manual Attendance Override** | **Implemented** | Instructor can modify status (`PRESENT`, `LATE`, `EXCUSED`, `ABSENT`) with mandatory reason logged to `AuditLog`. |
| **Course & Student Enrollment** | **Partially Implemented** | Backend endpoints exist (`POST /courses/`, `POST /courses/{id}/enroll`), but **no UI** exists in Organiser Dashboard or Admin Portal for creating courses or enrolling students. |
| **Attendance % Calculation** | **Partially Implemented** | Calculates $\frac{\text{Present + Excused}}{\text{Total Sessions}} \times 100\%$. However, counts drafted/unstarted sessions in the denominator. |
| **CSV Export** | **Implemented** | Exports sanitized CSV with formula injection prevention (prefixes `=`, `+`, `-`, `@` with `'`). |
| **Alembic Migrations** | **Broken** | `versions/736b576b811d_initial_schema.py` generated `pass` because tables were created via `Base.metadata.create_all()` prior to autogenerate. |
| **Rate Limiting** | **Missing** | Configuration settings exist in `.env.example`, but no rate limiting middleware is mounted on FastAPI. |

---

## 4. UI / UX Issues Ranked by Impact

### High Impact
1. **Missing Initial Device Registration Button:** In `StudentPortal.tsx`, if `approvedDevice` is null, the student sees a warning banner but has no button to register their device, blocking new student onboarding from the web portal.
2. **Missing Course & Enrollment Management in UI:** An organiser with no existing courses cannot create sessions because the course dropdown is empty and there is no UI to create a course or enroll students.
3. **Hardcoded Localhost Endpoints:** `frontend/src/api/client.ts` hardcodes `http://localhost:8000/api/v1` and `OrganiserDashboard.tsx` hardcodes `ws://localhost:8000`. Deploying the frontend to Vercel or any remote domain causes immediate connection failure.

### Medium Impact
1. **Browser `prompt()` and `confirm()` Dialogs:** `AdminPortal.tsx` uses native browser `prompt()` for rejection notes and `confirm()` for user status toggling. These are inaccessible, non-customizable, and blocked in some browsers/iframes.
2. **Missing WebSocket Auto-Reconnection:** In `OrganiserDashboard.tsx`, if the WebSocket disconnects due to a momentary network drop, it never attempts to reconnect, causing the live feed to silently freeze.
3. **Missing Loading States on Session Control Buttons:** Start Session and Close Session buttons lack loading states, allowing accidental double-clicks during network latency.

### Low Impact
1. **Subtle Badge Color Contrasts:** The `badge-revoked` class uses `#64748b` on `#f1f5f9` which has lower contrast than WCAG 2.1 AA recommendations for small text.
2. **Table Pagination/Filtering:** Attendance history and audit logs lack client-side search or course filtering.

---

## 5. Security & Reliability Risks

1. **Client-Side Signature Mocking:**
   * *Risk:* Submitting `'mock_demo_signature_or_ed25519_hex'` fails backend validation unless the backend is modified or the client implements authentic WebCrypto/Ed25519 signing.
   * *Remediation:* Implement client-side WebCrypto ECDSA P-256 or tweetnacl Ed25519 key generation and signing in `StudentPortal.tsx`.
2. **Unvalidated Device Public Key Format:**
   * *Risk:* Backend `POST /devices/register` accepts arbitrary strings $\ge 16$ characters without validating if it is a valid hex/base64 public key.
   * *Remediation:* Add validation in `backend/app/schemas/device.py` or `crypto.py` to ensure public keys parse correctly.
3. **Empty Migration Script:**
   * *Risk:* Running `alembic upgrade head` on an empty production database executes `pass`, leaving the database empty without tables.
   * *Remediation:* Re-generate the initial migration against an empty SQLite memory database or write the explicit table creation commands in Alembic.
4. **WebSocket Authentication Query Param:**
   * *Risk:* Query parameters like `?token=<jwt>` can appear in server access logs.
   * *Remediation:* Support initial connection authentication handshake message via WebSocket protocol.

---

## 6. Deployment Architecture Evaluation (Vercel Compatibility)

### Can ProxyProof be deployed to Vercel?
| Component | Can Deploy to Vercel? | Technical Reason / Limitation |
| :--- | :--- | :--- |
| **Frontend (`frontend/`)** | **YES (Recommended)** | Vite React SPA builds clean static assets (`dist/`). Requires `vercel.json` rewrite rule for client-side routing. |
| **Backend API (`backend/`)** | **PARTIAL (Not Recommended)** | Vercel Serverless Functions have: <br>1. **No persistent WebSockets** (serverless functions cannot hold open WS connections).<br>2. **Stateless ephemeral filesystem** (local SQLite database `proxyproof.db` will reset on every execution).<br>3. 15-60s timeout limits. |
| **Mobile App (`mobile/`)** | **NO** | Native Android/iOS application requires compilation via Expo EAS Build or local toolchains (Android Studio / Xcode). |

### Recommended Production Deployment Topology
```
┌─────────────────────────────────┐
│   Vercel / Cloudflare Pages     │
│   - Frontend React 18 SPA       │
│   - Global CDN Edge caching     │
└────────────────┬────────────────┘
                 │ HTTPS & WSS
                 ▼
┌─────────────────────────────────┐
│   Render / Railway / Fly.io /   │
│   AWS ECS / VPS Docker          │
│   - Persistent FastAPI Backend  │
│   - Native WebSockets Support   │
│   - Background Token Clock      │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   Managed Cloud PostgreSQL      │
│   (Neon, Supabase, AWS RDS)     │
└─────────────────────────────────┘
```

---

## 7. Automated Test & Build Execution Baseline

### Backend Test Results (`pytest`)
* **Command:** `source .venv/bin/activate && cd backend && python -m pytest app/tests -v`
* **Output:** `25 passed, 1 warning in 7.82s` (100% pass rate).
* **Covered test files:**
  * `test_admin.py` (Stats, Audit Logs, Forbidden checks, User status)
  * `test_attendance.py` (Full workflow, duplicate 409 rejection, weak RSSI rejection, expired token rejection, manual override, CSV export)
  * `test_auth.py` (Registration, duplicate email, duplicate student ID, missing ID, organiser registration, login, wrong password, auth me)
  * `test_crypto.py` (Ed25519 keypair generation, valid signature, tampered payload rejection, wrong key rejection, invalid hex rejection)
  * `test_device.py` (Device status query, second device rejection, device change request and admin approval)
  * `test_reports.py` (Attendance percentages, excused session handling, zero division safety)

### Frontend Production Build (`npm run build`)
* **Command:** `cd frontend && npm run build`
* **Output:**
  ```
  vite v5.4.21 building for production...
  ✓ 1505 modules transformed.
  dist/index.html                   1.07 kB │ gzip:  0.64 kB
  dist/assets/index-8rIM_2jT.css    2.51 kB │ gzip:  1.02 kB
  dist/assets/index-BUbeyeVG.js   211.62 kB │ gzip: 59.11 kB
  ✓ built in 963ms
  ```
* **Status:** Clean production bundle with zero TypeScript or packaging errors.

---

## 8. Prioritised Implementation Checklist

### Phase 1: High-Priority Safe Fixes (Immediate)
- [ ] Fix empty Alembic initial migration so `alembic upgrade head` creates all tables deterministically.
- [ ] Add initial Device Registration action on `StudentPortal.tsx` for students without an approved device.
- [ ] Add Course Creation and Student Enrollment UI modals in `OrganiserDashboard.tsx`.
- [ ] Parameterize API and WebSocket base URLs in frontend (`import.meta.env.VITE_API_URL` and `VITE_WS_URL`).
- [ ] Add `vercel.json` in `frontend/` for SPA route rewrite handling.
- [ ] Implement client-side WebCrypto keypair generation and authentic challenge signing in `StudentPortal.tsx`.
- [ ] Replace `prompt()` and `confirm()` browser dialogs in `AdminPortal.tsx` with accessible React modals.
- [ ] Add auto-reconnection logic and connection status indicator to WebSockets in `OrganiserDashboard.tsx`.

### Phase 2: Security & Edge Case Hardening
- [ ] Validate device public key format upon registration in backend.
- [ ] Filter unstarted/draft sessions out of attendance percentage denominator.
- [ ] Mount in-memory or Redis-based rate limiting on sensitive `/auth/login` and `/attendance/submit` endpoints.
- [ ] Add refresh tokens and revocation blacklisting for JWTs.

### Phase 3: Mobile Native Build Alignment
- [ ] Add `react-native-ble-plx` to `mobile/package.json` dependencies.
- [ ] Implement native asymmetric key signing via WebCrypto / tweetnacl in mobile service.
- [ ] Configure Expo EAS build profile for Android APK and iOS ipa generation.
