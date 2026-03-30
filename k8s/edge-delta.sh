#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
err() { echo -e "${RED}[x]${NC} $1"; exit 1; }

if [ -z "$ED_API_KEY" ]; then
  err "ED_API_KEY environment variable is required."
  echo ""
  echo "Get your API key from https://app.edgedelta.com"
  echo "Then run: ED_API_KEY=your-key-here ./k8s/edge-delta.sh"
  exit 1
fi

log "Adding Edge Delta Helm repo..."
helm repo add edgedelta https://helm.edgedelta.com
helm repo update

log "Installing Edge Delta agent..."
helm upgrade edgedelta edgedelta/edgedelta -i \
  --set secretApiKey.value="$ED_API_KEY" \
  --namespace edgedelta \
  --create-namespace

log "Waiting for Edge Delta agent to be ready..."
kubectl wait --namespace edgedelta --for=condition=ready pod -l app.kubernetes.io/name=edgedelta --timeout=120s

log "Edge Delta agent is running!"
echo ""
echo "  kubectl get pods -n edgedelta"
echo ""
echo "  Logs from all pitwall services will appear in your Edge Delta dashboard"
echo "  within 1-2 minutes at https://app.edgedelta.com"
echo ""
