# FPL Transfer Decision Engine ⚽️⚡️

A high-performance Fantasy Premier League (FPL) transfer, lineup, and chip optimization engine. Combines a **3-tier Mixed-Integer Linear Programming (MILP)** solver (`FastAPI` + `PuLP`) and the **OpenFPL v3.0 Multi-Factor Forecasting Engine** with an ultra-dark, high-density `Next.js 14` tactical dashboard.

---

## 🚀 Key Features

### 🧮 3-Tier Mathematical MILP Solver
- **Simultaneous Squad, XI & Captaincy Optimization:** Models binary decision variables for the 15-man Squad ($s_i$), 11-man Starting XI ($x_i$), and Captain ($c_i$) while enforcing all official FPL rules (valid formations, max 3 players per club, position quotas, and budget).
- **Exact FPL Selling Price Engine:** Reconstructs each squad member's purchase price from `/api/entry/{team_id}/transfers/` and `bootstrap-static` to apply the official 50% profit sell-on rule:
  $$\text{Selling Price} = \text{Purchase Price} + \left\lfloor \frac{\text{Current Price} - \text{Purchase Price}}{2} \right\rfloor$$
- **Squad Continuity & Hit Discipline:** Applies a retention tiebreaker bonus to prevent lateral transfer churn of proven starters, caps standard-play hits to at most `-4 pts`, and pairs transfers strictly **like-for-like by position** (`GKP → GKP`, `DEF → DEF`, `MID → MID`, `FWD → FWD`).
- **Multi-Gameweek Planning Horizons:** Optimize transfers over **1 GW** (immediate punt), **3 GWs** (medium-term fixture swing), or **5 GWs** (long-term structural plan).

### 🎯 Chip Simulation & Two-Set Seasonal Rules
- **Simultaneous 5-Strategy Evaluation:** Benchmarks **Standard Play**, **Wildcard**, **Free Hit**, **Bench Boost**, and **Triple Captain** in parallel for the active horizon.
- **Wildcard 4-GW Lookahead Blend:** Blends the active horizon with a 4-GW multi-week projection pool during Wildcard solves so 15-man overhauls never chase single-week mirages.
- **Two-Set Seasonal Chip Tracking:** Enforces the two-half chip system (**Set 1: GW1–GW19**, **Set 2: GW20–GW38**). Automatically inspects manager chip history to lock already-consumed chips (`USED (GWx)`) and tailor tactical verdicts (`RECOMMENDED`, `CONSIDER`, `HOLD / SAVE`).

### 📈 OpenFPL v3.0 Multi-Factor Forecasting Engine
Generates expected points ($xP$) and expected minutes ($xM$) over an **8-GW rolling horizon** by combining:
1. **Real Team Attacking & Defensive Ratings:** Computes empirical Goals For (`GF/g`) and Goals Against (`GA/g`) from finished fixtures smoothed with league standing priors, blended with official FPL Fixture Difficulty Ratings (`FDR`).
2. **50/50 Actual + Underlying Attacking Blend:** Combines actual `G90`/`A90` with `xG90`/`xA90` plus a clinical finishing/conversion efficiency modifier (`actual GI` vs `xGI`) and penalty-miss adjustments.
3. **2025/26+ Defensive Contribution Bonus:** Models the `+2 pts` bonus for `10+` defensive actions (`DEF`) and `12+` defensive actions (`MID`/`FWD`).
4. **Poisson Clean Sheet & GK Save Modeling:** Calculates clean sheet probabilities ($P(\text{CS}) = e^{-\lambda}$), goals conceded deductions, and goalkeeper save points.
5. **Empirical Form, PPG & Bonus Anchor:** Blends component-level $xP$ with regressed Form and Season Points-Per-Game (`PPG`), actual Bonus/BPS per 90 rates, ICT index involvement, cold-streak penalties, and consistency bonuses.
6. **Expected Minutes ($xM$) Model:** Weighs club start share, minutes per start, and official availability/injury flags so cameo substitutes are never over-projected.

### 🔒 Live & Historical Squad Snapshots + 5-FT Roll-Over
- **Up to 5 Banked Free Transfers:** Replays the manager's season transfer and chip history (`Wildcard` and `Free Hit` preserving banked FTs) to compute exact available free transfers (`1` to `5` FTs).
- **Automatic Planning Gameweek Resolution:** Detects when a gameweek deadline has passed and automatically targets the next actionable gameweek (`NEXT`) for transfer planning.
- **Read-Only Locked GW Snapshots:** Selecting a completed or currently live (`LIVE`) gameweek switches the dashboard into a read-only snapshot displaying the manager's actual Starting XI, Bench, Captaincy, and live/final event points.

---

## 🏗️ Architecture & Tech Stack

```mermaid
graph TD
    User([Manager / Browser]) <-->|Next.js 14 App Router| Frontend[Frontend Service :3800]
    Frontend <-->|Live Picks / History / Bootstrap| FPLAPI[Official FPL API]
    Frontend <-->|POST /optimize| Backend[FastAPI Solver :8000]
    Backend <-->|3-Tier MILP Model| Solver[PuLP CBC Optimizer]
    Backend <-->|Live Transfers & Chip History| FPLAPI
    Backend <-->|SQL Upsert & Queries| DB[(Neon PostgreSQL)]
```

### Backend Microservice (`:8000`)
- **Framework:** FastAPI / Python 3.11+
- **Optimization:** `PuLP` MILP (Coin-OR CBC Solver)
- **Forecasting:** OpenFPL v3.0 Multi-Factor Pipeline (`httpx` + `psycopg2-binary`)
- **Database:** Neon Serverless PostgreSQL (`teams`, `players`, `player_projections`)
- **Validation:** Pydantic v2 schemas

### Frontend Dashboard (`:3800`)
- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript
- **Styling:** Tailwind CSS + Radix UI headless primitives + Lucide Icons
- **Design System:** High-contrast dark brutalist palette (`surface-canvas: #000000`, `border-hard: #1e293b`, `accent-gain: #10b981`, `accent-loss: #f43f5e`)
- **Typography:** `Space Grotesk` (Headings) & `JetBrains Mono` / `Geist Mono` (Tabular Data)

---

## 📁 Repository Structure

```text
fpl-decision-engine/
├── backend/
│   ├── main.py              # FastAPI service, 3-tier PuLP MILP solver & chip evaluator
│   ├── openfpl_engine.py    # OpenFPL v3.0 multi-factor projection & DB sync pipeline
│   ├── check_db.py          # Database connectivity & schema verifier
│   ├── requirements.txt     # Python backend dependencies
│   └── Dockerfile           # Backend container definition (port 8000)
├── frontend/
│   ├── app/                 # Next.js 14 App Router (pages & API routes)
│   ├── components/          # Tactical UI (Dashboard, HeaderBar, ChipDeck, SquadPitch, TransferPanel)
│   ├── lib/                 # TypeScript schemas, FPL live/history fetchers, and API helpers
│   ├── tailwind.config.ts   # Design system theme tokens
│   ├── package.json         # Frontend dependencies & scripts (port 3800)
│   └── Dockerfile           # Frontend standalone container definition (port 3800)
├── docker-compose.yml       # Multi-container orchestration (with n8n_net support)
├── .env.example             # Template for required environment variables
├── .gitignore               # Secret & build artifact ignore rules
├── DESIGN.md                # UI/UX design directives & token specifications
└── agents.md                # Architectural rules & engineering guidelines
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

Edit `.env` with your connection details:

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
docker compose up --build -d
```

> [!NOTE]
> `docker-compose.yml` attaches the backend container to an external `n8n_default` network so scheduled `n8n` workflows can trigger `/projections/generate`. If you do not have `n8n_default` created yet, run `docker network create n8n_default` first.

- **Frontend Application:** [http://localhost:3800](http://localhost:3800)
- **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

### 3. Running Locally Without Docker

#### Backend (`:8000`)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend (`:3800`)
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:3800](http://localhost:3800).

---

## 📡 API Endpoints

### Backend (`:8000`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `POST` | `/optimize` | Runs the 3-tier MILP solver across all 5 chip modes and returns optimal transfers, starting XI, bench, captaincy, and chip verdicts |
| `POST` | `/projections/generate` | Triggers the OpenFPL v3.0 multi-factor forecasting pipeline (defaults to `horizon=8`) and upserts `teams`, `players`, and `player_projections` into PostgreSQL |

### Frontend Proxy (`:3800`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bootstrap` | Returns FPL event states (`liveGameweek`, `planningGameweek`, `events`) and player headshot photo mappings |
| `GET` | `/api/squad/[teamId]/[gw]` | Fetches the manager's 15-man squad, calculates exact banked free transfers (`1–5`), and builds `actual_lineup` snapshots for locked/live gameweeks |
| `POST` | `/api/optimize` | Proxies optimization requests to the FastAPI solver microservice |

---

## 🛡️ License & Attribution

- Built for Fantasy Premier League managers (`dkiriinya/fpl-transfer-engine`).
- Data sourced via the official Fantasy Premier League API and persisted in Neon PostgreSQL.
