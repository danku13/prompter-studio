'use client';

/**
 * Слой (c) суфлёра: статус-бар сверху (с учётом safe-area).
 * Назад (с подтверждением), название сценария, «Секц. i/N», заряд батареи,
 * точка WS-статуса, индикатор REC (пульс + таймер), настройки.
 */

import { motion } from 'framer-motion';
import { Battery, BatteryFull, BatteryLow, BatteryMedium, ChevronLeft, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/text';
import type { SyncStatus } from '@/lib/client/use-sync';

const WS_DOT: Record<SyncStatus, { className: string; label: string }> = {
  connected: { className: 'bg-emerald-500', label: 'Связь с сервером есть' },
  connecting: { className: 'bg-amber-400', label: 'Подключение к серверу…' },
  reconnecting: { className: 'bg-amber-400', label: 'Переподключение…' },
  error: { className: 'bg-red-500', label: 'Нет связи с сервером' },
  idle: { className: 'bg-zinc-600', label: 'Синхронизация выключена' },
};

function BatteryIcon({ level }: { level: number }) {
  if (level <= 20) return <BatteryLow className="size-4 text-red-400" />;
  if (level <= 45) return <Battery className="size-4 text-zinc-400" />;
  if (level <= 80) return <BatteryMedium className="size-4 text-zinc-400" />;
  return <BatteryFull className="size-4 text-zinc-400" />;
}

export interface StatusBarProps {
  title: string;
  sectionIndex: number;
  sectionCount: number;
  recording: boolean;
  elapsedMs: number;
  wsStatus: SyncStatus;
  battery: number | null;
  rehearsalMode: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
}

export default function StatusBar({
  title,
  sectionIndex,
  sectionCount,
  recording,
  elapsedMs,
  wsStatus,
  battery,
  rehearsalMode,
  onBack,
  onOpenSettings,
}: StatusBarProps) {
  const ws = WS_DOT[wsStatus];
  const pulse = wsStatus === 'connecting' || wsStatus === 'reconnecting';

  return (
    <div className="absolute inset-x-0 top-0 z-20" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/45 px-1.5 py-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          aria-label="Выйти из суфлёра"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-300 transition-colors active:bg-white/10"
        >
          <ChevronLeft className="size-6" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">{title}</p>
          <p className="text-[11px] text-zinc-500">
            Секц. {Math.min(sectionIndex + 1, Math.max(sectionCount, 1))}/{sectionCount}
          </p>
        </div>

        {rehearsalMode && (
          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
            репетиция
          </span>
        )}

        {recording && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5">
            <motion.span
              className="size-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
            />
            <span className="text-xs font-medium tabular-nums text-red-300">{formatDuration(elapsedMs / 1000)}</span>
          </span>
        )}

        {battery !== null && (
          <span className="flex shrink-0 items-center gap-1">
            <BatteryIcon level={battery} />
            <span className="text-xs tabular-nums text-zinc-400">{battery}%</span>
          </span>
        )}

        <span
          title={ws.label}
          className={cn('size-2 shrink-0 rounded-full', ws.className, pulse && 'animate-pulse')}
        />

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Настройки суфлёра"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-300 transition-colors active:bg-white/10"
        >
          <Settings2 className="size-5" />
        </button>
      </div>
    </div>
  );
}
