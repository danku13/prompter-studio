/**
 * Оповещение WS-мини-сервиса о сохранении сценария.
 * Fire-and-forget: сервис может быть не поднят — глушим ошибку warning'ом.
 *
 * Безопасность (аудит 2026-09): /internal/broadcast защищён секретом
 * X-Broadcast-Secret — без него любой хост LAN мог бы инжектить произвольный
 * текст в суфлёр. Секрет берётся из env BROADCAST_SECRET либо из файла
 * mini-services/prompter-sync/runtime-secret (его создаёт мини-сервис при
 * старте). Если секрет недоступен (сервис ещё не запускался) — пропускаем
 * broadcast с warning'ом, как при недоступном сервисе.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScriptData } from '@/lib/types';

const NOTIFY_TIMEOUT_MS = 2000;

/** Кэш прочитанного секрета; сбрасывается при 403 (секрет перегенерирован) */
let cachedSecret: string | null = null;

async function readBroadcastSecret(): Promise<string | null> {
  const fromEnv = process.env.BROADCAST_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (cachedSecret) return cachedSecret;
  try {
    const file = path.join(process.cwd(), 'mini-services', 'prompter-sync', 'runtime-secret');
    const value = (await readFile(file, 'utf8')).trim();
    if (value.length >= 16) {
      cachedSecret = value;
      return value;
    }
  } catch {
    /* файла нет — мини-сервис ещё не поднимался */
  }
  return null;
}

/**
 * POST /internal/broadcast на мини-сервис: { scriptId, revision, script }.
 * script — полные данные ScriptData (включая секции).
 */
export async function notifyScriptSaved(script: ScriptData): Promise<void> {
  const base = process.env.MINI_SERVICE_URL ?? 'http://127.0.0.1:3030';
  const url = `${base.replace(/\/$/, '')}/internal/broadcast`;
  const secret = await readBroadcastSecret();
  if (!secret) {
    console.warn('[notify] broadcast-секрет недоступен — синхронизация суфлёра пропущена');
    return;
  }
  try {
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Broadcast-Secret': secret },
      body: JSON.stringify({
        scriptId: script.id,
        revision: script.revision,
        script,
      }),
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    if (res.status === 403) {
      // мини-сервис перегенерировал секрет — перечитаем файл и повторим один раз
      cachedSecret = null;
      const fresh = await readBroadcastSecret();
      if (fresh && fresh !== secret) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Broadcast-Secret': fresh },
          body: JSON.stringify({
            scriptId: script.id,
            revision: script.revision,
            script,
          }),
          signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
        });
      }
    }
    if (!res.ok) {
      console.warn(`[notify] Мини-сервис ответил ${res.status} на ${url}`);
    }
  } catch (err) {
    console.warn(
      `[notify] WS-мини-сервис недоступен (${url}):`,
      err instanceof Error ? err.message : err
    );
  }
}
