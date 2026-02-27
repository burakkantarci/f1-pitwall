#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== PitWall Seed Script ==="
echo ""

# Wait for Postgres
echo "Waiting for Postgres..."
until docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres pg_isready -U pitwall -q 2>/dev/null; do
  printf "."
  sleep 2
done
echo " Ready."

# Wait for ingestion service
echo "Waiting for ingestion service..."
until curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  printf "."
  sleep 2
done
echo " Ready."

# Sync 2024 season from Ergast
echo ""
echo "Syncing 2024 season data from Ergast API..."
curl -sf -X POST http://localhost:8000/sync/season/2024
echo ""
echo "Sync job started in background. Waiting for completion..."

# Poll until data appears
for i in $(seq 1 30); do
  COUNT=$(docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
    psql -U pitwall -d pitwall -t -c "SELECT COUNT(*) FROM races;" 2>/dev/null | tr -d ' ')
  if [ "$COUNT" != "" ] && [ "$COUNT" -gt 0 ] 2>/dev/null; then
    echo "Found $COUNT races in database."
    break
  fi
  printf "."
  sleep 2
done

# Print summary
echo ""
echo "=== Database Summary ==="
docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
  psql -U pitwall -d pitwall -c "
    SELECT 'seasons' AS table_name, COUNT(*) AS rows FROM seasons
    UNION ALL SELECT 'drivers', COUNT(*) FROM drivers
    UNION ALL SELECT 'circuits', COUNT(*) FROM circuits
    UNION ALL SELECT 'races', COUNT(*) FROM races
    UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
    UNION ALL SELECT 'standings', COUNT(*) FROM standings
    ORDER BY table_name;
  "

echo ""
echo "=== Seed Complete ==="
echo ""
echo "Open http://localhost:5173 to view the app."
echo "Run ./scripts/replay.sh to start a race replay."
echo "Run ./scripts/chaos.sh to inject chaos."
