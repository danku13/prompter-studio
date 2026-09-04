import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, readJson } from '@/lib/server/http';
import { aiSettingsSchema } from '@/lib/server/validation';
import { aiSettingsView, readAiConfig, updateAiConfig } from '@/lib/server/ai/settings';

export const dynamic = 'force-dynamic';

/** GET /api/ai/settings → AiSettingsView (ключи масками) */
export async function GET() {
  try {
    const row = await readAiConfig();
    return NextResponse.json(aiSettingsView(row));
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/ai/settings AiSettingsUpdate → AiSettingsView */
export async function PUT(req: NextRequest) {
  try {
    const update = aiSettingsSchema.parse(await readJson(req));
    const row = await updateAiConfig(update);
    return NextResponse.json(aiSettingsView(row));
  } catch (err) {
    return errorResponse(err);
  }
}
