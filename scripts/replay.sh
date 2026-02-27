#!/bin/bash
set -e

SESSION_ID=${1:-1}
SPEED=${2:-10}

echo "=== PitWall Replay ==="
echo "Session ID: $SESSION_ID"
echo "Speed: ${SPEED}x"

curl -sf -X POST "http://localhost:8000/replay?session_id=${SESSION_ID}&speed=${SPEED}"
echo ""
echo "Replay started. Watch the frontend at http://localhost:5173/live"
