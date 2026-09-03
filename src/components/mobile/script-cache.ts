/**
 * Офлайн-кэш сценариев на устройстве: ключи localStorage `ps.cache.script.<id>`,
 * значение — { script, savedAt }. Пишется при подключении, открытии сценария
 * и при каждом WS-пуше текста. Читается экраном сценариев, когда сервер недоступен.
 */

import type { ScriptData } from '@/lib/types';

const PREFIX = 'ps.cache.script.';

export interface CachedScriptEntry {
  script: ScriptData;
  savedAt: string;
}

function isScriptData(value: unknown): value is ScriptData {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === 'string' && typeof s.title === 'string' && Array.isArray(s.sections);
}

export function cacheScript(script: ScriptData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFIX + script.id, JSON.stringify({ script, savedAt: new Date().toISOString() }));
  } catch {
    /* приватный режим и т.п. */
  }
}

export function readCachedScript(id: string): CachedScriptEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const entry = parsed as Record<string, unknown>;
    const script = entry.script;
    if (!isScriptData(script)) return null;
    return {
      script,
      savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function listCachedScripts(): CachedScriptEntry[] {
  if (typeof window === 'undefined') return [];
  const result: CachedScriptEntry[] = [];
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const entry = readCachedScript(key.slice(PREFIX.length));
      if (entry) result.push(entry);
    }
  } catch {
    /* доступ к localStorage запрещён */
  }
  return result.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}
