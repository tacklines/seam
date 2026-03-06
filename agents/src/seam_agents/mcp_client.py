"""MCP client that connects to the Seam server over Streamable HTTP.

Uses a dedicated background thread for the async event loop so that
synchronous callers (LangGraph ToolNode) can safely invoke MCP methods
without nesting event loops or conflicting with anyio's task tracking.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.exceptions import McpError

from seam_agents.config import settings

log = logging.getLogger(__name__)


@dataclass
class SeamMCPClient:
    """Wraps the Seam MCP server with a background event loop.

    All MCP I/O runs on a dedicated daemon thread. Public methods are
    synchronous and safe to call from any thread (including LangGraph's
    ToolNode thread).
    """

    agent_code: str
    agent_name: str = "seam-agent"
    _session: ClientSession | None = field(default=None, repr=False)
    _http_cm: Any = field(default=None, repr=False)
    _loop: asyncio.AbstractEventLoop | None = field(default=None, repr=False)
    _thread: threading.Thread | None = field(default=None, repr=False)
    _seam_url: str = field(default="", repr=False)

    def _start_loop(self):
        """Start a background thread running an event loop."""
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._loop.run_forever,
            daemon=True,
            name="mcp-event-loop",
        )
        self._thread.start()

    def _run(self, coro) -> Any:
        """Submit a coroutine to the background loop and block for the result."""
        if self._loop is None:
            raise RuntimeError("Background loop not started")
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    def connect(self) -> "SeamMCPClient":
        """Connect to the Seam MCP server (synchronous)."""
        self._start_loop()
        self._run(self._async_connect())
        return self

    async def _async_connect(self):
        url = self._seam_url = f"{settings.seam_url.rstrip('/')}/mcp"
        headers = {}
        if settings.seam_token:
            headers["Authorization"] = f"Bearer {settings.seam_token}"

        self._http_cm = streamablehttp_client(url, headers=headers or None)
        self._read, self._write, self._get_session_id = await self._http_cm.__aenter__()
        self._session = ClientSession(self._read, self._write)
        await self._session.__aenter__()
        await self._session.initialize()

    def disconnect(self):
        """Disconnect and shut down the background loop (synchronous)."""
        if self._loop is None:
            return
        try:
            self._run(self._async_disconnect())
        except RuntimeError:
            pass
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=5)
        self._loop = None
        self._thread = None

    async def _async_disconnect(self):
        if self._session:
            await self._session.__aexit__(None, None, None)
            self._session = None
        if self._http_cm:
            await self._http_cm.__aexit__(None, None, None)
            self._http_cm = None

    def _require_session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("Not connected — call connect() first")
        return self._session

    def list_tools(self) -> list[dict]:
        """List available MCP tools (synchronous)."""
        return self._run(self._async_list_tools())

    async def _async_list_tools(self) -> list[dict]:
        try:
            result = await self._require_session().list_tools()
        except (McpError, RuntimeError, ConnectionError, OSError) as e:
            log.warning("MCP list_tools failed: %s — reconnecting", e)
            await self._async_reconnect()
            result = await self._require_session().list_tools()
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            for tool in result.tools
        ]

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        """Call an MCP tool and return the text result (synchronous)."""
        return self._run(self._async_call_tool(name, arguments))

    async def _async_reconnect(self):
        """Tear down the current session and reconnect."""
        log.info("Reconnecting MCP session...")
        try:
            await self._async_disconnect()
        except Exception:
            pass
        await self._async_connect()
        log.info("MCP session reconnected")

    async def _async_call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        try:
            result = await self._require_session().call_tool(name, arguments or {})
        except (McpError, RuntimeError, ConnectionError, OSError) as e:
            log.warning("MCP call_tool(%s) failed: %s — reconnecting", name, e)
            await self._async_reconnect()
            result = await self._require_session().call_tool(name, arguments or {})
        parts = []
        for content in result.content:
            if hasattr(content, "text"):
                parts.append(content.text)
        return "\n".join(parts)
