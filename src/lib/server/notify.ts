/**
 * Оповещение WS-мини-сервиса о сохранении сценария.
 * Fire-and-forget: сервис может быть не поднят — глушим ошибку warning'ом.
 */

import type { ScriptData } from '@/lib/types';

const NOTIFY_TIMEOUT_MS = 2000;

/**
 * POST /internal/broadcast на мини-сервис: { scriptId, revision, script }.
 * script — полные данные ScriptData (включая секции).
 */
export async function notifyScriptSaved(script: ScriptData): Promise<void> {
  const base = process.env.MINI_SERVICE_URL ?? 'http://127.0.0.1:3030';
  const url = `${base.replace(/\/$/, '')}/internal/broadcast`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scriptId: script.id,
        revision: script.revision,
        script,
      }),
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
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
