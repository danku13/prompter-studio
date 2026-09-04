/**
 * Онбординг-курс: состояние прохождения в localStorage (ключ `ps.onboarding`).
 *
 * Спека: docs/plan/01-onboarding.md §5. До появления аккаунтов хранение
 * per-браузер; приватный режим или недоступный localStorage — тихая
 * деградация (курс просто стартует заново на каждом визите, без ошибок).
 *
 * Значение:
 *   { version, startedAt, completedAt?, skippedAt?, lastStep }
 *   completedAt / skippedAt — ISO-даты последнего завершения / пропуска
 *   (последнее событие выигрывает: обратный флаг очищается);
 *   lastStep — последний открытый шаг, 1..ONBOARDING_STEPS (1-based).
 */

const STORAGE_KEY = 'ps.onboarding';

/** Версия формата (существенная переработка контента — поднять). */
export const ONBOARDING_VERSION = 1;

/** Число шагов курса. */
export const ONBOARDING_STEPS = 7;

export interface OnboardingState {
  version: number;
  startedAt: string;
  /** ISO-дата завершения курса. */
  completedAt?: string;
  /** ISO-дата пропуска курса. */
  skippedAt?: string;
  /** Последний открытый шаг (1..ONBOARDING_STEPS). */
  lastStep: number;
}

/** Патч для saveOnboarding: null = явно стереть поле. */
export type OnboardingPatch = Partial<Omit<OnboardingState, 'version' | 'startedAt'>> & {
  completedAt?: string | null;
  skippedAt?: string | null;
};

/** SSR/приватный режим: доступный Storage или null. */
function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    // доступ к localStorage запрещён (политики безопасности и т.п.)
    return null;
  }
}

function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.min(Math.max(Math.round(step), 1), ONBOARDING_STEPS);
}

/** Приводит произвольный JSON к валидному состоянию (битые поля — дефолты). */
function normalize(raw: unknown): OnboardingState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const isIso = (v: unknown): v is string => typeof v === 'string' && v !== '';
  return {
    version: ONBOARDING_VERSION,
    startedAt: isIso(r.startedAt) ? r.startedAt : new Date().toISOString(),
    completedAt: isIso(r.completedAt) ? r.completedAt : undefined,
    skippedAt: isIso(r.skippedAt) ? r.skippedAt : undefined,
    lastStep: clampStep(typeof r.lastStep === 'number' ? r.lastStep : 1),
  };
}

/** Прочитать состояние (null = записи нет или она нечитаема). */
export function loadOnboarding(): OnboardingState | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return normalize(JSON.parse(raw));
  } catch {
    // битый JSON — считаем, что записи нет
    return null;
  }
}

/**
 * Сохранить состояние с патчем (merge поверх текущего). Если записи ещё нет —
 * создаёт её с startedAt=now. Возвращает итоговое состояние.
 */
export function saveOnboarding(patch: OnboardingPatch = {}): OnboardingState {
  const base: OnboardingState =
    loadOnboarding() ?? {
      version: ONBOARDING_VERSION,
      startedAt: new Date().toISOString(),
      lastStep: 1,
    };
  const merged: OnboardingState = {
    version: ONBOARDING_VERSION,
    startedAt: base.startedAt,
    completedAt: patch.completedAt === undefined ? base.completedAt : patch.completedAt ?? undefined,
    skippedAt: patch.skippedAt === undefined ? base.skippedAt : patch.skippedAt ?? undefined,
    lastStep: clampStep(patch.lastStep === undefined ? base.lastStep : patch.lastStep),
  };
  const ls = storage();
  if (ls) {
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* квота/приватный режим: живём без персиста */
    }
  }
  return merged;
}

/** Отметить шаг увиденным (step — 0-based индекс). Прогресс не откатываем. */
export function markStepSeen(step: number): void {
  const n = clampStep(step + 1);
  const cur = loadOnboarding();
  if (cur && cur.lastStep >= n) return;
  saveOnboarding({ lastStep: n });
}

/** Завершить курс: completedAt=now, старый skippedAt очищается. */
export function completeOnboarding(): void {
  saveOnboarding({ completedAt: new Date().toISOString(), skippedAt: null });
}

/** Пропустить курс: skippedAt=now, старый completedAt очищается. */
export function skipOnboarding(): void {
  saveOnboarding({ skippedAt: new Date().toISOString(), completedAt: null });
}

/** Полностью удалить запись («пройти заново с чистого листа»). */
export function resetOnboarding(): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    /* тихо */
  }
}

/** Курс завершён или пропущен (автозапуск больше не нужен). */
export function isOnboardingFinished(): boolean {
  const s = loadOnboarding();
  return s !== null && (s.completedAt !== undefined || s.skippedAt !== undefined);
}
