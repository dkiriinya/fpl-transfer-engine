# AI Engineering Execution Rules

## Anti-Vibe Coding Mandates

1. **No Schema Recreation:** The Neon database schema is already live. Do NOT output DDL, database creation scripts, or ORM migrations. Connect and query using raw SQL or lightweight parameterized queries via `psycopg2-binary`.

2. **Strict Separation of Concerns:**
   - `frontend/` acts purely as an interactive presentation and orchestration layer. It fetches live user squad state from the official FPL API, passes current player IDs and bank balance to the FastAPI backend, and renders the result. It does NOT compute points or projections.
   - `backend/` handles all database reads from Neon, mathematical modeling, and PuLP constraint optimization.

3. **Persistent Identity:** On initial mount, the client checks for an existing `fpl_team_id` in `localStorage`. If present, auto-load the dashboard and trigger `/api/optimize`. Provide a lightweight "Change Team" toggle to update it.

4. **Strict Typing:** Every FastAPI route must use explicit Pydantic request/response schemas. Next.js must define matching TypeScript interfaces for all network boundaries in `lib/types.ts`.

5. **BANNED UI Libraries:** `shadcn/ui`, Material UI, and Bootstrap are strictly **BANNED**. Build custom, bespoke components using pure Tailwind CSS and Radix UI headless primitives only.

6. **No Hardcoded Secrets:** `DATABASE_URL` and `FPL_TEAM_ID` are loaded exclusively from environment variables. Never inline credentials in source code. The `.env` file is gitignored.

7. **No DDL / No Migrations:** The `teams`, `players`, `player_projections`, and `fixtures` tables already exist and are populated by an external n8n workflow. The backend only SELECTs from these tables.

8. **Gameweek Auto-Detection:** The current gameweek is resolved server-side from the FPL bootstrap-static API. Never require the user to input a GW number manually.

## Execution Phases

- **Phase 1:** Scaffold root `docker-compose.yml`, `.env.example`, `.gitignore`, `agents.md`.
- **Phase 2:** Backend solver microservice — FastAPI + PuLP MILP reading from Neon.
- **Phase 3:** Frontend dashboard — Next.js 14 App Router, Tailwind Theme Factory, proxy routes, bespoke components.
