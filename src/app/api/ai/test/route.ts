import { NextResponse, type NextRequest } from 'next/server';
import { HttpError, errorResponse, readJson } from '@/lib/server/http';
import { requireTicket } from '@/lib/server/security';
import { callLlm } from '@/lib/server/ai/provider';
import { providerConfig, readAiConfig } from '@/lib/server/ai/settings';
import { aiTestSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** Нормализация для сравнения Base URL (без хвостовых слэшей) */
function normBaseUrl(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

/**
 * POST /api/ai/test {provider?, key?, baseUrl?, model?} → AiTestResult.
 * Поля key/baseUrl/model можно передать инлайн — тогда проверяется ещё
 * несохранённый ключ из формы настроек; иначе берётся сохранённый.
 *
 * Анти-эксфильтрация (аудит 2026-09): подмена инлайн-Base URL при наличии
 * сохранённого ключа требует и инлайн-ключ. Иначе неаутентифицированный
 * запрос мог бы отправить сохранённый ключ на произвольный адрес.
 */
export async function POST(req: NextRequest) {
  try {
    await requireTicket(req);
    const body = aiTestSchema.parse(await readJson(req));
    const row = await readAiConfig();
    const provider = body.provider ?? null;
    const target = provider ?? (row.defaultProvider === 'openai' || row.defaultProvider === 'anthropic' ? row.defaultProvider : 'builtin');

    const stored = providerConfig(row, target);
    const apiKey = body.key?.trim() || stored.apiKey;
    const baseUrl = body.baseUrl?.trim() || stored.baseUrl;
    const model = body.model?.trim() || stored.model;

    const baseUrlOverridden =
      body.baseUrl != null &&
      body.baseUrl.trim() !== '' &&
      normBaseUrl(body.baseUrl) !== normBaseUrl(stored.baseUrl);
    if (baseUrlOverridden && !body.key?.trim() && stored.apiKey) {
      throw new HttpError(
        400,
        'Проверка с другим Base URL требует ввести API-ключ в поле ключа: иначе запрос ушёл бы с сохранённым ключом на новый адрес.',
        'base_url_requires_key'
      );
    }

    if (target !== 'builtin' && !apiKey) {
      throw new HttpError(
        400,
        `API-ключ для ${target === 'openai' ? 'OpenAI' : 'Claude'} не задан.`,
        'ai_not_configured'
      );
    }

    const reply = await callLlm(
      { provider: target, apiKey, baseUrl, model },
      {
        system: 'Ты — автоматическая проверка соединения.',
        user: 'Ответь ровно одним словом: ок',
        maxTokens: 16,
        temperature: 0,
        timeoutMs: 30_000,
      }
    );

    return NextResponse.json({ ok: true as const, provider: target, model, reply: reply.trim() });
  } catch (err) {
    return errorResponse(err);
  }
}
