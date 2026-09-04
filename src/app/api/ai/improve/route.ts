import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, readJson } from '@/lib/server/http';
import { callLlm } from '@/lib/server/ai/provider';
import { buildImprovePrompt } from '@/lib/server/ai/prompts';
import { readAiConfig, resolveProviderConfig } from '@/lib/server/ai/settings';
import { aiImproveSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/improve {content, mode, instruction?, title?} → { content }.
 * Stateless: работаем с текстом из тела (в редакторе он может быть ещё
 * не сохранён), результат редактор применяет через обычный PUT сценария —
 * ревизия и broadcast в суфлёр идут штатным путём.
 */
export async function POST(req: NextRequest) {
  try {
    const body = aiImproveSchema.parse(await readJson(req));
    const row = await readAiConfig();
    const cfg = resolveProviderConfig(row);

    const prompt = buildImprovePrompt(body.title, body.content, body.mode, body.instruction);
    const improved = (await callLlm(cfg, prompt)).trim();

    if (improved.length === 0) {
      return NextResponse.json({ error: 'AI вернул пустой результат' }, { status: 502 });
    }
    return NextResponse.json({ content: improved });
  } catch (err) {
    return errorResponse(err);
  }
}
