'use client';

/**
 * Диалог «Подключить телефон»: два QR-кода (deep link для APK + webUrl
 * для браузера), токен с копированием, обратный отсчёт до истечения,
 * live-статус подключения и предупреждение о LAN IP.
 */

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, Check, Copy, Loader2, QrCode, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import type { ApiClient } from '@/lib/client/api';
import type { DeviceStatusMessage, PairSessionInfo, ScriptSection } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ConnectedPlate } from './device-card';
import { errorMessage } from './utils';

export interface PairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ApiClient;
  scriptId: string | null;
  scriptTitle?: string;
  sections: ScriptSection[];
  devices: DeviceStatusMessage[];
}

/** Копирование с фолбэком для http-контекстов без clipboard API */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* фолбэк ниже */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function PairDialog({
  open,
  onOpenChange,
  api,
  scriptId,
  scriptTitle,
  sections,
  devices,
}: PairDialogProps) {
  const [info, setInfo] = React.useState<PairSessionInfo | null>(null);
  const [lanIpMissing, setLanIpMissing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [copied, setCopied] = React.useState(false);

  const fetchSession = React.useCallback(async () => {
    if (!scriptId) return;
    setLoading(true);
    setError(null);
    try {
      const [pair, server] = await Promise.all([
        api.createPairing(scriptId),
        api.serverInfo().catch(() => null),
      ]);
      setInfo(pair);
      setLanIpMissing(server !== null && server.lanIp === null);
      setNow(Date.now());
    } catch (e) {
      setInfo(null);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api, scriptId]);

  // при открытии — свежая сессия, при закрытии — сброс
  React.useEffect(() => {
    if (open && scriptId) {
      setCopied(false);
      void fetchSession();
    }
    if (!open) {
      setInfo(null);
      setError(null);
      setLanIpMissing(false);
      setLoading(false);
    }
  }, [open, scriptId, fetchSession]);

  // тикер обратного отсчёта
  React.useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const remainingMs = info ? Math.max(0, new Date(info.expiresAt).getTime() - now) : 0;
  const expired = info !== null && remainingMs <= 0;
  const totalSec = Math.ceil(remainingMs / 1000);
  const mmss = `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;

  const copyToken = async () => {
    if (!info) return;
    const ok = await copyText(info.token);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Smartphone className="size-4" />
            </span>
            Подключить телефон
          </DialogTitle>
          <DialogDescription>
            {scriptTitle
              ? `Сценарий «${scriptTitle}» появится на телефоне сразу после подключения.`
              : 'Отсканируйте QR-код, чтобы открыть суфлёр на телефоне.'}
          </DialogDescription>
        </DialogHeader>

        {lanIpMissing && !loading && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              LAN IP не найден: убедитесь, что телефон и компьютер находятся в одной Wi-Fi сети,
              иначе QR-коды могут не сработать.
            </span>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Skeleton className="h-56 w-56 rounded-xl" />
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Создаю код подключения…
            </p>
          </div>
        )}

        {!loading && error !== null && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
            <WifiOff className="size-6 text-red-500" />
            <p className="text-sm font-medium">Не удалось создать код подключения</p>
            <p className="max-w-72 text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchSession()}>
              <RefreshCw className="size-3.5" />
              Повторить
            </Button>
          </div>
        )}

        {!loading && error === null && !scriptId && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Сначала создайте или выберите сценарий.
          </p>
        )}

        {!loading && error === null && info !== null && (
          <>
            <div className="flex flex-wrap items-start justify-center gap-5">
              <figure className="flex flex-col items-center gap-2">
                <div className="rounded-xl border bg-white p-3 shadow-sm">
                  <QRCodeSVG value={info.deepLink} size={216} marginSize={1} />
                </div>
                <figcaption className="max-w-56 text-center text-xs text-muted-foreground">
                  Отсканируйте камерой телефона (в приложении)
                </figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-2">
                <div className="rounded-xl border bg-white p-2 shadow-sm">
                  <QRCodeSVG value={info.webUrl} size={144} marginSize={1} />
                </div>
                <figcaption className="max-w-44 text-center text-xs text-muted-foreground">
                  Или откройте в браузере телефона
                </figcaption>
              </figure>
            </div>

            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
              <QrCode className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={info.token}>
                {info.token}
              </span>
              <Button variant="outline" size="sm" className="h-7" onClick={() => void copyToken()}>
                {copied ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {expired ? (
                  <span className="font-medium text-red-600">Код истёк</span>
                ) : (
                  <>
                    Действует ещё{' '}
                    <span className="font-semibold tabular-nums text-foreground">{mmss}</span>
                  </>
                )}
              </span>
              {expired && (
                <Button variant="outline" size="sm" onClick={() => void fetchSession()}>
                  <RefreshCw className="size-3.5" />
                  Обновить код
                </Button>
              )}
            </div>

            <Separator />

            <p className="text-sm font-medium">Статус подключения</p>
            {devices.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed p-4">
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
                </span>
                <p className="text-sm text-muted-foreground">
                  Ожидаю телефон… Не закрывайте окно — подключение появится автоматически.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {devices.map((d) => (
                  <ConnectedPlate key={d.deviceId} device={d} sections={sections} />
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
