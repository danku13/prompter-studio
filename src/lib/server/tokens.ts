/**
 * Валидация pairing-токенов (используется mini-сервисом и мобильным клиентом).
 */

import type { PairToken } from '@prisma/client';
import { db } from '@/lib/db';
import { HttpError } from './http';

/** Токен существует и не истёк; иначе 404 */
export async function requireValidToken(token: string): Promise<PairToken> {
  const record = token ? await db.pairToken.findUnique({ where: { token } }) : null;
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(404, 'Код подключения недействителен или истёк', 'invalid_token');
  }
  return record;
}
