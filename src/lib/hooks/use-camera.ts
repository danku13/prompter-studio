'use client';

/**
 * Камера + микрофон мобильного суфлёра.
 *
 * getUserMedia({ video: {facingMode, 1280x720 ideal}, audio: true }).
 * Если аудио недоступно — повторная попытка без звука (запись тогда без звука).
 * Фронтальная камера зеркалируется CSS-классом на <video> (scale-x-[-1]).
 *
 * Ошибка (нет камеры / нет разрешения / headless-браузер) отдаётся человеческим
 * текстом — по ней экран суфлёра показывает заглушку «Камера недоступна»
 * и кнопку «Продолжить без записи» (режим репетиции).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export type CameraFacing = 'user' | 'environment';

export interface UseCamera {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** true — камера подключена, поток активен */
  ready: boolean;
  /** человекочитаемое описание ошибки, если камеру открыть не удалось */
  error: string | null;
  facing: CameraFacing;
  stream: MediaStream | null;
  hasAudio: boolean;
  /** Сменить фронтальную/тыловую (пересоздаёт поток) */
  switchCamera: () => void;
  /** Повторить попытку открыть камеру */
  retry: () => void;
}

function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Доступ к камере запрещён. Разрешите камеру и микрофон в настройках браузера или системы.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Камера не найдена. Проверьте, что она подключена и не занята другим приложением.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Камера занята другим приложением. Закройте его и повторите попытку.';
    default:
      return 'Камера недоступна в этом окружении. Откройте страницу по HTTPS, на localhost или в мобильном приложении.';
  }
}

export function useCamera(): UseCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraFacing>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const open = useCallback(
    async (mode: CameraFacing): Promise<boolean> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Камера доступна только по HTTPS, на localhost или в мобильном приложении.');
        setReady(false);
        setStream(null);
        return false;
      }

      stopStream();

      const constraints = (withAudio: boolean): MediaStreamConstraints => ({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: withAudio,
      });

      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia(constraints(true));
      } catch {
        // Аудио могло не согласиться — пробуем видео без звука
        try {
          media = await navigator.mediaDevices.getUserMedia(constraints(false));
        } catch (videoErr) {
          setError(describeCameraError(videoErr));
          setReady(false);
          setStream(null);
          return false;
        }
      }

      streamRef.current = media;
      setStream(media);
      setHasAudio(media.getAudioTracks().length > 0);
      setFacing(mode);
      setError(null);
      setReady(true);

      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.srcObject = media;
        videoEl.play().catch(() => {
          /* автоплей заблокирован — видео всё равно muted, дальше разберётся */
        });
      }
      return true;
    },
    [stopStream]
  );

  const switchCamera = useCallback(() => {
    void open(facing === 'user' ? 'environment' : 'user');
  }, [facing, open]);

  const retry = useCallback(() => {
    void open(facing);
  }, [facing, open]);

  useEffect(() => {
    // rAF: камера открывается после первого кадра — setState уходит из синхронного тела эффекта
    const raf = requestAnimationFrame(() => {
      void open('user');
    });
    return () => {
      cancelAnimationFrame(raf);
      stopStream();
    };
  }, [open, stopStream]);

  return { videoRef, ready, error, facing, stream, hasAudio, switchCamera, retry };
}
