#!/usr/bin/env bash
# ==============================================================================
# Sovereign Spark: Complete Multi-Tier Services Runner & Test Suite
# ==============================================================================

set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "======================================================================"
echo "⚡ SOVEREIGN SPARK MULTI-TIER SYSTEM LAUNCHER"
echo "======================================================================"
echo "Project Directory: $PROJECT_ROOT"
echo ""

# 1. Run Phase 2 Pub/Sub & Broker Verification
echo ">>> [1/4] Running Phase 2 Pub/Sub & Event Broker Test Suite..."
node ./scripts/test-phase2-pubsub.mjs
echo ""

# 2. Run Phase 3 Edge & Maintenance Test Suite
echo ">>> [2/4] Running Phase 3 Maintenance Test Suite..."
node ./scripts/test-phase3-maintenance.mjs
echo ""

# 3. Compile & Start Go API Gateway (:8080)
echo ">>> [3/4] Preparing Go API Gateway (:8080)..."
if command -v go >/dev/null 2>&1; then
    (cd gateway && go build -o ../bin/gateway . && echo "   ✅ Go Gateway compiled successfully to bin/gateway")
    echo "   🚀 To run Go Gateway: ./bin/gateway (or GATEWAY_PORT=8080 ./bin/gateway)"
else
    echo "   ⚠️ Go compiler not detected. Skipping binary compilation."
fi
echo ""

# 4. FastAPI Compute Coordinator (:8090)
echo ">>> [4/4] FastAPI Compute & Dual-Path Router (:8090)..."
echo "   🚀 To start FastAPI Coordinator:"
echo "      uvicorn compute.app:app --host 0.0.0.0 --port 8090 --reload"
echo ""

echo "======================================================================"
echo "🎉 ALL VERIFICATION TEST SUITES PASSED!"
echo "   - Go API Gateway:         http://127.0.0.1:8080/health"
echo "   - FastAPI Coordinator:    http://127.0.0.1:8090/health"
echo "   - Web API Client UI:      http://127.0.0.1:5173/"
echo "   - Ephemeral Sandboxes:    http://127.0.0.1:17330/health"
echo "======================================================================"
