/**
 * Общие типы и константы мобильного суфлёра.
 */

/** Дубль внутри сессии записи (локальная копия; на сервер уходит через WS) */
export interface SessionTake {
  id: string;
  sectionId: string;
  sectionTitle: string;
  /** мс от старта записи */
  t0: number;
  /** мс от старта записи */
  t1: number;
}

/**
 * «Тёмный» скоуп для shadcn/ui внутри шитов: класс dark + переопределение
 * CSS-переменных темы (amber-акцент на zinc-950). Sheet по умолчанию светлый,
 * а суфлёр живёт на чёрном фоне.
 */
export const DARK_SCOPE =
  'dark bg-zinc-950 text-zinc-100 [--background:#09090b] [--foreground:#fafafa] ' +
  '[--primary:#f59e0b] [--primary-foreground:#451a03] [--secondary:#27272a] ' +
  '[--secondary-foreground:#fafafa] [--muted:#27272a] [--muted-foreground:#a1a1aa] ' +
  '[--accent:#27272a] [--accent-foreground:#fafafa] [--border:#3f3f46] ' +
  '[--input:#3f3f46] [--ring:#f59e0b]';
