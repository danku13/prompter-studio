'use client';

/**
 * Правая панель с табами «Устройства» / «Дубли».
 * Используется в постоянном aside (xl+) и в Sheet (<xl).
 */

import { Film, Smartphone } from 'lucide-react';
import type { DeviceStatusMessage, ScriptSection, TakeRating, TakeRecord } from '@/lib/types';
import type { SyncStatus } from '@/lib/client/use-sync';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DevicesPanel } from './devices-panel';
import { TakesPanel } from './takes-panel';

export interface SyncPanelProps {
  devices: DeviceStatusMessage[];
  syncStatus: SyncStatus;
  sections: ScriptSection[];
  takes: TakeRecord[];
  onRateTake: (take: TakeRecord, rating: TakeRating | null) => void;
  onDeleteTake: (take: TakeRecord) => void;
  onRefreshTakes: () => void;
  onConnect: () => void;
}

export function SyncPanel({
  devices,
  syncStatus,
  sections,
  takes,
  onRateTake,
  onDeleteTake,
  onRefreshTakes,
  onConnect,
}: SyncPanelProps) {
  return (
    <Tabs defaultValue="devices" className="flex h-full min-h-0 flex-1 flex-col gap-0">
      <div className="shrink-0 border-b p-3">
        <TabsList className="grid h-9 w-full grid-cols-2">
          <TabsTrigger value="devices" className="gap-1.5">
            <Smartphone className="size-3.5" />
            Устройства
            {devices.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/15 px-1 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {devices.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="takes" className="gap-1.5">
            <Film className="size-3.5" />
            Дубли
            {takes.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {takes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="devices" className="min-h-0 flex-1 overflow-hidden">
        <DevicesPanel
          devices={devices}
          status={syncStatus}
          sections={sections}
          onConnect={onConnect}
        />
      </TabsContent>
      <TabsContent value="takes" className="min-h-0 flex-1 overflow-hidden">
        <TakesPanel takes={takes} onRate={onRateTake} onDelete={onDeleteTake} onRefresh={onRefreshTakes} />
      </TabsContent>
    </Tabs>
  );
}
