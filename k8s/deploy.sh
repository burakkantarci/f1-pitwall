#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLUSTER_NAME="pitwall"
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
command -v docker >/dev/null 2>&1 || err "docker is not installed"
command -v kind >/dev/null 2>&1   || err "kind is not installed — run: brew install kind"
command -v kubectl >/dev/null 2>&1 || err "kubectl is not installed"
command -v helm >/dev/null 2>&1   || err "helm is not installed — run: brew install helm"

docker info >/dev/null 2>&1 || err "Docker daemon is not running"

# -------------------------------------------------------------------
# Step 1: Create kind cluster (skip if already exists)
# -------------------------------------------------------------------
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  log "Kind cluster '$CLUSTER_NAME' already exists"
else
  log "Creating kind cluster '$CLUSTER_NAME'..."
  kind create cluster --name "$CLUSTER_NAME" --config "$SCRIPT_DIR/kind-config.yml"
fi

kubectl cluster-info --context "kind-${CLUSTER_NAME}" >/dev/null 2>&1 || err "Cannot connect to cluster"
kubectl config use-context "kind-${CLUSTER_NAME}"

# -------------------------------------------------------------------
# Step 2: Build Docker images
# -------------------------------------------------------------------
log "Building Docker images..."
docker build -t pitwall-api:latest       "$PROJECT_DIR/services/api"
docker build -t pitwall-ingestion:latest "$PROJECT_DIR/services/ingestion"
docker build -t pitwall-notifications:latest "$PROJECT_DIR/services/notifications"
docker build -t pitwall-frontend:latest  "$PROJECT_DIR/frontend"

# -------------------------------------------------------------------
# Step 3: Load images into kind
# -------------------------------------------------------------------
log "Loading images into kind cluster..."
kind load docker-image pitwall-api:latest       --name "$CLUSTER_NAME"
kind load docker-image pitwall-ingestion:latest --name "$CLUSTER_NAME"
kind load docker-image pitwall-notifications:latest --name "$CLUSTER_NAME"
kind load docker-image pitwall-frontend:latest  --name "$CLUSTER_NAME"

# -------------------------------------------------------------------
# Step 4: Apply base resources
# -------------------------------------------------------------------
log "Creating namespace and config..."
kubectl apply -f "$SCRIPT_DIR/namespace.yml"
kubectl apply -f "$SCRIPT_DIR/configmap.yml"
kubectl apply -f "$SCRIPT_DIR/secrets.yml"

# -------------------------------------------------------------------
# Step 5: Deploy PostgreSQL and wait
# -------------------------------------------------------------------
log "Deploying PostgreSQL..."
kubectl apply -f "$SCRIPT_DIR/postgres.yml"
wait_for_ready "app=postgres" 120

# -------------------------------------------------------------------
# Step 6: Deploy Redis and wait
# -------------------------------------------------------------------
log "Deploying Redis..."
kubectl apply -f "$SCRIPT_DIR/redis.yml"
wait_for_ready "app=redis" 60

# -------------------------------------------------------------------
# Step 7: Run DB migration
# -------------------------------------------------------------------
log "Running database migration..."

# Create migration configmap from SQL file
kubectl create configmap db-migrations \
  --namespace "$NAMESPACE" \
  --from-file="001_initial.sql=$PROJECT_DIR/database/migrations/001_initial.sql" \
  --dry-run=client -o yaml | kubectl apply -f -

# Delete previous migration job if it exists
kubectl delete job db-migrate --namespace "$NAMESPACE" --ignore-not-found=true

kubectl apply -f "$SCRIPT_DIR/db-migrate.yml"
wait_for_job "db-migrate" 60

# -------------------------------------------------------------------
# Step 8: Deploy Elastic OTel kube-stack (operator + collectors)
# -------------------------------------------------------------------
log "Setting up Elastic OpenTelemetry stack..."
helm repo add open-telemetry 'https://open-telemetry.github.io/opentelemetry-helm-charts' --force-update 2>/dev/null

kubectl create namespace opentelemetry-operator-system 2>/dev/null || true

kubectl create secret generic elastic-secret-otel \
  --namespace opentelemetry-operator-system \
  --from-literal=elastic_otlp_endpoint='https://my-observability-project-da5871.ingest.us-central1.gcp.elastic.cloud:443' \
  --from-literal=elastic_api_key='OUg4bW9Kd0JoYnU2NlkyV0x2ZUw6ZVZlLUZlaEFCWnF3UlhncUU0LXZadw==' \
  --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install opentelemetry-kube-stack open-telemetry/opentelemetry-kube-stack \
  --namespace opentelemetry-operator-system \
  --values 'https://raw.githubusercontent.com/elastic/elastic-agent/refs/tags/v9.3.1/deploy/helm/edot-collector/kube-stack/managed_otlp/values.yaml' \
  --version '0.12.4' \
  --wait --timeout 180s

log "Waiting for OTel operator pods..."
kubectl wait --namespace opentelemetry-operator-system --for=condition=ready pod --all --timeout=180s

# -------------------------------------------------------------------
# Step 9: Deploy application services
# -------------------------------------------------------------------
log "Deploying application services..."
kubectl apply -f "$SCRIPT_DIR/api.yml"
kubectl apply -f "$SCRIPT_DIR/ingestion.yml"
kubectl apply -f "$SCRIPT_DIR/notifications.yml"
kubectl apply -f "$SCRIPT_DIR/frontend.yml"

# -------------------------------------------------------------------
# Step 10: Wait for all deployments
# -------------------------------------------------------------------
log "Waiting for all deployments to be ready..."
kubectl rollout status deployment/api           --namespace "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/ingestion     --namespace "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/notifications --namespace "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/frontend      --namespace "$NAMESPACE" --timeout=120s

# -------------------------------------------------------------------
# Done
# -------------------------------------------------------------------
echo ""
log "PitWall is running on Kubernetes!"
echo ""
echo "  Frontend:   http://localhost:5173"
echo "  API:        http://localhost:3001"
echo "  Ingestion:  http://localhost:8000"
echo ""
echo "  Seed data:  curl -X POST http://localhost:8000/sync/season/2024"
echo ""
echo "  kubectl get pods -n pitwall"
echo ""
