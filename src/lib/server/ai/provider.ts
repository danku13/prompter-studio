/**
 * Слой вызова LLM для AI-помощника (агент 5, BYOK).
 *
 * Поддержка:
 *  - 'openai'    — POST {base}/chat/completions, Authorization: Bearer <key>
 *                  (совместимо с любым OpenAI-совместимым endpoint, включая прокси);
 *  - 'anthropic' — POST {base}/v1/messages, x-api-key + anthropic-version
 *                  (Claude Messages API);
 *  - 'builtin'   — z-ai-web-dev-sdk (без ключа, работает из коробки в песочнице).
 *
 * Все ошибки переводятся в HttpError с человекочитаемым сообщением на русском.
 */

import type { AiProviderName } from '@/lib/types';
import { HttpError } from '../http';

export interface ProviderConfig {
  provider: AiProviderName;
  apiKey: string | null;
  baseUrl: string;
  model: string;
}

export interface LlmCall {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

const PROVIDER_LABEL: Record<AiProviderName, string> = {
  builtin: 'встроенный AI',
  openai: 'OpenAI API',
  anthropic: 'Claude API',
};

/** Склейка base + path с терпимостью к слэшам */
function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

function truncate(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** HTTP-вызов к внешнему API с единым маппингом сетевых ошибок */
async function providerFetch(
  provider: AiProviderName,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const label = PROVIDER_LABEL[provider];
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new HttpError(504, `${label}: превышено время ожидания ответа (${Math.round(timeoutMs / 1000)} с).`);
    }
    throw new HttpError(502, `${label}: не удалось связаться с ${url}. Проверьте интернет и Base URL.`);
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new HttpError(mapStatus(res.status), statusMessage(provider, res.status, text));
  }
  return text;
}

/** 401/403/404 — ошибка конфигурации (400), остальное — провайдер (502) */
function mapStatus(status: number): number {
  if (status === 401 || status === 403 || status === 404) return 400;
  return 502;
}

/** HTTP-статус + тело ошибки провайдера → русское сообщение */
function statusMessage(provider: AiProviderName, status: number, bodyText: string): string {
  const label = PROVIDER_LABEL[provider];
  let detail = '';
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const raw = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message;
    if (raw) detail = truncate(raw);
  } catch {
    if (bodyText) detail = truncate(bodyText);
  }
  const tail = detail ? ` Детали: ${detail}` : '';
  switch (true) {
    case status === 401:
      return `${label}: ключ отклонён (401). Проверьте API-ключ.${tail}`;
    case status === 403:
      return `${label}: доступ запрещён для этого ключа (403).${tail}`;
    case status === 404:
      return `${label}: адрес или модель не найдены (404). Проверьте Base URL и имя модели.${tail}`;
    case status === 429:
      return `${label}: превышен лимит запросов (429). Подождите немного и повторите.${tail}`;
    case status >= 500:
      return `${label}: провайдер временно недоступен (${status}).${tail}`;
    default:
      return `${label}: ошибка API (${status}).${tail}`;
  }
}

interface OpenAiChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
}

/** Универсальный вызов LLM → готовый текст ответа */
export async function callLlm(cfg: ProviderConfig, call: LlmCall): Promise<string> {
  const timeoutMs = call.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (cfg.provider === 'builtin') {
    return callBuiltin(call);
  }

  if (!cfg.apiKey) {
    throw new HttpError(
      400,
      `API-ключ для ${PROVIDER_LABEL[cfg.provider]} не настроен. Откройте «Настройки AI» и добавьте ключ.`,
      'ai_not_configured'
    );
  }

  if (cfg.provider === 'openai') {
    const url = cfg.baseUrl.endsWith('/chat/completions')
      ? cfg.baseUrl
      : joinUrl(cfg.baseUrl, '/chat/completions');
    const body = await providerFetch(
      'openai',
      url,
      { Authorization: `Bearer ${cfg.apiKey}` },
      {
        model: cfg.model,
        messages: [
          { role: 'system', content: call.system },
          { role: 'user', content: call.user },
        ],
        max_tokens: call.maxTokens,
        temperature: call.temperature ?? 0.7,
      },
      timeoutMs
    );
    let parsed: OpenAiChatResponse;
    try {
      parsed = JSON.parse(body) as OpenAiChatResponse;
    } catch {
      throw new HttpError(502, 'OpenAI API: неожиданный формат ответа.');
    }
    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new HttpError(502, 'OpenAI API вернул пустой ответ. Попробуйте ещё раз.');
    }
    return content;
  }

  // anthropic (Claude Messages API)
  const url = cfg.baseUrl.endsWith('/v1/messages')
    ? cfg.baseUrl
    : joinUrl(cfg.baseUrl.replace(/\/v1$/, ''), '/v1/messages');
  const body = await providerFetch(
    'anthropic',
    url,
    { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    {
      model: cfg.model,
      system: call.system,
      messages: [{ role: 'user', content: call.user }],
      max_tokens: call.maxTokens,
      temperature: call.temperature ?? 0.7,
    },
    timeoutMs
  );
  let parsed: AnthropicMessageResponse;
  try {
    parsed = JSON.parse(body) as AnthropicMessageResponse;
  } catch {
    throw new HttpError(502, 'Claude API: неожиданный формат ответа.');
  }
  const content = (parsed.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
  if (content.length === 0) {
    throw new HttpError(502, 'Claude API вернул пустой ответ. Попробуйте ещё раз.');
  }
  return content;
}

/** Встроенный провайдер (z-ai-web-dev-sdk, только серверная сторона) */
async function callBuiltin(call: LlmCall): Promise<string> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: call.system },
      { role: 'user', content: call.user },
    ],
    thinking: { type: 'disabled' },
  });
  const content = completion.choices[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new HttpError(502, 'Встроенный AI вернул пустой ответ. Попробуйте ещё раз.');
  }
  return content;
}
