"""
Intelligent Dual-Path LLM Router.
Dynamically routes inference between local vLLM on DGX Spark (Blackwell GB10)
and remote Featherless AI / Sovereign Cloud Mesh.
"""

import httpx
import logging
import os
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("spark.router")

LOCAL_VLLM_URL = os.getenv("LOCAL_VLLM_URL", "http://192.168.4.103:8000")
FEATHERLESS_API_URL = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")
FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY", "")
CLOUD_MESH_URL = os.getenv("CLOUD_MESH_URL", "https://api.abliteration.ai/v1")

# Models explicitly optimized for local GB10 vLLM GPU inference
LOCAL_MODELS = {
    "qwen-abliterated",
    "gpt-oss-120b-abliterated",
    "qwen-flash-next",
    "deepseek-ai/DeepSeek-V3",
}


class LLMRouter:
    """Evaluates requests and directs to optimal execution engine."""

    def __init__(self):
        self._local_healthy = True
        self._last_health_check = 0.0

    async def check_local_health(self) -> bool:
        """Fast probe to local vLLM /health endpoint."""
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                res = await client.get(f"{LOCAL_VLLM_URL}/health")
                self._local_healthy = (res.status_code == 200)
                return self._local_healthy
        except Exception:
            self._local_healthy = False
            return False

    async def route_request(self, model: str, body: Dict[str, Any]) -> Tuple[str, str, Dict[str, str]]:
        """
        Determines execution route ('local' or 'remote').
        Returns: (route_name, target_url, headers)
        """
        # If user explicitly requested local model and local vLLM is reachable
        clean_model = model.strip()
        is_local_preferred = any(m in clean_model.lower() for m in LOCAL_MODELS) or "abliterated" in clean_model.lower()

        # Check health if local is preferred
        if is_local_preferred:
            is_healthy = await self.check_local_health()
            if is_healthy:
                headers = {"Content-Type": "application/json"}
                return "local_vllm", f"{LOCAL_VLLM_URL}/v1/chat/completions", headers

        # Remote Route: Featherless AI / Sovereign Cloud Mesh
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {FEATHERLESS_API_KEY}",
        }
        target_url = f"{FEATHERLESS_API_URL}/chat/completions"
        return "remote_featherless", target_url, headers


# Singleton Router
llm_router = LLMRouter()
