import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, readJson } from '@/lib/server/http';
import {
  checkPinAttemptLimit,
  clearPinAttempts,
  isPinEnabled,
  issueEditorTicket,
  recordFailedPinAttempt,
  verifyPin,
} from '@/lib/server/security';
import { pinVerifySchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/pin/verify { pin } → { ok, ticket, expiresAt }.
 * Вход редактора: scrypt-проверка (дорогая — только здесь) + выдача HMAC-тикета.
 * Rate-limit: 10 неудач / 5 мин на IP.
 * PIN не задан → { ok: true, ticket: null } — приложение работает без блокировки.
 */
export async function POST(req: NextRequest) {
  try {
    const { pin } = pinVerifySchema.parse(await readJson(req));
    if (!(await isPinEnabled())) {
      return NextResponse.json({ ok: true, ticket: null, expiresAt: null, enabled: false });
    }
    checkPinAttemptLimit(req);
    if (!(await verifyPin(pin))) {
      recordFailedPinAttempt(req);
      return NextResponse.json(
        { error: 'Неверный PIN-код', code: 'pin_invalid' },
        { status: 401 }
      );
    }
    clearPinAttempts(req);
    const { ticket, expiresAt } = issueEditorTicket();
    return NextResponse.json({ ok: true, ticket, expiresAt, enabled: true });
  } catch (err) {
    return errorResponse(err);
  }
}
