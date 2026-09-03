import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getWsMode, getWsPort } from '@/lib/server/config';
import { HttpError, errorResponse } from '@/lib/server/http';
import { serializeScript } from '@/lib/server/serialize';
import { requireValidToken } from '@/lib/server/tokens';

export const dynamic = 'force-dynamic';

const MAX_DEVICE_NAME = 200;

/**
 * GET /api/mobile/script?token=&deviceName= → { script: ScriptData, wsMode, wsPort }.
 * Первая загрузка сценария на телефон: отмечаем usedAt и имя устройства.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') ?? '';
    const deviceName = req.nextUrl.searchParams.get('deviceName')?.trim();

    const record = await requireValidToken(token);
    const script = await db.script.findUnique({
      where: { id: record.scriptId },
      include: { sections: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!script) throw new HttpError(404, 'Сценарий не найден');

    await db.pairToken.update({
      where: { token },
      data: {
        usedAt: new Date(),
        ...(deviceName ? { deviceName: deviceName.slice(0, MAX_DEVICE_NAME) } : {}),
      },
    });

    return NextResponse.json({
      script: serializeScript(script),
      wsMode: getWsMode(req.headers.get('host') ?? undefined),
      wsPort: getWsPort(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
