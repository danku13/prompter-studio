/**
 * Цвета секций сценария (SECTION_COLORS из контракта) → реальные tailwind-классы.
 */

import { SECTION_COLORS, type SectionColor } from '@/lib/types';

export { SECTION_COLORS };

/** Цвет точки-переключателя в шапке карточки секции */
export const SECTION_COLOR_DOT: Record<SectionColor, string> = {
  default: 'bg-zinc-400 dark:bg-zinc-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
};

/** Цвет левой полосы карточки секции */
export const SECTION_COLOR_EDGE: Record<SectionColor, string> = {
  default: 'border-l-zinc-300 dark:border-l-zinc-600',
  amber: 'border-l-amber-500',
  rose: 'border-l-rose-500',
  emerald: 'border-l-emerald-500',
  violet: 'border-l-violet-500',
};

export const SECTION_COLOR_LABEL: Record<SectionColor, string> = {
  default: 'Обычная',
  amber: 'Жёлтая',
  rose: 'Красная',
  emerald: 'Зелёная',
  violet: 'Фиолетовая',
};
