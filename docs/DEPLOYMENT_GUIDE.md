# ProxyProof — Production Deployment & Operations Guide

**Target Platform:** Vercel (Frontend & Serverless API) / PostgreSQL (Neon / Supabase / AWS RDS) / Mobile (Expo & React Native)  
**Release Version:** v1.0.0-rc1  
**Repository:** `https://github.com/SarveshS1407/ProxyProof-VV.git`

---

## 1. System Deployment Architecture

ProxyProof provides two production deployment models depending on institutional requirements for real-time WebSocket connections and infrastructure preferences:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENT LAYER                                            │
├─────────────────────────────────────────┬───────────────────────────────────────────────┤
│           Web Browser Client            │               Native Mobile App               │
│     (Students, Organisers, Admins)      │         (Android & iOS Physical BLE)          │
│        React 18 + Vite SPA              │        React Native + WebCrypto + BLE         │
└────────────────────┬────────────────────┴───────────────────────┬───────────────────────┘
                     │                                            │
                     │ HTTPS / WSS Requests                       │ HTTPS / WSS Requests
                     ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                VERCEL EDGE & CDN LAYER                                  │
│   - Global Edge Caching & Asset Distribution                                            │
│   - SPA Client-Side Routing Rewrites (/* -> /index.html)                                │
│   - Security Headers (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy)    │
└────────────────────┬────────────────────────────────────────────┬───────────────────────┘
                     │                                            │
         Option A: Unified Serverless                  Option B: Decoupled Backend
                     │                                            │
                     ▼                                            ▼
┌─────────────────────────────────────────┐   ┌───────────────────────────────────────────┐
│       Vercel Python Functions           │   │     Dedicated Persistent Backend          │
│       (`/api/index.py` - FastAPI)       │   │        (Render / Railway / Fly.io)        │
│  - Ephemeral Serverless execution       │   │  - Persistent Uvicorn ASGI process        │
│  - Automatic REST Polling fallback      │   │  - Native Full-Duplex WebSocket Streaming │
│  - Serverless PostgreSQL pooling        │   │  - In-Memory / Redis Sliding Window Limiter│
└────────────────────┬────────────────────┘   └───────────────────┬───────────────────────┘
                     │                                            │
                     └────────────────────┬───────────────────────┘
                                          │ SQLAlchemy 2.0 (pool_pre_ping=True)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               PRODUCTION DATABASE LAYER                                 │
│                   PostgreSQL 15+ (Neon / Supabase / AWS RDS / Cloud SQL)                │
│       - Relational Schema managed via Alembic (`alembic upgrade head`)                  │
│       - Tables: users, student_profiles, devices, change_requests, sessions,            │
│                 attendance_records, courses, course_enrollments, audit_logs             │
│       - Strict Idempotency Constraints: UNIQUE (session_id, student_profile_id)         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Deployment Architectures Explained

### Option A: Unified Full-Stack Vercel Deployment (Default)
In this model, the entire application is hosted on Vercel:
* **Frontend:** Built via `cd frontend && npm install && npm run build` to `frontend/dist`.
* **Backend API:** FastAPI application served via Vercel Python Serverless Functions through `/api/index.py`.
* **Database:** External cloud-managed PostgreSQL (e.g., Neon or Supabase) with SSL required.
* **Realtime Mechanism:** Since serverless environments do not support persistent long-lived WebSockets, the ProxyProof frontend seamlessly and automatically falls back to **REST polling** (`GET /api/v1/sessions/{id}` and `GET /api/v1/attendance/session/{id}`) every 3 seconds during active sessions.

### Option B: Decoupled Enterprise Architecture (Dedicated WebSocket Server)
In this model, the frontend and backend are deployed independently:
* **Frontend on Vercel:** Hosted on Vercel for high-speed edge distribution and instant previews.
* **Backend on Dedicated Host:** Hosted on Render, Railway, Fly.io, or an institutional VPS with persistent Uvicorn workers.
* **Full-Duplex WebSockets:** Supports live `/api/v1/ws/sessions/{id}` broadcasts with latency $< 200\text{ ms}$.
* **Configuration:** Frontend connects to the backend via `VITE_API_URL` and `VITE_WS_URL`.

---

## 3. Environment Variables Reference

The following environment variables configure ProxyProof. **Never commit real secrets or production credentials to source code.**

### 3.1 Backend & Serverless Environment Variables
| Variable Name | Required | Default / Example | Purpose / Description |
|---|:---:|---|---|
| `PROJECT_NAME` | No | `ProxyProof` | Application display name |
| `ENVIRONMENT` | Yes | `production` | Runtime mode (`development`, `staging`, `production`) |
| `DEBUG` | Yes | `false` | Disables debug logs and traceback exposure in production |
| `SECRET_KEY` | **Yes** | *(Cryptographic secret)* | 32+ character hex string used to sign JWT access tokens. Generate with `openssl rand -hex 32`. |
| `ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `1440` | JWT expiration duration in minutes (default: 24 hours) |
| `DATABASE_URL` | **Yes** | `postgresql://user:pass@host:5432/db?sslmode=require` | Production PostgreSQL connection URI |
| `CORS_ORIGINS` | **Yes** | `https://proxyproof.vercel.app,https://*.vercel.app` | Comma-separated list of permitted web origins |
| `BLE_SERVICE_UUID` | No | `0000FD00-0000-1000-8000-00805F9B34FB` | Standard 16-bit short ID `0xFD00` ProxyProof BLE Service UUID |
| `BLE_TOKEN_ROTATION_SECONDS` | No | `10` | Frequency in seconds for rotating HMAC attendance tokens |
| `DEFAULT_MIN_RSSI` | No | `-85` | Signal attenuation threshold in dBm for physical presence |
| `RSSI_VARIANCE_TOLERANCE` | No | `15` | Acceptable variance window for signal fluctuations |
| `RATE_LIMIT_ENABLED` | No | `true` | Enables sliding window rate limiting on auth and check-in |
| `RATE_LIMIT_LOGIN_MAX_REQUESTS` | No | `10` | Max login attempts per minute per IP |
| `RATE_LIMIT_SUBMIT_MAX_REQUESTS` | No | `30` | Max attendance check-ins per minute per IP |

### 3.2 Frontend Client Environment Variables
| Variable Name | Required | Example | Purpose / Description |
|---|:---:|---|---|
| `VITE_API_URL` | Optional | `https://api.proxyproof.edu` | Backend REST API base URL. If left empty, defaults to same-origin relative `/api/v1`. |
| `VITE_WS_URL` | Optional | `wss://api.proxyproof.edu` | Backend WebSocket base URL. If left empty, defaults to same-origin `wss://{host}/api/v1`. |

### 3.3 Mobile Application Environment Variables
| Variable Name | Required | Example | Purpose / Description |
|---|:---:|---|---|
| `EXPO_PUBLIC_API_URL` | **Yes** | `https://proxyproof.vercel.app` | Base API URL for native Android/iOS mobile application builds |

---

## 4. Step-by-Step Vercel Deployment Instructions

### Method 1: Deploy via Vercel Web Dashboard (Git Integration)

1. **Push your code to GitHub:**
   Ensure all changes are committed and pushed to `https://github.com/SarveshS1407/ProxyProof-VV.git` on branch `main`.

2. **Import Project in Vercel:**
   - Log in to [Vercel Dashboard](https://vercel.com/dashboard).
   - Click **Add New...** $\to$ **Project**.
   - Select your GitHub repository: `ProxyProof-VV`.

3. **Configure Project Settings:**
   - **Project Name:** `proxyproof`
   - **Framework Preset:** `Vite`
   - **Root Directory:** Leave as `./` (Root directory) to enable full-stack serverless deployment, OR set to `frontend` for frontend-only deployment.
   - **Build Command:** `cd frontend && npm install && npm run build` (or leave default if using root `package.json`).
   - **Output Directory:** `frontend/dist`

4. **Configure Environment Variables in Vercel:**
   In the **Environment Variables** section, add:
   ```env
   ENVIRONMENT=production
   DEBUG=false
   SECRET_KEY=<your-generated-openssl-rand-hex-32>
   DATABASE_URL=postgresql://<user>:<password>@<neon-host>/proxyproof?sslmode=require
   CORS_ORIGINS=https://proxyproof.vercel.app,https://proxyproof-*.vercel.app
   ```

5. **Deploy:**
   - Click **Deploy**.
   - Vercel will install dependencies from `requirements.txt` and `package.json`, compile the frontend bundle, and configure serverless functions.
   - Once complete, Vercel will assign your production URL (e.g. `https://proxyproof.vercel.app`).

---

### Method 2: Deploy via Vercel CLI

```bash
# 1. Install Vercel CLI globally (if not installed)
npm install -g vercel

# 2. Authenticate CLI
vercel login

# 3. Deploy Preview Build
vercel

# 4. Link project and configure environment variables:
vercel env add SECRET_KEY production
vercel env add DATABASE_URL production
vercel env add ENVIRONMENT production

# 5. Promote Preview to Production
vercel --prod
```

---

## 5. Production Database Provisioning & Migration Procedure

### 5.1 Recommended Database Providers
- **Neon Serverless Postgres** ([neon.tech](https://neon.tech)): Free tier available, instant branching, native serverless connection pooling, SSL required by default.
- **Supabase** ([supabase.com](https://supabase.com)): Managed PostgreSQL with built-in connection pooler (port `6543`).
- **AWS RDS / Aurora Serverless**: Enterprise institutional deployment.

### 5.2 Executing Migrations
Database migrations must be applied using Alembic before routing production user traffic:

```bash
# 1. Activate backend environment
source .venv/bin/activate
cd backend

# 2. Set production database connection URL
export DATABASE_URL="postgresql://proxyproof_user:secure_pass@ep-pooler.us-east-1.aws.neon.tech/proxyproof_db?sslmode=require"

# 3. Test migration dry-run on disposable DB first
DATABASE_URL="sqlite:///./test_disposable.db" alembic upgrade head
rm test_disposable.db

# 4. Execute production migration against PostgreSQL
alembic upgrade head
```

### 5.3 Initial Data Seeding
On initial startup against a fresh database, ProxyProof automatically provisions initial role templates:
- **System Administrator:** `admin@proxyproof.edu` (default credential: `AdminPass123!`)
- **Organiser / Professor:** `prof@university.edu` (default credential: `ProfPass123!`)
- **Student Profile:** `student@university.edu` (default credential: `StudentPass123!`, pre-bound hardware device key)
- **Course:** `CS301` — Distributed Systems & Networks

> **Security Mandate:** Upon initial production deployment, log in immediately as `admin@proxyproof.edu` and update passwords for all seeded accounts via the profile settings.

---

## 6. Post-Deployment Verification & Smoke Tests

Execute these verification checks immediately following deployment to confirm system health:

### 1. API Health Check
```bash
curl -i https://proxyproof.vercel.app/api/v1/health
```
**Expected Response:** `HTTP/1.1 200 OK`
```json
{
  "status": "healthy",
  "service": "ProxyProof Backend API",
  "version": "1.0.0",
  "database": "connected",
  "ble_service_uuid": "0000FD00-0000-1000-8000-00805F9B34FB",
  "token_rotation_seconds": 10,
  "min_rssi": -85
}
```

### 2. User Authentication
```bash
curl -X POST https://proxyproof.vercel.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@university.edu","password":"StudentPass123!"}'
```
**Expected Response:** `HTTP/1.1 200 OK` with `access_token` and `user` object.

### 3. Client SPA Deep Routing
Open browser and navigate directly to:
- `https://proxyproof.vercel.app/student`
- `https://proxyproof.vercel.app/organiser`
- `https://proxyproof.vercel.app/admin`  
**Expected Behavior:** Pages load cleanly without 404 errors due to `frontend/vercel.json` rewrites.

---

## 7. Native Mobile Application Production Build Guide

The native mobile app (`mobile/`) handles physical Bluetooth Low Energy (BLE) peripheral advertising and central scanning on physical mobile hardware.

### 7.1 Mobile Configuration
In `mobile/.env`, point to your production Vercel backend:
```env
EXPO_PUBLIC_API_URL=https://proxyproof.vercel.app
```

### 7.2 Native Permissions Configured
- **Android Manifest (`mobile/app.json`):**
  - `BLUETOOTH`, `BLUETOOTH_ADMIN`
  - `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE` (Android 12+ / API 31+)
  - `ACCESS_FINE_LOCATION` (Android 6.0–11 beacon discovery requirement)
- **iOS Info.plist (`mobile/app.json`):**
  - `NSBluetoothAlwaysUsageDescription`: "ProxyProof requires Bluetooth to verify physical presence during class attendance sessions."
  - `NSBluetoothPeripheralUsageDescription`: "ProxyProof allows organisers to broadcast Bluetooth session attendance beacons."

### 7.3 Building Standalone Binaries via EAS Build
```bash
# 1. Install Expo Application Services CLI
npm install -g eas-cli
eas login

# 2. Configure EAS project in mobile directory
cd mobile
eas build:configure

# 3. Build Android APK / App Bundle (AAB)
eas build --platform android --profile production

# 4. Build iOS Archive (IPA)
eas build --platform ios --profile production
```

---

## 8. Remaining Operational Tasks & Manual Next Steps

1. **Custom Domain Configuration:**
   Add institutional domain (e.g. `attendance.university.edu`) under **Project Settings $\to$ Domains** in Vercel. Configure DNS CNAME record pointing to `cname.vercel-dns.com`.
2. **Apple Developer & Google Play Console Accounts:**
   Submit EAS-built `.aab` to Google Play Internal Testing and `.ipa` to Apple TestFlight.
3. **Database SSL & Backup Verification:**
   Verify automated daily backups in your PostgreSQL provider (Neon/Supabase) and ensure connection pooling connection limits match expected student concurrency.
