#!/bin/bash
set -e

API_URL="${PITWALL_API_URL:-http://localhost:3001}"
NAMESPACE="${PITWALL_NAMESPACE:-pitwall}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo "=== PitWall Chaos Scenarios ==="
echo ""

case "${1:-help}" in
  # --------------- App-level chaos (API endpoints) ---------------
  latency)
    log "Injecting latency (200-2000ms for 60s)..."
    curl -sf -X POST "$API_URL/api/chaos/latency" \
      -H 'Content-Type: application/json' \
      -d '{"min_ms": 200, "max_ms": 2000, "duration_s": 60}'
    ;;
  errors)
    log "Injecting 30% error rate for 60s..."
    curl -sf -X POST "$API_URL/api/chaos/errors" \
      -H 'Content-Type: application/json' \
      -d '{"rate": 0.3, "duration_s": 60}'
    ;;
  memory)
    log "Starting memory leak..."
    curl -sf -X POST "$API_URL/api/chaos/memory-leak"
    ;;
  cache)
    log "Flushing Redis cache..."
    curl -sf -X POST "$API_URL/api/chaos/cache-flush"
    ;;
  db-slow)
    log "Injecting slow queries (500ms for 60s)..."
    curl -sf -X POST "$API_URL/api/chaos/db-slow" \
      -H 'Content-Type: application/json' \
      -d '{"delay_ms": 500, "duration_s": 60}'
    ;;
  db-pool-exhaust)
    log "Exhausting DB connection pool for 60s..."
    curl -sf -X POST "$API_URL/api/chaos/db-pool-exhaust" \
      -H 'Content-Type: application/json' \
      -d '{"duration_s": 60}'
    ;;
  redis-flood)
    log "Flooding Redis pub/sub (50 msgs/100ms for 60s)..."
    curl -sf -X POST "$API_URL/api/chaos/redis-flood" \
      -H 'Content-Type: application/json' \
      -d '{"rate": 50, "duration_s": 60}'
    ;;
  clear)
    log "Clearing all app-level chaos injections..."
    curl -sf -X DELETE "$API_URL/api/chaos"
    ;;
  status)
    echo "Current chaos status:"
    curl -sf "$API_URL/api/chaos/status" | python3 -m json.tool
    ;;

  # --------------- K8s-level chaos (infrastructure) ---------------
  db-kill)
    log "Killing PostgreSQL (scaling to 0 replicas)..."
    warn "Cascade: API DB queries fail, ingestion writes fail, notifications unaffected"
    kubectl scale statefulset postgres -n "$NAMESPACE" --replicas=0
    ;;
  db-restore)
    log "Restoring PostgreSQL..."
    kubectl scale statefulset postgres -n "$NAMESPACE" --replicas=1
    log "Waiting for postgres to be ready..."
    kubectl wait --namespace "$NAMESPACE" --for=condition=ready pod -l app=postgres --timeout=60s
    ;;

  redis-kill)
    log "Killing Redis (scaling to 0 replicas)..."
    warn "Cascade: WebSocket stops, notifications disconnects, pub/sub dead, cache gone"
    kubectl scale deployment redis -n "$NAMESPACE" --replicas=0
    ;;
  redis-restore)
    log "Restoring Redis..."
    kubectl scale deployment redis -n "$NAMESPACE" --replicas=1
    log "Waiting for redis to be ready..."
    kubectl wait --namespace "$NAMESPACE" --for=condition=ready pod -l app=redis --timeout=60s
    warn "Services may need a moment to reconnect..."
    ;;

  ingestion-crash)
    log "Killing ingestion service (scaling to 0 replicas)..."
    warn "Cascade: replay stops, no new data, API replay proxy fails"
    kubectl scale deployment ingestion -n "$NAMESPACE" --replicas=0
    ;;
  ingestion-restore)
    log "Restoring ingestion service..."
    kubectl scale deployment ingestion -n "$NAMESPACE" --replicas=1
    kubectl rollout status deployment/ingestion --namespace "$NAMESPACE" --timeout=60s
    ;;

  # --------------- Combined scenarios ---------------
  meltdown)
    log "MELTDOWN: Triggering total system degradation..."
    echo ""
    $0 db-kill
    sleep 2
    $0 redis-kill
    sleep 2
    $0 ingestion-crash
    sleep 2
    $0 latency
    $0 errors
    echo ""
    warn "All systems degraded. Watch Edge Delta for multi-service error correlation."
    warn "Run '$0 meltdown-restore' to recover."
    ;;
  meltdown-restore)
    log "Restoring all systems..."
    echo ""
    $0 clear
    $0 db-restore
    $0 redis-restore
    $0 ingestion-restore
    echo ""
    log "All systems restored. Watch logs return to normal."
    ;;

  all)
    log "Running app-level chaos scenarios in sequence..."
    echo ""
    $0 latency
    sleep 5
    $0 errors
    sleep 5
    $0 cache
    sleep 5
    $0 db-slow
    echo ""
    log "All app-level chaos active. Run '$0 status' to check, '$0 clear' to stop."
    ;;

  help|*)
    echo "Usage: $0 <scenario>"
    echo ""
    echo "App-level chaos (API endpoints):"
    echo "  latency          Inject 200-2000ms random latency (60s)"
    echo "  errors           Inject 30% HTTP 500 error rate (60s)"
    echo "  memory           Start memory leak"
    echo "  cache            Flush Redis cache"
    echo "  db-slow          Inject 500ms DB query delay (60s)"
    echo "  db-pool-exhaust  Exhaust DB connection pool (60s)"
    echo "  redis-flood      Flood Redis pub/sub channels (60s)"
    echo "  clear            Clear all app-level chaos"
    echo "  status           Show current chaos status"
    echo "  all              Run all app-level chaos in sequence"
    echo ""
    echo "K8s-level chaos (infrastructure):"
    echo "  db-kill          Scale PostgreSQL to 0 replicas"
    echo "  db-restore       Scale PostgreSQL back to 1"
    echo "  redis-kill       Scale Redis to 0 replicas"
    echo "  redis-restore    Scale Redis back to 1"
    echo "  ingestion-crash  Scale ingestion service to 0"
    echo "  ingestion-restore Scale ingestion back to 1"
    echo ""
    echo "Combined scenarios:"
    echo "  meltdown         Kill DB + Redis + ingestion + inject API chaos"
    echo "  meltdown-restore Restore everything"
    echo ""
    echo "Environment variables:"
    echo "  PITWALL_API_URL    API base URL (default: http://localhost:3001)"
    echo "  PITWALL_NAMESPACE  K8s namespace (default: pitwall)"
    exit 1
    ;;
esac

echo ""
echo "Done."
