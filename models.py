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
# Redis 
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
# Target Audience: US Developers
# Focus: Absolute zero-hallucination via cross-frontier model debate.
# ---------------------------------------------------------------------------
PLAN_CONFIGS = {
    "free": {
        "label": "Free",
        "debaters": [
            "deepseek/deepseek-chat",
            "google/gemini-2.5-flash",
            "meta-llama/llama-3.3-70b-instruct",
        ],
        "synthesis_model": "anthropic/claude-haiku-4.5",
        "rpm": 5,
        "daily_limit": 5,
        "subject_to_global_cap": True,
    },
    "core": {
        "label": "Core ($19/mo)",
        "debaters": [
            "anthropic/claude-haiku-4.5",
            "openai/gpt-4o-mini",
            "google/gemini-2.5-flash",
        ],
        "synthesis_model": "anthropic/claude-sonnet-4.6",
        "rpm": 15,
        "daily_limit": 60,
        "subject_to_global_cap": False,
    },
    "pro": {
        "label": "Pro ($49/mo)",
        "debaters": [
            "anthropic/claude-sonnet-4.6",
            "openai/gpt-4o",
            "deepseek/deepseek-reasoner",
        ],
        "synthesis_model": "anthropic/claude-opus-4.8",
        "rpm": 10,
        "daily_limit": 30, # Strict cap because Opus + GPT-4o + Sonnet per query is expensive
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