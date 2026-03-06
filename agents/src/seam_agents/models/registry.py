"""Model registry — profiles and capabilities for available models."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Capability(str, Enum):
    """What a model is good at."""
    CODING = "coding"
    REASONING = "reasoning"
    TOOL_USE = "tool_use"
    LONG_CONTEXT = "long_context"
    SPEED = "speed"
    CREATIVE = "creative"
    INSTRUCTION_FOLLOWING = "instruction_following"


class Budget(str, Enum):
    """Cost tier — local models are always 'free'."""
    FREE = "free"          # local ollama models
    ECONOMY = "economy"    # cheap API models (haiku, etc.)
    MODERATE = "moderate"  # mid-tier API (sonnet)
    UNLIMITED = "unlimited"  # frontier API (opus)


@dataclass
class ModelProfile:
    """Everything the router needs to know about a model."""
    name: str              # ollama model name or API model ID
    provider: str          # "ollama" | "anthropic"
    capabilities: dict[Capability, float] = field(default_factory=dict)  # 0.0-1.0
    budget: Budget = Budget.FREE
    context_window: int = 32768
    tok_per_sec: float = 0.0  # estimated generation speed (0 = unknown)

    def score_for(self, capability: Capability) -> float:
        return self.capabilities.get(capability, 0.0)


# --- Well-known model profiles ---
# These map model names/hints to capability profiles.
# The router uses these both for available models AND to interpret
# model hints (e.g., "claude-opus-4-6" tells us the user wants
# frontier reasoning even if we don't have API access).

KNOWN_PROFILES: dict[str, ModelProfile] = {
    # Local ollama models
    "qwen35-tuned": ModelProfile(
        name="qwen35-tuned",
        provider="ollama",
        capabilities={
            Capability.REASONING: 0.8,
            Capability.CODING: 0.75,
            Capability.TOOL_USE: 0.7,
            Capability.LONG_CONTEXT: 0.85,
            Capability.SPEED: 0.5,
            Capability.CREATIVE: 0.7,
            Capability.INSTRUCTION_FOLLOWING: 0.75,
        },
        budget=Budget.FREE,
        context_window=65536,
        tok_per_sec=25.0,
    ),
    "devstral-tuned": ModelProfile(
        name="devstral-tuned",
        provider="ollama",
        capabilities={
            Capability.CODING: 0.85,
            Capability.TOOL_USE: 0.8,
            Capability.SPEED: 0.8,
            Capability.REASONING: 0.6,
            Capability.LONG_CONTEXT: 0.5,
            Capability.CREATIVE: 0.4,
            Capability.INSTRUCTION_FOLLOWING: 0.7,
        },
        budget=Budget.FREE,
        context_window=32768,
        tok_per_sec=52.0,
    ),

    # llama.cpp models (OpenAI-compatible API)
    "qwen3-coder-30b": ModelProfile(
        name="qwen3-coder-30b",
        provider="llamacpp",
        capabilities={
            Capability.CODING: 0.9,
            Capability.REASONING: 0.85,
            Capability.TOOL_USE: 0.8,
            Capability.LONG_CONTEXT: 0.95,
            Capability.SPEED: 0.6,
            Capability.CREATIVE: 0.7,
            Capability.INSTRUCTION_FOLLOWING: 0.85,
        },
        budget=Budget.FREE,
        context_window=131072,
        tok_per_sec=30.0,
    ),

    # OpenRouter models — available via OpenRouter API (OpenAI-compatible)
    "qwen/qwen3.5-coder-32b": ModelProfile(
        name="qwen/qwen3.5-coder-32b",
        provider="openrouter",
        capabilities={
            Capability.CODING: 0.9,
            Capability.REASONING: 0.85,
            Capability.TOOL_USE: 0.8,
            Capability.LONG_CONTEXT: 0.9,
            Capability.SPEED: 0.7,
            Capability.CREATIVE: 0.7,
            Capability.INSTRUCTION_FOLLOWING: 0.85,
        },
        budget=Budget.ECONOMY,
        context_window=131072,
        tok_per_sec=80.0,
    ),
    "deepseek/deepseek-v3-0324": ModelProfile(
        name="deepseek/deepseek-v3-0324",
        provider="openrouter",
        capabilities={
            Capability.CODING: 0.9,
            Capability.REASONING: 0.9,
            Capability.TOOL_USE: 0.85,
            Capability.LONG_CONTEXT: 0.9,
            Capability.SPEED: 0.6,
            Capability.CREATIVE: 0.8,
            Capability.INSTRUCTION_FOLLOWING: 0.85,
        },
        budget=Budget.ECONOMY,
        context_window=131072,
        tok_per_sec=60.0,
    ),
    "meta-llama/llama-4-maverick": ModelProfile(
        name="meta-llama/llama-4-maverick",
        provider="openrouter",
        capabilities={
            Capability.CODING: 0.85,
            Capability.REASONING: 0.85,
            Capability.TOOL_USE: 0.8,
            Capability.LONG_CONTEXT: 0.85,
            Capability.SPEED: 0.65,
            Capability.CREATIVE: 0.8,
            Capability.INSTRUCTION_FOLLOWING: 0.85,
        },
        budget=Budget.ECONOMY,
        context_window=131072,
        tok_per_sec=70.0,
    ),

    # API models — available only when API keys are configured
    "claude-opus-4-6": ModelProfile(
        name="claude-opus-4-6",
        provider="anthropic",
        capabilities={
            Capability.REASONING: 1.0,
            Capability.CODING: 0.95,
            Capability.TOOL_USE: 0.95,
            Capability.LONG_CONTEXT: 0.95,
            Capability.CREATIVE: 0.95,
            Capability.INSTRUCTION_FOLLOWING: 1.0,
        },
        budget=Budget.UNLIMITED,
        context_window=200000,
        tok_per_sec=80.0,
    ),
    "claude-sonnet-4-6": ModelProfile(
        name="claude-sonnet-4-6",
        provider="anthropic",
        capabilities={
            Capability.REASONING: 0.85,
            Capability.CODING: 0.9,
            Capability.TOOL_USE: 0.9,
            Capability.LONG_CONTEXT: 0.9,
            Capability.SPEED: 0.7,
            Capability.CREATIVE: 0.8,
            Capability.INSTRUCTION_FOLLOWING: 0.9,
        },
        budget=Budget.MODERATE,
        context_window=200000,
        tok_per_sec=150.0,
    ),
    "claude-haiku-4-5": ModelProfile(
        name="claude-haiku-4-5",
        provider="anthropic",
        capabilities={
            Capability.SPEED: 0.95,
            Capability.TOOL_USE: 0.75,
            Capability.CODING: 0.7,
            Capability.REASONING: 0.6,
            Capability.LONG_CONTEXT: 0.8,
            Capability.CREATIVE: 0.5,
            Capability.INSTRUCTION_FOLLOWING: 0.8,
        },
        budget=Budget.ECONOMY,
        context_window=200000,
        tok_per_sec=300.0,
    ),
}

# Aliases: map common ways people refer to models → canonical profile keys
MODEL_ALIASES: dict[str, str] = {
    "opus": "claude-opus-4-6",
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5",
    "qwen": "qwen35-tuned",
    "devstral": "devstral-tuned",
    "qwen3-coder": "qwen3-coder-30b",
    "qwen-coder": "qwen3-coder-30b",
    "qwen3.5:35b": "qwen35-tuned",
    "devstral-small-2:latest": "devstral-tuned",
    "devstral-small-2": "devstral-tuned",
    "qwen3.5": "qwen/qwen3.5-coder-32b",
    "qwen3.5-coder": "qwen/qwen3.5-coder-32b",
    "deepseek": "deepseek/deepseek-v3-0324",
    "deepseek-v3": "deepseek/deepseek-v3-0324",
    "maverick": "meta-llama/llama-4-maverick",
    "llama-4": "meta-llama/llama-4-maverick",
}


class ModelRegistry:
    """Tracks which models are actually available on this system."""

    def __init__(self):
        self._available: dict[str, ModelProfile] = {}

    def register(self, profile: ModelProfile):
        self._available[profile.name] = profile

    @property
    def available(self) -> list[ModelProfile]:
        return list(self._available.values())

    def get(self, name: str) -> ModelProfile | None:
        return self._available.get(name)

    def has_provider(self, provider: str) -> bool:
        return any(m.provider == provider for m in self._available.values())

    @staticmethod
    def resolve_alias(name: str) -> str:
        """Resolve a model alias to its canonical profile key."""
        return MODEL_ALIASES.get(name, name)

    @staticmethod
    def get_known_profile(name: str) -> ModelProfile | None:
        """Get a known profile by name or alias (even if not available)."""
        canonical = MODEL_ALIASES.get(name, name)
        return KNOWN_PROFILES.get(canonical)
