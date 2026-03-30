# Failure Scenarios

PitWall includes two types of chaos scenarios: **app-level** (injected via API endpoints) and **K8s-level** (infrastructure manipulation via kubectl).

All scenarios are triggered through `./scripts/chaos.sh`.

---

## App-Level Chaos

These inject failures within the API service process. They produce rich log output and are useful for demonstrating application-level observability.

### Latency Injection

```bash
./scripts/chaos.sh latency
```

**What it does:** Adds 200-2000ms random delay to every API request (except /health and /chaos endpoints) for 60 seconds.

**Affected services:** API only (but frontend and traffic generator experience slow responses)

**Log patterns:**
- API: Chaos span `chaos.latency_injection` with `chaos.delay_ms` attribute
- Pino access logs show elevated response times

**Edge Delta signal:** Latency anomaly on pitwall-api

---

### Error Injection

```bash
./scripts/chaos.sh errors
```

**What it does:** 30% of API requests return HTTP 500 for 60 seconds.

**Affected services:** API only

**Log patterns:**
- API: Chaos span `chaos.error_injection`, HTTP 500 responses logged
- Traffic generator shows red 500 status codes

**Edge Delta signal:** Error rate spike on pitwall-api

---

### Memory Leak

```bash
./scripts/chaos.sh memory
```

**What it does:** Allocates arrays every 100ms without cleanup. Continues until cleared.

**Affected services:** API process memory grows until OOMKill or manual clear

**Log patterns:**
- API: "Chaos: memory leak activated"
- Eventually: K8s OOMKilled event if memory limit is hit

**Edge Delta signal:** Memory pressure alerts, potential pod restart

**Clear:** `./scripts/chaos.sh clear`

---

### Cache Flush

```bash
./scripts/chaos.sh cache
```

**What it does:** Runs Redis FLUSHALL, wiping all cached data.

**Affected services:** API (cache misses, all requests hit DB directly)

**Log patterns:**
- API: "Chaos: cache flushed"
- Subsequent requests show increased DB query volume

**Edge Delta signal:** Temporary latency increase as cache rebuilds

---

### Slow DB Queries

```bash
./scripts/chaos.sh db-slow
```

**What it does:** Injects `pg_sleep(0.5)` before every DB query for 60 seconds.

**Affected services:** API (every database-backed endpoint slows down)

**Log patterns:**
- API: Chaos span `chaos.db_slow_injection` with 500ms delay
- Pino access logs show ~500ms+ response times

**Edge Delta signal:** Database latency anomaly

---

### DB Pool Exhaustion

```bash
./scripts/chaos.sh db-pool-exhaust
```

**What it does:** Acquires all available PostgreSQL connection pool slots and holds them for 60 seconds. New queries cannot get a connection and will timeout.

**Affected services:** API (all DB-dependent routes timeout)

**Log patterns:**
- API: "Chaos: DB pool exhausted" with connection count
- Subsequent DB queries log connection timeout errors

**Edge Delta signal:** Connection timeout errors across multiple API endpoints

---

### Redis Pub/Sub Flood

```bash
./scripts/chaos.sh redis-flood
```

**What it does:** Publishes 50 garbage messages per 100ms to Redis pub/sub channels for 60 seconds. The notifications service must process all of them.

**Affected services:** Notifications (overwhelmed with processing), Redis (increased load)

**Log patterns:**
- Notifications: High-frequency "Position change: CHAOS_FLOOD" log entries
- Redis: Elevated memory and CPU from message throughput

**Edge Delta signal:** Log volume anomaly on notifications service, unusual event patterns

---

## K8s-Level Chaos

These manipulate Kubernetes resources directly, causing real infrastructure failures with authentic cross-service cascading.

### Database Kill

```bash
./scripts/chaos.sh db-kill
```

**What it does:** Scales the PostgreSQL StatefulSet to 0 replicas. The database pod is terminated.

**Affected services:**
- **API**: All DB queries return `ECONNREFUSED`. REST endpoints that query races, drivers, standings, positions all fail.
- **Ingestion**: SQLAlchemy `OperationalError` on any write attempt. Replay fails if running.
- **Notifications**: Unaffected (uses Redis only)

**Log patterns:**
- API (Pino): `{"err": {"message": "connect ECONNREFUSED 10.x.x.x:5432"}, ...}`
- Ingestion (Structlog): `{"event": "Replay error", "error": "OperationalError(...)"}`

**Edge Delta signal:** Multi-service database connectivity failure. Agent should correlate API and ingestion errors to the same root cause.

**Restore:** `./scripts/chaos.sh db-restore`

---

### Redis Kill

```bash
./scripts/chaos.sh redis-kill
```

**What it does:** Scales the Redis Deployment to 0 replicas. The Redis pod is terminated.

**Affected services:**
- **API**: Cache reads fail (falls back to DB), WebSocket handler loses Redis subscription
- **Notifications**: Loses Redis pub/sub subscription, logs disconnect errors, goes silent
- **Ingestion**: Cannot publish events via Redis, but DB writes still work

**Log patterns:**
- API (Pino): Redis connection error logs, WebSocket subscription failures
- Notifications (Pino): `{"err": {"message": "Connection is closed"}, ...}`
- Ingestion (Structlog): Redis publish failures

**Edge Delta signal:** Cross-service Redis connectivity failure. Three services with different error messages but the same root cause.

**Restore:** `./scripts/chaos.sh redis-restore`

---

### Ingestion Crash

```bash
./scripts/chaos.sh ingestion-crash
```

**What it does:** Scales the ingestion Deployment to 0 replicas.

**Affected services:**
- **API**: Proxy requests to ingestion (`/api/admin/replay`) return connection refused
- **Frontend**: Race replay stops, no new data flows
- **Notifications**: Stops receiving events (no publisher), but no errors

**Log patterns:**
- API (Pino): fetch error when proxying to ingestion service
- Notifications: Silence (no events to process - absence of logs is the signal)

**Edge Delta signal:** Service unavailability. Agent should detect both the explicit errors in API and the anomalous silence in notifications.

**Restore:** `./scripts/chaos.sh ingestion-restore`

---

### Meltdown (Combined)

```bash
./scripts/chaos.sh meltdown
```

**What it does:** Kills DB, Redis, and ingestion in sequence, then injects API-level latency and errors. Total system degradation.

**Affected services:** All of them, simultaneously, with distinct error signatures per service.

**Why this is the best demo scenario:** Every service logs different errors for different reasons, all happening at once. This is the scenario that best demonstrates the value of agentic SRE - manually correlating these signals across 4 services would take significant time, but the agent can do it in seconds.

**Restore:** `./scripts/chaos.sh meltdown-restore`
