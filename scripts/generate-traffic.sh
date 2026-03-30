#!/bin/bash

API_URL="${PITWALL_API_URL:-http://localhost:3001}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENDPOINTS=(
  "GET /api/health"
  "GET /api/races"
  "GET /api/drivers"
  "GET /api/live/session"
  "GET /api/live/positions"
)

echo "=== PitWall Traffic Generator ==="
echo "Target: $API_URL"
echo "Press Ctrl+C to stop."
echo ""

while true; do
  for endpoint in "${ENDPOINTS[@]}"; do
    METHOD=$(echo "$endpoint" | cut -d' ' -f1)
    EPATH=$(echo "$endpoint" | cut -d' ' -f2)
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X "$METHOD" "${API_URL}${EPATH}" 2>/dev/null || echo "000")

    TIMESTAMP=$(date +%H:%M:%S)
    if [[ "$HTTP_CODE" == 2* ]]; then
      echo -e "[${TIMESTAMP}] ${GREEN}${HTTP_CODE}${NC} $METHOD $EPATH"
    elif [[ "$HTTP_CODE" == 0* ]]; then
      echo -e "[${TIMESTAMP}] ${RED}ERR${NC} $METHOD $EPATH (connection refused)"
    else
      echo -e "[${TIMESTAMP}] ${RED}${HTTP_CODE}${NC} $METHOD $EPATH"
    fi
  done
  sleep 1
done
