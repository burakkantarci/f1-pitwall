# When Kubernetes Apps Break: Agentic SRE in Action

A hands-on workshop where you deploy a real-time F1 race data platform on minikube, intentionally break it with cascading failures, and use Edge Delta's agentic SRE workflows to investigate - instead of manually digging through logs.

## What You'll Learn

- Deploy a multi-service application (PitWall) to a local Kubernetes cluster
- Trigger real-world failure patterns: database outages, Redis kills, cascading service failures
- Use Edge Delta's agentic investigation threads to analyze and troubleshoot issues
- Ask follow-up questions about operational signals instead of manually searching logs

## About the App

PitWall is a real-time Formula 1 race monitoring dashboard - a simplified version of what F1 engineering teams see on their pit wall screens during races. It pulls real data from the 2024 F1 season (24 races, 24 drivers including Verstappen, Norris, Leclerc, and more).

**What you see in the browser:**

- **Race Calendar** (home page) - The full 2024 F1 season with all races, circuits, and dates
- **Live Dashboard** (`/live`) - The main screen. When a race replay is running, it shows a real-time position tower, live event feed (pit stops, fastest laps, overtakes), lap time charts, and a WebSocket connection indicator
- **Driver Standings** (`/standings`) - Championship table with points and wins
- **Admin Panel** (`/admin`) - Controls for starting race replays at 1x-50x speed and triggering chaos scenarios

**How it works:** The ingestion service pulls historical F1 data and can replay races at accelerated speed. Events flow through Redis pub/sub to the notifications service and are streamed to the browser via WebSocket. All services emit structured JSON logs, making this an ideal app for demonstrating observability and agentic SRE workflows.

## Architecture

PitWall is a 4-service platform with PostgreSQL, Redis, and an OpenTelemetry collector:

```
                    +-----------+
                    | Frontend  |
                    | (React)   |
                    +-----+-----+
                          |
                    REST + WebSocket
                          |
                    +-----+-----+
                    |    API    |
                    | (Fastify) |
                    +--+-----+--+
                       |     |
            +----------+     +----------+
            |                           |
      +-----+-----+            +-------+------+
      | PostgreSQL |            |    Redis     |
      +-----+-----+            +---+------+---+
            |                       |      |
      +-----+-----+         +------+  +---+----------+
      | Ingestion  +---------+        | Notifications |
      | (Python)   | pub/sub          | (Node.js)     |
      +------------+                  +--------------+
```

See [Architecture](docs/architecture.md) for details.

## Prerequisites

| Tool | Install |
|------|---------|
| Docker Desktop | [docker.com](https://www.docker.com/products/docker-desktop/) |
| minikube | `brew install minikube` |
| kubectl | `brew install kubectl` or included with Docker Desktop |
| Git | `brew install git` |

No prior experience with AI-driven or agentic systems is required.

## Quick Start

```bash
# Clone and deploy
git clone https://github.com/burakkantarci/f1-pitwall.git
cd f1-pitwall

# Deploy to minikube (builds images, applies manifests, seeds data)
./k8s/deploy-minikube.sh

# Install Edge Delta agent
# Go to app.edgedelta.com > Connectors > Create Kubernetes connector
# Copy the API key from the install instructions
ED_API_KEY=your-key-here ./k8s/edge-delta.sh

# Generate baseline traffic
./scripts/generate-traffic.sh

# Break things
./scripts/chaos.sh redis-kill       # Kill Redis - partial failure
./scripts/chaos.sh meltdown         # Total system degradation
./scripts/chaos.sh meltdown-restore # Bring it all back
```

## Workshop Guide

Follow the step-by-step [Workshop Guide](docs/workshop-guide.md) for the full 30-minute session.

## Failure Scenarios

See [Failure Scenarios](docs/failure-scenarios.md) for all available chaos scenarios and their expected effects.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite, Tailwind |
| API | Fastify, TypeScript |
| Ingestion | Python, FastAPI |
| Notifications | TypeScript, ioredis |
| Database | PostgreSQL 16 |
| Cache/PubSub | Redis 7 |
| Observability | OpenTelemetry, structured JSON logging (Pino/Structlog) |
| Orchestration | minikube, Kubernetes |

## Project Structure

```
services/
  api/            - REST API + WebSocket server + chaos engineering endpoints
  ingestion/      - Data ingestion from F1 APIs + race replay engine
  notifications/  - Event-driven notification handlers via Redis pub/sub
frontend/         - React SPA with live race dashboard
database/
  migrations/     - SQL schema
k8s/              - Kubernetes manifests + deployment scripts
scripts/          - Chaos, traffic generation, replay, and seed scripts
docs/             - Workshop guide, failure scenarios, architecture
```

## Cleanup

```bash
helm uninstall edgedelta -n edgedelta 2>/dev/null
kubectl delete namespace pitwall edgedelta 2>/dev/null
minikube stop
```

## Resources

- [Edge Delta](https://www.edgedelta.com) - Agentic observability platform
- [OpenF1 API](https://api.openf1.org/v1) - Live and historical F1 session data
- [Ergast API](https://api.jolpi.ca/ergast/f1) - Race results and standings
