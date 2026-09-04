import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, readJson } from '@/lib/server/http';
import {
  applyPinChange,
  checkPinAttemptLimit,
  isPinEnabled,
  isValidPinFormat,
  recordFailedPinAttempt,
} from '@/lib/server/security';
import { pinChangeSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/auth/pin → { enabled } (публично: нужно настройке UI; секретов нет) */
export async function GET() {
  try {
    return NextResponse.json({ enabled: await isPinEnabled() });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/auth/pin { currentPin?, newPin } → { enabled, ticket, expiresAt }.
 *  - PIN ещё не задан: newPin (4–8 цифр) устанавливается без currentPin
 *    (первый «захват»: задайте PIN до работы из публичной сети);
 *  - PIN задан: обязателен верный currentPin (rate-limit на неудачи);
 *  - newPin = null/'' → отключение (тоже требует currentPin).
 * После смены ротируется auth-секрет — выданный тикет — единственный действующий.
 */
export async function POST(req: NextRequest) {
  try {
    const body = pinChangeSchema.parse(await readJson(req));
    const newPinRaw = body.newPin;
    const newPin = newPinRaw === null || newPinRaw === '' ? null : newPinRaw;
    if (newPin !== null && !isValidPinFormat(newPin)) {
      return NextResponse.json(
        { error: 'PIN — от 4 до 8 цифр', code: 'pin_bad_format' },
        { status: 400 }
      );
    }
    const enabled = await isPinEnabled();
    if (enabled) checkPinAttemptLimit(req);
    try {
      const result = await applyPinChange(newPin, body.currentPin);
      return NextResponse.json(result);
    } catch (err) {
      // неверный currentPin — учитываем в rate-limit (важно: не глотаем прочие ошибки)
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) {
        recordFailedPinAttempt(req);
      }
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
