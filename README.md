# ANPR Ingestion Portal (XCW-MICROCAM-02)

A real-time Automatic Number Plate Recognition (ANPR) camera ingestion portal and traffic monitoring dashboard designed for **LASPA**.

The application receives vehicle capture JSON payloads and images from physical/simulated XCW-MICROCAM-02 nodes, screens the plate numbers against a watchlist using case-insensitive wildcard pattern matching, persists data in a local database, and broadcasts updates instantly via WebSockets to a sleek, glassmorphic management dashboard.

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express, WebSockets (`ws`), Prisma ORM
- **Frontend:** React, Vite, Tailwind CSS v4, Chart.js, Lucide Icons
- **Database:** PostgreSQL (with SQLite auto-fallback out-of-the-box)

---

## 🚀 Getting Started

### 1. Database Setup

To match the local setup environment, you can run the database on **SQLite** (default setup, requires zero configuration) or switch to a local **PostgreSQL** database:

#### **Option A: Run on SQLite (Recommended for immediate testing)**
The project is currently configured to run on SQLite. It has been seeded with initial flag patterns and mock captures. 
If you ever need to reset or switch back to SQLite, run:
```bash
cd backend
npm run switch:sqlite
```

#### **Option B: Run on PostgreSQL**
1. Make sure you have a local PostgreSQL service running (or run `docker-compose up -d` in the root folder to start a containerized instance).
2. Configure your connection credentials in `backend/.env`.
3. Switch the database provider and run migrations:
```bash
cd backend
npm run switch:postgres
npx prisma migrate dev
npm run db:seed
```

---

### 2. Installation & Running

#### **Step 1: Install Backend Dependencies**
```bash
cd backend
npm install
```

#### **Step 2: Install Frontend Dependencies**
```bash
cd frontend
npm install
```

#### **Step 3: Run the Application**
For local development, start both servers simultaneously:

**Run Backend (Port 5000):**
```bash
cd backend
npm run dev
```

**Run Frontend (Port 8000):**
```bash
cd frontend
npm run dev
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 🔑 Demo Access Credentials

The portal features Role-Based Access Control (RBAC) to restrict administrative operations like watchlist management:

| Username | Password | Role | Permissions |
| :--- | :--- | :--- | :--- |
| **admin** | `admin123` | Administrator | Full Access (Dashboard, Live Feed, History, Watchlist CRUD, Simulator) |
| **operator** | `operator123` | Duty Operator | Read-Only (Dashboard, Live Feed, History Search, Simulator) |

---

## 📷 Camera Ingestion API (`POST /api/ingest`)

Your physical or simulated **XCW-MICROCAM-02** camera can push events to:
`http://localhost:5000/api/ingest`

### Request Schema (JSON)
```json
{
  "camera_id": "CAM-01-NORTH",
  "plate_number": "STOLEN-99",
  "confidence": 98.4,
  "timestamp": "2026-06-10T14:50:00Z",
  "image": "data:image/jpeg;base64,...(base64 encoded image data)..."
}
```

*Note: The API also accepts `multipart/form-data` uploads containing file attachments as `imageFile` alongside form-data body variables.*

---

## 💡 Watchlist Wildcard Matching Syntax

Watchlist flag rules support flexible SQL/Javascript case-insensitive wildcard searches:
- `STOLEN-%` or `STOLEN-*` matches any plates starting with "STOLEN-" (e.g., `STOLEN-99`).
- `%-XYZ` or `*-XYZ` matches plates ending with "-XYZ" (e.g., `LA-123-XYZ`).
- `%888%` or `*888*` matches any plates containing "888" (e.g., `LA-888-ZZ`).
- `EK-432-AB` matches that specific plate exactly.
