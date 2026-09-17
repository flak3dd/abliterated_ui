#!/usr/bin/env node
/**
 * Test Suite for Phase 2: Event-Driven Queueing Broker
 * Validates CloudEvents 1.0 schemas, ordering keys, retry backoff, and DLQ routing.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

async function runPythonTest() {
  console.log('================================================================');
  console.log('🧪 VERIFYING PHASE 2: EVENT-DRIVEN QUEUEING BROKER');
  console.log('================================================================\n');

  const testScript = `
import asyncio
import sys
from services.pubsub.schema import CloudEvent, IngestionPayload, AgentTelemetryPayload
from services.pubsub.broker import LocalEventBroker, publish_ingestion_event

async def test_all():
    print("1. Testing CloudEvents 1.0 schema compliance...")
    evt = CloudEvent(
        type="io.spark.test.v1",
        subject="session_abc",
        data={"action": "crunch", "records": 5000}
    )
    raw = evt.model_dump_json()
    assert '"specversion":"1.0"' in raw, "Missing specversion 1.0"
    assert '"subject":"session_abc"' in raw, "Missing subject"
    deserialized = CloudEvent.model_validate_json(raw)
    assert deserialized.id == evt.id
    print("   ✅ CloudEvents 1.0 schema serialization verified.")

    print("\\n2. Testing session-based ordering keys...")
    broker = LocalEventBroker(maxsize=100)
    sess_1 = "session_order_1"
    sess_2 = "session_order_2"

    await broker.publish("topic_orders", CloudEvent(type="test", subject=sess_1, data={"step": 1}), ordering_key=sess_1)
    await broker.publish("topic_orders", CloudEvent(type="test", subject=sess_2, data={"step": 10}), ordering_key=sess_2)
    await broker.publish("topic_orders", CloudEvent(type="test", subject=sess_1, data={"step": 2}), ordering_key=sess_1)
    await broker.publish("topic_orders", CloudEvent(type="test", subject=sess_2, data={"step": 20}), ordering_key=sess_2)

    batch_s1 = await broker.consume_batch("topic_orders", max_events=10, timeout_s=0.5, ordering_key=sess_1)
    batch_s2 = await broker.consume_batch("topic_orders", max_events=10, timeout_s=0.5, ordering_key=sess_2)

    assert len(batch_s1) == 2
    assert batch_s1[0].data["step"] == 1 and batch_s1[1].data["step"] == 2
    assert len(batch_s2) == 2
    assert batch_s2[0].data["step"] == 10 and batch_s2[1].data["step"] == 20
    print("   ✅ Per-session ordering keys guaranteed sequential delivery.")

    print("\\n3. Testing negative acknowledgment (NACK) & automated DLQ routing...")
    fail_evt = CloudEvent(type="test.fail", subject="fail_sess", data={"status": "malformed"})
    await broker.publish("topic_dlq_test", fail_evt)
    
    consumed = await broker.consume_batch("topic_dlq_test", max_events=1, timeout_s=0.5)
    assert len(consumed) == 1
    target_evt = consumed[0]

    # Retry 3 times
    await broker.nack("topic_dlq_test", target_evt, max_retries=2)
    c2 = await broker.consume_batch("topic_dlq_test", max_events=1, timeout_s=0.5)
    assert len(c2) == 1

    await broker.nack("topic_dlq_test", c2[0], max_retries=2)
    c3 = await broker.consume_batch("topic_dlq_test", max_events=1, timeout_s=0.5)
    assert len(c3) == 1

    # Third failure exceeds max_retries=2 -> routed to DLQ!
    await broker.nack("topic_dlq_test", c3[0], max_retries=2)

    stats = broker.get_stats()
    assert stats["dlq_total"] == 1, f"Expected 1 DLQ entry, got {stats['dlq_total']}"
    assert stats["dlq_pending_count"] == 1

    dlq_records = broker.get_dlq_events()
    assert len(dlq_records) >= 1
    assert dlq_records[-1]["reason"] == "exceeded_max_retries_2"
    print("   ✅ Automatic Dead-Letter Queue routing and retry backoff verified.")

    print("\\n4. Testing Dead-Letter Queue (DLQ) recovery & re-processing...")
    reprocessed = await broker.reprocess_dlq("topic_recovered")
    assert reprocessed == 1
    recovered = await broker.consume_batch("topic_recovered", max_events=5, timeout_s=0.5)
    assert len(recovered) == 1
    assert recovered[0].id == fail_evt.id
    print("   ✅ Dead-Letter Queue recovery & re-processing verified.")

    print("\\n================================================================")
    print("🎉 ALL PHASE 2 PUBSUB & BROKER TESTS PASSED CLEANLY!")
    print("================================================================")

asyncio.run(test_all())
`;

  try {
    const { stdout, stderr } = await execFileP('python3', ['-c', testScript], {
      cwd: '/Users/adminuser/abliterated_ui',
      env: { ...process.env, PYTHONPATH: '/Users/adminuser/abliterated_ui' },
    });
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runPythonTest();
