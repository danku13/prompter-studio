import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { HttpError, errorResponse, readJson } from '@/lib/server/http';
import { requireTicket } from '@/lib/server/security';
import { serializeTake } from '@/lib/server/serialize';
import { requireValidToken } from '@/lib/server/tokens';
import { takeCreateSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/takes?scriptId= → TakeRecord[] (новые сверху) */
export async function GET(req: NextRequest) {
  try {
    await requireTicket(req);
    const scriptId = req.nextUrl.searchParams.get('scriptId');
    if (!scriptId) throw new HttpError(400, 'Не указан параметр scriptId');
    const takes = await db.take.findMany({
      where: { scriptId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(takes.map(serializeTake));
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/takes { token, sectionId, sectionTitle, t0, t1 } → { take: TakeRecord }.
 * Вызывает WS-мини-сервис (метка дубля с телефона). Токен определяет сценарий.
 */
export async function POST(req: NextRequest) {
  try {
    const body = takeCreateSchema.parse(await readJson(req));
    const record = await requireValidToken(body.token);
    const take = await db.take.create({
      data: {
        scriptId: record.scriptId,
        sectionId: body.sectionId,
        sectionTitle: body.sectionTitle,
        t0: body.t0,
        t1: body.t1,
        durationMs: body.t1 - body.t0,
        rating: null,
      },
    });
    return NextResponse.json({ take: serializeTake(take) });
  } catch (err) {
    return errorResponse(err);
  }
}
