/**
 * Серверные утилиты Prompter Studio (агент 2-c).
 */

import type { WsMode } from '@/lib/types';

export const APP_NAME = 'Prompter Studio';
export const APP_VERSION = '0.1.0';

/** Порт веб-сервера Next.js */
export function getWebPort(): number {
  return Number(process.env.PORT) || 3000;
}

/** Порт WS-мини-сервиса (socket.io) */
export function getWsPort(): number {
  return Number(process.env.WS_PORT) || 3030;
}

/**
 * Режим WS-подключения (динамический, по Host запроса):
 *  - 'gateway' — страница открыта через прокси-шлюз песочницы (host *.space-z.ai):
 *    socket.io ходит через `/?XTransformPort=<port>`, роутинг делает Caddy;
 *  - 'direct'  — страница открыта с localhost или LAN-IP:
 *    клиент подключается напрямую ws://<host>:<wsPort>.
 * Явное значение env WS_MODE ('gateway' | 'direct') перекрывает автодетект.
 */
export function getWsMode(host?: string): WsMode {
  if (process.env.WS_MODE === 'gateway') return 'gateway';
  if (process.env.WS_MODE === 'direct') return 'direct';
  if (host && /\.space-z\.ai$/i.test(host.trim().toLowerCase())) return 'gateway';
  return 'direct';
}

/** Скорость чтения для оценки хронометража, слов в минуту */
export const READING_WPM = 140;

/** Время жизни pairing-токена, минут */
export function getPairTtlMinutes(): number {
  return Number(process.env.PAIR_TTL_MIN) || 15;
}
