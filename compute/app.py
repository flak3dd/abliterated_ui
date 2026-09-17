"""
Sovereign Spark Compute & Analytics Coordinator (FastAPI).
Utilizes Python 3.11 asyncio.TaskGroup for structured concurrency.
"""

import asyncio
from contextlib import asynccontextmanager
import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from services.pubsub.broker import event_broker, publish_ingestion_event
from services.pubsub.schema import CloudEvent, IngestionPayload
from .olap import olap_engine
from .rapids_accel import crunch_tabular_metrics, is_gpu_accelerated
from .llm_router import llm_router
from .streaming import create_sse_response

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("spark.compute")

# Background event processing flag
_worker_running = True


async def background_event_consumer():
    """
    Background worker consuming decoupled events using Python 3.11 asyncio.TaskGroup.
    """
    logger.info("⚡ [TaskGroup Worker] Background PubSub consumer worker started.")
    while _worker_running:
        try:
            # Pull batch from event broker (up to 25 events or 1.0s timeout)
            events = await event_broker.consume_batch("spark-ingestion-events", max_events=25, timeout_s=1.0)
            if not events:
                await asyncio.sleep(0.1)
                continue

            # Process events concurrently using Python 3.11 structured TaskGroup
            async with asyncio.TaskGroup() as tg:
                for evt in events:
                    tg.create_task(process_single_event(evt))

        except* Exception as eg:
            logger.error(f"[TaskGroup Worker] TaskGroup encountered exception: {eg.exceptions}")
            await asyncio.sleep(1.0)
        except Exception as e:
            logger.error(f"[TaskGroup Worker] Unexpected error: {e}")
            await asyncio.sleep(1.0)


async def process_single_event(evt: CloudEvent):
    """Process an ingested event and store in DuckDB OLAP."""
    data = evt.data or {}
    record = {
        "id": evt.id,
        "time": evt.time,
        "session_id": data.get("sessionId", "anonymous"),
        "endpoint": data.get("endpoint", "/api/ingest"),
        "target": data.get("target", "dgx_spark"),
        "client_ip": data.get("clientIp", "127.0.0.1"),
        "status_code": 200,
        "latency_ms": 1.2,
    }
    olap_engine.record_ingestion(record)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Launch background TaskGroup worker
    consumer_task = asyncio.create_task(background_event_consumer())
    yield
    # Shutdown: Stop worker cleanly
    global _worker_running
    _worker_running = False
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass
    logger.info("[Compute] Lifespan shutdown complete.")


app = FastAPI(
    title="Sovereign Spark Compute & LLM Router",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
)


@app.get("/health")
@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "service": "spark-compute-coordinator",
        "python_version": "3.11",
        "structured_concurrency": "asyncio.TaskGroup",
        "gpu_accelerated": is_gpu_accelerated(),
        "olap": olap_engine.get_stats(),
        "broker": event_broker.get_stats() if hasattr(event_broker, "get_stats") else "gcp_pubsub",
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """
    Unified LLM chat completions endpoint.
    Dynamically routes to local vLLM (Blackwell GB10) or remote Featherless AI,
    and returns SSE token stream with minimum TTFT.
    """
    body = await request.json()
    model = str(body.get("model", "qwen-abliterated"))
    stream = bool(body.get("stream", True))

    # Evaluate route
    route_name, target_url, headers = await llm_router.route_request(model, body)
    logger.info(f"[Router] Model '{model}' routed to -> {route_name} ({target_url})")

    if stream:
        return create_sse_response(target_url, headers, body)
    else:
        # Non-streaming fallback
        import httpx
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(target_url, headers=headers, json=body)
            return JSONResponse(status_code=res.status_code, content=res.json())


@app.post("/api/ingest")
async def ingest_event(payload: IngestionPayload):
    """
    Decoupled ingestion endpoint: pushes payloads into Pub/Sub queue with zero-drop guarantee.
    """
    message_id = await publish_ingestion_event(
        session_id=payload.sessionId,
        endpoint=payload.endpoint,
        payload=payload.payload,
    )
    return {
        "ok": True,
        "messageId": message_id,
        "sessionId": payload.sessionId,
        "queued": True,
    }


@app.get("/api/analytics/velocity")
async def analytics_velocity():
    """In-Process DuckDB query returning token generation velocity and TTFT distribution."""
    metrics = olap_engine.query_token_velocity()
    return {"ok": True, "metrics": metrics}


@app.post("/api/analytics/crunch")
async def analytics_crunch(request: Request):
    """NVIDIA RAPIDS (cuDF) GPU-accelerated tabular matrix crunching."""
    body = await request.json()
    records = body.get("records", [])
    crunched = crunch_tabular_metrics(records)
    return {"ok": True, "result": crunched}


@app.get("/api/analytics/parquet")
async def analytics_parquet(path: str, filter: Optional[str] = None):
    """Direct zero-copy DuckDB query on Parquet file from NVMe or disk."""
    try:
        rows = olap_engine.query_parquet(path, filter)
        return {"ok": True, "count": len(rows), "rows": rows}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
