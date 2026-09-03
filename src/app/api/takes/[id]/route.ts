import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, readJson } from '@/lib/server/http';
import { serializeTake } from '@/lib/server/serialize';
import { takeRatingSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** PATCH /api/takes/:id { rating: 'good'|'ok'|'bad'|null } → TakeRecord */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { rating } = takeRatingSchema.parse(await readJson(req));
    const take = await db.take.update({ where: { id }, data: { rating } });
    return NextResponse.json(serializeTake(take));
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/takes/:id → { ok: true } */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await db.take.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
