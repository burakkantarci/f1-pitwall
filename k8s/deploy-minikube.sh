#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NAMESPACE="pitwall"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

wait_for_ready() {
  local label=$1
  local timeout=${2:-120}
  log "Waiting for pods with label $label to be ready (timeout: ${timeout}s)..."
  kubectl wait --namespace "$NAMESPACE" --for=condition=ready pod -l "$label" --timeout="${timeout}s"
}

wait_for_job() {
  local job=$1
  local timeout=${2:-120}
  log "Waiting for job/$job to complete (timeout: ${timeout}s)..."
  kubectl wait --namespace "$NAMESPACE" --for=condition=complete "job/$job" --timeout="${timeout}s"
}

# -------------------------------------------------------------------
# Pre-flight checks
# -------------------------------------------------------------------
command -v docker >/dev/null 2>&1   || err "docker is not installed"
command -v minikube >/dev/null 2>&1  || err "minikube is not installed - run: brew install minikube"
command -v kubectl >/dev/null 2>&1   || err "kubectl is not installed"

docker info >/dev/null 2>&1 || err "Docker daemon is not running"

# -------------------------------------------------------------------
# Step 1: Start minikube (skip if already running)
# -------------------------------------------------------------------
if minikube status --format='{{.Host}}' 2>/dev/null | grep -q "Running"; then
  log "minikube is already running"
else
  log "Starting minikube..."
  minikube start --driver=docker --cpus=4 --memory=8192
fi

kubectl cluster-info >/dev/null 2>&1 || err "Cannot connect to cluster"

# -------------------------------------------------------------------
# Step 2: Build Docker images inside minikube's Docker daemon
# -------------------------------------------------------------------
log "Configuring Docker to use minikube's daemon..."
eval $(minikube docker-env)

log "Building Docker images (native arm64 on Apple Silicon)..."
docker build -t pitwall-api:latest       "$PROJECT_DIR/services/api"
docker build -t pitwall-ingestion:latest "$PROJECT_DIR/services/ingestion"
docker build -t pitwall-notifications:latest "$PROJECT_DIR/services/notifications"
docker build -t pitwall-frontend:latest  "$PROJECT_DIR/frontend"

# -------------------------------------------------------------------
# Step 3: Apply base resources
# -------------------------------------------------------------------
log "Creating namespace and config..."
kubectl apply -f "$SCRIPT_DIR/namespace.yml"
kubectl apply -f "$SCRIPT_DIR/configmap.yml"
kubectl apply -f "$SCRIPT_DIR/secrets.yml"

# -------------------------------------------------------------------
# Step 4: Deploy PostgreSQL and wait
# -------------------------------------------------------------------
log "Deploying PostgreSQL..."
kubectl apply -f "$SCRIPT_DIR/postgres.yml"
wait_for_ready "app=postgres" 120

# -------------------------------------------------------------------
# Step 5: Deploy Redis and wait
# -------------------------------------------------------------------
log "Deploying Redis..."
kubectl apply -f "$SCRIPT_DIR/redis.yml"
wait_for_ready "app=redis" 60

# -------------------------------------------------------------------
# Step 6: Run DB migration
# -------------------------------------------------------------------
log "Running database migration..."

kubectl create configmap db-migrations \
  --namespace "$NAMESPACE" \
  --from-file="001_initial.sql=$PROJECT_DIR/database/migrations/001_initial.sql" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl delete job db-migrate --namespace "$NAMESPACE" --ignore-not-found=true
kubectl apply -f "$SCRIPT_DIR/db-migrate.yml"
wait_for_job "db-migrate" 60

# -------------------------------------------------------------------
# Step 7: Deploy OTel Collector
# -------------------------------------------------------------------
log "Deploying OpenTelemetry Collector..."
kubectl apply -f "$SCRIPT_DIR/otel-collector.yml"
wait_for_ready "app=otel-collector" 60

# -------------------------------------------------------------------
# Step 8: Deploy application services
# -------------------------------------------------------------------
log "Deploying application services..."
kubectl apply -f "$SCRIPT_DIR/api.yml"
kubectl apply -f "$SCRIPT_DIR/ingestion.yml"
kubectl apply -f "$SCRIPT_DIR/notifications.yml"
kubectl apply -f "$SCRIPT_DIR/frontend.yml"

# -------------------------------------------------------------------
# Step 9: Wait for all deployments
# -------------------------------------------------------------------
log "Waiting for all deployments to be ready..."
kubectl rollout status deployment/api           --namespace "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/ingestion     --namespace "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/notifications --namespace "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/frontend      --namespace "$NAMESPACE" --timeout=120s

# -------------------------------------------------------------------
# Step 10: Seed data
# -------------------------------------------------------------------
log "Seeding 2024 season data..."

INGESTION_POD=$(kubectl get pod -n "$NAMESPACE" -l app=ingestion -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n "$NAMESPACE" "pod/$INGESTION_POD" 8000:8000 &
PF_PID=$!
sleep 2

curl -sf -X POST http://localhost:8000/sync/season/2024 || warn "Seed request failed - you can retry manually"

# Poll until race data appears (max 60s)
log "Waiting for season data..."
for i in $(seq 1 30); do
  COUNT=$(kubectl exec -n "$NAMESPACE" statefulset/postgres -- \
    psql -U pitwall -d pitwall -t -c "SELECT COUNT(*) FROM races;" 2>/dev/null | tr -d ' ')
  if [ -n "$COUNT" ] && [ "$COUNT" -gt 0 ] 2>/dev/null; then
    log "Found $COUNT races in database."
    break
  fi
  printf "."
  sleep 2
done
echo ""

# Sync Bahrain GP telemetry from OpenF1 (positions, laps, pit stops)
log "Syncing Bahrain GP telemetry from OpenF1 API..."
BAHRAIN_SESSION_KEY=9472

# Update session with OpenF1 key
kubectl exec -n "$NAMESPACE" statefulset/postgres -- \
  psql -U pitwall -d pitwall -c \
  "UPDATE sessions SET external_id = 'openf1-${BAHRAIN_SESSION_KEY}' WHERE id = 1;" >/dev/null 2>&1

# Trigger telemetry sync
curl -sf -X POST "http://localhost:8000/sync/openf1/session/${BAHRAIN_SESSION_KEY}" || warn "OpenF1 sync failed - you can retry manually"

# Poll until positions appear (max 60s)
log "Waiting for telemetry data..."
for i in $(seq 1 30); do
  POS_COUNT=$(kubectl exec -n "$NAMESPACE" statefulset/postgres -- \
    psql -U pitwall -d pitwall -t -c "SELECT COUNT(*) FROM positions;" 2>/dev/null | tr -d ' ')
  if [ -n "$POS_COUNT" ] && [ "$POS_COUNT" -gt 0 ] 2>/dev/null; then
    log "Synced $POS_COUNT position records."
    break
  fi
  printf "."
  sleep 2
done
echo ""

kill $PF_PID 2>/dev/null || true

# -------------------------------------------------------------------
# Done
# -------------------------------------------------------------------
echo ""
log "PitWall is running on minikube!"
echo ""

API_URL=$(minikube service api -n "$NAMESPACE" --url 2>/dev/null || echo "http://localhost:3001")
FRONTEND_URL=$(minikube service frontend -n "$NAMESPACE" --url 2>/dev/null || echo "http://localhost:5173")
INGESTION_URL=$(minikube service ingestion -n "$NAMESPACE" --url 2>/dev/null || echo "http://localhost:8000")

echo "  Frontend:   $FRONTEND_URL"
echo "  API:        $API_URL"
echo "  Ingestion:  $INGESTION_URL"
echo ""
echo "  kubectl get pods -n pitwall"
echo ""
echo "Next steps:"
echo "  1. Install Edge Delta agent:  ./k8s/edge-delta.sh"
echo "  2. Generate traffic:          ./scripts/generate-traffic.sh"
echo "  3. Trigger chaos:             ./scripts/chaos.sh redis-kill"
echo ""
