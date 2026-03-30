# Workshop Guide: When Kubernetes Apps Break

Step-by-step instructions for the 30-minute workshop session.

---

## Pre-Workshop Setup

Run this **before** the workshop starts (takes ~5 minutes):

```bash
# 1. Clone the repo
git clone https://github.com/emrahssamdan-edge/f1-pitwall.git
cd f1-pitwall

# 2. Deploy to minikube
./k8s/deploy-minikube.sh

# 3. Install Edge Delta agent
ED_API_KEY=your-key-here ./k8s/edge-delta.sh

# 4. Verify everything is running
kubectl get pods -n pitwall
kubectl get pods -n edgedelta
```

All pods should show `Running` status. If a pod is in `CrashLoopBackOff`, check logs with `kubectl logs <pod-name> -n pitwall`.

### Access the application

```bash
# Get service URLs
minikube service list -n pitwall

# Or use port-forwarding
kubectl port-forward -n pitwall svc/api 3001:3001 &
kubectl port-forward -n pitwall svc/frontend 5173:5173 &
```

Open the frontend in your browser and verify the dashboard loads.

### Start traffic generation

In a separate terminal:

```bash
./scripts/generate-traffic.sh
```

You should see green `200` responses for all endpoints. Leave this running throughout the workshop.

---

## Act 1: The Healthy System (0:00 - 0:05)

**Goal:** Show the audience what "normal" looks like.

### Show the architecture
- 4 services: API (Fastify), Ingestion (Python), Notifications (Node.js), Frontend (React)
- PostgreSQL for persistent data, Redis for caching and pub/sub
- All services emit structured JSON logs, collected by Edge Delta

### Show the live dashboard
- Start a race replay: `./scripts/replay.sh 1 10`
- Point out the position tower updating in real-time via WebSocket
- Show the traffic generator terminal - all green 200s

### Show Edge Delta baseline
- Open Edge Delta dashboard at [app.edgedelta.com](https://app.edgedelta.com)
- Show logs flowing from all pitwall services
- Point out the structured JSON format (Pino for Node, Structlog for Python)
- This is what "healthy" looks like - remember it

---

## Act 2: First Failure - Redis Goes Down (0:05 - 0:12)

**Goal:** Demonstrate partial failure and how the agentic SRE detects it.

### Trigger the failure

```bash
./scripts/chaos.sh redis-kill
```

### What happens
- Redis pod scales to 0 - it's gone
- **Notifications service**: Loses its Redis subscription, logs disconnect errors
- **API service**: WebSocket handler loses its subscription, cache reads fail (falls back to DB)
- **Ingestion service**: Can't publish events to Redis, but DB writes still work
- **Frontend**: WebSocket stops receiving updates, dashboard freezes
- **Traffic generator**: Requests still return 200 (API falls back to DB queries)

### Show in Edge Delta
- Watch for the sudden spike in error logs from notifications and API
- Show how the agentic investigation thread identifies the common root cause: Redis connection refused
- Point out that the error messages are different per service, but the agent correlates them
- Ask the agent follow-up questions: "Which services are affected?", "When did this start?"

### Restore

```bash
./scripts/chaos.sh redis-restore
```

Watch the recovery in Edge Delta - error logs stop, normal patterns resume. Services reconnect automatically (ioredis has built-in retry).

---

## Act 3: Cascading Meltdown (0:12 - 0:20)

**Goal:** Show multi-signal correlation across a total system failure.

### Trigger the meltdown

```bash
./scripts/chaos.sh meltdown
```

This does five things in sequence:
1. Kills PostgreSQL (StatefulSet scaled to 0)
2. Kills Redis (Deployment scaled to 0)
3. Kills the ingestion service (Deployment scaled to 0)
4. Injects 200-2000ms latency on all API requests
5. Injects 30% HTTP 500 error rate on API

### What happens
- **Every service** is now logging errors, but with different signatures:
  - API: Connection refused to PostgreSQL, Redis disconnect, injected 500s, latency spikes
  - Ingestion: Gone entirely (pod terminated)
  - Notifications: Redis subscription lost
- **Traffic generator**: Mix of 500s, slow responses, and timeouts

### Show in Edge Delta
- Multiple agentic investigation threads should form
- Show how the agent distinguishes between:
  - Database connectivity issues (API + ingestion)
  - Redis connectivity issues (API + notifications)
  - Service unavailability (ingestion pod gone)
  - Application-level errors (chaos-injected 500s)
- The agent can correlate the timeline: DB went first, then Redis, then ingestion
- Ask: "What is the root cause?" - the agent should identify the infrastructure-level failures

---

## Act 4: Recovery (0:20 - 0:25)

**Goal:** Show the system recovering and the agent tracking the resolution.

### Restore everything

```bash
./scripts/chaos.sh meltdown-restore
```

This:
1. Clears app-level chaos (latency + errors)
2. Restores PostgreSQL (scales back to 1, waits for ready)
3. Restores Redis (scales back to 1, waits for ready)
4. Restores ingestion (scales back to 1, waits for rollout)

### What to observe
- Traffic generator returns to all green 200s
- Edge Delta shows error rates dropping back to baseline
- Investigation threads reflect the resolution
- Point out: the agent can tell you *when* the system recovered, not just when it broke

---

## Wrap-up and Q&A (0:25 - 0:30)

### Key takeaways
- Kubernetes applications fail in complex, cascading ways
- Different services produce different error signatures for the same root cause
- Agentic SRE automatically correlates these signals into investigation threads
- You can ask follow-up questions instead of grep-ing through logs manually

### For attendees to try later
- Clone the repo and run `./k8s/deploy-minikube.sh`
- Try individual chaos scenarios: `./scripts/chaos.sh --help`
- Explore the app-level chaos (latency, errors, memory leak, DB pool exhaustion)
- Read the [Failure Scenarios](failure-scenarios.md) doc for the full list

---

## Troubleshooting

**Pods stuck in Pending:**
```bash
kubectl describe pod <pod-name> -n pitwall
# Usually means minikube needs more resources
minikube stop && minikube start --cpus=4 --memory=8192
```

**Pods in CrashLoopBackOff:**
```bash
kubectl logs <pod-name> -n pitwall
# Common cause: DB not ready yet. Wait 30s and check again.
```

**Services don't reconnect after redis-restore:**
```bash
kubectl rollout restart deployment/notifications deployment/api -n pitwall
```

**Traffic generator shows connection refused:**
```bash
# Check if port-forward is still running, or use minikube service URLs
minikube service api -n pitwall --url
```

**Edge Delta not showing logs:**
```bash
kubectl logs -n edgedelta -l app.kubernetes.io/name=edgedelta
# Verify the API key is correct
```
