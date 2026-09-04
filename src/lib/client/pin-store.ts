/**
 * Хранилище тикета доступа (PIN) для клиента.
 *
 * Тикет выдаётся POST /api/auth/pin/verify после ввода PIN и живёт ~12 ч.
 * Хранится в sessionStorage: переживает перезагрузку страницы в той же вкладке,
 * но не расползается по браузеру навсегда (в отличие от localStorage) —
 * на чужом компьютере в той же сети у злоумышленника свой sessionStorage.
 *
 * Любой запрос с протухшим/невалидным тикетом получает 401 code='pin_required';
 * ApiClient тогда сбрасывает тикет и бросает событие PIN_REQUIRED_EVENT —
 * DesktopApp показывает экран ввода PIN поверх заблокированного интерфейса.
 */

const STORAGE_KEY = 'ps.ticket';

/** Имя window-события «сервер требует PIN» (listen в DesktopApp) */
export const PIN_REQUIRED_EVENT = 'ps:pin-required';

interface StoredTicket {
  ticket: string;
  expiresAt: number;
}

/** Кэш в памяти — работает даже когда sessionStorage недоступен (приватный режим) */
let memory: StoredTicket | null = null;

function readStorage(): StoredTicket | null {
  if (typeof window === 'undefined') return memory;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredTicket;
      if (parsed && typeof parsed.ticket === 'string' && typeof parsed.expiresAt === 'number') {
        memory = memory ?? parsed;
        return parsed;
      }
    }
  } catch {
    /* приватный режим и т.п. */
  }
  return memory;
}

export function setTicket(ticket: string, expiresAt: number): void {
  memory = { ticket, expiresAt };
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* приватный режим — живём в памяти до перезагрузки */
  }
}

export function clearTicket(): void {
  memory = null;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function getTicket(): string | null {
  const stored = readStorage();
  if (!stored) return null;
  if (stored.expiresAt <= Date.now()) {
    clearTicket();
    return null;
  }
  return stored.ticket;
}

/** Сообщить приложению, что нужно разблокироваться вводом PIN */
export function notifyPinRequired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PIN_REQUIRED_EVENT));
}
