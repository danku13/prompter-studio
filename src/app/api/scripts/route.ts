import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, readJson } from '@/lib/server/http';
import { serializeScript, serializeSummary } from '@/lib/server/serialize';
import { createScriptSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/scripts → ScriptSummary[] (по updatedAt desc) */
export async function GET(_req: NextRequest) {
  try {
    const scripts = await db.script.findMany({
      include: { sections: true },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(scripts.map(serializeSummary));
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/scripts { title? } → ScriptData (с одной пустой секцией «Интро») */
export async function POST(req: NextRequest) {
  try {
    const body = createScriptSchema.parse(await readJson(req));
    const title = body.title?.trim();
    const script = await db.script.create({
      data: {
        ...(title ? { title } : {}),
        sections: {
          create: { title: 'Интро', content: '', color: 'default', orderIndex: 0 },
        },
      },
      include: { sections: true },
    });
    return NextResponse.json(serializeScript(script));
  } catch (err) {
    return errorResponse(err);
  }
}
