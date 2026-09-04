'use client';

/**
 * PIN-доступ (P0 «кафе/коворкинг», см. lib/server/security.ts):
 *  - PinUnlockOverlay — полноэкранная блокировка приложения, пока не введён PIN
 *    (сервер ответил 401 pin_required или при загрузке pinRequired=true);
 *  - PinSettingsDialog — установка/смена/отключение PIN из меню «⋯».
 *
 * Тикет после проверки хранится в sessionStorage (см. lib/client/pin-store.ts):
 * переживает F5 в той же вкладке, не расползается по браузеру.
 */

import * as React from 'react';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { ApiClient, ApiError } from '@/lib/client/api';
import { setTicket } from '@/lib/client/pin-store';
import { PIN_MIN_LEN, PIN_MAX_LEN } from '@/lib/pin-policy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const pinLengthHint = `от ${PIN_MIN_LEN} до ${PIN_MAX_LEN} цифр`;

function isValidPin(v: string): boolean {
  return /^\d+$/.test(v) && v.length >= PIN_MIN_LEN && v.length <= PIN_MAX_LEN;
}

/** Поле ввода PIN: цифры, маска, автоподбор цифровой клавиатуры на телефоне */
function PinField({
  id,
  label,
  value,
  onChange,
  autoFocus,
  autoComplete = 'off',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        pattern="[0-9]*"
        maxLength={PIN_MAX_LEN}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_MAX_LEN))}
        className="h-11 text-center text-lg tracking-[0.5em] font-semibold"
      />
    </div>
  );
}

// ============================== Экран разблокировки ==============================

export interface PinUnlockOverlayProps {
  api: ApiClient;
  onUnlocked: () => void;
  /** почему заблокировано (например, «тикет истёк») — строка от родителя */
  reason?: string | null;
}

export function PinUnlockOverlay({ api, onUnlocked, reason }: PinUnlockOverlayProps) {
  const [pin, setPin] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(reason ?? null);
  const inputRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // автофокус на поле при показе
    const el = inputRef.current?.querySelector('input');
    el?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const candidate = pin.trim();
    if (!candidate) {
      setError('Введите PIN-код');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await api.verifyPin(candidate);
      if (resp.ticket && resp.expiresAt) {
        setTicket(resp.ticket, resp.expiresAt);
        onUnlocked();
      } else {
        // PIN выключили с другого устройства — просто продолжаем
        onUnlocked();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось проверить PIN. Попробуйте ещё раз.');
      setPin('');
      const el = inputRef.current?.querySelector('input');
      el?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 px-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label="Введите PIN-код"
    >
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-6" noValidate>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="size-7" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Prompter Studio заблокирован</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Доступ защищён PIN-кодом. Введите его, чтобы продолжить работу.
            </p>
          </div>
        </div>

        <div ref={inputRef}>
          <PinField
            id="unlock-pin"
            label="PIN-код"
            value={pin}
            onChange={setPin}
            autoFocus
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="text-sm leading-relaxed text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy} className="h-11 w-full bg-primary text-primary-foreground">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {busy ? 'Проверка…' : 'Разблокировать'}
        </Button>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          PIN задаётся на этом компьютере: меню «⋯» → «PIN-код…»
        </p>
      </form>
    </div>
  );
}

// ============================== Настройка PIN ==============================

export interface PinSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ApiClient;
  /** PIN сейчас включен? (состояние родителя — из server-info) */
  enabled: boolean;
  /** сообщить родителю новый статус (после успешной установки/смены/отключения) */
  onApplied: (enabled: boolean) => void;
}

type Mode = 'setup' | 'change' | 'disable';

export function PinSettingsDialog({ open, onOpenChange, api, enabled, onApplied }: PinSettingsDialogProps) {
  const [mode, setMode] = React.useState<Mode>(enabled ? 'change' : 'setup');
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [askDisable, setAskDisable] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMode(enabled ? 'change' : 'setup');
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
      setAskDisable(false);
    }
  }, [open, enabled]);

  const resetFields = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const validate = (): string | null => {
    if (enabled && mode !== 'setup' && !current) return 'Введите текущий PIN-код';
    if (mode !== 'disable') {
      if (!isValidPin(next)) return `Новый PIN — ${pinLengthHint}`;
      if (next !== confirm) return 'PIN-коды не совпадают';
    }
    return null;
  };

  const apply = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await api.changePin({
        ...(enabled ? { currentPin: current } : {}),
        newPin: mode === 'disable' ? null : next,
      });
      // сервер ротировал секрет — сразу живём с новым тикетом
      if (resp.ticket && resp.expiresAt) setTicket(resp.ticket, resp.expiresAt);
      onApplied(resp.enabled);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить. Попробуйте ещё раз.');
      resetFields();
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'disable') {
      setAskDisable(true);
      return;
    }
    void apply();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            PIN-код доступа
          </DialogTitle>
          <DialogDescription>
            {enabled
              ? 'Смена или отключение PIN. После смены все открытые сессии вводят PIN заново.'
              : 'Защита для кафе и коворкинга: без PIN любой в вашей Wi-Fi сети может открыть редактор.'}
          </DialogDescription>
        </DialogHeader>

        {enabled && (
          <div
            role="tablist"
            aria-label="Действие с PIN"
            className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'change'}
              onClick={() => {
                setMode('change');
                resetFields();
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                mode === 'change' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Сменить
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'disable'}
              onClick={() => {
                setMode('disable');
                resetFields();
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                mode === 'disable' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Отключить
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4" noValidate>
          {enabled && <PinField id="pin-current" label="Текущий PIN" value={current} onChange={setCurrent} />}
          {mode !== 'disable' && (
            <>
              <PinField id="pin-new" label="Новый PIN" value={next} onChange={setNext} />
              <PinField id="pin-confirm" label="Повторите новый PIN" value={confirm} onChange={setConfirm} />
            </>
          )}

          {error && (
            <p className="text-sm leading-relaxed text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={busy}
              variant={mode === 'disable' ? 'destructive' : 'default'}
              className={mode === 'disable' ? '' : 'bg-primary text-primary-foreground'}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === 'disable' ? 'Отключить PIN' : mode === 'change' ? 'Сменить PIN' : 'Установить PIN'}
            </Button>
          </DialogFooter>
        </form>

        {mode === 'setup' && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            PIN устанавливает тот, кто откроет эти настройки первым — включите его до работы
            из публичной сети. Если PIN забыт, снимается он только локально на компьютере
            с сервером.
          </p>
        )}

        <AlertDialog open={askDisable} onOpenChange={setAskDisable}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Отключить PIN-защиту?</AlertDialogTitle>
              <AlertDialogDescription>
                Редактор снова будет доступен без пароля всем, кто находится в вашей сети.
                Телефоны продолжат подключаться по QR-коду.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={(e) => {
                  e.preventDefault();
                  void apply();
                }}
              >
                Отключить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
