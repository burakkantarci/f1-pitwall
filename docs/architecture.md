# PitWall Architecture

## Overview

PitWall is a real-time Formula 1 race data platform built as a microservices application. It ingests live and historical F1 data, processes it, and streams updates to a browser-based dashboard via WebSocket.

## Services

### API (Fastify/TypeScript) - Port 3001
The central gateway. Serves REST endpoints for race data, driver standings, and live positions. Runs a WebSocket server that streams real-time events to the frontend. Also hosts the chaos engineering endpoints used in the workshop.

**Depends on:** PostgreSQL (queries), Redis (caching + pub/sub subscription)

### Ingestion (Python/FastAPI) - Port 8000
Pulls data from external F1 APIs (OpenF1 for live data, Ergast for historical). Processes positions, lap times, and pit stops, writes to PostgreSQL, and publishes events to Redis pub/sub channels. Includes a replay engine that re-plays historical sessions at accelerated speed.

**Depends on:** PostgreSQL (writes), Redis (event publishing)

### Notifications (Node.js/TypeScript) - No external port
Subscribes to Redis pub/sub channels and processes events: position changes, pit stops, fastest laps, safety cars. Logs structured events that Edge Delta can analyze.

**Depends on:** Redis (subscription only)

### Frontend (React/Vite) - Port 5173
Single-page application with a live race dashboard, position tower, lap time charts, and an admin panel for triggering replays and chaos scenarios.

**Depends on:** API (REST + WebSocket)

## Data Flow

```
External F1 APIs
      |
      v
  Ingestion  --(writes)-->  PostgreSQL  <--(queries)--  API  --(REST/WS)-->  Frontend
      |                                                  |
      +--(publishes)-->  Redis Pub/Sub  <--(subscribes)--+
                              |
                    +---------+---------+
                    |                   |
              Notifications       API WebSocket
              (log events)        (stream to browser)
```

## Infrastructure

| Component | Image | K8s Resource | Port |
|-----------|-------|-------------|------|
| PostgreSQL | postgres:16-alpine | StatefulSet | 5432 |
| Redis | redis:7-alpine | Deployment | 6379 |
| OTel Collector | otel/opentelemetry-collector-contrib | Deployment | 4317 (gRPC), 4318 (HTTP) |

## Observability

All services emit structured JSON logs:
- **Node.js services**: Pino logger with JSON output
- **Python service**: Structlog with JSON rendering and ISO timestamps

All services send traces to the OpenTelemetry Collector via gRPC (port 4317):
- HTTP request spans (auto-instrumented)
- Database query spans (pg, SQLAlchemy)
- Redis operation spans
- External API call spans (httpx)
- Custom spans for chaos injection, replay, event processing

The OTel Collector exports to debug by default. Edge Delta collects container logs independently at the node level via its K8s agent.

## How Chaos Scenarios Interrupt Data Flow

| Scenario | Broken Link | Effect |
|----------|------------|--------|
| DB Kill | PostgreSQL gone | API queries fail, ingestion writes fail, notifications unaffected |
| Redis Kill | Redis gone | Pub/sub dead, WebSocket stops, cache misses, notifications disconnects |
| Ingestion Crash | Ingestion gone | No new data, replay stops, API proxy to ingestion fails |
| Meltdown | All of the above | Every service logs distinct error patterns simultaneously |

This is what makes PitWall effective for demonstrating agentic SRE: each chaos scenario produces different error signatures across different services, giving the AI agent distinct signals to correlate.
