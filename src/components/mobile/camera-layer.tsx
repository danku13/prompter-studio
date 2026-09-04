'use client';

/**
 * Слой (a) суфлёра: полноэкранная камера (или заглушка «Камера недоступна»).
 * Фронтальная камера зеркалится CSS scaleX(-1). Ошибка → тёмная заглушка
 * с кнопкой «Продолжить без записи» (режим репетиции: суфлёр работает, записи нет).
 *
 * Пропсы разложены «плоско» (videoRef/facing/error/retry отдельно), чтобы
 * не проводить объект с ref через рендер.
 */

import { CameraOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CameraFacing, UseCamera } from '@/lib/hooks/use-camera';

export interface CameraLayerProps {
  videoRef: UseCamera['videoRef'];
  facing: CameraFacing;
  error: string | null;
  retry: () => void;
  rehearsalMode: boolean;
  onEnterRehearsal: () => void;
}

export default function CameraLayer({ videoRef, facing, error, retry, rehearsalMode, onEnterRehearsal }: CameraLayerProps) {
  const showStub = error !== null && !rehearsalMode;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {rehearsalMode ? (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900 to-black" />
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          disablePictureInPicture
          className={cn('h-full w-full object-cover', facing === 'user' && 'scale-x-[-1]')}
        />
      )}

      {showStub && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-zinc-950/95 px-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <CameraOff className="size-8 text-zinc-500" />
          </div>
          <div className="max-w-sm">
            <p className="text-lg font-semibold text-zinc-100">Камера недоступна</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{error}</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onEnterRehearsal}
              className="h-12 rounded-xl bg-blue-400 px-6 text-sm font-semibold text-zinc-950 transition-colors active:bg-blue-500"
            >
              Продолжить без записи
            </button>
            <button
              type="button"
              onClick={retry}
              className="flex h-10 items-center gap-2 rounded-xl px-4 text-sm text-zinc-400 transition-colors active:bg-white/5"
            >
              <RefreshCw className="size-4" />
              Повторить попытку
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
