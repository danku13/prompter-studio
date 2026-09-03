import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/server/http';
import { requireValidToken } from '@/lib/server/tokens';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pair/validate?token= → { ok: true, scriptId, expiresAt } | 404.
 * Вызывает WS-мини-сервис при подключении устройства (hello с токеном).
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') ?? '';
    const record = await requireValidToken(token);
    return NextResponse.json({
      ok: true,
      scriptId: record.scriptId,
      expiresAt: record.expiresAt.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
