import { NextResponse, type NextRequest } from 'next/server';
import { APP_NAME, APP_VERSION, getWebPort, getWsMode, getWsPort } from '@/lib/server/config';
import { errorResponse } from '@/lib/server/http';
import { getLanIp } from '@/lib/server/lan';
import { isPinEnabled } from '@/lib/server/security';

export const dynamic = 'force-dynamic';

/** GET /api/server-info → ServerInfo (+ pinRequired — клиент решает, показать ли ввод PIN) */
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({
      appName: APP_NAME,
      version: APP_VERSION,
      lanIp: getLanIp(),
      webPort: getWebPort(),
      wsPort: getWsPort(),
      wsMode: getWsMode(req.headers.get('host') ?? undefined),
      pinRequired: await isPinEnabled(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
