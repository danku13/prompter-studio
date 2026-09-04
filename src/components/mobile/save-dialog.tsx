'use client';

/**
 * Сохранение видео (Sheet снизу): предпросмотр записанного ролика, длительность,
 * список дублей сессии (таймкоды), «Сохранить видео» (браузер — скачивание,
 * APK — системный шаринг), «Снять ещё дубль», «Удалить».
 */

import { useEffect, useMemo } from 'react';
import { Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDuration, formatTimecode } from '@/lib/text';
import { cn } from '@/lib/utils';
import type { SessionTake } from './shared';
import { DARK_SCOPE } from './shared';

export interface SaveDialogProps {
  open: boolean;
  blob: Blob | null;
  durationMs: number;
  filename: string;
  takes: SessionTake[];
  saving: boolean;
  onSave: () => void;
  onRetake: () => void;
  onDiscard: () => void;
}

export default function SaveDialog({
  open,
  blob,
  durationMs,
  filename,
  takes,
  saving,
  onSave,
  onRetake,
  onDiscard,
}: SaveDialogProps) {
  const blobUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onRetake(); // свайп/крестик — назад к суфлёру, ролик отбрасывается
      }}
    >
      <SheetContent
        side="bottom"
        className={cn(DARK_SCOPE, 'max-h-[92vh] overflow-y-auto rounded-t-3xl border-white/10 p-0')}
      >
        <SheetHeader className="px-5 pt-4 pb-2">
          <SheetTitle className="text-zinc-100">Запись готова</SheetTitle>
          <SheetDescription className="text-zinc-500">
            Проверьте ролик и сохраните его — либо снимите ещё дубль.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          {blobUrl ? (
            <video
              src={blobUrl}
              controls
              playsInline
              className="aspect-video w-full rounded-xl border border-white/10 bg-black"
            />
          ) : (
            <div className="aspect-video w-full animate-pulse rounded-xl border border-white/10 bg-zinc-900" />
          )}

          <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
            <span className="shrink-0">Длительность: {formatDuration(durationMs / 1000)}</span>
            <span className="truncate text-right" title={filename}>
              {filename}
            </span>
          </div>

          {takes.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-300">Дубли ({takes.length})</p>
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {takes.map((take, i) => (
                  <div key={take.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
                    <span className="truncate text-zinc-300">
                      {i + 1}. {take.sectionTitle}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-500">
                      {formatTimecode(take.t0)} → {formatTimecode(take.t1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={saving || !blob}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-400 text-sm font-semibold text-zinc-950 transition-colors active:bg-blue-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? 'Сохранение…' : 'Сохранить видео'}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRetake}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-sm text-zinc-200 transition-colors active:bg-white/10"
            >
              <RotateCcw className="size-4" />
              Снять ещё дубль
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm text-red-400 transition-colors active:bg-red-500/10"
            >
              <Trash2 className="size-4" />
              Удалить
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
