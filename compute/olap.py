"""
In-Process OLAP Engine powered by DuckDB.
Performs vectorized analytical queries directly on memory and Parquet files.
"""

import duckdb
import os
from typing import Any, Dict, List, Optional
import logging

logger = logging.getLogger("spark.olap")


class SparkOLAPEngine:
    """Zero-overhead embedded DuckDB analytical database."""

    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self._con = duckdb.connect(self.db_path)
        self._init_schemas()

    def _init_schemas(self):
        """Pre-initialize analytical tables for ingestion and telemetry events."""
        self._con.execute("""
            CREATE TABLE IF NOT EXISTS ingestion_events (
                id VARCHAR PRIMARY KEY,
                time TIMESTAMP,
                session_id VARCHAR,
                endpoint VARCHAR,
                target VARCHAR,
                client_ip VARCHAR,
                status_code INTEGER DEFAULT 200,
                latency_ms DOUBLE DEFAULT 0.0
            );

            CREATE TABLE IF NOT EXISTS telemetry_records (
                id VARCHAR PRIMARY KEY,
                time TIMESTAMP,
                session_id VARCHAR,
                model VARCHAR,
                provider VARCHAR,
                tokens_prompt INTEGER DEFAULT 0,
                tokens_completion INTEGER DEFAULT 0,
                ttft_ms DOUBLE DEFAULT 0.0,
                total_duration_ms DOUBLE DEFAULT 0.0,
                is_looping BOOLEAN DEFAULT FALSE,
                exit_code INTEGER DEFAULT 0
            );
        """)
        logger.info("[DuckDB] Vectorized OLAP schemas initialized in-process.")

    def record_ingestion(self, event_data: Dict[str, Any]):
        """Record an ingestion event row into in-memory DuckDB."""
        self._con.execute(
            """
            INSERT INTO ingestion_events (id, time, session_id, endpoint, target, client_ip, status_code, latency_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                event_data.get("id"),
                event_data.get("time"),
                event_data.get("session_id"),
                event_data.get("endpoint"),
                event_data.get("target", "dgx_spark"),
                event_data.get("client_ip", "127.0.0.1"),
                event_data.get("status_code", 200),
                event_data.get("latency_ms", 0.0),
            ],
        )

    def record_telemetry(self, t_data: Dict[str, Any]):
        """Record an LLM/agent telemetry record into in-memory DuckDB."""
        self._con.execute(
            """
            INSERT INTO telemetry_records (id, time, session_id, model, provider, tokens_prompt, tokens_completion, ttft_ms, total_duration_ms, is_looping, exit_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                t_data.get("id"),
                t_data.get("time"),
                t_data.get("session_id"),
                t_data.get("model"),
                t_data.get("provider"),
                t_data.get("tokens_prompt", 0),
                t_data.get("tokens_completion", 0),
                t_data.get("ttft_ms", 0.0),
                t_data.get("total_duration_ms", 0.0),
                t_data.get("is_looping", False),
                t_data.get("exit_code", 0),
            ],
        )

    def query_token_velocity(self) -> List[Dict[str, Any]]:
        """Compute token generation velocity, average TTFT, and total tokens per model."""
        res = self._con.execute("""
            SELECT 
                model,
                provider,
                COUNT(*) as request_count,
                ROUND(AVG(ttft_ms), 2) as avg_ttft_ms,
                ROUND(AVG(total_duration_ms), 2) as avg_duration_ms,
                SUM(tokens_prompt + tokens_completion) as total_tokens,
                ROUND(SUM(tokens_completion) / NULLIF(SUM(total_duration_ms) / 1000.0, 0), 2) as tokens_per_sec
            FROM telemetry_records
            GROUP BY model, provider
            ORDER BY total_tokens DESC
        """).df()
        return res.to_dict(orient="records")

    def query_parquet(self, parquet_path: str, sql_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Read Parquet file directly from disk/NVMe using DuckDB vectorized reader with zero copying."""
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found: {parquet_path}")

        where_clause = f"WHERE {sql_filter}" if sql_filter else ""
        query = f"SELECT * FROM read_parquet('{parquet_path}') {where_clause} LIMIT 1000"
        df = self._con.execute(query).df()
        return df.to_dict(orient="records")

    def get_stats(self) -> Dict[str, Any]:
        """Return counts from in-process analytical tables."""
        ingest_count = self._con.execute("SELECT COUNT(*) FROM ingestion_events").fetchone()[0]
        telemetry_count = self._con.execute("SELECT COUNT(*) FROM telemetry_records").fetchone()[0]
        return {
            "engine": "DuckDB-Vectorized-OLAP",
            "ingestion_rows": ingest_count,
            "telemetry_rows": telemetry_count,
        }


# Singleton OLAP Engine
olap_engine = SparkOLAPEngine()
