/**
 * Политика PIN-кода — общий модуль для клиента и сервера
 * (server/security.ts импортирует те же константы: единый источник правил).
 */

export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 8;

/** PIN — только цифры */
export function isValidPinFormat(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN_LEN && pin.length <= PIN_MAX_LEN;
}
