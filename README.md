# ANPR Ingestion Portal — LASPA MicroCam-02

A real-time **Automatic Number Plate Recognition (ANPR)** camera ingestion portal and traffic monitoring dashboard for **LASPA (Lagos State Parking Authority)**.

The system receives vehicle capture payloads from physical **ARH XCW-MICROCAM-02** nodes via a secure HTTP-to-HTTPS bridge (ngrok), screens plates against a watchlist using wildcard pattern matching, persists records in a cloud PostgreSQL database, and broadcasts updates instantly via WebSockets to a glassmorphic management dashboard — available both locally and on a deployed Render instance.

---

## 🏗️ System Architecture

```
┌─────────────────┐     HTTP POST      ┌──────────────────────┐
│  ARH Camera     │ ─────────────────► │  ngrok HTTP Tunnel   │
│  (HTTP-only)    │                    │  (public URL bridge) │
└─────────────────┘                    └──────────┬───────────┘
                                                  │ proxies to
                                                  ▼
                                       ┌──────────────────────┐
                                       │  Local Backend       │
                                       │  Node.js / Express   │
                                       │  Port 5000           │
                                       └───┬──────────────┬───┘
                                           │              │
                              saves to DB  │              │ background relay (HTTPS)
                                           ▼              ▼
                                    ┌──────────┐   ┌────────────────────┐
                                    │ Supabase │   │  Render Backend    │
                                    │ Postgres │◄──│  (laspa-anpr-      │
                                    └──────────┘   │   backend)         │
                                                   └────────┬───────────┘
                                                            │ WebSocket broadcast
                                                            ▼
                                                   ┌────────────────────┐
                                                   │  Render Frontend   │
                                                   │  (laspa-anpr-      │
                                                   │   frontend)        │
                                                   └────────────────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
| :--- | :--- | :--- |
| **ARH Camera (XCW-MICROCAM-02)** | Embedded ANPR Engine | Captures images, performs on-device OCR, and pushes payloads via HTTP multipart/form-data or JSON |
| **ngrok HTTP Tunnel** | ngrok free tier | Bridges the camera's plain HTTP uploads to the local HTTPS-capable backend. Provides a stable public URL the camera can POST to |
| **Local Backend** | Node.js, Express, Prisma, `ws` | Receives camera payloads, normalises both native ARH and flat simulator formats, checks watchlist, saves to Supabase, broadcasts via WebSocket, and relays to Render in the background |
| **Render Backend** | Node.js, Express (deployed) | Mirror of the local backend. Receives forwarded events, persists to the same Supabase database, and broadcasts to the deployed frontend via WebSocket |
| **Supabase PostgreSQL** | PostgreSQL (cloud) | Shared persistent store for both local and Render backends. All ANPR events, flag lists, and enforcement records are stored here |
| **Local Frontend** | React, Vite, Tailwind CSS v4 | Developer/operator dashboard running on `localhost:8000`. Can point to either the local backend or the Render backend via `.env` |
| **Render Frontend** | React, Vite (static site) | Publicly accessible dashboard deployed at `laspa-anpr-frontend.onrender.com` |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with a PostgreSQL database
- [ngrok](https://ngrok.com) installed (for camera HTTP tunnel)

### 1. Clone & Install

```bash
git clone https://github.com/nzotaemmanuel/LASPA-ANPR.git
cd LASPA-ANPR

# Install all dependencies (backend + frontend)
npm install
```

### 2. Configure Environment Variables

#### Backend (`backend/.env`)

```env
PORT=5000
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<db>?schema=local_test&connection_limit=5&connect_timeout=10"
DIRECT_URL="postgresql://<user>:<password>@<host>:5432/<db>?schema=local_test&connection_limit=5&connect_timeout=10"
JWT_SECRET="your-secret-key"
RETENTION_DAYS=90
LIVE_ONLY=true

# Set to the Render backend URL to enable background event replication:
FORWARD_TO_URL=https://laspa-anpr-backend.onrender.com/api/ingest
```

#### Frontend (`frontend/.env`)

```env
# Point to Render backend (for production-equivalent local testing):
VITE_API_BASE_URL=https://laspa-anpr-backend.onrender.com
VITE_WS_BASE_URL=wss://laspa-anpr-backend.onrender.com

# Or point to local backend (for offline development):
# VITE_API_BASE_URL=http://localhost:5000
# VITE_WS_BASE_URL=ws://localhost:5000
```

### 3. Database Setup

```bash
cd backend
npx prisma db push      # Create/sync tables to Supabase
node prisma/seed.js     # Seed initial flag patterns and mock events
```

### 4. Run the Application

```bash
# From the project root — starts both backend (5000) and frontend (8000) concurrently:
npm run dev
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

### 5. Start the ngrok Tunnel (for Live Camera)

```bash
ngrok http 5000 --scheme http
```

Copy the public `http://` URL shown by ngrok (e.g. `http://5f20-102-88-114-97.ngrok-free.app`) and configure it as your camera's upload URL:

```
http://<your-ngrok-id>.ngrok-free.app/api/ingest
```

---

## 🔑 Access Credentials

| Username | Password | Role | Permissions |
| :--- | :--- | :--- | :--- |
| **admin** | `admin123` | Administrator | Full access — Dashboard, Live Feed, History, Watchlist CRUD, Simulator, Webhooks |
| **operator** | `operator123` | Duty Operator | Read-only — Dashboard, Live Feed, History Search, Simulator |

---

## 📡 Camera Ingestion API

### `POST /api/ingest`

The endpoint accepts two payload formats.

#### Format 1 — Native ARH Camera JSON
```json
{
  "result": {
    "cameraid": "XCW-MICROCAM-02",
    "location": "HIGHWAY-NORTH",
    "capture": {
      "frametime": "20260623T160000+0100"
    },
    "anpr": {
      "text": "ABC123XY",
      "confidence": "97.4",
      "country": "NG",
      "state": "LA"
    },
    "mmr": {
      "make": "Toyota", "model": "Camry", "color": "Silver"
    },
    "trigger": {
      "speed": "72.50", "speed_limit": "100.00", "direction": "forward"
    },
    "misc": {
      "gps_lat": "6.5244", "gps_lon": "3.3792"
    },
    "images": {
      "normal_img": "<base64-or-url>"
    }
  }
}
```

#### Format 2 — Flat Simulator Format
```json
{
  "camera_id": "CAM-01-NORTH",
  "plate_number": "LAG-TEST-01",
  "confidence": 98.4,
  "timestamp": "2026-06-23T16:00:00Z",
  "image": "data:image/jpeg;base64,..."
}
```

Both formats also accept `multipart/form-data` with image fields (`normal_img`, `lp_img`, `imageFile`).

---

## 🔄 Data Flow (Camera → Dashboard)

1. **Camera** sends HTTP multipart POST to the ngrok public URL.
2. **ngrok** proxies the request to `localhost:5000`.
3. **Local backend** normalises the payload, checks the watchlist, saves to Supabase, and responds **`201 Created` immediately** (the camera is unblocked in milliseconds).
4. **Background relay** — the local backend asynchronously forwards the same payload over HTTPS to the Render backend (50s timeout to allow Render to wake from sleep).
5. **Render backend** saves the event to the shared Supabase DB and broadcasts it via WebSocket to the deployed frontend.
6. **Deployed dashboard** at `laspa-anpr-frontend.onrender.com` updates in real time.

---

## 🏷️ Watchlist Wildcard Syntax

| Pattern | Matches |
| :--- | :--- |
| `STOLEN-*` or `STOLEN-%` | Any plate starting with `STOLEN-` |
| `*-XYZ` or `%-XYZ` | Any plate ending with `-XYZ` |
| `*888*` or `%888%` | Any plate containing `888` |
| `EK-432-AB` | That exact plate only |

---

## 🌐 Deployed URLs

| Service | URL |
| :--- | :--- |
| **Frontend (Render)** | https://laspa-anpr-frontend.onrender.com |
| **Backend API (Render)** | https://laspa-anpr-backend.onrender.com |
| **Health Check** | https://laspa-anpr-backend.onrender.com/health |
| **Webhook Info** | https://laspa-anpr-backend.onrender.com/api/ingest/webhook-info |

---

## 🗂️ Project Structure

```
LASPA-MicroCam-02/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express server, WebSocket setup
│   │   ├── db.js             # Prisma client with connection pool tuning
│   │   ├── logger.js         # Winston logger (daily rotating log files)
│   │   ├── routes/
│   │   │   ├── ingest.js     # Camera ingestion endpoint + background relay
│   │   │   ├── events.js     # Event query / enforcement update endpoints
│   │   │   ├── analytics.js  # Dashboard analytics aggregation
│   │   │   └── flags.js      # Watchlist CRUD
│   │   └── services/
│   │       └── purge.js      # Scheduled data retention purge
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   └── seed.js           # Initial seed data
│   ├── uploads/              # Saved vehicle images
│   └── logs/                 # Daily application logs
├── frontend/
│   └── src/
│       ├── App.jsx            # Root layout, auth, WebSocket connection
│       └── components/
│           ├── DashboardOverview.jsx
│           ├── LiveFeed.jsx
│           ├── HistoryPanel.jsx
│           ├── FlagListPanel.jsx
│           ├── SimulatorPanel.jsx
│           └── WebhookPanel.jsx
├── render.yaml                # Render deployment blueprint
├── docker-compose.yml         # Local PostgreSQL container (optional)
└── package.json               # Root orchestrator (runs both services)
```
