/**
 * Общие утилиты десктоп-редактора.
 */

import type { ScriptData, ScriptSection, SectionDraft } from '@/lib/types';

/** Временный id для новых секций (заменяется серверным при сохранении) */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tmp-${crypto.randomUUID()}`;
  }
  // фолбэк для небезопасного контекста (http без localhost)
  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Неизвестная ошибка';
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Русская плюрализация: plural(3, 'секция', 'секции', 'секций') → «секции» */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Тонкий аккуратный скроллбар для списков с прокруткой */
export const THIN_SCROLL =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700';

/** Секции для PUT /api/scripts/:id — orderIndex по позиции, временные id без id */
export function toDrafts(sections: ScriptSection[]): SectionDraft[] {
  return sections.map((s, i) => ({
    id: s.id.startsWith('tmp-') ? undefined : s.id,
    title: s.title,
    content: s.content,
    color: s.color,
    orderIndex: i,
  }));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Экспорт сценария: заголовок секции + текст, пустая строка между секциями */
export function buildExportText(script: ScriptData, format: 'txt' | 'md'): string {
  const parts: string[] = [];
  const scriptTitle = script.title.trim() || 'Без названия';
  parts.push(format === 'md' ? `# ${scriptTitle}` : scriptTitle, '');
  script.sections.forEach((s, i) => {
    const title = s.title.trim() || `Секция ${i + 1}`;
    parts.push(format === 'md' ? `## ${title}` : title, '');
    if (s.content.trim()) parts.push(s.content.trimEnd(), '');
  });
  return `${parts.join('\n').trimEnd()}\n`;
}

export function sanitizeFilename(name: string): string {
  return (name.trim() || 'сценарий').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
}
