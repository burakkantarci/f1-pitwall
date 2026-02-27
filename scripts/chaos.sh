#!/bin/bash
set -e

echo "=== PitWall Chaos Scenarios ==="

case "${1:-all}" in
  latency)
    echo "Injecting latency (200-2000ms for 60s)..."
    curl -sf -X POST http://localhost:3001/api/chaos/latency \
      -H 'Content-Type: application/json' \
      -d '{"min_ms": 200, "max_ms": 2000, "duration_s": 60}'
    ;;
  errors)
    echo "Injecting 30% error rate for 60s..."
    curl -sf -X POST http://localhost:3001/api/chaos/errors \
      -H 'Content-Type: application/json' \
      -d '{"rate": 0.3, "duration_s": 60}'
    ;;
  memory)
    echo "Starting memory leak..."
    curl -sf -X POST http://localhost:3001/api/chaos/memory-leak
    ;;
  cache)
    echo "Flushing Redis cache..."
    curl -sf -X POST http://localhost:3001/api/chaos/cache-flush
    ;;
  db-slow)
    echo "Injecting slow queries (500ms for 60s)..."
    curl -sf -X POST http://localhost:3001/api/chaos/db-slow \
      -H 'Content-Type: application/json' \
      -d '{"delay_ms": 500, "duration_s": 60}'
    ;;
  clear)
    echo "Clearing all chaos injections..."
    curl -sf -X DELETE http://localhost:3001/api/chaos
    ;;
  status)
    echo "Current chaos status:"
    curl -sf http://localhost:3001/api/chaos/status | python3 -m json.tool
    ;;
  all)
    echo "Running all chaos scenarios in sequence..."
    echo ""
    $0 latency
    sleep 5
    $0 errors
    sleep 5
    $0 cache
    sleep 5
    $0 db-slow
    echo ""
    echo "All chaos active. Run '$0 status' to check, '$0 clear' to stop."
    ;;
  *)
    echo "Usage: $0 {latency|errors|memory|cache|db-slow|clear|status|all}"
    exit 1
    ;;
esac

echo ""
echo "Done."
