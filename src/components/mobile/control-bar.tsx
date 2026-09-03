'use client';

/**
 * Слой (d) суфлёра: панель управления снизу (safe-area bottom).
 * Большие тач-кнопки (≥48px): замок, секции, REC (64px), пауза/плей,
 * «Кусок заново», смена камеры, настройки + быстрые кнопки скорости ±10 wpm.
 */

import { motion } from 'framer-motion';
import { Camera, ChevronDown, ChevronUp, Lock, Minus, Pause, Play, Plus, RotateCcw, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOUCH_BTN =
  'flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300 transition-colors active:bg-white/15 disabled:pointer-events-none disabled:opacity-40';

export interface ControlBarProps {
  playing: boolean;
  recording: boolean;
  /** false — камера недоступна/режим репетиции */
  canRecord: boolean;
  progress: number;
  wpm: number;
  canPrev: boolean;
  canNext: boolean;
  onTogglePlay: () => void;
  onToggleRecord: () => void;
  onPrevSection: () => void;
  onNextSection: () => void;
  onRestartSection: () => void;
  onSwitchCamera: () => void;
  onToggleLock: () => void;
  onOpenSettings: () => void;
  /** ±10 слов/мин */
  onWpmChange: (delta: number) => void;
}

export default function ControlBar({
  playing,
  recording,
  canRecord,
  progress,
  wpm,
  canPrev,
  canNext,
  onTogglePlay,
  onToggleRecord,
  onPrevSection,
  onNextSection,
  onRestartSection,
  onSwitchCamera,
  onToggleLock,
  onOpenSettings,
  onWpmChange,
}: ControlBarProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
      <div className="border-t border-white/10 bg-black/60 px-3 pb-2 pt-1.5 backdrop-blur-md">
        {/* Тонкий прогресс сценария */}
        <div className="mb-1 h-0.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-amber-400/80"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>

        {/* Скорость: быстрые кнопки ±10 */}
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onWpmChange(-10)}
            disabled={wpm <= 60}
            aria-label="Медленнее на 10 слов в минуту"
            className="flex size-9 items-center justify-center rounded-lg text-zinc-400 transition-colors active:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <span className="min-w-24 text-center text-xs tabular-nums text-zinc-300">{wpm} слов/мин</span>
          <button
            type="button"
            onClick={() => onWpmChange(10)}
            disabled={wpm >= 300}
            aria-label="Быстрее на 10 слов в минуту"
            className="flex size-9 items-center justify-center rounded-lg text-zinc-400 transition-colors active:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Основной ряд */}
        <div className="mt-2 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={onToggleLock}
            aria-label="Заблокировать интерфейс"
            title="Заблокировать интерфейс"
            className={TOUCH_BTN}
          >
            <Lock className="size-5" />
          </button>
          <button
            type="button"
            onClick={onPrevSection}
            disabled={!canPrev}
            aria-label="Предыдущая секция"
            title="Предыдущая секция"
            className={TOUCH_BTN}
          >
            <ChevronUp className="size-6" />
          </button>

          {/* REC */}
          <motion.button
            type="button"
            onClick={onToggleRecord}
            disabled={!canRecord && !recording}
            aria-label={recording ? 'Остановить запись' : 'Начать запись'}
            title={recording ? 'Остановить запись' : canRecord ? 'Начать запись' : 'Запись недоступна: камера выключена'}
            className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-red-500/50 bg-black/40 disabled:pointer-events-none disabled:opacity-40"
            animate={
              recording
                ? {
                    boxShadow: [
                      '0 0 0px rgba(239,68,68,0)',
                      '0 0 28px rgba(239,68,68,0.55)',
                      '0 0 0px rgba(239,68,68,0)',
                    ],
                  }
                : { boxShadow: '0 0 0px rgba(239,68,68,0)' }
            }
            transition={recording ? { repeat: Infinity, duration: 2 } : { duration: 0.3 }}
          >
            {recording ? <span className="size-7 rounded-[4px] bg-red-500" /> : <span className="size-8 rounded-full bg-red-500" />}
          </motion.button>

          <button
            type="button"
            onClick={onNextSection}
            disabled={!canNext}
            aria-label="Следующая секция"
            title="Следующая секция"
            className={TOUCH_BTN}
          >
            <ChevronDown className="size-6" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? 'Пауза прокрутки' : 'Продолжить прокрутку'}
            title={playing ? 'Пауза прокрутки' : 'Продолжить прокрутку'}
            className={TOUCH_BTN}
          >
            {playing ? <Pause className="size-6" /> : <Play className="size-6" />}
          </button>
        </div>

        {/* Дополнительный ряд */}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onRestartSection}
            aria-label="Кусок заново"
            title="Кусок заново — вернуться к началу текущей секции"
            className={cn(
              'flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-2 text-amber-400 transition-colors active:bg-amber-500/25'
            )}
          >
            <RotateCcw className="size-5 shrink-0" />
            <span className="truncate text-sm font-medium">Кусок заново</span>
          </button>
          <button
            type="button"
            onClick={onSwitchCamera}
            disabled={recording}
            aria-label="Сменить камеру"
            title={recording ? 'Смена камеры во время записи недоступна' : 'Сменить камеру'}
            className={TOUCH_BTN}
          >
            <Camera className="size-5" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Настройки суфлёра"
            title="Настройки суфлёра"
            className={TOUCH_BTN}
          >
            <Settings2 className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
