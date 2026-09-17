"""
CloudEvents 1.0 Schemas for Sovereign Spark Decoupled Ingestion Pipeline.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import uuid


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CloudEvent(BaseModel):
    specversion: str = "1.0"
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source: str = "sovereign-spark/ingestion"
    type: str
    time: str = Field(default_factory=utc_now_iso)
    datacontenttype: str = "application/json"
    subject: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class IngestionPayload(BaseModel):
    sessionId: str
    target: str = "dgx_spark"
    endpoint: str
    method: str = "POST"
    headers: Dict[str, str] = Field(default_factory=dict)
    payload: Dict[str, Any] = Field(default_factory=dict)
    clientIp: Optional[str] = None
    timestamp: str = Field(default_factory=utc_now_iso)


class AgentTelemetryPayload(BaseModel):
    sessionId: str
    round: int
    model: str
    provider: str
    toolCalls: List[Dict[str, Any]] = Field(default_factory=list)
    tokensPrompt: Optional[int] = None
    tokensCompletion: Optional[int] = None
    ttftMs: Optional[float] = None
    totalDurationMs: Optional[float] = None
    isLooping: bool = False
    exitCode: Optional[int] = None
    timestamp: str = Field(default_factory=utc_now_iso)


class ModelFeedbackPayload(BaseModel):
    sessionId: str
    model: str
    promptSummary: str
    rating: int = 1
    flagReason: Optional[str] = None
    timestamp: str = Field(default_factory=utc_now_iso)
