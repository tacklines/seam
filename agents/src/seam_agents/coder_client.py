"""MCP client that connects to the Coder MCP server for workspace management."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from seam_agents.config import settings


@dataclass
class CoderMCPClient:
    """Wraps the Coder MCP server (coder exp mcp server) as an async context manager."""

    _session: ClientSession | None = field(default=None, repr=False)
    _stdio_cm: Any = field(default=None, repr=False)

    async def connect(self) -> "CoderMCPClient":
        server_params = StdioServerParameters(
            command=settings.coder_binary,
            args=["exp", "mcp", "server"],
            env={
                "CODER_URL": settings.coder_url,
                "CODER_SESSION_TOKEN": settings.coder_session_token,
                "CODER_MCP_APP_STATUS_SLUG": "agent",
            },
        )
        self._stdio_cm = stdio_client(server_params)
        self._read, self._write = await self._stdio_cm.__aenter__()
        self._session = ClientSession(self._read, self._write)
        await self._session.__aenter__()
        await self._session.initialize()
        return self

    async def disconnect(self):
        if self._session:
            await self._session.__aexit__(None, None, None)
            self._session = None
        if self._stdio_cm:
            await self._stdio_cm.__aexit__(None, None, None)
            self._stdio_cm = None

    def _require_session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("Not connected — call connect() first")
        return self._session

    async def list_tools(self) -> list[dict]:
        """List available Coder MCP tools."""
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
        """Call a Coder MCP tool and return the text result."""
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
