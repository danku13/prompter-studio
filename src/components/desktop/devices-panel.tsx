'use client';

/**
 * Панель «Устройства»: онлайн-телефоны с телеметрией (запись/батарея/wpm/секция)
 * и статус WS-соединения с мини-сервисом синхронизации.
 */

import { Smartphone, Wifi, WifiOff } from 'lucide-react';
import type { DeviceStatusMessage, ScriptSection } from '@/lib/types';
import type { SyncStatus } from '@/lib/client/use-sync';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DeviceLiveCard } from './device-card';
import { THIN_SCROLL } from './utils';

/** Подписи статусов WS-соединения редактора с мини-сервисом */
export const WS_STATUS_META: Record<SyncStatus, { label: string; dot: string; text: string }> = {
  idle: { label: 'Синхронизация не активна', dot: 'bg-zinc-400', text: 'text-muted-foreground' },
  connecting: { label: 'Подключение к синхронизации…', dot: 'bg-amber-500', text: 'text-muted-foreground' },
  connected: { label: 'Синхронизация активна', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  reconnecting: { label: 'Переподключение…', dot: 'bg-amber-500', text: 'text-muted-foreground' },
  error: { label: 'Нет связи с сервером синхронизации', dot: 'bg-red-500', text: 'text-red-600' },
};

export interface DevicesPanelProps {
  devices: DeviceStatusMessage[];
  status: SyncStatus;
  sections: ScriptSection[];
  onConnect: () => void;
}

export function DevicesPanel({ devices, status, sections, onConnect }: DevicesPanelProps) {
  const meta = WS_STATUS_META[status];

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3', THIN_SCROLL)}>
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-medium',
          meta.text
        )}
      >
        {status === 'error' ? <WifiOff className="size-3.5 shrink-0" /> : <Wifi className="size-3.5 shrink-0" />}
        <span className="flex-1">{meta.label}</span>
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            meta.dot,
            status === 'connected' && 'animate-pulse'
          )}
        />
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <div className="rounded-full bg-muted p-3">
            <Smartphone className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Телефон не подключён</p>
            <p className="mt-1 max-w-56 text-xs text-muted-foreground">
              Нажмите «Подключить телефон» и отсканируйте QR-код камерой.
            </p>
          </div>
          <Button
            size="sm"
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={onConnect}
          >
            <Smartphone className="size-3.5" />
            Подключить телефон
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {devices.map((d) => (
            <DeviceLiveCard key={d.deviceId} device={d} sections={sections} />
          ))}
        </div>
      )}
    </div>
  );
}
