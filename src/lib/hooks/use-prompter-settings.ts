'use client';

/**
 * Настройки суфлёра с персистом в localStorage (ключ ps.prompterSettings).
 * Используются и оверлеем (текст/позиция), и прокруткой (wpm).
 */

import { useCallback, useState } from 'react';

export type PrompterPosition = 'top' | 'center' | 'bottom';

export interface PrompterSettings {
  /** слов в минуту, 60–300 */
  wpm: number;
  /** размер шрифта, px, 20–72 */
  fontSize: number;
  /** интерлиньяж, 1.2–2.0 */
  lineHeight: number;
  position: PrompterPosition;
  /** тонкая подстройка полосы, % экрана, −20..+20 */
  offsetPct: number;
  /** непрозрачность подложки, % 0–90 */
  overlayOpacity: number;
  /** зеркалирование текста (rig с полупрозрачным стеклом) */
  mirrorText: boolean;
  /** показывать линии зоны чтения */
  readingZone: boolean;
  /** цветные маркеры секций */
  sectionColors: boolean;
  /** обратный отсчёт 3-2-1 перед записью */
  countdown: boolean;
}

export const DEFAULT_PROMPTER_SETTINGS: PrompterSettings = {
  wpm: 140,
  fontSize: 40,
  lineHeight: 1.4,
  position: 'center',
  offsetPct: 0,
  overlayOpacity: 60,
  mirrorText: false,
  readingZone: true,
  sectionColors: true,
  countdown: true,
};

const STORAGE_KEY = 'ps.prompterSettings';
const POSITIONS: PrompterPosition[] = ['top', 'center', 'bottom'];

/** Мягкая валидация закэшированных настроек (защита от битого JSON) */
function sanitize(raw: unknown): Partial<PrompterSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const s = raw as Record<string, unknown>;
  const out: Partial<PrompterSettings> = {};
  const num = (v: unknown, min: number, max: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

  const wpm = num(s.wpm, 60, 300);
  if (wpm !== undefined) out.wpm = Math.round(wpm);
  const fontSize = num(s.fontSize, 20, 72);
  if (fontSize !== undefined) out.fontSize = Math.round(fontSize);
  const lineHeight = num(s.lineHeight, 1.2, 2);
  if (lineHeight !== undefined) out.lineHeight = Math.round(lineHeight * 100) / 100;
  const offsetPct = num(s.offsetPct, -20, 20);
  if (offsetPct !== undefined) out.offsetPct = Math.round(offsetPct);
  const overlayOpacity = num(s.overlayOpacity, 0, 90);
  if (overlayOpacity !== undefined) out.overlayOpacity = Math.round(overlayOpacity);
  if (typeof s.position === 'string' && POSITIONS.includes(s.position as PrompterPosition)) {
    out.position = s.position as PrompterPosition;
  }
  if (typeof s.mirrorText === 'boolean') out.mirrorText = s.mirrorText;
  if (typeof s.readingZone === 'boolean') out.readingZone = s.readingZone;
  if (typeof s.sectionColors === 'boolean') out.sectionColors = s.sectionColors;
  if (typeof s.countdown === 'boolean') out.countdown = s.countdown;
  return out;
}

/** Начальные настройки: localStorage, если есть (мобайл-экраны рендерятся только на клиенте). */
function readInitialSettings(): PrompterSettings {
  if (typeof window === 'undefined') return DEFAULT_PROMPTER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const patch = sanitize(JSON.parse(raw) as unknown);
      return { ...DEFAULT_PROMPTER_SETTINGS, ...patch };
    }
  } catch {
    /* битый JSON — используем дефолты */
  }
  return DEFAULT_PROMPTER_SETTINGS;
}

export function usePrompterSettings() {
  const [settings, setSettings] = useState<PrompterSettings>(readInitialSettings);

  const update = useCallback(
    (patch: Partial<PrompterSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* приватный режим */
        }
        return next;
      });
    },
    []
  );

  const reset = useCallback(() => {
    setSettings(DEFAULT_PROMPTER_SETTINGS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  return { settings, update, reset };
}
