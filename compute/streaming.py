"""
High-Speed Server-Sent Events (SSE) Token Streaming Pipeline.
Pipes token streams directly to clients with minimum Time To First Token (TTFT).
"""

import httpx
import json
import logging
from typing import Any, AsyncGenerator, Dict
from fastapi.responses import StreamingResponse

logger = logging.getLogger("spark.streaming")


async def sse_stream_generator(
    target_url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
) -> AsyncGenerator[bytes, None]:
    """
    Consumes upstream SSE stream and forwards tokens directly to client.
    """
    # Ensure stream is enabled in request payload
    payload["stream"] = True

    timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream("POST", target_url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    err_msg = err_body.decode("utf-8", errors="replace")
                    yield f"data: {json.dumps({'error': f'Upstream error HTTP {response.status_code}: {err_msg}'})}\n\n".encode("utf-8")
                    yield b"data: [DONE]\n\n"
                    return

                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk

        except httpx.RequestError as e:
            logger.error(f"[Streaming] HTTP connection error to {target_url}: {e}")
            yield f"data: {json.dumps({'error': f'Stream connection failed: {str(e)}'})}\n\n".encode("utf-8")
            yield b"data: [DONE]\n\n"


def create_sse_response(target_url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> StreamingResponse:
    """
    Wraps the SSE async generator in FastAPI StreamingResponse with proper SSE headers.
    """
    gen = sse_stream_generator(target_url, headers, payload)
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disables Nginx/reverse-proxy buffering
        },
    )
