/**
 * HTTP-хелперы для route handlers: единый формат ошибок { error, code? }.
 */

import { Prisma } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

/** Ошибка с HTTP-статусом и человекочитаемым сообщением на русском */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Читает JSON-тело; при битом JSON — 400 */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Некорректный JSON в теле запроса');
  }
}

const FIELD_LABELS: Record<string, string> = {
  title: 'заголовок',
  sections: 'секции',
  baseRevision: 'базовая ревизия',
  scriptId: 'идентификатор сценария',
  token: 'токен подключения',
  sectionId: 'идентификатор секции',
  sectionTitle: 'заголовок секции',
  t0: 'время начала дубля',
  t1: 'время конца дубля',
  rating: 'оценка дубля',
  color: 'цвет секции',
  content: 'текст секции',
  orderIndex: 'порядковый номер секции',
};

/** ZodError → русское человекочитаемое сообщение */
export function zodMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Некорректные данные запроса';
  const path = issue.path.join('.');
  const label = FIELD_LABELS[path] ?? path ?? 'данные';
  return `Некорректное поле «${label}»`;
}

/** Любое исключение → NextResponse с { error, code? } */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, ...(err.code ? { code: err.code } : {}) },
      { status: err.status }
    );
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: zodMessage(err) }, { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }
  console.error('[api] Необработанная ошибка:', err);
  return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
}
