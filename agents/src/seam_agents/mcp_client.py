"""MCP client that connects to the Seam server over Streamable HTTP."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from seam_agents.config import settings


@dataclass
class SeamMCPClient:
    """Wraps the Seam MCP server as an async context manager."""

    agent_code: str
    agent_name: str = "seam-agent"
    _session: ClientSession | None = field(default=None, repr=False)
    _http_cm: Any = field(default=None, repr=False)

    async def connect(self) -> "SeamMCPClient":
        url = self._seam_url = f"{settings.seam_url.rstrip('/')}/mcp"
        headers = {}
        if settings.seam_token:
            headers["Authorization"] = f"Bearer {settings.seam_token}"

        self._http_cm = streamablehttp_client(url, headers=headers or None)
        self._read, self._write, self._get_session_id = await self._http_cm.__aenter__()
        self._session = ClientSession(self._read, self._write)
        await self._session.__aenter__()
        await self._session.initialize()
        return self

    async def disconnect(self):
        try:
            if self._session:
                await self._session.__aexit__(None, None, None)
                self._session = None
        except RuntimeError:
            # anyio cancel scope task mismatch during shutdown — safe to ignore
            self._session = None
        try:
            if self._http_cm:
                await self._http_cm.__aexit__(None, None, None)
                self._http_cm = None
        except RuntimeError:
            self._http_cm = None

    def _require_session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("Not connected — call connect() first")
        return self._session

    async def list_tools(self) -> list[dict]:
        """List available MCP tools."""
        result = await self._require_session().list_tools()
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            for tool in result.tools
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        """Call an MCP tool and return the text result."""
        result = await self._require_session().call_tool(name, arguments or {})
        parts = []
        for content in result.content:
            if hasattr(content, "text"):
                parts.append(content.text)
        return "\n".join(parts)

    async def __aenter__(self):
        return await self.connect()

    async def __aexit__(self, *exc):
        await self.disconnect()
