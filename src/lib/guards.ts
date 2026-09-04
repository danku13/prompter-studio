/**
 * Рантайм-гарды для данных, приходящих по WebSocket (push сценария).
 *
 * Мотивация (аудит безопасности 2026-09): payload WS-пуша приходит из сети
 * и до этого применялся «как есть». Валидация формы защищает клиентов от
 * мусорных/враждебных broadcast'ов (краш рендера, отравление автосохранения).
 *
 * Гард намеренно мягкий к «неизвестным» полям (forward-compat), но строгий
 * к типам и разумным лимитам размеров. Используется и десктопом, и мобильным
 * клиентом (файл без next/*-зависимостей — собирается в APK через Vite).
 */

import type { ScriptPushMessage } from './types';

const MAX_ID = 64;
const MAX_TITLE = 10_000;
const MAX_CONTENT = 2_000_000; // ≥ лимита импорта файла 5 МБ (UTF-8)
const MAX_SECTIONS = 5_000;

function isStr(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isLooseStr(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

export function isValidScriptData(v: unknown): v is import('./types').ScriptData {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (!isStr(s.id, MAX_ID)) return false;
  if (!isLooseStr(s.title, MAX_TITLE)) return false;
  if (typeof s.revision !== 'number' || !Number.isFinite(s.revision)) return false;
  if (!Array.isArray(s.sections) || s.sections.length > MAX_SECTIONS) return false;
  for (const sec of s.sections) {
    if (!sec || typeof sec !== 'object') return false;
    const q = sec as Record<string, unknown>;
    if (!isStr(q.id, MAX_ID)) return false;
    if (!isLooseStr(q.title, MAX_TITLE)) return false;
    if (!isLooseStr(q.content, MAX_CONTENT)) return false;
    if (!isLooseStr(q.color, 32)) return false;
    if (typeof q.orderIndex !== 'number' || !Number.isFinite(q.orderIndex)) return false;
  }
  return true;
}

/** Полный Guard для ScriptPushMessage: конверт + сам сценарий */
export function isValidScriptPush(v: unknown): v is ScriptPushMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (!isStr(m.scriptId, MAX_ID)) return false;
  if (typeof m.revision !== 'number' || !Number.isFinite(m.revision)) return false;
  return isValidScriptData(m.script);
}
