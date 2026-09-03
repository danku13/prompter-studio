'use client';

/**
 * MediaRecorder-запись видео суфлёра (камера + микрофон).
 *
 * MimeType-цепочка: первый поддерживаемый браузером.
 * Android-WebView обычно даёт mp4, десктопные Chrome — webm.
 * Имя файла: prompter-<slug-название>-<ЧЧ-ММ-СС>.<mp4|webm>.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      /* попробуем следующий из цепочки */
    }
  }
  return null;
}

export function videoExtension(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

/** prompter-<slug>-<HH-MM-SS>.<ext> */
export function buildVideoFilename(title: string, mime: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `prompter-${slug || 'script'}-${hh}-${mm}-${ss}.${videoExtension(mime)}`;
}

export interface UseRecorder {
  recording: boolean;
  /** мс от старта записи, обновляется ~5 раз в секунду */
  elapsedMs: number;
  /** готовый ролик после stop(); сбрасывается reset() */
  blob: Blob | null;
  mimeType: string | null;
  error: string | null;
  /** null — запись началась; иначе текст ошибки */
  start: (stream: MediaStream) => string | null;
  /** Остановить; возвращает финальную длительность в мс */
  stop: () => number;
  /** Сбросить blob/таймер — готовы к новому дублю */
  reset: () => void;
}

export function useRecorder(): UseRecorder {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const setElapsed = (ms: number) => {
    elapsedRef.current = ms;
    setElapsedMs(ms);
  };

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (stream: MediaStream): string | null => {
      if (recorderRef.current) return null; // уже пишем
      if (typeof MediaRecorder === 'undefined') {
        const msg = 'Этот браузер не поддерживает запись видео.';
        setError(msg);
        return msg;
      }
      const mime = pickMimeType();
      if (!mime) {
        const msg = 'Браузер не поддерживает ни один формат записи (mp4/webm).';
        setError(msg);
        return msg;
      }
      try {
        const rec = new MediaRecorder(stream, { mimeType: mime });
        chunksRef.current = [];
        rec.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const type = rec.mimeType || mime;
          setBlob(new Blob(chunksRef.current, { type }));
        };
        rec.start(500);
        recorderRef.current = rec;
        startedAtRef.current = performance.now();
        setElapsed(0);
        setBlob(null);
        setError(null);
        setMimeType(mime);
        setRecording(true);
        clearTimer();
        timerRef.current = setInterval(() => {
          setElapsed(performance.now() - startedAtRef.current);
        }, 200);
        return null;
      } catch (err) {
        const msg = `Не удалось начать запись: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`;
        setError(msg);
        return msg;
      }
    },
    [clearTimer]
  );

  const stop = useCallback((): number => {
    clearTimer();
    const rec = recorderRef.current;
    recorderRef.current = null;
    const final = rec ? performance.now() - startedAtRef.current : elapsedRef.current;
    setElapsed(final);
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* уже остановлен */
      }
    }
    setRecording(false);
    return final;
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null; // результат больше не нужен
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
    setBlob(null);
    setRecording(false);
    setError(null);
    setElapsed(0);
  }, [clearTimer]);

  // Размонтирование: аккуратно останавливаем запись без setState
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return { recording, elapsedMs, blob, mimeType, error, start, stop, reset };
}
