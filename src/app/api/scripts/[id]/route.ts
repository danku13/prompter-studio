import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { HttpError, errorResponse, readJson } from '@/lib/server/http';
import { notifyScriptSaved } from '@/lib/server/notify';
import { requireTicket } from '@/lib/server/security';
import { serializeScript } from '@/lib/server/serialize';
import { saveScriptSchema } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/scripts/:id → ScriptData (секции по orderIndex asc) */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await requireTicket(req);
    const { id } = await params;
    const script = await db.script.findUnique({
      where: { id },
      include: { sections: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!script) throw new HttpError(404, 'Сценарий не найден');
    return NextResponse.json(serializeScript(script));
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * PUT /api/scripts/:id SaveScriptPayload → { script: ScriptData } (новая ревизия).
 * При baseRevision !== revision → 409 { error, code: 'revision_conflict' }.
 * Секции пересоздаются (новые cuid) в транзакции; revision инкрементируется.
 * После коммита оповещаем WS-мини-сервис (broadcast редакторам/устройствам).
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    await requireTicket(req);
    const { id } = await params;
    const body = saveScriptSchema.parse(await readJson(req));

    const current = await db.script.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, 'Сценарий не найден');
    if (body.baseRevision !== current.revision) {
      throw new HttpError(409, 'Сценарий был изменён на другом устройстве', 'revision_conflict');
    }

    const updated = await db.$transaction(async (tx) => {
      await tx.section.deleteMany({ where: { scriptId: id } });
      if (body.sections.length > 0) {
        await tx.section.createMany({
          data: body.sections.map((section, index) => ({
            scriptId: id,
            title: section.title,
            content: section.content,
            color: section.color,
            orderIndex: section.orderIndex ?? index,
          })),
        });
      }
      return tx.script.update({
        where: { id },
        data: { title: body.title, revision: { increment: 1 } },
        include: { sections: { orderBy: { orderIndex: 'asc' } } },
      });
    });

    const script = serializeScript(updated);
    await notifyScriptSaved(script);
    return NextResponse.json({ script });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/scripts/:id → { ok: true } (каскад: секции, дубли, токены) */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    await requireTicket(req);
    const { id } = await params;
    const existing = await db.script.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Сценарий не найден');
    await db.script.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
