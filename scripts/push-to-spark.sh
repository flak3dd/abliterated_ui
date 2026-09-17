#!/usr/bin/env bash
# ==============================================================================
# Push Multi-Tier Pipeline & Compute Services to DGX Spark (192.168.4.103)
# ==============================================================================
set -e

KEY="/Users/adminuser/Library/Application Support/NVIDIA/Sync/config/nvsync.key"
SPARK_HOST="${SPARK_HOST:-192.168.4.103}"
SPARK_USER="${SPARK_USER:-flak3dd}"
SPARK_DIR="${SPARK_DIR:-/home/flak3dd/abliterated_ui}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "======================================================================"
echo "⚡ PUSHING ABLITERATED SERVICES TO DGX SPARK"
echo "   Target: $SPARK_USER@$SPARK_HOST:$SPARK_DIR"
echo "======================================================================"

# 1. Test SSH connectivity
echo -n "• Testing SSH connection to $SPARK_HOST... "
if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$KEY" "$SPARK_USER@$SPARK_HOST" "echo OK" >/dev/null 2>&1; then
  echo "CONNECTED ✔"
else
  echo "FAILED ✖"
  echo "  Could not reach $SPARK_USER@$SPARK_HOST using key: $KEY"
  echo "  Falling back to SSH host alias 'flak3dd' or 'sync-flak3dd'..."
  SPARK_TARGET="sync-flak3dd"
fi

TARGET="${SPARK_TARGET:-$SPARK_USER@$SPARK_HOST}"

# 2. Ensure remote project directory exists
echo "• Creating remote directory $SPARK_DIR on Spark..."
if [ -n "$SPARK_TARGET" ]; then
  ssh "$TARGET" "mkdir -p $SPARK_DIR"
else
  ssh -o StrictHostKeyChecking=no -i "$KEY" "$TARGET" "mkdir -p $SPARK_DIR"
fi

# 3. Synchronize files with rsync
echo "• Syncing compute, gateway, pubsub, and scripts..."
RSYNC_SSH="ssh -o StrictHostKeyChecking=no"
if [ -z "$SPARK_TARGET" ]; then
  RSYNC_SSH="ssh -o StrictHostKeyChecking=no -i '$KEY'"
fi

rsync -avz --progress \
  -e "$RSYNC_SSH" \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.expo' \
  "$REPO_ROOT/compute" \
  "$REPO_ROOT/gateway" \
  "$REPO_ROOT/services" \
  "$REPO_ROOT/scripts" \
  "$REPO_ROOT/edge" \
  "$REPO_ROOT/.githooks" \
  "$TARGET:$SPARK_DIR/"

echo "======================================================================"
echo "✔ Synchronization to DGX Spark complete!"
echo "======================================================================"
echo ""
echo "To start the compute coordinator on the Spark:"
echo "  ssh flak3dd@$SPARK_HOST"
echo "  cd $SPARK_DIR"
echo "  uvicorn compute.app:app --host 0.0.0.0 --port 8090 --reload"
echo ""
echo "Or run the diagnostic suite:"
echo "  bash scripts/rapid-debug.sh"
echo "======================================================================"
