#!/bin/bash
set -e

echo "=== PitWall Seed Script ==="

# Wait for services to be ready
echo "Waiting for Postgres..."
until docker compose exec postgres pg_isready -U pitwall -q; do
  sleep 2
done
echo "Postgres ready."

echo "Waiting for ingestion service..."
until curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  sleep 2
done
echo "Ingestion service ready."

# Sync 2024 season from Ergast
echo "Syncing 2024 season data..."
curl -sf -X POST http://localhost:8000/sync/season/2024
echo ""

# Wait for sync to complete
echo "Waiting for sync to complete..."
sleep 10

echo "=== Seed complete ==="
