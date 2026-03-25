# PitWall

Real-time F1 race data platform with live telemetry, race tracking, and notifications.

## Architecture

- **Frontend** — React + TypeScript + Tailwind CSS (Vite). Live dashboard, race calendar, driver standings, and admin panel.
- **API** — Fastify (TypeScript). REST endpoints and WebSocket for live position updates. PostgreSQL + Redis caching.
- **Ingestion** — Python service that pulls data from OpenF1 and Ergast APIs. Handles historical sync, live polling, and race replay.
- **Notifications** — TypeScript service with event-driven handlers for position changes, pit stops, fastest laps, and safety cars.
- **Infrastructure** — Docker Compose for local dev. Kubernetes manifests in `k8s/`. OpenTelemetry collector for observability.

## Tech Stack

| Layer         | Technology                        |
|---------------|-----------------------------------|
| Frontend      | React, TypeScript, Vite, Tailwind |
| API           | Fastify, TypeScript               |
| Ingestion     | Python                            |
| Notifications | TypeScript                        |
| Database      | PostgreSQL                        |
| Cache         | Redis                             |
| Observability | OpenTelemetry                     |
| Orchestration | Docker Compose, Kubernetes        |

## Getting Started

1. Copy the environment file:
   ```sh
   cp .env.example .env
   ```

2. Start all services:
   ```sh
   docker compose -f docker-compose.otel.yml up --build
   ```

3. The frontend is available at `http://localhost:5173` and the API at `http://localhost:3001`.

## Project Structure

```
services/
  api/          — REST API + WebSocket server
  ingestion/    — Data ingestion from F1 APIs
  notifications/ — Event-driven notification handlers
frontend/       — React SPA
database/
  migrations/   — SQL migrations
k8s/            — Kubernetes manifests
scripts/        — Replay and chaos testing scripts
```

## Data Sources

- [OpenF1 API](https://api.openf1.org/v1) — Live and historical session data
- [Ergast API](https://api.jolpi.ca/ergast/f1) — Race results and standings
