'use client';

/**
 * Экран 2. Сценарии.
 *
 * Онлайн: api.listScripts() — карточки с метаданными. Тап → api.getScript(id)
 * → кэш ps.cache.script.<id> → экран суфлёра.
 * Офлайн: баннер + карточки из кэшей; тап открывает офлайн-копию.
 * Header: имя устройства, адрес сервера, точка WS-статуса, «Отключиться».
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileVideo, Loader2, LogOut, RefreshCw, WifiOff } from 'lucide-react';
import { ApiClient, ApiError } from '@/lib/client/api';
import { getDeviceIdentity, type ConnectionConfig } from '@/lib/client/connection';
import { useDeviceSync, type SyncStatus } from '@/lib/client/use-sync';
import type { ScriptData, ScriptSummary } from '@/lib/types';
import { formatDuration, formatRelative } from '@/lib/text';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { cacheScript, listCachedScripts, readCachedScript } from './script-cache';
import type { CachedScriptEntry } from './script-cache';

const WS_BADGE: Record<SyncStatus, { dot: string; text: string }> = {
  connected: { dot: 'bg-emerald-500', text: 'связь есть' },
  connecting: { dot: 'bg-amber-400', text: 'подключение' },
  reconnecting: { dot: 'bg-amber-400', text: 'переподключение' },
  error: { dot: 'bg-red-500', text: 'нет связи' },
  idle: { dot: 'bg-zinc-600', text: 'офлайн' },
};

export interface ScriptPickerProps {
  cfg: ConnectionConfig;
  api: ApiClient;
  initialScript: ScriptData;
  onOpenScript: (script: ScriptData) => void;
  onDisconnect: () => void;
}

export default function ScriptPicker({ cfg, api, initialScript, onOpenScript, onDisconnect }: ScriptPickerProps) {
  const { toast } = useToast();
  const [scripts, setScripts] = useState<ScriptSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const deviceName = useMemo(() => getDeviceIdentity().name, []);
  const sync = useDeviceSync(api, cfg, {});
  const ws = WS_BADGE[sync.status];
  const cached = useMemo<CachedScriptEntry[]>(() => (offline ? listCachedScripts() : []), [offline]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listScripts();
      setScripts(list);
      setOffline(false);
    } catch {
      setScripts(null);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // подключение уже отдаёт сценарий — держим кэш свежим
  useEffect(() => {
    cacheScript(initialScript);
  }, [initialScript]);

  const openScript = useCallback(
    async (id: string) => {
      setOpeningId(id);
      try {
        const script = await api.getScript(id);
        cacheScript(script);
        onOpenScript(script);
      } catch (err) {
        const copy = readCachedScript(id);
        if (copy) {
          toast({
            title: 'Открыта офлайн-копия',
            description: 'Нет связи с сервером — показан последний сохранённый текст.',
          });
          onOpenScript(copy.script);
        } else {
          toast({
            title: 'Не удалось открыть сценарий',
            description: err instanceof ApiError ? err.message : 'Проверьте связь с сервером.',
          });
        }
      } finally {
        setOpeningId(null);
      }
    },
    [api, onOpenScript, toast]
  );

  const openCached = useCallback(
    (entry: CachedScriptEntry) => {
      onOpenScript(entry.script);
    },
    [onOpenScript]
  );

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <header
        className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/90 backdrop-blur"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0px)' }}
      >
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{deviceName}</p>
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className={cn('size-2 shrink-0 rounded-full', ws.dot)} />
              <span className="truncate">
                {cfg.serverHost}:{cfg.webPort} · {ws.text}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Обновить список"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors active:bg-white/5"
          >
            <RefreshCw className={cn('size-5', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-zinc-300 transition-colors active:bg-white/5"
          >
            <LogOut className="size-4" />
            Отключиться
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 p-4 pb-10">
        {offline && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
            <WifiOff className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-300">Нет связи с сервером</p>
              <p className="mt-0.5 text-xs text-amber-400/80">
                Доступны офлайн-копии сценариев — они откроются без синхронизации.
              </p>
            </div>
          </div>
        )}

        {loading && !offline && scripts === null && (
          <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
            <Loader2 className="size-5 animate-spin" />
            Загрузка сценариев…
          </div>
        )}

        {scripts !== null &&
          scripts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void openScript(s.id)}
              disabled={openingId === s.id}
              className="w-full rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-left transition-colors active:bg-zinc-800/70"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[15px] font-medium text-zinc-100">{s.title}</p>
                {openingId === s.id && <Loader2 className="size-4 shrink-0 animate-spin text-amber-400" />}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {s.sectionCount} секц. · {s.wordCount} слов · ~{formatDuration(s.estSeconds)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-600">изменён {formatRelative(s.updatedAt)}</p>
            </button>
          ))}

        {!loading && scripts !== null && scripts.length === 0 && !offline && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <FileVideo className="size-8 text-zinc-600" />
            <p className="text-sm text-zinc-400">Сценариев пока нет</p>
            <p className="max-w-60 text-xs text-zinc-600">
              Создайте сценарий в редакторе на компьютере и обновите список.
            </p>
          </div>
        )}

        {cached.map((entry) => (
          <button
            key={entry.script.id}
            type="button"
            onClick={() => openCached(entry)}
            className="w-full rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-left transition-colors active:bg-zinc-800/70"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[15px] font-medium text-zinc-100">{entry.script.title}</p>
              <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
                офлайн
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {entry.script.sections.length} секц. · копия от {formatRelative(entry.savedAt)}
            </p>
          </button>
        ))}

        {offline && cached.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <FileVideo className="size-8 text-zinc-600" />
            <p className="text-sm text-zinc-400">Нет офлайн-копий</p>
            <p className="max-w-60 text-xs text-zinc-600">
              Подключитесь к серверу и откройте сценарий хотя бы раз — он сохранится на устройстве.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
