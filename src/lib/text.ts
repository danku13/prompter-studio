/**
 * Текстовые утилиты: подсчёт слов, оценка хронометража, форматирование.
 * Используются и редактором, и мобильным суфлёром.
 */

/** Количество слов: последовательности букв/цифр */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Оценка длительности чтения вслух, секунд */
export function estimateSeconds(words: number, wpm: number): number {
  if (words <= 0 || wpm <= 0) return 0;
  return (words / wpm) * 60;
}

/** "1:23" / "12:05" / "1:02:03" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "1:23.4" — таймкод дубля от старта записи (мс) */
export function formatTimecode(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const d = Math.floor((totalSec % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}

/** Человекочитаемая разница от времени: «только что», «5 мин назад», «вчера 14:03» */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffMs = now.getTime() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `вчера ${new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  return new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
