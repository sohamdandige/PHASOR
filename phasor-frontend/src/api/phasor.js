// API base URL — set VITE_API_URL in your .env
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function authHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// ------------------------------------------------------------------
// Non-streaming /ask
// ------------------------------------------------------------------
export async function ask({ query, history = [], byok_config = null, token = null }) {
  const body = { query };
  if (history.length) body.history = history;
  if (byok_config) body.byok_config = byok_config;

  const res = await fetch(`${BASE_URL}/ask`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(
      new Error(data.message || data.error || 'Request failed'),
      { code: data.error, status: res.status }
    );
  }
  return data; // { answers, debates, verdict }
}

// ------------------------------------------------------------------
// Streaming /ask/stream — SSE
// Calls onEvent(eventName, data) for each SSE event.
// Returns an AbortController so the caller can cancel.
// Events: start, answers_complete, debates_complete, done, error
// ------------------------------------------------------------------
export function askStream({ query, history = [], byok_config = null, token = null, onEvent, onError }) {
  const controller = new AbortController();

  (async () => {
    try {
      const body = { query };
      if (history.length) body.history = history;
      if (byok_config) body.byok_config = byok_config;

      const res = await fetch(`${BASE_URL}/ask/stream`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error(errData.message || errData.error || 'Stream request failed'),
          { code: errData.error, status: res.status }
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep the incomplete trailing chunk

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventName = 'message';
          let dataLine = '';

          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            if (line.startsWith('data: ')) dataLine = line.slice(6).trim();
          }

          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine);
            onEvent(eventName, parsed);
          } catch {
            // ignore malformed chunk
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      onError?.(err);
    }
  })();

  return controller;
}

// ------------------------------------------------------------------
// /usage
// Returns: { plan, identity_type, daily_used, daily_limit, daily_remaining, rate_limit_per_minute }
// ------------------------------------------------------------------
export async function fetchUsage(token = null) {
  const res = await fetch(`${BASE_URL}/usage`, {
    headers: authHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.error || 'Usage fetch failed'), { code: data.error });
  }
  return data;
}

// ------------------------------------------------------------------
// /config
// Returns: { plans: { free, core, pro, byok } }
// ------------------------------------------------------------------
export async function fetchConfig() {
  const res = await fetch(`${BASE_URL}/config`);
  const data = await res.json();
  if (!res.ok) throw new Error('Config fetch failed');
  return data;
}

// ------------------------------------------------------------------
// /health
// ------------------------------------------------------------------
export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}

// ------------------------------------------------------------------
// Error code → human-readable message mapping (mirrors backend error codes)
// ------------------------------------------------------------------
export const ERROR_MESSAGES = {
  invalid_token: 'Your session has expired. Please sign in again.',
  token_expired: 'Your session has expired. Please sign in again.',
  rate_limit_exceeded: 'Too many requests. Slow down and try again.',
  daily_limit_exceeded: 'Daily limit reached. Upgrade or try again tomorrow.',
  free_tier_capacity_reached: 'Free tier is at capacity for this month.',
  pipeline_failure: 'Something went wrong on our end. Please retry.',
  invalid_query: 'Invalid query. Please check your input.',
  invalid_byok_config: 'Invalid BYOK configuration.',
};

export function friendlyError(err) {
  return ERROR_MESSAGES[err?.code] || err?.message || 'An unexpected error occurred.';
}
