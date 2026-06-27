import os
import json
import time
import hmac
import hashlib
import logging
import threading
from datetime import datetime, timezone
from itertools import combinations
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

import jwt
import requests
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS

try:
    import redis as redis_lib
except ImportError:  # pragma: no cover - redis is an expected prod dependency
    redis_lib = None

try:
    from supabase import create_client
except ImportError:  # pragma: no cover - supabase is an expected prod dependency
    create_client = None

from models import (
    PLAN_CONFIGS,
    OPENROUTER_API_URL,
    OPENROUTER_API_KEY,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET,
    REDIS_URL,
    LEMON_SQUEEZY_WEBHOOK_SECRET,
    LS_CORE_VARIANT_ID,
    LS_PRO_VARIANT_ID,
    FREE_TIER_MONTHLY_PROMPT_CAP,
    MAX_BYOK_MODELS,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("phasor")

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

# ---------------------------------------------------------------------------
# Constants not sourced from config.models
# ---------------------------------------------------------------------------
MIN_BYOK_MODELS = 2
MAX_QUERY_LENGTH = 2000
MAX_HISTORY_MESSAGES = 10
REQUEST_TIMEOUT_SECONDS = 60
SYNTHESIS_TIMEOUT_SECONDS = 90
HTTP_RETRY_COUNT = 2
MODEL_UNAVAILABLE = "[Model unavailable]"


# ===========================================================================
# Redis connection (with safe in-memory fallback)
# ===========================================================================
redis_client = None
REDIS_AVAILABLE = False


def _init_redis() -> None:
    global redis_client, REDIS_AVAILABLE
    if not REDIS_URL or redis_lib is None:
        logger.warning(
            "REDIS_URL not set or redis package unavailable -- falling back "
            "to in-memory usage tracking. This is NOT safe across multiple "
            "server processes/instances."
        )
        return
    try:
        client = redis_lib.from_url(
            REDIS_URL,
            socket_connect_timeout=3,
            socket_timeout=3,
            decode_responses=True,
        )
        client.ping()
        redis_client = client
        REDIS_AVAILABLE = True
        logger.info("Connected to Redis successfully.")
    except Exception as exc:  # noqa: BLE001 - intentional broad catch, must never crash boot
        logger.warning("Redis connection failed (%s). Falling back to in-memory tracking.", exc)
        redis_client = None
        REDIS_AVAILABLE = False


_init_redis()

# In-memory fallback stores, guarded by their own locks. Only used when
# Redis is unavailable. Note: these are per-process and reset on restart /
# are not shared across multiple server instances -- acceptable as a
# degraded-mode safety net, not a long-term substitute for Redis.
IN_MEMORY_RPM: Dict[Tuple[str, str], int] = {}
IN_MEMORY_DAILY: Dict[Tuple[str, str], int] = {}
IN_MEMORY_GLOBAL_FREE_MONTHLY: Dict[str, Any] = {"count": 0, "month_key": None}

_RPM_LOCK = threading.Lock()
_DAILY_LOCK = threading.Lock()
_GLOBAL_LOCK = threading.Lock()


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _minute_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H-%M")


def _redis_incr_with_expiry(key: str, ttl_seconds: int) -> Optional[int]:
    """Atomically increments a Redis counter and (re)sets its TTL.
    Returns the new count, or None if Redis is unreachable so callers can
    fall back to in-memory tracking."""
    try:
        pipe = redis_client.pipeline()
        pipe.incr(key, 1)
        pipe.expire(key, ttl_seconds)
        results = pipe.execute()
        return int(results[0])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis INCR failed for key=%s (%s). Falling back to in-memory.", key, exc)
        return None


# ---------------------------------------------------------------------------
# Per-minute rate limiting (anti-abuse)
# ---------------------------------------------------------------------------
def check_rate_limit(identity: str, rpm_limit: int) -> bool:
    """Returns True if this request is within the per-minute rate limit."""
    bucket = _minute_key()
    key = f"phasor:rpm:{identity}:{bucket}"

    if REDIS_AVAILABLE:
        count = _redis_incr_with_expiry(key, 90)
        if count is not None:
            return count <= rpm_limit

    with _RPM_LOCK:
        stale = [k for k in IN_MEMORY_RPM if k[0] == identity and k[1] != bucket]
        for k in stale:
            del IN_MEMORY_RPM[k]
        dict_key = (identity, bucket)
        current = IN_MEMORY_RPM.get(dict_key, 0) + 1
        IN_MEMORY_RPM[dict_key] = current
        return current <= rpm_limit


# ---------------------------------------------------------------------------
# Per-day usage tracking
# ---------------------------------------------------------------------------
def check_and_increment_daily(identity: str, daily_limit: Optional[int]) -> Tuple[bool, int]:
    """Increments today's usage counter for `identity`. Returns
    (allowed, new_count). daily_limit=None means unlimited (BYOK), in
    which case usage is still tracked for visibility but always allowed."""
    bucket = _today_key()
    key = f"phasor:daily:{identity}:{bucket}"

    if REDIS_AVAILABLE:
        count = _redis_incr_with_expiry(key, 60 * 60 * 26)
        if count is not None:
            allowed = True if daily_limit is None else count <= daily_limit
            return allowed, count

    with _DAILY_LOCK:
        stale = [k for k in IN_MEMORY_DAILY if k[0] == identity and k[1] != bucket]
        for k in stale:
            del IN_MEMORY_DAILY[k]
        dict_key = (identity, bucket)
        current = IN_MEMORY_DAILY.get(dict_key, 0) + 1
        IN_MEMORY_DAILY[dict_key] = current
        allowed = True if daily_limit is None else current <= daily_limit
        return allowed, current


def get_daily_usage(identity: str) -> int:
    """Read-only lookup of today's usage count, without incrementing it."""
    bucket = _today_key()
    key = f"phasor:daily:{identity}:{bucket}"

    if REDIS_AVAILABLE:
        try:
            value = redis_client.get(key)
            return int(value) if value is not None else 0
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis GET failed for key=%s (%s). Falling back to in-memory.", key, exc)

    with _DAILY_LOCK:
        return IN_MEMORY_DAILY.get((identity, bucket), 0)


# ---------------------------------------------------------------------------
# Aggregate free-tier monthly spend safety net
# ---------------------------------------------------------------------------
def check_and_increment_global_free_cap() -> Tuple[bool, int]:
    """Increments the aggregate free-tier monthly counter across ALL users.
    Returns (allowed, new_count)."""
    bucket = _month_key()
    key = f"phasor:global_free_monthly:{bucket}"

    if REDIS_AVAILABLE:
        count = _redis_incr_with_expiry(key, 60 * 60 * 24 * 35)
        if count is not None:
            return count <= FREE_TIER_MONTHLY_PROMPT_CAP, count

    with _GLOBAL_LOCK:
        if IN_MEMORY_GLOBAL_FREE_MONTHLY["month_key"] != bucket:
            IN_MEMORY_GLOBAL_FREE_MONTHLY["month_key"] = bucket
            IN_MEMORY_GLOBAL_FREE_MONTHLY["count"] = 0
        IN_MEMORY_GLOBAL_FREE_MONTHLY["count"] += 1
        current = IN_MEMORY_GLOBAL_FREE_MONTHLY["count"]
        return current <= FREE_TIER_MONTHLY_PROMPT_CAP, current


def get_global_free_monthly_usage() -> int:
    bucket = _month_key()
    key = f"phasor:global_free_monthly:{bucket}"

    if REDIS_AVAILABLE:
        try:
            value = redis_client.get(key)
            return int(value) if value is not None else 0
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis GET failed for key=%s (%s).", key, exc)

    with _GLOBAL_LOCK:
        if IN_MEMORY_GLOBAL_FREE_MONTHLY["month_key"] != bucket:
            return 0
        return IN_MEMORY_GLOBAL_FREE_MONTHLY["count"]


# ===========================================================================
# Authentication / plan resolution
# ===========================================================================
class AuthError(Exception):
    """Raised when an Authorization header is present but invalid/expired.
    Per spec, this must surface as a 401 -- never a silent fallback to free."""

    def __init__(self, error_code: str, status_code: int = 401):
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(error_code)


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def resolve_identity() -> Dict[str, Any]:
    """Resolves the caller's plan + rate-limit identity from the
    Authorization header.

    Returns {"plan": str, "user_id": str | None, "identity": str}.
    Raises AuthError if a token is present but invalid/expired.
    Falls back to the free plan ONLY when no Authorization header exists.
    """
    auth_header = request.headers.get("Authorization", "")

    if not auth_header:
        return {"plan": "free", "user_id": None, "identity": _client_ip()}

    if not auth_header.startswith("Bearer "):
        raise AuthError("invalid_token")

    token = auth_header[len("Bearer "):].strip()
    if not token:
        raise AuthError("invalid_token")

    if not SUPABASE_JWT_SECRET:
        logger.error("SUPABASE_JWT_SECRET is not configured; cannot verify incoming JWT.")
        raise AuthError("invalid_token")

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise AuthError("token_expired")
    except jwt.InvalidTokenError:
        raise AuthError("invalid_token")

    plan = payload.get("app_metadata", {}).get("plan", "free")
    if plan not in PLAN_CONFIGS:
        plan = "free"

    user_id = payload.get("sub")
    identity = user_id or _client_ip()

    return {"plan": plan, "user_id": user_id, "identity": identity}


# ===========================================================================
# Request validation
# ===========================================================================
def validate_query_text(raw_value: Any) -> Tuple[Optional[str], Optional[str]]:
    """Returns (cleaned_text, error_message). error_message is None on success."""
    if raw_value is None:
        return None, "query is required"
    if not isinstance(raw_value, str):
        return None, "query must be a string"
    cleaned = raw_value.strip()
    if not cleaned:
        return None, "query cannot be empty"
    if len(cleaned) > MAX_QUERY_LENGTH:
        return None, f"query exceeds maximum length of {MAX_QUERY_LENGTH} characters"
    return cleaned, None


def sanitize_history(raw_history: Any) -> List[Dict[str, str]]:
    """Validates and truncates the optional conversation history to the last
    MAX_HISTORY_MESSAGES entries. Malformed entries are dropped rather than
    failing the whole request -- history is a best-effort convenience, not
    something that should block a query."""
    if not raw_history or not isinstance(raw_history, list):
        return []

    cleaned: List[Dict[str, str]] = []
    for entry in raw_history:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        content = entry.get("content")
        if role not in ("user", "assistant"):
            continue
        if not isinstance(content, str) or not content.strip():
            continue
        cleaned.append({"role": role, "content": content.strip()})

    if len(cleaned) > MAX_HISTORY_MESSAGES:
        cleaned = cleaned[-MAX_HISTORY_MESSAGES:]

    return cleaned


def validate_byok_config(byok_config: Any) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Validates a byok_config block. Returns (config_dict, error_message)."""
    if not isinstance(byok_config, dict):
        return None, "byok_config must be an object"

    api_key = byok_config.get("api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        return None, "byok_config.api_key is required"

    models = byok_config.get("models")
    if not isinstance(models, list) or not all(isinstance(m, str) and m.strip() for m in models):
        return None, "byok_config.models must be a non-empty array of model slugs"

    models = [m.strip() for m in models]

    if len(models) < MIN_BYOK_MODELS:
        return None, f"byok_config.models must contain at least {MIN_BYOK_MODELS} models"
    if len(models) > MAX_BYOK_MODELS:
        return None, f"byok_config.models must contain at most {MAX_BYOK_MODELS} models"

    synthesis_model = byok_config.get("synthesis_model")
    if not isinstance(synthesis_model, str) or not synthesis_model.strip():
        synthesis_model = models[0]
    else:
        synthesis_model = synthesis_model.strip()

    return {
        "api_key": api_key.strip(),
        "models": models,
        "synthesis_model": synthesis_model,
    }, None


def resolve_pipeline_config(
    plan: str, byok_payload: Any
) -> Tuple[List[str], str, Optional[str]]:
    """Returns (models, synthesis_model, api_key_override) for a plan.
    Raises ValueError with a user-facing message if BYOK config is invalid."""
    if plan == "byok":
        if byok_payload is None:
            raise ValueError("byok_config is required for the byok plan")
        config, error = validate_byok_config(byok_payload)
        if error:
            raise ValueError(error)
        return config["models"], config["synthesis_model"], config["api_key"]

    plan_cfg = PLAN_CONFIGS.get(plan, PLAN_CONFIGS["free"])
    return plan_cfg["debaters"], plan_cfg["synthesis_model"], None


def enforce_request_boundaries(plan: str, identity: str) -> Optional[Tuple[Dict[str, str], int]]:
    """Runs rate-limit, daily-limit, and global-free-cap checks.
    Returns None if allowed, or (response_body, status_code) if rejected."""
    plan_cfg = PLAN_CONFIGS.get(plan, PLAN_CONFIGS["free"])
    rpm_limit = plan_cfg["rpm"]

    if not check_rate_limit(identity, rpm_limit):
        return {
            "error": "rate_limit_exceeded",
            "message": f"Too many requests. Limit is {rpm_limit} requests per minute.",
        }, 429

    daily_limit = plan_cfg["daily_limit"]
    allowed, _current_daily = check_and_increment_daily(identity, daily_limit)
    if not allowed:
        return {
            "error": "daily_limit_exceeded",
            "message": (
                f"Daily limit of {daily_limit} prompts reached. "
                "Please try again tomorrow or upgrade your plan."
            ),
        }, 429

    if plan_cfg.get("subject_to_global_cap"):
        global_allowed, _current_global = check_and_increment_global_free_cap()
        if not global_allowed:
            return {
                "error": "free_tier_capacity_reached",
                "message": (
                    "Free tier has reached its monthly capacity. Please try "
                    "again next month or consider upgrading."
                ),
            }, 503

    return None


# ===========================================================================
# OpenRouter client
# ===========================================================================
def call_openrouter(
    model: str,
    messages: List[Dict[str, str]],
    api_key: Optional[str] = None,
    max_tokens: int = 1200,
    temperature: float = 0.7,
    timeout: int = REQUEST_TIMEOUT_SECONDS,
) -> str:
    """Makes a single chat-completion request to OpenRouter. Never raises --
    returns MODEL_UNAVAILABLE on any failure so the pipeline can keep going."""
    key_to_use = api_key or OPENROUTER_API_KEY
    if not key_to_use:
        logger.error("No OpenRouter API key available for model=%s.", model)
        return MODEL_UNAVAILABLE

    headers = {
        "Authorization": f"Bearer {key_to_use}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://phasor.ai",
        "X-Title": "Phasor AI",
    }
    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    last_error = "unknown"

    for attempt in range(HTTP_RETRY_COUNT + 1):
        try:
            response = requests.post(OPENROUTER_API_URL, headers=headers, json=body, timeout=timeout)

            if response.status_code != 200:
                last_error = f"HTTP {response.status_code}: {response.text[:300]}"
                logger.warning(
                    "OpenRouter call failed for model=%s (attempt %d/%d): %s",
                    model, attempt + 1, HTTP_RETRY_COUNT + 1, last_error,
                )
                retriable = response.status_code in (429, 500, 502, 503, 504)
                if retriable and attempt < HTTP_RETRY_COUNT:
                    time.sleep(0.6 * (attempt + 1))
                    continue
                return MODEL_UNAVAILABLE

            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                logger.warning("OpenRouter returned no choices for model=%s.", model)
                return MODEL_UNAVAILABLE

            content = choices[0].get("message", {}).get("content")
            if not content or not isinstance(content, str):
                logger.warning("OpenRouter returned empty content for model=%s.", model)
                return MODEL_UNAVAILABLE

            return content.strip()

        except requests.exceptions.Timeout:
            last_error = "request timed out"
            logger.warning("OpenRouter call timed out for model=%s (attempt %d).", model, attempt + 1)
        except requests.exceptions.RequestException as exc:
            last_error = str(exc)
            logger.warning("OpenRouter request error for model=%s (attempt %d): %s", model, attempt + 1, exc)
        except (ValueError, KeyError, TypeError) as exc:
            # response.json() parsing / unexpected shape -- not retriable.
            logger.warning("OpenRouter response parsing error for model=%s: %s", model, exc)
            return MODEL_UNAVAILABLE
        except Exception as exc:  # noqa: BLE001 - final safety net, must never crash the pipeline
            logger.error("Unexpected error calling OpenRouter for model=%s: %s", model, exc)
            return MODEL_UNAVAILABLE

        if attempt < HTTP_RETRY_COUNT:
            time.sleep(0.6 * (attempt + 1))

    logger.error("Exhausted retries calling OpenRouter for model=%s. Last error: %s", model, last_error)
    return MODEL_UNAVAILABLE


# ===========================================================================
# Step 1 -- Independent Answers
# ===========================================================================
def run_step1_independent_answers(
    models: List[str], query: str, api_key: Optional[str] = None
) -> Dict[str, str]:
    """Every model answers the query independently and concurrently."""
    system_prompt = (
        "You are one of several independent expert analysts answering a "
        "user's question. Provide your single best, accurate, well-reasoned "
        "answer. Do not mention that you are an AI model, a debate, or any "
        "platform -- just answer the question directly and substantively."
    )

    messages_for = {
        model: [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ]
        for model in models
    }

    answers: Dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=max(len(models), 1)) as executor:
        future_to_model = {
            executor.submit(call_openrouter, model, messages_for[model], api_key): model
            for model in models
        }
        for future in as_completed(future_to_model):
            model = future_to_model[future]
            try:
                answers[model] = future.result()
            except Exception as exc:  # noqa: BLE001
                logger.error("Step 1 future raised for model=%s: %s", model, exc)
                answers[model] = MODEL_UNAVAILABLE

    # Preserve the caller-supplied model ordering in the returned dict.
    return {model: answers.get(model, MODEL_UNAVAILABLE) for model in models}


# ===========================================================================
# Step 2 -- Adversarial Debate
# ===========================================================================
def run_step2_debates(
    models: List[str],
    query: str,
    answers: Dict[str, str],
    api_key: Optional[str] = None,
) -> Dict[str, str]:
    """Every pair of models critiques each other's Step 1 answer. For N
    models this issues up to 2 * C(N, 2) calls, all concurrent. If a
    model's Step 1 answer was unavailable, no critique is generated
    targeting that model's (missing) answer -- though that model may still
    critique others if its own Step 1 answer succeeded.

    Returns a dict keyed "{critic_model}->{target_model}" -> critique text.
    """
    jobs: List[Tuple[str, str]] = []
    for model_a, model_b in combinations(models, 2):
        if answers.get(model_b) != MODEL_UNAVAILABLE:
            jobs.append((model_a, model_b))  # model_a critiques model_b
        if answers.get(model_a) != MODEL_UNAVAILABLE:
            jobs.append((model_b, model_a))  # model_b critiques model_a

    debates: Dict[str, str] = {}
    if not jobs:
        return debates

    critique_system_prompt = (
        "You are acting as a rigorous peer reviewer. You will be shown a "
        "question and another analyst's answer to it. Critically evaluate "
        "that answer: identify factual errors, logical gaps, missing "
        "considerations, or unsupported claims, and note what it gets "
        "right. Be specific and substantive. Do not mention AI models, "
        "debates, or platforms -- just critique the reasoning and content."
    )

    def _build_messages(target_answer: str) -> List[Dict[str, str]]:
        user_prompt = (
            f"Original question:\n{query}\n\n"
            f"Answer to critique:\n{target_answer}\n\n"
            "Provide your critique."
        )
        return [
            {"role": "system", "content": critique_system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    with ThreadPoolExecutor(max_workers=max(len(jobs), 1)) as executor:
        future_to_pair = {
            executor.submit(
                call_openrouter, critic, _build_messages(answers.get(target, MODEL_UNAVAILABLE)), api_key
            ): (critic, target)
            for critic, target in jobs
        }
        for future in as_completed(future_to_pair):
            critic, target = future_to_pair[future]
            key = f"{critic}->{target}"
            try:
                debates[key] = future.result()
            except Exception as exc:  # noqa: BLE001
                logger.error("Step 2 future raised for %s: %s", key, exc)
                debates[key] = MODEL_UNAVAILABLE

    return debates


# ===========================================================================
# Step 3 -- Synthesis
# ===========================================================================
def run_step3_synthesis(
    synthesis_model: str,
    query: str,
    answers: Dict[str, str],
    debates: Dict[str, str],
    history: List[Dict[str, str]],
    api_key: Optional[str] = None,
) -> str:
    """A single synthesis model receives the original query, all Step 1
    answers, all Step 2 critiques, and recent conversation history, and
    produces one final consensus answer. The model is explicitly instructed
    to never reveal the underlying debate mechanics, platform name, or
    model identities -- it must output only the final verdict."""
    system_prompt = (
        "You are producing a single, final, authoritative answer to the "
        "user's question. You have privately been given multiple expert "
        "perspectives on this question, along with critiques exchanged "
        "between those perspectives. Use all of this to reason out the "
        "most accurate, complete, and well-supported answer.\n\n"
        "CRITICAL RULES FOR YOUR OUTPUT:\n"
        "1) Never mention that multiple models, analysts, or AIs were "
        "consulted.\n"
        "2) Never mention a debate, critique, review, or synthesis "
        "process of any kind.\n"
        "3) Never name or hint at any AI model, vendor, or platform "
        "(for example: do not say Llama, Claude, DeepSeek, Gemini, GPT, "
        "OpenRouter, or Phasor).\n"
        "4) Output ONLY the final consensus answer to the user's "
        "question, written as if it is your own direct, confident "
        "response. Do not include any meta-commentary about how the "
        "answer was produced."
    )

    evidence_lines = ["Independent expert perspectives gathered on this question:"]
    for i, (_model, answer) in enumerate(answers.items(), start=1):
        evidence_lines.append(f"\n--- Perspective {i} ---\n{answer}")

    if debates:
        evidence_lines.append("\n\nCritiques exchanged between the perspectives above:")
        for i, (_pair_key, critique) in enumerate(debates.items(), start=1):
            evidence_lines.append(f"\n--- Critique {i} ---\n{critique}")

    evidence_block = "\n".join(evidence_lines)

    user_content = (
        f"User's question:\n{query}\n\n"
        f"{evidence_block}\n\n"
        "Using everything above, write the single best final answer to "
        "the user's question, following the rules in your instructions "
        "exactly."
    )

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for turn in history:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_content})

    return call_openrouter(
        synthesis_model,
        messages,
        api_key=api_key,
        max_tokens=1800,
        temperature=0.4,
        timeout=SYNTHESIS_TIMEOUT_SECONDS,
    )


# ===========================================================================
# Supabase admin client (service role) -- used ONLY by the billing webhook
# ===========================================================================
supabase_admin = None


def _init_supabase_admin() -> None:
    global supabase_admin
    if create_client is None:
        logger.warning(
            "supabase package not installed; the billing webhook will be "
            "unable to update profiles."
        )
        return
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured; the "
            "billing webhook will be unable to update profiles."
        )
        return
    try:
        supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        logger.info("Supabase service-role admin client initialized.")
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to initialize Supabase admin client: %s", exc)
        supabase_admin = None


_init_supabase_admin()


def _update_user_plan(user_id: str, plan: str) -> bool:
    """Safely updates a user's plan column in the profiles table using the
    service-role client (bypasses RLS). Never raises."""
    if supabase_admin is None:
        logger.error(
            "Cannot update plan for user_id=%s: Supabase admin client not initialized.",
            user_id,
        )
        return False
    try:
        supabase_admin.table("profiles").update(
            {"plan": plan, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", user_id).execute()
        logger.info("Updated profiles.plan for user_id=%s -> plan=%s.", user_id, plan)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to update profile for user_id=%s: %s", user_id, exc)
        return False


# ===========================================================================
# Endpoints
# ===========================================================================
@app.route("/ask", methods=["POST"])
def ask():
    payload = request.get_json(silent=True) or {}

    query, query_error = validate_query_text(payload.get("query"))
    if query_error:
        return jsonify({"error": "invalid_query", "message": query_error}), 400

    try:
        identity_info = resolve_identity()
    except AuthError as exc:
        return jsonify({"error": exc.error_code}), exc.status_code

    plan = identity_info["plan"]
    identity = identity_info["identity"]
    history = sanitize_history(payload.get("history"))

    try:
        models, synthesis_model, byok_api_key = resolve_pipeline_config(plan, payload.get("byok_config"))
    except ValueError as exc:
        return jsonify({"error": "invalid_byok_config", "message": str(exc)}), 400

    boundary_violation = enforce_request_boundaries(plan, identity)
    if boundary_violation:
        body, status = boundary_violation
        return jsonify(body), status

    try:
        answers = run_step1_independent_answers(models, query, api_key=byok_api_key)
        debates = run_step2_debates(models, query, answers, api_key=byok_api_key)
        verdict = run_step3_synthesis(synthesis_model, query, answers, debates, history, api_key=byok_api_key)
    except Exception as exc:  # noqa: BLE001 - pipeline must never bubble a 500 from a partial failure
        logger.error("Unexpected pipeline failure for identity=%s: %s", identity, exc)
        return jsonify({
            "error": "pipeline_failure",
            "message": "An unexpected error occurred while processing your request.",
        }), 500

    return jsonify({"answers": answers, "debates": debates, "verdict": verdict}), 200


@app.route("/ask/stream", methods=["POST"])
def ask_stream():
    payload = request.get_json(silent=True) or {}

    query, query_error = validate_query_text(payload.get("query"))
    if query_error:
        return jsonify({"error": "invalid_query", "message": query_error}), 400

    try:
        identity_info = resolve_identity()
    except AuthError as exc:
        return jsonify({"error": exc.error_code}), exc.status_code

    plan = identity_info["plan"]
    identity = identity_info["identity"]
    history = sanitize_history(payload.get("history"))

    try:
        models, synthesis_model, byok_api_key = resolve_pipeline_config(plan, payload.get("byok_config"))
    except ValueError as exc:
        return jsonify({"error": "invalid_byok_config", "message": str(exc)}), 400

    boundary_violation = enforce_request_boundaries(plan, identity)
    if boundary_violation:
        body, status = boundary_violation
        return jsonify(body), status

    def _sse_event(event_name: str, data_dict: Dict[str, Any]) -> str:
        return f"event: {event_name}\ndata: {json.dumps(data_dict)}\n\n"

    def generate():
        try:
            yield _sse_event("start", {"status": "started"})

            answers = run_step1_independent_answers(models, query, api_key=byok_api_key)
            yield _sse_event("answers_complete", {"answers": answers})

            debates = run_step2_debates(models, query, answers, api_key=byok_api_key)
            yield _sse_event("debates_complete", {"debates": debates})

            verdict = run_step3_synthesis(synthesis_model, query, answers, debates, history, api_key=byok_api_key)
            yield _sse_event("done", {"answers": answers, "debates": debates, "verdict": verdict})

        except Exception as exc:  # noqa: BLE001
            logger.error("Unexpected streaming pipeline failure for identity=%s: %s", identity, exc)
            yield _sse_event("error", {
                "error": "pipeline_failure",
                "message": "An unexpected error occurred while processing your request.",
            })

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.route("/usage", methods=["GET"])
def usage():
    try:
        identity_info = resolve_identity()
    except AuthError as exc:
        return jsonify({"error": exc.error_code}), exc.status_code

    plan = identity_info["plan"]
    identity = identity_info["identity"]
    plan_cfg = PLAN_CONFIGS.get(plan, PLAN_CONFIGS["free"])

    daily_used = get_daily_usage(identity)
    daily_limit = plan_cfg["daily_limit"]
    daily_remaining = None if daily_limit is None else max(daily_limit - daily_used, 0)

    return jsonify({
        "plan": plan,
        "identity_type": "user" if identity_info["user_id"] else "ip",
        "daily_used": daily_used,
        "daily_limit": daily_limit,
        "daily_remaining": daily_remaining,
        "rate_limit_per_minute": plan_cfg["rpm"],
    }), 200


@app.route("/config", methods=["GET"])
def config_endpoint():
    public_plans: Dict[str, Any] = {}
    for plan_name, cfg in PLAN_CONFIGS.items():
        public_plans[plan_name] = {
            "label": cfg["label"],
            "debaters": cfg["debaters"],
            "synthesis_model": cfg["synthesis_model"],
            "rate_limit_per_minute": cfg["rpm"],
            "daily_limit": cfg["daily_limit"],
        }

    public_plans["byok"]["min_models"] = MIN_BYOK_MODELS
    public_plans["byok"]["max_models"] = MAX_BYOK_MODELS

    return jsonify({"plans": public_plans}), 200


@app.route("/health", methods=["GET"])
def health():
    redis_status = "connected" if REDIS_AVAILABLE else "unavailable_using_in_memory_fallback"
    supabase_configured = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET)
    billing_webhook_configured = bool(LEMON_SQUEEZY_WEBHOOK_SECRET and LS_CORE_VARIANT_ID and LS_PRO_VARIANT_ID)

    return jsonify({
        "status": "ok",
        "redis": redis_status,
        "supabase_configured": supabase_configured,
        "billing_webhook_configured": billing_webhook_configured,
        "free_tier_monthly_usage": get_global_free_monthly_usage(),
        "free_tier_monthly_cap": FREE_TIER_MONTHLY_PROMPT_CAP,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }), 200


@app.route("/webhooks/lemon-squeezy", methods=["POST"])
def lemon_squeezy_webhook():
    raw_body = request.get_data()
    signature = request.headers.get("X-Signature", "")

    if not LEMON_SQUEEZY_WEBHOOK_SECRET:
        logger.error("LEMON_SQUEEZY_WEBHOOK_SECRET is not configured; rejecting webhook.")
        return jsonify({"error": "webhook_not_configured"}), 500

    try:
        expected_signature = hmac.new(
            LEMON_SQUEEZY_WEBHOOK_SECRET.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to compute webhook signature: %s", exc)
        return jsonify({"error": "signature_computation_failed"}), 400

    if not signature or not hmac.compare_digest(expected_signature, signature):
        logger.warning("Lemon Squeezy webhook signature mismatch.")
        return jsonify({"error": "invalid_signature"}), 401

    try:
        event = json.loads(raw_body)
    except (ValueError, TypeError) as exc:
        logger.error("Failed to parse Lemon Squeezy webhook body: %s", exc)
        return jsonify({"error": "invalid_payload"}), 400

    meta = event.get("meta", {}) or {}
    event_name = meta.get("event_name", "")
    custom_data = meta.get("custom_data", {}) or {}
    user_id = custom_data.get("user_id")

    if event_name == "subscription_created":
        if not user_id:
            logger.error("subscription_created webhook missing meta.custom_data.user_id.")
            return jsonify({"error": "missing_user_id"}), 400

        variant_id = str(event.get("data", {}).get("attributes", {}).get("variant_id", ""))

        if LS_CORE_VARIANT_ID and variant_id == str(LS_CORE_VARIANT_ID):
            target_plan = "core"
        elif LS_PRO_VARIANT_ID and variant_id == str(LS_PRO_VARIANT_ID):
            target_plan = "pro"
        else:
            logger.error(
                "subscription_created webhook has unrecognized variant_id=%s for user_id=%s.",
                variant_id, user_id,
            )
            return jsonify({"error": "unrecognized_variant"}), 400

        _update_user_plan(user_id, target_plan)

    elif event_name in ("subscription_cancelled", "subscription_expired"):
        if not user_id:
            logger.error("%s webhook missing meta.custom_data.user_id.", event_name)
            return jsonify({"error": "missing_user_id"}), 400
        _update_user_plan(user_id, "free")

    elif event_name == "subscription_payment_failed":
        logger.warning(
            "Lemon Squeezy payment failure for user_id=%s | event_data=%s",
            user_id, json.dumps(event.get("data", {}))[:2000],
        )
        # Intentionally does not downgrade the account immediately -- this
        # is surfaced for administrative auditing / dunning workflows.

    else:
        logger.info("Received unhandled Lemon Squeezy event_name=%s.", event_name)

    return jsonify({"status": "received"}), 200


# ===========================================================================
# Generic error handlers
# ===========================================================================
@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "not_found", "message": "The requested endpoint does not exist."}), 404


@app.errorhandler(405)
def method_not_allowed(_error):
    return jsonify({
        "error": "method_not_allowed",
        "message": "This HTTP method is not allowed on this endpoint.",
    }), 405


@app.errorhandler(500)
def internal_error(error):
    logger.error("Unhandled internal server error: %s", error)
    return jsonify({"error": "internal_server_error", "message": "An unexpected error occurred."}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)