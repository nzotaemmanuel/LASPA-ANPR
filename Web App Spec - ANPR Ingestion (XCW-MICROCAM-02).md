# Web Application Specification: ANPR Camera Data Ingestion Portal

**Project:** LASPA MicroCam-02
**Camera Model:** ARH XCW-MICROCAM-02
**Version:** 2.0 (Current Implementation)
**Last Updated:** June 2026

---

## 1. Introduction

This document describes the technical specification and current implementation of the LASPA ANPR Camera Data Ingestion Portal. The system ingests, processes, and displays real-time vehicle capture data from ARH XCW-MICROCAM-02 Automatic Number Plate Recognition (ANPR) cameras.

The primary objectives are:
- Accept live ANPR captures from physical camera hardware over plain HTTP
- Screen plate numbers against a configurable security watchlist in real time
- Persist all events to a cloud database with full ANPR enrichment metadata
- Provide real-time live monitoring and historical analysis via a web dashboard
- Replicate data transparently to a fully deployed cloud portal accessible to remote operators

---

## 2. System Architecture

The system uses a **local-first, cloud-replicated** architecture to bridge the camera's HTTP-only upload capability with a cloud HTTPS backend.

### 2.1 Architecture Diagram

```
┌─────────────────────┐
│  ARH XCW-MICROCAM   │  ← Captures plate via embedded OCR
│  (HTTP-only device) │
└────────┬────────────┘
         │ HTTP POST (multipart/form-data or JSON)
         │ to: http://<ngrok-id>.ngrok-free.app/api/ingest
         ▼
┌─────────────────────┐
│   ngrok Tunnel      │  ← Bridges HTTP camera to local HTTPS server
│   (public HTTP URL) │
└────────┬────────────┘
         │ proxied to localhost:5000
         ▼
┌─────────────────────────────────────────────────────────┐
│                 Local Backend (Port 5000)                │
│  Node.js · Express · Prisma ORM · ws WebSocket          │
│                                                          │
│  1. Normalise payload (native ARH or simulator format)  │
│  2. Match plate against FlagList (wildcard patterns)    │
│  3. Save event to Supabase PostgreSQL                   │
│  4. Broadcast event via WebSocket to local frontend     │
│  5. Return 201 to camera immediately ← (no timeout)     │
│  6. [Background] Forward payload to Render backend      │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
   saves   │                          │ HTTPS POST (async, background)
           ▼                          ▼
  ┌─────────────────┐      ┌──────────────────────────┐
  │ Supabase        │      │  Render Backend           │
  │ PostgreSQL      │◄─────│  (laspa-anpr-backend)     │
  │ (shared DB)     │      │  Node.js · Express        │
  └─────────────────┘      └──────────┬───────────────┘
                                      │ WebSocket broadcast
                                      ▼
                           ┌──────────────────────────┐
                           │  Render Frontend          │
                           │  (laspa-anpr-frontend)   │
                           │  React · Vite static site │
                           └──────────────────────────┘
```

### 2.2 Component Summary

| Component | Technology | Deployment | Role |
| :--- | :--- | :--- | :--- |
| **ARH Camera** | XCW-MICROCAM-02 embedded | On-premise (LAN) | Captures images, performs on-device OCR, pushes HTTP payloads |
| **ngrok Tunnel** | ngrok free tier | Local machine | Publishes a stable HTTP URL that the camera can reach; proxies to `localhost:5000` |
| **Local Backend** | Node.js 18, Express, Prisma, `ws` | Developer machine | Core ingestion engine: normalises, validates, saves, broadcasts, and relays |
| **Render Backend** | Node.js 18, Express, Prisma, `ws` | Render (cloud) | Mirror of local backend; receives relayed events, saves to shared DB, broadcasts to deployed frontend |
| **Supabase PostgreSQL** | PostgreSQL 15 | Supabase (cloud) | Shared persistent database for all events, enforcement records, and flag lists |
| **Local Frontend** | React 18, Vite, Tailwind CSS v4 | `localhost:8000` | Developer/operator dashboard; configurable to point at local or Render backend |
| **Deployed Frontend** | React 18, Vite (static site) | Render (cloud) | Public-facing LASPA operator dashboard |

---

## 3. Data Model

Each ingested event is stored in the `Event` table with the following fields:

### 3.1 Core Fields
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Unique event identifier |
| `timestamp` | DateTime | Original camera capture time (parsed from `frametime` / `frametimems`) |
| `cameraId` | String | Camera identifier (from `cameraid` or `location` field) |
| `plateNumber` | String | OCR-extracted plate text, uppercased |
| `confidence` | Float | OCR confidence score (0–100%) |
| `imageUrl` | String | Path to saved vehicle image (`/uploads/…` or external URL) |
| `isFlagged` | Boolean | True if plate matched a watchlist pattern |
| `flagReason` | String? | Label from the matching watchlist rule |
| `rawPayload` | String? | Full JSON payload stored for audit and inspection |

### 3.2 ANPR Enrichment Fields
| Field | Description |
| :--- | :--- |
| `anprType`, `anprCountry`, `anprState` | Plate type, country code, state code |
| `anprBgColor`, `anprColor` | Plate background and text colour |
| `anprResultCnt` | Number of ANPR results returned by the camera |

### 3.3 MMR (Make/Model Recognition) Fields
| Field | Description |
| :--- | :--- |
| `mmrMake`, `mmrModel`, `mmrSubmodel` | Vehicle make, model, and submodel |
| `mmrCategory`, `mmrColor` | Vehicle category (Sedan, SUV, etc.) and colour |
| `mmrModelConf`, `mmrCategoryConf`, `mmrColorConf` | Confidence scores for each MMR result |

### 3.4 Trigger / Speed Fields
| Field | Description |
| :--- | :--- |
| `triggerSpeed` | Vehicle speed at time of capture (km/h) |
| `triggerSpeedLimit` | Speed limit at camera location (km/h) |
| `triggerDirection` | Direction of travel (`forward` / `backward`) |
| `triggerCategory`, `triggerVclass` | Vehicle category and class from trigger system |

### 3.5 GPS & Location Fields
| Field | Description |
| :--- | :--- |
| `gpsLat`, `gpsLon` | Camera GPS coordinates |
| `countryLong`, `countryShort` | Country name and ISO code |
| `stateLong`, `stateShort` | State/region name and code |
| `location` | Free-text location label from camera |

### 3.6 LASPA Enforcement Fields
| Field | Description |
| :--- | :--- |
| `isFined`, `fineAmount` | Whether a fine was issued and its amount (₦) |
| `isDisputed` | Whether the fine is under dispute |
| `isClamped`, `isTowed`, `isImpounded` | Physical enforcement actions taken |
| `isBooked`, `bookingHours` | Whether vehicle is on a parking booking |
| `revenue` | Total revenue attributed to this capture event |

---

## 4. Functional Requirements

### 4.1 Camera Ingestion Bridge (Implemented)
- Accept HTTP `POST` uploads from cameras via a public ngrok URL
- Handle both **native ARH JSON format** (`result.anpr.text`, `result.cameraid`) and **flat simulator format** (`camera_id`, `plate_number`)
- Accept payloads as `application/json` or `multipart/form-data` (with image file attachments)
- Handle **split uploads** where the camera sends the JSON metadata and the JPEG image in two separate sequential requests; correlate them by source IP within a 5-second window
- Sanitise unreplaced camera template variables (e.g. `$(ANPR_TYPE)` placeholders)
- Preserve the original capture timestamp from the camera — not the server receive time

### 4.2 Real-Time Monitoring (Implemented)
- Broadcast new events to all connected WebSocket clients instantly after ingestion
- Surface a **Live Monitor Feed** showing plate number, camera, timestamp, OCR confidence, vehicle details, and enforcement status
- Trigger a **high-priority alert modal** for any plate matching the watchlist, with audio alert
- Display WebSocket connection health indicator in the top navigation bar

### 4.3 Asynchronous Cloud Replication (Implemented)
- After responding to the camera with `201`, forward the payload to the Render backend **in the background** (fire-and-forget)
- Use a 50-second timeout for the background relay to accommodate Render free-tier cold-start delays
- Log relay success or failure without impacting the camera or local frontend

### 4.4 Watchlist / Flag List (Implemented)
- Maintain a configurable `FlagList` of plate patterns with labels
- Support wildcards: `*` and `%` as multi-character wildcards in patterns
- Match case-insensitively against every ingested plate in real time
- Admin-only CRUD operations via the Flag List Manager panel

### 4.5 Historical Data Retrieval (Implemented)
- Query all events with filtering by date/time range and plate wildcard pattern
- Sort by capture timestamp descending
- Support pagination and inline enforcement record editing for admin users

### 4.6 Raw Payload Inspection (Implemented)
- Store a circular buffer of the last 50 raw HTTP requests in memory
- Expose via `GET /api/ingest/recent-payloads` for the Webhook Inspector panel
- Display source IP, content type, processing status, received time, and full expandable JSON

### 4.7 Analytics Dashboard (Implemented)
- Real-time metrics: total events today, flagged captures, average confidence, active cameras
- Hourly capture volume chart
- Top plates and camera station ranking

### 4.8 Camera Simulator (Implemented)
- In-browser tool to POST simulated ANPR events without physical hardware
- Supports all payload fields, image upload, and enforcement field overrides
- Useful for testing watchlist rules, UI behaviour, and Render relay

### 4.9 Data Retention (Implemented)
- Scheduled background job runs every 24 hours
- Deletes events older than `RETENTION_DAYS` (default: 90 days)
- Configurable via environment variable

---

## 5. Technical Stack (Current Implementation)

| Layer | Technology | Version |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js | 18+ |
| **Backend Framework** | Express | 4.x |
| **WebSocket Server** | `ws` library | 8.x |
| **ORM** | Prisma | 5.x |
| **Database** | PostgreSQL (Supabase cloud) | 15 |
| **Logging** | Winston + `winston-daily-rotate-file` | — |
| **File Uploads** | Multer (disk storage) | — |
| **Frontend Framework** | React | 18 |
| **Frontend Bundler** | Vite | 5.x |
| **Frontend Styling** | Tailwind CSS | v4 |
| **Charts** | Chart.js via `react-chartjs-2` | — |
| **Icons** | Lucide React | — |
| **HTTP Tunnel** | ngrok | free tier |
| **Cloud Hosting** | Render | free tier |
| **Database Host** | Supabase | free tier |
| **CI/CD** | GitHub → Render auto-deploy | — |

---

## 6. API Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/ingest` | Main camera ingestion endpoint |
| `GET` | `/api/ingest/webhook-info` | Returns current webhook URL and schema |
| `GET` | `/api/ingest/recent-payloads` | Returns last 50 raw payloads (in-memory) |
| `GET` | `/api/events` | Query events with filters |
| `PATCH` | `/api/events/:id` | Update enforcement fields on an event |
| `DELETE` | `/api/events/:id` | Delete an event (admin only) |
| `GET` | `/api/analytics/summary` | Dashboard summary metrics |
| `GET` | `/api/analytics/hourly` | Hourly capture volume |
| `GET` | `/api/flags` | List all watchlist rules |
| `POST` | `/api/flags` | Create a new watchlist rule |
| `DELETE` | `/api/flags/:id` | Delete a watchlist rule |
| `GET` | `/health` | Server and database health check |

---

## 7. Security Considerations

### 7.1 Data in Transit
- All camera-to-server communication travels over the public internet via the ngrok tunnel. While ngrok encrypts the tunnel itself, the camera's outgoing leg uses plain HTTP (device limitation). The ngrok-to-local-server leg is encrypted.
- All communication between the local backend and Render, and between the Render backend and the deployed frontend, uses HTTPS/WSS.

### 7.2 Access Control
- Role-Based Access Control (RBAC) is enforced at the frontend:
  - **Admin:** Full access including watchlist management and event deletion
  - **Operator:** Read-only access to all monitoring and history views
- Credentials are stored in browser `localStorage` (session persistence only).

### 7.3 Data Retention
- Automated purge job removes events older than the configured retention period (default 90 days) to comply with data privacy requirements.
- Image files are stored locally in `backend/uploads/` and are purged alongside their database records.

### 7.4 Secrets Management
- All credentials (`DATABASE_URL`, `JWT_SECRET`, `FORWARD_TO_URL`) are stored in `.env` files that are excluded from version control via `.gitignore`.
- Render environment variables are configured directly in the Render Dashboard and are never committed to the repository.

---

## 8. Deployment Configuration

### 8.1 Render Blueprint (`render.yaml`)
Two services are declared:
1. **`laspa-anpr-backend`** — Node.js web service running `node src/index.js`
2. **`laspa-anpr-frontend`** — Static site serving the Vite `dist/` build

### 8.2 Environment Variables (Render Dashboard)
The following must be set manually in the Render service settings:

| Variable | Service | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Backend | Supabase PostgreSQL connection string with pooling params |
| `DIRECT_URL` | Backend | Supabase direct (non-pooled) connection for Prisma migrations |
| `PORT` | Backend | `5000` |
| `NODE_ENV` | Backend | `production` |
| `RETENTION_DAYS` | Backend | Number of days to retain event records |
| `VITE_API_BASE_URL` | Frontend | `https://laspa-anpr-backend.onrender.com` |
| `VITE_WS_BASE_URL` | Frontend | `wss://laspa-anpr-backend.onrender.com` |