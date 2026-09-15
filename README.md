# FPL Transfer Decision Engine ⚽️⚡️

A high-performance Fantasy Premier League (FPL) transfer and squad optimization engine. Combines a Mixed-Integer Linear Programming (**MILP**) solver built with FastAPI & PuLP with an ultra-dark, high-density Next.js analytics dashboard.

---

## 🚀 Key Features

- **Mathematical MILP Solver:** Solves the combinatorial transfer problem using Mixed-Integer Linear Programming (`PuLP`) while strictly enforcing all FPL constraints (budget, club quotas, valid formations, starting XI, and captaincy).
- **Multi-Gameweek Planning Horizons:** Optimize transfers over **1 GW** (immediate punt), **3 GWs** (medium-term swing), or **5 GWs** (long-term structural plan).
- **Chip Simulation & Decision Deck:** Evaluates and benchmarks all chip strategies simultaneously:
  - **Standard** (free transfers + point-hit penalty optimization)
  - **Wildcard** (free unlimited permanent transfers)
  - **Free Hit** (unlimited 1-GW squad overhaul)
  - **Bench Boost** (active 15-man scoring)
  - **Triple Captain** (3x multiplier on optimal captain)
  - Provides contextual verdicts (`RECOMMENDED`, `CONSIDER`, `HOLD / SAVE`) with data-driven reasoning.
- **OpenFPL Forecasting Engine:** Dynamic statistical fixture modeling, expected goal involvements ($xG$, $xA$), clean sheet probabilities, and home/away difficulty weighting.
- **Live Squad & Gameweek Auto-Detection:** Automatically resolves current gameweek and live team state from the official Fantasy Premier League API given a Team ID.
- **High-Density Technical UI:** Engineered with an ultra-dark aesthetic, monospace tabular data hierarchy, stark transfer delta split-view, and wireframe pitch visualization.

---

## 🏗️ Architecture & Tech Stack

```mermaid
graph TD
    User([Manager / Browser]) <-->|Next.js 14 App Router| Frontend[Frontend Service :3000]
    Frontend <-->|Proxy API / SWR| FPLAPI[Official FPL API]
    Frontend <-->|POST /optimize| Backend[FastAPI Solver :8000]
    Backend <-->|PuLP MILP Solver| Solver[CBC Optimizer]
    Backend <-->|SQL Queries| DB[(Neon PostgreSQL)]
```

### Backend Microservice
- **Framework:** FastAPI / Python 3.11+
- **Optimization:** PuLP MILP (Coin-OR CBC Solver)
- **Database Driver:** `psycopg2-binary` (queries Neon Serverless PostgreSQL)
- **Validation:** Pydantic v2 schemas

### Frontend Dashboard
- **Framework:** Next.js 14 (App Router) + React 18
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Radix UI headless primitives + Lucide Icons
- **Design Tokens:** High-contrast brutalist palette (`surface-canvas: #000000`, `border-hard: #1e293b`, `accent-gain: #10b981`, `accent-loss: #f43f5e`)
- **Typography:** `Space Grotesk` (Headings) & `JetBrains Mono` / `Geist Mono` (Tabular Data)

---

## 📁 Repository Structure

```
fpl-decision-engine/
├── backend/
│   ├── main.py              # FastAPI server, endpoints, and PuLP MILP solver
│   ├── openfpl_engine.py    # OpenFPL projection & fixture pipeline
│   ├── check_db.py          # Database connectivity & health checker
│   ├── requirements.txt     # Python backend dependencies
│   └── Dockerfile           # Backend container definition
├── frontend/
│   ├── app/                 # Next.js 14 App Router (pages & API proxies)
│   ├── components/          # High-density UI components (Pitch, Chips, Delta)
│   ├── lib/                 # Types, FPL API client, and server utilities
│   ├── tailwind.config.ts   # Design system theme tokens
│   ├── package.json         # Frontend dependencies & scripts
│   └── Dockerfile           # Frontend container definition
├── docker-compose.yml       # Multi-container orchestration
├── .env.example             # Template for required environment variables
├── .gitignore               # Strict secret & build artifact ignore rules
├── DESIGN.md                # UI/UX design directives & token specifications
└── agents.md                # Anti-vibe coding guidelines & architectural rules
```

---

## ⚙️ Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- *(Optional for local dev)* Python 3.11+, Node.js 18+ / npm

---

### 1. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your actual parameters:

```env
# Neon PostgreSQL Connection String (sslmode=require)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require&channel_binding=require

# Your FPL Team ID (numeric ID from your FPL profile URL)
FPL_TEAM_ID=1234567

# Backend internal URL for Next.js server proxy
BACKEND_URL=http://backend:8000
```

> [!IMPORTANT]
> The `.env` file contains database credentials and must **NEVER** be committed to Git. It is automatically ignored by `.gitignore`.

---

### 2. Running with Docker Compose (Recommended)

Start both frontend and backend microservices:

```bash
docker compose up --build
```

- **Frontend Application:** [http://localhost:3000](http://localhost:3000)
- **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

### 3. Running Locally Without Docker

#### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## 📡 API Endpoints

### Backend (`:8000`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health and DB probe |
| `POST` | `/optimize` | Solves MILP transfer model for given squad & chip parameters |
| `POST` | `/projections/generate` | Triggers OpenFPL multi-gameweek forecasting engine |

### Frontend Proxy (`:3000`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bootstrap` | Returns FPL static metadata (current GW, players, teams) |
| `GET` | `/api/squad/[teamId]/[gw]` | Fetches manager's live 15-man squad & bank balance |
| `POST` | `/api/optimize` | Proxies optimization request to Python solver microservice |

---

## 🛡️ License & Attribution

- Built for Fantasy Premier League managers.
- Data sourced via the official Fantasy Premier League API and Neon PostgreSQL projections.
