import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getPairTtlMinutes, getWebPort, getWsPort } from '@/lib/server/config';
import { HttpError, errorResponse, readJson } from '@/lib/server/http';
import { getLanIp } from '@/lib/server/lan';
import { pairCreateSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pair { scriptId } → PairSessionInfo (+ warning, если LAN IP не найден).
 * Токен живёт PAIR_TTL_MIN минут (по умолчанию 15).
 */
export async function POST(req: NextRequest) {
  try {
    const { scriptId } = pairCreateSchema.parse(await readJson(req));
    const script = await db.script.findUnique({ where: { id: scriptId } });
    if (!script) throw new HttpError(404, 'Сценарий не найден');

    const token = crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + getPairTtlMinutes() * 60_000);
    await db.pairToken.create({ data: { token, scriptId, expiresAt } });

    const lanIp = getLanIp();
    const webPort = getWebPort();
    const wsPort = getWsPort();
    const host = lanIp ?? 'localhost';

    const info: {
      token: string;
      scriptId: string;
      deepLink: string;
      webUrl: string;
      expiresAt: string;
      warning?: string;
    } = {
      token,
      scriptId,
      deepLink: `prompter://connect?host=${host}&webPort=${webPort}&wsPort=${wsPort}&token=${token}`,
      webUrl: `http://${host}:${webPort}/?pair=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
    if (!lanIp) info.warning = 'LAN IP не найден';

    return NextResponse.json(info);
  } catch (err) {
    return errorResponse(err);
  }
}
