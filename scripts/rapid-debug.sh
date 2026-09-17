#!/usr/bin/env bash
# ==============================================================================
# Sovereign Spark Rapid Debugger (Ripgrep Sub-Second Trace Mining)
# ==============================================================================

QUERY="${1:-ERROR}"
CONTEXT="${2:-3}"

SEARCH_PATHS=("/mnt/nvme/logs" "logs" "/tmp/spark-sandboxes")
VALID_PATHS=()

for p in "${SEARCH_PATHS[@]}"; do
    if [ -d "$p" ]; then
        VALID_PATHS+=("$p")
    fi
done

echo "======================================================================"
echo "⚡ SOVEREIGN SPARK RAPID LOG DEBUGGER"
echo "   Query:   '$QUERY'"
echo "   Context: ±$CONTEXT lines"
echo "   Target:  ${VALID_PATHS[*]:-(current directory)}"
echo "======================================================================"

T0=$(python3 -c "import time; print(time.time())")

if command -v rg >/dev/null 2>&1; then
    rg --color=always \
       --line-number \
       --smart-case \
       --context "$CONTEXT" \
       --max-columns 200 \
       --type-add 'log:*.{log,jsonl,txt,out}' \
       -t log \
       "$QUERY" "${VALID_PATHS[@]:-.}" || echo "No matches found for '$QUERY'."
else
    echo "⚠️ Ripgrep (rg) not found in PATH. Falling back to grep..."
    grep -rnI -C "$CONTEXT" "$QUERY" "${VALID_PATHS[@]:-.}" 2>/dev/null || echo "No matches found."
fi

T1=$(python3 -c "import time; print(time.time())")
ELAPSED=$(python3 -c "print(f'{($T1 - $T0)*1000:.2f} ms')")

echo ""
echo "======================================================================"
echo "⏱️ Search completed in $ELAPSED."
echo "======================================================================"
