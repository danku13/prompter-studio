import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, readJson } from '@/lib/server/http';
import { requireTicket } from '@/lib/server/security';
import { callLlm } from '@/lib/server/ai/provider';
import { buildSplitPrompt, parseSplitResponse } from '@/lib/server/ai/prompts';
import { readAiConfig, resolveProviderConfig } from '@/lib/server/ai/settings';
import { aiSplitSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** Целевой размер подсекции по умолчанию, слов */
const DEFAULT_MAX_WORDS = 90;

/**
 * POST /api/ai/split {content, maxWords?, title?} → { subsections: [{title, content}] }.
 * Как и improve — stateless текст→текст; применение в сценарий идёт
 * через штатное сохранение редактора (ревизия + синк в суфлёр).
 */
export async function POST(req: NextRequest) {
  try {
    await requireTicket(req);
    const body = aiSplitSchema.parse(await readJson(req));
    const row = await readAiConfig();
    const cfg = resolveProviderConfig(row);

    const prompt = buildSplitPrompt(body.title, body.content, body.maxWords ?? DEFAULT_MAX_WORDS);
    const raw = await callLlm(cfg, prompt);
    const subsections = parseSplitResponse(raw);

    return NextResponse.json({ subsections });
  } catch (err) {
    return errorResponse(err);
  }
}
