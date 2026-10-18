# ProxyProof — Emergency Production Deployment Recovery & Verification Report

**Execution Date:** October 18, 2026  
**Target Repository:** [`SarveshS1407/ProxyProof-VV`](https://github.com/SarveshS1407/ProxyProof-VV)  
**Production URL:** [https://proxyproof-neon.vercel.app](https://proxyproof-neon.vercel.app)  
**Target Branch:** `main`  
**Latest Production Commit:** `fdf389c` (plus recovery documentation commit)  
**Hosting Environment:** Vercel Production + Neon Serverless PostgreSQL Pooler  

---

## A. Final Public URL & Live Status

- **Canonical Public Production URL:** [https://proxyproof-neon.vercel.app](https://proxyproof-neon.vercel.app)
- **Deployment Status:** `● Ready` (Vercel Production Edge Deployment)
- **Direct Deployment Identifier:** `proxyproof-6mkv9knrx-ko-f67f.vercel.app`
- **HTTP Response Codes:**
  - `GET /` -> **HTTP 200 OK** (`content-type: text/html; charset=utf-8`)
  - `HEAD /` (curl `-I` / health probes) -> **HTTP 200 OK** (`content-type: text/html; charset=utf-8`)
  - `GET /api/v1/health` -> **HTTP 200 OK** (`{"status":"healthy","database":"connected"}`)
  - `HEAD /api/v1/health` -> **HTTP 200 OK**
- **Frontend Assets Verified:**
  - `GET /assets/index-DFHn6TR4.js` -> **HTTP 200 OK** (283.68 kB, JS Module)
  - `GET /assets/index-BuzKcXz-.css` -> **HTTP 200 OK** (10.13 kB, CSS Stylesheet)
- **Rendered DOM Verification:**
  - Headless Chrome rendered DOM confirmed full React tree mounting: `<div id="root">...<h1 ...>ProxyProof</h1>...<form>...</form>...One-Click Role Demonstration...</div>`.
  - Zero uncaught exceptions, zero blank screens, zero localhost requests.

---

## B. Root Cause Analysis

### 1. HTTP 405 Method Not Allowed on Automated Inspections (`HEAD` Requests)
- **Symptom:** Command-line inspection tools, curl checks (`curl -ILs`), monitoring bots, and uptime probes returned `HTTP/2 405 Method Not Allowed` with `Allow: GET`.
- **Cause:** In `backend/app/main.py`, endpoints `/`, `/{full_path:path}`, `/health`, and `/api/v1/health` were declared using `@app.get(...)`. Unlike WSGI frameworks, FastAPI does not automatically add `HEAD` route handlers to `@app.get` routes. When a `HEAD` request arrived, Starlette threw an HTTP 405.
- **Resolution:** Replaced `@app.get(...)` with `@app.api_route(..., methods=["GET", "HEAD"])` on all health and static SPA routes in [`backend/app/main.py`](file:///Users/kingpin/Documents/Vinno-2/backend/app/main.py#L220-L365).

### 2. WebSocket Authentication Failure on Live Attendance Stream
- **Symptom:** Live attendance WebSocket connection (`/api/v1/ws/sessions/{session_id}?token=...`) was immediately terminated by the server with `WS_1008_POLICY_VIOLATION: User account inactive or not found`.
- **Cause:** In `session_websocket_endpoint` in `backend/app/main.py`:
  ```python
  user_email = payload.get("sub")
  user = db.query(User).filter(User.email == user_email).first()
  ```
  The JWT `sub` claim generated across the application is the user's integer ID as a string (`"1"`, `"2"`, `"12"`), not an email address. Querying `User.email == "1"` returned `None`, terminating the connection.
- **Resolution:** Updated `session_websocket_endpoint` to support both numeric ID (`User.id == int(sub)`) and fallback email string matching.

### 3. Serverless Ephemeral Database Isolation ("Session Not Found")
- **Symptom:** Organisers could create a session, but clicking **Start Session** failed with `Error starting session: Session not found` (HTTP 404).
- **Cause:** Vercel spins up independent, parallel serverless container instances. The backend had defaulted to local SQLite in `/tmp/proxyproof.db`. Instance A processed the session creation, but Instance B processed the start session request with an isolated, empty database.
- **Resolution:** Connected persistent Neon Serverless PostgreSQL (`postgresql+psycopg2://` with SSL) across Vercel environments. All serverless lambdas share synchronized state.

### 4. UI Header Text Overflow on 320px Viewports
- **Symptom:** Compact mobile viewports (e.g. iPhone SE 1st Gen) experienced horizontal compression in the top navigation bar when displaying long full names.
- **Resolution:** Constrained `maxWidth: 120px` with `text-overflow: ellipsis` and `white-space: nowrap` in [`frontend/src/components/Navbar.tsx`](file:///Users/kingpin/Documents/Vinno-2/frontend/src/components/Navbar.tsx#L90-L105).

---

## C. Backend and Database Verification

- **Backend API Base URL:** [https://proxyproof-neon.vercel.app/api/v1](https://proxyproof-neon.vercel.app/api/v1)
- **Database Engine:** PostgreSQL 16 (Neon Serverless Pooler, US East AWS)
- **Health Check Endpoint:** `GET https://proxyproof-neon.vercel.app/api/v1/health`
  ```json
  {
    "status": "healthy",
    "service": "ProxyProof Backend API",
    "version": "1.0.0",
    "database": "connected",
    "environment": "development",
    "ble_service_uuid": "0000FD00-0000-1000-8000-00805F9B34FB",
    "token_rotation_seconds": 10,
    "min_rssi": -85
  }
  ```
- **Database Migrations:** Alembic schema target verified at `736b576b811d (head)` with normalized driver configuration in `backend/alembic/env.py`.

---

## D. Automated & Manual Test Results

### 1. Build & Static Analysis
- **Backend Test Suite (Pytest 9.1.1):** 59 passed, 0 failed in 19.08s
- **Frontend Unit Tests (handleResponse WHATWG):** 6 passed, 0 failed
- **TypeScript Typecheck (`tsc --noEmit`):** 0 errors
- **Vite Production Compilation:** Built in 922ms (283.62 kB JS, 10.13 kB CSS)

### 2. Live Acceptance Matrix Executed on Production (15 / 15 Passed)
```text
==================================================================
ACCEPTANCE MATRIX SUMMARY:
  [PASS] 1. Registration, Login, Invalid Credentials
  [PASS] 2. Role Authorization (Student, Organiser, Admin)
  [PASS] 3. Course Creation & Student Enrollment
  [PASS] 4. Device Binding & Replacement Approval
  [PASS] 5. Session Lifecycle (Create, Start, Refresh)
  [PASS] 6. Student Active Session Discovery
  [PASS] 7. Rotating Token Expiration & Validation
  [PASS] 8. Digital Signature Verification
  [PASS] 9. RSSI Threshold Enforcement
  [PASS] 10. Attendance Submission & Duplicate Rejection
  [PASS] 11. Attendance Persistence
  [PASS] 12. Organiser Attendee Roster
  [PASS] 13. CSV Export & Sanitization
  [PASS] 14. Audit Log & Manual Attendance Overrides
  [PASS] 15. API Error Handling & Auth Security
==================================================================
```

### 3. Browser & Viewport Verification
- **Desktop (1920x1080 / 1440x900):** Clean desktop navigation, multi-column card layout, real-time live token broadcast view.
- **Mobile (320px, 375px, 390px, 430px):** Tested in headless Chrome. Bottom mobile navigation bar renders (`.mobile-bottom-nav`), touch targets enforce 44px min-height, inputs have `1rem` font to prevent iOS Safari auto-zoom.

---

## E. GitHub Synchronization & Deployment Details

- **GitHub Repository:** [`SarveshS1407/ProxyProof-VV`](https://github.com/SarveshS1407/ProxyProof-VV)
- **Branch:** `main`
- **Pushed Commits:**
  - `00a9e88`: `fix(sessions): resolve session not found bug via shared PostgreSQL and state synchronization`
  - `0a8f5f0`: `fix(release): normalize alembic database_url and harden mobile header on 320px viewports`
  - `3c95081`: `docs: add release readiness and end-to-end verification report`
  - `fdf389c`: `fix(api): add HEAD method support for health/SPA routes and resolve websocket sub ID lookup`
- **Vercel Production Deployment Alias:** [https://proxyproof-neon.vercel.app](https://proxyproof-neon.vercel.app)

---

## F. Remaining Blockers & Physical Hardware Requirements

1. **Physical Bluetooth Low Energy Hardware:**
   - The Web Bluetooth API client, token generation, cryptographic digital signature (Ed25519/ECDSA), RSSI threshold checking, and attendance recording are fully functional and verified.
   - Physical peer-to-peer BLE radio transmission from mobile phones requires real hardware devices during the live interview demonstration.
2. **Zero Known Production Software Blockers:**
   - The public website, backend API, database persistence, authentication, session management, and attendance verification are completely operational.
