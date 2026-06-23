"""
config/models.py
=====================================================================
Central configuration for Phasor AI.

Holds OpenRouter / Supabase / Redis / Lemon Squeezy environment-derived
constants, plus the per-plan tier definitions (debater rosters, synthesis
model, and rate/usage limits) that main.py reads at request time.

All values are pulled from environment variables at import time so the
same code works unmodified across local dev, staging, and Vercel/production
deployments -- only the environment differs.
"""

import os

# ---------------------------------------------------------------------------
# OpenRouter
# ---------------------------------------------------------------------------
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

# ---------------------------------------------------------------------------
# Redis (Upstash or any Redis-compatible URL)
# ---------------------------------------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL", "")

# ---------------------------------------------------------------------------
# Lemon Squeezy billing
# ---------------------------------------------------------------------------
LEMON_SQUEEZY_WEBHOOK_SECRET = os.environ.get("LEMON_SQUEEZY_WEBHOOK_SECRET", "")
LS_CORE_VARIANT_ID = os.environ.get("LS_CORE_VARIANT_ID", "")
LS_PRO_VARIANT_ID = os.environ.get("LS_PRO_VARIANT_ID", "")

# ---------------------------------------------------------------------------
# Spend safety net / BYOK bounds
# ---------------------------------------------------------------------------
FREE_TIER_MONTHLY_PROMPT_CAP = int(os.environ.get("FREE_TIER_MONTHLY_PROMPT_CAP", "2000"))
MAX_BYOK_MODELS = 5

# ---------------------------------------------------------------------------
# Plan configuration
#
# "debaters"         -> Step 1 / Step 2 model roster for this plan.
# "synthesis_model"   -> Step 3 master judge model for this plan.
# "rpm"               -> per-minute rate limit, per IP/User.
# "daily_limit"       -> prompts/day allowed on this plan. None = unlimited.
# "subject_to_global_cap" -> whether this plan is gated by the aggregate
#                            FREE_TIER_MONTHLY_PROMPT_CAP circuit breaker.
#
# "byok" has empty/None debaters & synthesis_model because those are
# supplied dynamically per-request via the `byok_config` request body
# block rather than being fixed ahead of time.
# ---------------------------------------------------------------------------
PLAN_CONFIGS = {
    "free": {
        "label": "Free",
        "debaters": [
            "google/gemini-2.5-flash",
            "anthropic/claude-haiku-4.5",
            "deepseek/deepseek-v3.2",
        ],
        "synthesis_model": "anthropic/claude-haiku-4.5",
        "rpm": 5,
        "daily_limit": 5,
        "subject_to_global_cap": True,
    },
    "core": {
        "label": "Core",
        "debaters": [
            "google/gemini-2.5-flash",
            "anthropic/claude-haiku-4.5",
            "deepseek/deepseek-v3.2",
        ],
        "synthesis_model": "google/gemini-2.5-pro",
        "rpm": 15,
        "daily_limit": 100,
        "subject_to_global_cap": False,
    },
    "pro": {
        "label": "Pro",
        "debaters": [
            "anthropic/claude-sonnet-4.6",
            "google/gemini-3.1-pro",
            "openai/gpt-5.4",
            "deepseek/deepseek-v3.2",
        ],
        "synthesis_model": "anthropic/claude-sonnet-4.6",
        "rpm": 10,
        "daily_limit": 60,
        "subject_to_global_cap": False,
    },
    "byok": {
        "label": "BYOK",
        "debaters": [],
        "synthesis_model": None,
        "rpm": 60,
        "daily_limit": None,
        "subject_to_global_cap": False,
    },
}
