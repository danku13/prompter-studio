'use client';

/**
 * Карточка живого статуса телефона: online-точка, бейдж «ЗАПИСЬ»,
 * батарея, wpm, текущая секция. Плюс зелёная плашка «Подключено»
 * для диалога сопряжения.
 */

import { BatteryFull, BatteryLow, BatteryMedium, CheckCircle2, Gauge, Layers } from 'lucide-react';
import type { DeviceStatusMessage, ScriptSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

function pickBatteryIcon(level: number) {
  if (level >= 50) return <BatteryFull className="size-3.5" />;
  if (level >= 20) return <BatteryMedium className="size-3.5" />;
  return <BatteryLow className="size-3.5" />;
}

function BatteryIcon({ level }: { level: number | null }) {
  if (level === null) return null;
  return pickBatteryIcon(level);
}

export interface DeviceLiveCardProps {
  device: DeviceStatusMessage;
  sections: ScriptSection[];
  className?: string;
}

export function DeviceLiveCard({ device, sections, className }: DeviceLiveCardProps) {
  const sectionTitle = device.sectionId
    ? sections.find((s) => s.id === device.sectionId)?.title
    : undefined;

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        device.recording
          ? 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20'
          : 'bg-card',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="truncate text-sm font-medium">{device.deviceName}</span>
        {device.recording && (
          <Badge className="animate-pulse bg-red-600 text-white">ЗАПИСЬ</Badge>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {device.battery !== null && (
          <span
            className={cn('inline-flex items-center gap-1 tabular-nums', device.battery < 20 && 'text-red-600')}
          >
            <BatteryIcon level={device.battery} />
            {device.battery}%
          </span>
        )}
        {device.wpm !== null && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Gauge className="size-3.5" />
            {device.wpm} слов/мин
          </span>
        )}
        {device.sectionId !== null && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Layers className="size-3.5 shrink-0" />
            <span className="truncate">{sectionTitle || 'Секция не найдена'}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Зелёная плашка «Подключено: имя» + live-статус (для диалога сопряжения) */
export function ConnectedPlate({
  device,
  sections,
}: {
  device: DeviceStatusMessage;
  sections: ScriptSection[];
}) {
  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-4 shrink-0" />
        <span className="truncate">Подключено: {device.deviceName}</span>
        {device.recording && <Badge className="animate-pulse bg-red-600 text-white">ЗАПИСЬ</Badge>}
      </div>
      <DeviceLiveCard device={device} sections={sections} className="mt-2" />
    </div>
  );
}
