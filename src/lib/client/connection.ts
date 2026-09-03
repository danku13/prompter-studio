/**
 * Конфигурация подключения мобильного клиента к серверу Prompter Studio.
 *
 * Три сценария:
 *  1. Браузер на телефоне, открыт по ссылке http://<lan-ip>:3000/?pair=TOKEN
 *     → конфиг строится из location + ответа /api/mobile/script
 *  2. APK (Capacitor): deep link prompter://connect?host=..&webPort=..&wsPort=..&token=..
 *     → конфиг из deep link (см. capacitor-bridge.ts)
 *  3. Ручной ввод адреса сервера + кода pairing на экране подключения.
 *
 * Конфиг персистится в localStorage — офлайн-доступ к последнему сценарию.
 */

export interface ConnectionConfig {
  /** LAN IP / hostname сервера (компьютера) */
  serverHost: string;
  webPort: number;
  wsPort: number;
  /** токен pairing-сессии */
  token: string;
  /** сценарий, к которому привязан токен */
  scriptId: string | null;
  savedAt: string;
}

const STORAGE_KEY = 'ps.connection';
const DEVICE_KEY = 'ps.device';

/** Мы внутри нативного APK (Capacitor)? */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

export function loadConnection(): ConnectionConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConnectionConfig;
    if (!parsed.serverHost || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConnection(cfg: ConnectionConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* приватный режим и т.п. */
  }
}

export function clearConnection(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** Стабильная идентичность устройства (deviceId + имя) для телеметрии */
export interface DeviceIdentity {
  deviceId: string;
  name: string;
  platform: string;
}

export function getDeviceIdentity(): DeviceIdentity {
  if (typeof window === 'undefined') return { deviceId: 'ssr', name: 'SSR', platform: 'ssr' };
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceIdentity;
      if (parsed.deviceId) return parsed;
    }
  } catch {
    /* пересоздадим */
  }
  const deviceId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const ua = window.navigator.userAgent;
  const platform = /android/i.test(ua) ? 'android' : /iphone|ipad/i.test(ua) ? 'ios' : 'browser';
  const uaModel = ua.match(/Android[^;]*;\s*([^;)]+)/i)?.[1]?.trim();
  const name = uaModel ? `Android · ${uaModel}` : platform === 'ios' ? 'iPhone' : 'Браузер';
  const identity: DeviceIdentity = { deviceId, name, platform };
  try {
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(identity));
  } catch {
    /* noop */
  }
  return identity;
}

// ================= Deep link =================

export interface DeepLinkParams {
  host: string;
  webPort: number;
  wsPort: number;
  token: string;
}

/** prompter://connect?host=192.168.1.20&webPort=3000&wsPort=3030&token=XXX */
export function parseDeepLink(url: string): DeepLinkParams | null {
  if (!url.startsWith('prompter://connect')) return null;
  const query = url.split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  const host = params.get('host');
  const token = params.get('token');
  if (!host || !token) return null;
  return {
    host,
    token,
    webPort: Number(params.get('webPort')) || 3000,
    wsPort: Number(params.get('wsPort')) || 3030,
  };
}

export function connectionFromDeepLink(p: DeepLinkParams, scriptId: string | null = null): ConnectionConfig {
  return {
    serverHost: p.host,
    webPort: p.webPort,
    wsPort: p.wsPort,
    token: p.token,
    scriptId,
    savedAt: new Date().toISOString(),
  };
}

/**
 * Базовый URL для REST-запросов:
 *  - браузер: same-origin ('' — относительные пути)
 *  - нативное приложение: http://<host>:<webPort>
 */
export function restBase(cfg: ConnectionConfig | null): string {
  if (cfg && isNativeApp()) return `http://${cfg.serverHost}:${cfg.webPort}`;
  return '';
}
