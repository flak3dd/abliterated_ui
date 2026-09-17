"""
Automated PyTest Test Suite for Sovereign Spark Pipeline:
- CloudEvents & Ingestion Schema Validation
- DuckDB Vectorized In-Process OLAP
- RAPIDS / Pandas Hardware Crunching
- Dual-Path LLM Routing Logic
- FastAPI Coordinator Endpoints
"""

import pytest
import asyncio
import uuid
import time
from services.pubsub.schema import CloudEvent, IngestionPayload, AgentTelemetryPayload
from services.pubsub.broker import LocalEventBroker
from compute.olap import SparkOLAPEngine
from compute.rapids_accel import crunch_tabular_metrics
from compute.llm_router import LLMRouter


def test_cloudevents_serialization():
    """Verify CloudEvents 1.0 schema serialization and validation."""
    event = CloudEvent(
        type="io.spark.telemetry.v1",
        subject="session_test_123",
        data={"sessionId": "session_test_123", "model": "qwen-abliterated", "ttft_ms": 14.5},
    )
    json_str = event.model_dump_json()
    assert "1.0" in json_str
    assert "session_test_123" in json_str
    assert "io.spark.telemetry.v1" in json_str

    deserialized = CloudEvent.model_validate_json(json_str)
    assert deserialized.id == event.id
    assert deserialized.data["ttft_ms"] == 14.5


@pytest.mark.asyncio
async def test_event_broker_local_queue():
    """Verify decoupled event publishing and batch consumption with ordering keys."""
    broker = LocalEventBroker(maxsize=100)
    session_id = f"sess_{uuid.uuid4().hex[:8]}"

    event1 = CloudEvent(type="test.event", subject=session_id, data={"seq": 1})
    event2 = CloudEvent(type="test.event", subject=session_id, data={"seq": 2})

    id1 = await broker.publish("test-topic", event1, ordering_key=session_id)
    id2 = await broker.publish("test-topic", event2, ordering_key=session_id)
    assert id1 == event1.id
    assert id2 == event2.id

    batch = await broker.consume_batch("test-topic", max_events=10, timeout_s=0.5, ordering_key=session_id)
    assert len(batch) == 2
    assert batch[0].data["seq"] == 1
    assert batch[1].data["seq"] == 2


def test_duckdb_in_process_olap():
    """Verify embedded DuckDB table creation, insertion, and vectorized aggregation."""
    olap = SparkOLAPEngine(db_path=":memory:")

    # Insert test telemetry records
    olap.record_telemetry({
        "id": "tel_1",
        "time": "2026-09-17T14:00:00Z",
        "session_id": "sess_1",
        "model": "qwen-abliterated",
        "provider": "dgx_spark",
        "tokens_prompt": 120,
        "tokens_completion": 450,
        "ttft_ms": 12.4,
        "total_duration_ms": 1100.0,
        "is_looping": False,
        "exit_code": 0,
    })
    olap.record_telemetry({
        "id": "tel_2",
        "time": "2026-09-17T14:01:00Z",
        "session_id": "sess_2",
        "model": "qwen-abliterated",
        "provider": "dgx_spark",
        "tokens_prompt": 80,
        "tokens_completion": 200,
        "ttft_ms": 11.2,
        "total_duration_ms": 500.0,
        "is_looping": False,
        "exit_code": 0,
    })

    stats = olap.get_stats()
    assert stats["telemetry_rows"] == 2

    velocity = olap.query_token_velocity()
    assert len(velocity) >= 1
    qwen_metric = next(m for m in velocity if m["model"] == "qwen-abliterated")
    assert qwen_metric["request_count"] == 2
    assert qwen_metric["total_tokens"] == 850
    assert qwen_metric["avg_ttft_ms"] > 0


def test_tabular_crunch_metrics():
    """Verify hardware crunching transformations."""
    records = [
        {"round": 1, "tokens": 150, "latency_ms": 45.2},
        {"round": 2, "tokens": 300, "latency_ms": 78.5},
        {"round": 3, "tokens": 450, "latency_ms": 92.1},
    ]
    res = crunch_tabular_metrics(records)
    assert res["count"] == 3
    assert "means" in res
    assert res["means"]["tokens"] == 300.0
    assert res["duration_ms"] >= 0.0


@pytest.mark.asyncio
async def test_llm_router_dual_path():
    """Verify local vs remote model route decisions."""
    router = LLMRouter()

    # Remote model routing (e.g. Meta Llama 70B on Featherless)
    route_name, target_url, headers = await router.route_request(
        "meta-llama/Meta-Llama-3.1-70B-Instruct",
        {"messages": [{"role": "user", "content": "hello"}]},
    )
    assert route_name == "remote_featherless"
    assert "featherless.ai" in target_url
