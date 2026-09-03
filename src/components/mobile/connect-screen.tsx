'use client';

/**
 * Экран 1. Подключение.
 *
 * Три сценария входа:
 *  1. Браузер, открытый по http://<lan-ip>:3000/?pair=TOKEN — автоподключение.
 *  2. APK (Capacitor): сохранённый конфиг → валидация токеном; иначе deep link
 *     prompter://connect?host=..&webPort=..&wsPort=..&token=..
 *     (+ подписка на открытие deep link при запущенном приложении).
 *  3. Ручной ввод: адрес сервера (только в APK) + код подключения.
 *
 * Успех → saveConnection + кэш сценария → onConnected(cfg, script) → экран «Сценарии».
 * Ошибка — инлайн красным текстом с человеческим сообщением (ApiError.message).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Clapperboard, Loader2 } from 'lucide-react';
import { ApiClient, ApiError } from '@/lib/client/api';
import {
  getDeviceIdentity,
  isNativeApp,
  loadConnection,
  parseDeepLink,
  saveConnection,
  type ConnectionConfig,
} from '@/lib/client/connection';
import { getAppLaunchUrl, listenAppUrlOpen } from '@/lib/client/capacitor-bridge';
import type { ScriptData } from '@/lib/types';
import { cacheScript } from './script-cache';

export interface ConnectScreenProps {
  onConnected: (cfg: ConnectionConfig, script: ScriptData) => void;
}

type Phase = 'auto' | 'manual';

function parseAddress(raw: string): { host: string; port: number } {
  const cleaned = raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const idx = cleaned.lastIndexOf(':');
  if (idx > 0) {
    const port = Number(cleaned.slice(idx + 1));
    return { host: cleaned.slice(0, idx), port: Number.isFinite(port) && port > 0 ? port : 3000 };
  }
  return { host: cleaned, port: 3000 };
}

export default function ConnectScreen({ onConnected }: ConnectScreenProps) {
  const [phase, setPhase] = useState<Phase>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const startedRef = useRef(false);

  const connect = useCallback(
    async (host: string, webPort: number, wsPortFallback: number, pairToken: string, prefillOnFail: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const api = isNativeApp() ? new ApiClient(`http://${host}:${webPort}`) : new ApiClient('');
        const resp = await api.mobileScript(pairToken, getDeviceIdentity().name);
        const cfg: ConnectionConfig = {
          serverHost: host,
          webPort,
          wsPort: resp.wsPort || wsPortFallback,
          token: pairToken,
          scriptId: resp.script.id,
          savedAt: new Date().toISOString(),
        };
        saveConnection(cfg);
        cacheScript(resp.script);
        onConnected(cfg, resp.script);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Не удалось подключиться. Проверьте, что сервер запущен, а телефон в той же сети.'
        );
        setPhase('manual');
        if (prefillOnFail) {
          setAddress(`${host}:${webPort}`);
          setToken(pairToken);
        }
      } finally {
        setBusy(false);
      }
    },
    [onConnected]
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (isNativeApp()) {
      const saved = loadConnection();
      if (saved) {
        void connect(saved.serverHost, saved.webPort, saved.wsPort, saved.token, true);
        return;
      }
      // нет конфига — ждём deep link (запуск или открытие при работающем приложении)
      void (async () => {
        const launchUrl = await getAppLaunchUrl();
        const params = launchUrl ? parseDeepLink(launchUrl) : null;
        if (params) {
          void connect(params.host, params.webPort, params.wsPort, params.token, true);
        } else {
          setPhase('manual');
        }
      })();
      return listenAppUrlOpen((url) => {
        const params = parseDeepLink(url);
        if (params) void connect(params.host, params.webPort, params.wsPort, params.token, true);
      });
    }

    // Браузер: ?pair=TOKEN → автоподключение (same-origin)
    const pair = new URLSearchParams(window.location.search).get('pair');
    if (pair) {
      setToken(pair);
      const host = window.location.hostname;
      const webPort = Number(window.location.port) || 3000;
      void connect(host, webPort, 3030, pair, false);
    } else {
      setPhase('manual');
    }
    return undefined;
  }, [connect]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const pairToken = token.trim();
    if (!pairToken) {
      setError('Введите код подключения из окна «Подключить телефон» на компьютере.');
      return;
    }
    let host: string;
    let webPort: number;
    if (isNativeApp()) {
      const parsed = parseAddress(address);
      if (!parsed.host) {
        setError('Введите адрес сервера, например 192.168.1.20:3000.');
        return;
      }
      host = parsed.host;
      webPort = parsed.port;
    } else {
      // в браузере запросы идут same-origin — поле адреса скрыто
      host = window.location.hostname;
      webPort = Number(window.location.port) || 3000;
    }
    await connect(host, webPort, 3030, pairToken, true);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-950 px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <Clapperboard className="size-8 text-amber-400" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-zinc-100">Prompter Studio</h1>
            <p className="mt-1 text-sm text-zinc-500">Мобильный суфлёр</p>
          </div>
        </div>

        {phase === 'auto' ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="size-8 animate-spin text-amber-400" />
            <p className="text-sm text-zinc-400">Подключение к серверу…</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="w-full space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-5"
          >
            {isNativeApp() && (
              <div className="space-y-1.5">
                <label htmlFor="server-address" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Адрес сервера
                </label>
                <input
                  id="server-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="192.168.1.20:3000"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-amber-500/60"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="pair-token" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Код подключения
              </label>
              <input
                id="pair-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="например, 7F3K-9QZM"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-amber-500/60"
              />
            </div>

            {error && <p className="text-sm leading-relaxed text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-semibold text-zinc-950 transition-colors active:bg-amber-400 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? 'Подключение…' : 'Подключиться'}
            </button>
          </form>
        )}

        <p className="max-w-xs text-center text-xs leading-relaxed text-zinc-600">
          Код и QR-код находятся в окне «Подключить телефон» на компьютере.
        </p>
      </div>
    </div>
  );
}
