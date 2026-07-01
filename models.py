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
# Plan configuration — July 2026
#
# Philosophy: benchmarks > profit. Three architecturally distinct labs per
# tier so the adversarial debate catches what a single lab's blind spots miss.
# No free/open-weight models anywhere — quality floor is non-negotiable.
#
# Pricing note: Sonnet 5 intro rate ($2/$10) runs through Aug 31 2026.
# After Sep 1 it steps to $3/$15. Budget around Sep pricing for anything
# beyond a short pilot. New tokenizer adds ~0–35% token count vs Sonnet 4.6.
# ---------------------------------------------------------------------------
PLAN_CONFIGS = {

    # ------------------------------------------------------------------
    # FREE
    # Ideal for: students, first-timers, quick sanity checks.
    # Hard 5-prompt/day cap. Three paid frontier models kept as cheap as
    # possible while staying off free/open-weight garbage tier.
    # Cost per query ≈ $0.003–0.006 (Haiku synthesis keeps it lean).
    # Debaters: Anthropic + Google + DeepSeek — three labs, three styles.
    # ------------------------------------------------------------------
    "free": {
        "label": "Free",
        "use_case": "Quick questions, first look at multi-model debate",
        "debaters": [
            "anthropic/claude-haiku-4.5",    # $1/$5 — lowest hallucination in its class (~4.6%)
            "google/gemini-2.5-flash",        # $0.30/$2.50 — Google's fastest paid model
            "deepseek/deepseek-v3.2",         # $0.23/$0.28 — GPT-4-class at near-zero cost
        ],
        "synthesis_model": "anthropic/claude-haiku-4.5",  # keep synthesis cheap on free tier
        "rpm": 3,
        "daily_limit": 5,
        "subject_to_global_cap": True,
    },

    # ------------------------------------------------------------------
    # CORE  $19/mo
    # Ideal for: indie developers, researchers, daily driver for complex Qs.
    # Steps up debaters to mid-frontier; synthesis jumps to Sonnet 5.
    # Three labs: Anthropic + OpenAI + Google.
    # Cost per query ≈ $0.015–0.030. Comfortable at 60 queries/day.
    # ------------------------------------------------------------------
    "core": {
        "label": "Core ($19/mo)",
        "use_case": "Daily dev work, research, complex technical questions",
        "debaters": [
            "anthropic/claude-haiku-4.5",    # $1/$5 — Anthropic voice, lowest hallucination
            "openai/gpt-4o",                  # $2.50/$10 — OpenAI flagship, strong tool use
            "google/gemini-2.5-flash",        # $0.30/$2.50 — Google's reasoning-capable fast model
        ],
        "synthesis_model": "anthropic/claude-sonnet-5",   # $2/$10 intro — best skeptic/arbitrator available
        "rpm": 15,
        "daily_limit": 60,
        "subject_to_global_cap": False,
    },

    # ------------------------------------------------------------------
    # PRO  $49/mo
    # Ideal for: power users, teams, production-grade zero-hallucination output.
    # All three debaters are current frontier models from different labs.
    # Synthesis: Sonnet 5 — 63.2% SWE-bench Pro, lowest red-rate available.
    # Three labs: Anthropic + OpenAI + Google (Gemini 2.5 Pro).
    # Cost per query ≈ $0.04–0.08. Tight daily cap protects margin.
    # ------------------------------------------------------------------
    "pro": {
        "label": "Pro ($49/mo)",
        "use_case": "Production pipelines, high-stakes answers, zero-hallucination requirement",
        "debaters": [
            "anthropic/claude-sonnet-5",      # $2/$10 intro — near-Opus quality, best skeptic behavior
            "openai/gpt-4o",                  # $2.50/$10 — strong reasoning, different failure modes
            "google/gemini-2.5-pro",          # $1.25/$10 — Google flagship, 1M context, deep reasoning
        ],
        "synthesis_model": "anthropic/claude-sonnet-5",   # only model with confirmed 3% red-rate
        "rpm": 25,
        "daily_limit": 100,
        "subject_to_global_cap": False,
    },

    # ------------------------------------------------------------------
    # BYOK  (Bring Your Own Key)
    # Ideal for: enterprises, teams with existing OpenRouter credits,
    # researchers who need custom model combinations.
    # User supplies their own OpenRouter key + model list. No cost to Phasor.
    # ------------------------------------------------------------------
    "byok": {
        "label": "BYOK",
        "use_case": "Custom model combos, enterprise, existing OpenRouter credits",
        "debaters": [],
        "synthesis_model": None,
        "rpm": 60,
        "daily_limit": None,
        "subject_to_global_cap": False,
    },
}