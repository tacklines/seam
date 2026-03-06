"""Configuration loaded from environment / .env file."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # LLM — provider/model are now defaults; the router overrides per-request
    llm_provider: str = "ollama"  # ollama | anthropic
    default_model: str = "qwen3-coder-30b"
    ollama_base_url: str = "http://localhost:11434"
    llamacpp_base_url: str = "http://192.168.1.14:8080/v1"
    anthropic_api_key: str = ""
    openrouter_api_key: str = ""  # enables OpenRouter models if set

    # Seam MCP (Streamable HTTP)
    seam_url: str = "http://localhost:3002"
    seam_token: str = ""  # Optional: agent token (sat_ prefix) for auth

    # Coder (workspace sandbox management)
    coder_binary: str = "coder"
    coder_url: str = ""
    coder_session_token: str = ""
    coder_template: str = "agent-workspace"

    # Langfuse
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_host: str = "http://localhost:3101"


settings = Settings()


def build_model_registry():
    """Build a ModelRegistry populated with available models.

    Local ollama models are always registered.
    API models are registered only when their API key is configured.
    """
    from seam_agents.models.registry import (
        KNOWN_PROFILES,
        Budget,
        ModelRegistry,
    )

    registry = ModelRegistry()

    # Register local ollama models
    for name, profile in KNOWN_PROFILES.items():
        if profile.provider == "ollama":
            registry.register(profile)

    # Register llama.cpp models (always available — local server)
    for name, profile in KNOWN_PROFILES.items():
        if profile.provider == "llamacpp":
            registry.register(profile)

    # Register Anthropic models if API key is set
    if settings.anthropic_api_key:
        for name, profile in KNOWN_PROFILES.items():
            if profile.provider == "anthropic":
                registry.register(profile)

    # Register OpenRouter models if API key is set
    if settings.openrouter_api_key:
        for name, profile in KNOWN_PROFILES.items():
            if profile.provider == "openrouter":
                registry.register(profile)

    return registry
