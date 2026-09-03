/**
 * Мост к нативным возможностям Capacitor (APK) через window.Capacitor.Plugins —
 * без npm-импортов, чтобы один и тот же код собирался и в Next.js (браузер), и в Vite (APK).
 * Плагины подключаются в apk/package.json и синхронизируются в Android-проект.
 */

type AnyRecord = Record<string, any>;

function cap(): AnyRecord | null {
  if (typeof window === 'undefined') return null;
  return (window as any).Capacitor ?? null;
}

export function isNative(): boolean {
  return !!cap()?.isNativePlatform?.();
}

/** Deep link при запуске APK: prompter://connect?... */
export async function getAppLaunchUrl(): Promise<string | null> {
  const plugins = cap()?.Plugins;
  if (!plugins?.App) return null;
  try {
    const res = await plugins.App.getLaunchUrl();
    return res?.url ?? null;
  } catch {
    return null;
  }
}

/** Подписка на открытие deep link, когда приложение уже запущено. Возвращает отписку. */
export function listenAppUrlOpen(cb: (url: string) => void): () => void {
  const plugins = cap()?.Plugins;
  if (!plugins?.App) return () => {};
  try {
    const handle = plugins.App.addListener('appUrlOpen', (data: AnyRecord) => {
      if (typeof data?.url === 'string') cb(data.url);
    });
    return () => {
      try {
        handle?.remove?.();
      } catch {
        /* noop */
      }
    };
  } catch {
    return () => {};
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // data:video/webm;base64,XXXX
      resolve(String(reader.result).split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Сохранение записанного видео.
 *  - Браузер: скачивание файлом (a[download]).
 *  - APK: пишем в кэш приложения и открываем системный шеринг
 *    (там «Сохранить в Галерею» / Drive / Telegram и т.д.).
 */
export async function saveVideoBlob(blob: Blob, filename: string): Promise<'download' | 'shared' | 'error'> {
  const native = cap();
  if (!native?.isNativePlatform?.()) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return 'download';
    } catch {
      return 'error';
    }
  }
  try {
    const base64 = await blobToBase64(blob);
    const plugins = native.Plugins;
    const writeRes = await plugins.Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: 'CACHE',
      recursive: true,
    });
    await plugins.Share.share({
      title: filename,
      dialogTitle: 'Сохранить видео',
      files: [writeRes.uri],
    });
    return 'shared';
  } catch {
    return 'error';
  }
}

// ================= Wake lock =================

let wakeLockSentinel: AnyRecord | null = null;

/** Не гасить экран. Web Wake Lock, в APK — плагин KeepAwake. */
export async function keepScreenAwake(awake: boolean): Promise<void> {
  const native = cap();
  const plugins = native?.isNativePlatform?.() ? native.Plugins : null;
  if (plugins?.KeepAwake) {
    try {
      if (awake) await plugins.KeepAwake.keepAwake();
      else await plugins.KeepAwake.allowSleep();
    } catch {
      /* noop */
    }
    return;
  }
  try {
    if (awake) {
      if ('wakeLock' in navigator) {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      }
    } else {
      await wakeLockSentinel?.release?.();
      wakeLockSentinel = null;
    }
  } catch {
    /* noop */
  }
}

export function isWakeLockSupported(): boolean {
  const native = cap();
  if (native?.isNativePlatform?.() && native.Plugins?.KeepAwake) return true;
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}
