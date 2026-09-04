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
 * CSS-переменных темы (синий брендовый акцент на zinc-950 — тот же #60a5fa,
 * что и primary тёмной темы веб-версии). Sheet по умолчанию светлый,
 * а суфлёр живёт на чёрном фоне.
 */
export const DARK_SCOPE =
  'dark bg-zinc-950 text-zinc-100 [--background:#09090b] [--foreground:#fafafa] ' +
  '[--primary:#60a5fa] [--primary-foreground:#10192b] [--secondary:#27272a] ' +
  '[--secondary-foreground:#fafafa] [--muted:#27272a] [--muted-foreground:#a1a1aa] ' +
  '[--accent:#27272a] [--accent-foreground:#fafafa] [--border:#3f3f46] ' +
  '[--input:#3f3f46] [--ring:#60a5fa]';
